import type Phaser from "phaser";
import { PROTOTYPE_CONFIG } from "../config/prototypeConfig";
import { applyImpulse, type PuckEntity } from "../entities/createPuck";
import { AimIndicator } from "../ui/AimIndicator";

/** Pointer travel below this on release counts as a tap (select), not a flick. */
const TAP_MAX_MOVE_PX = 10;

type DragState = {
  active: boolean;
  pointerId: number;
  puck: PuckEntity | null;
  /** World point where the drag began (remote gesture origin). */
  originX: number;
  originY: number;
  /**
   * Remote aim: pull is pointer − origin (click-drag gesture).
   * On-puck aim: pull is pointer − puck (classic slingshot).
   */
  relativeToGesture: boolean;
};

/** Press on a puck that may become a tap-select or an on-puck flick. */
type PendingPress = {
  pointerId: number;
  puck: PuckEntity;
  startX: number;
  startY: number;
};

export type FlickControllerOptions = {
  getSelectablePucks: () => PuckEntity[];
  onLaunch?: (puck: PuckEntity) => void;
};

type PuckHandler = (
  pointer: Phaser.Input.Pointer,
  localX: number,
  localY: number,
  event: Phaser.Types.Input.EventData,
) => void;

/**
 * Multi-puck slingshot:
 * - Drag on a puck → normal flick
 * - Tap a puck → select it; then drag anywhere to flick (tight spaces)
 */
export class FlickController {
  private readonly scene: Phaser.Scene;
  private readonly aim: AimIndicator;
  private readonly opts: FlickControllerOptions;
  private readonly drag: DragState = {
    active: false,
    pointerId: -1,
    puck: null,
    originX: 0,
    originY: 0,
    relativeToGesture: false,
  };
  private pending: PendingPress | null = null;
  private selected: PuckEntity | null = null;
  private enabled = true;
  private readonly handlers = new Map<string, PuckHandler>();
  private boundPucks: PuckEntity[] = [];

  constructor(scene: Phaser.Scene, opts: FlickControllerOptions) {
    this.scene = scene;
    this.opts = opts;
    this.aim = new AimIndicator(scene);

    scene.input.on("pointerdown", this.onScenePointerDown, this);
    scene.input.on("pointermove", this.onPointerMove, this);
    scene.input.on("pointerup", this.onPointerUp, this);
    scene.input.on("pointerupoutside", this.onPointerUp, this);
  }

  /** Currently tap-selected puck id, if any. */
  get selectedPuckId(): string | null {
    return this.selected?.id ?? null;
  }

  bindPucks(pucks: PuckEntity[]): void {
    this.unbindPucks();
    this.boundPucks = pucks;
    for (const puck of pucks) {
      const handler: PuckHandler = (pointer, _lx, _ly, event) => {
        this.beginPuckPress(puck, pointer, event);
      };
      this.handlers.set(puck.id, handler);
      puck.sprite.on("pointerdown", handler);
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) {
      this.cancelDrag();
      this.pending = null;
      this.clearSelection();
    }
  }

  destroy(): void {
    this.unbindPucks();
    this.scene.input.off("pointerdown", this.onScenePointerDown, this);
    this.scene.input.off("pointermove", this.onPointerMove, this);
    this.scene.input.off("pointerup", this.onPointerUp, this);
    this.scene.input.off("pointerupoutside", this.onPointerUp, this);
    this.aim.destroy();
  }

  private unbindPucks(): void {
    for (const puck of this.boundPucks) {
      const handler = this.handlers.get(puck.id);
      if (handler) puck.sprite.off("pointerdown", handler);
    }
    this.handlers.clear();
    this.boundPucks = [];
  }

  private isSelectable(puck: PuckEntity): boolean {
    return this.opts.getSelectablePucks().some((p) => p.id === puck.id);
  }

  private beginPuckPress(
    puck: PuckEntity,
    pointer: Phaser.Input.Pointer,
    event: Phaser.Types.Input.EventData,
  ): void {
    if (!this.enabled || this.drag.active || this.pending) return;
    if (!this.isSelectable(puck)) return;

    event.stopPropagation();
    this.pending = {
      pointerId: pointer.id,
      puck,
      startX: pointer.x,
      startY: pointer.y,
    };
  }

  /** Drag-anywhere when a puck is already selected; empty tap clears selection. */
  private onScenePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || this.drag.active) return;
    // Puck press owns this pointer (handler may run before or after this).
    if (this.pending && this.pending.pointerId === pointer.id) return;
    if (this.pointerHitsSelectablePuck(pointer)) return;

    if (!this.selected || !this.isSelectable(this.selected)) {
      this.clearSelection();
      return;
    }

    this.beginDrag(this.selected, pointer, /* relativeToGesture */ true);
  }

  private pointerHitsSelectablePuck(pointer: Phaser.Input.Pointer): boolean {
    const hits = this.scene.input.hitTestPointer(pointer);
    return this.opts
      .getSelectablePucks()
      .some((p) => hits.includes(p.sprite));
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.pending && pointer.id === this.pending.pointerId) {
      const dx = pointer.x - this.pending.startX;
      const dy = pointer.y - this.pending.startY;
      if (Math.hypot(dx, dy) >= TAP_MAX_MOVE_PX) {
        const puck = this.pending.puck;
        this.pending = null;
        // On-puck drag: classic slingshot anchored at the puck.
        this.beginDrag(puck, pointer, /* relativeToGesture */ false);
      }
      return;
    }

    if (!this.drag.active || pointer.id !== this.drag.pointerId) return;
    this.updateAim(pointer);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.pending && pointer.id === this.pending.pointerId) {
      const puck = this.pending.puck;
      this.pending = null;
      // Tap: toggle selection on same puck, otherwise select.
      if (this.selected?.id === puck.id) {
        this.clearSelection();
      } else {
        this.selected = puck;
      }
      return;
    }

    if (!this.drag.active || pointer.id !== this.drag.pointerId) return;

    const puck = this.drag.puck;
    const shot = puck ? this.computeShot(pointer, puck) : null;
    this.cancelDrag();

    if (!puck || !shot) {
      // Click-anywhere with no pull while selected → deselect.
      if (this.selected) this.clearSelection();
      return;
    }

    this.clearSelection();
    applyImpulse(puck, shot.angle, shot.power);
    this.opts.onLaunch?.(puck);
  }

  private beginDrag(
    puck: PuckEntity,
    pointer: Phaser.Input.Pointer,
    relativeToGesture: boolean,
  ): void {
    const world = this.pointerWorld(pointer);
    this.drag.active = true;
    this.drag.pointerId = pointer.id;
    this.drag.puck = puck;
    this.drag.originX = world.x;
    this.drag.originY = world.y;
    this.drag.relativeToGesture = relativeToGesture;
    this.updateAim(pointer);
  }

  private cancelDrag(): void {
    this.drag.active = false;
    this.drag.puck = null;
    this.drag.relativeToGesture = false;
    this.aim.hide();
  }

  private clearSelection(): void {
    this.selected = null;
  }

  private updateAim(pointer: Phaser.Input.Pointer): void {
    const puck = this.drag.puck;
    if (!puck) return;
    const shot = this.computeShot(pointer, puck);
    if (!shot) {
      this.aim.hide();
      return;
    }
    const { x, y } = puck.body.position;
    this.aim.show(x, y, shot.angle, shot.power);
  }

  private pointerWorld(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    return this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  private computeShot(
    pointer: Phaser.Input.Pointer,
    puck: PuckEntity,
  ): { angle: number; power: number } | null {
    const world = this.pointerWorld(pointer);
    let dragX: number;
    let dragY: number;

    if (this.drag.relativeToGesture) {
      // Remote: direction/power from the click-drag gesture itself.
      dragX = world.x - this.drag.originX;
      dragY = world.y - this.drag.originY;
    } else {
      // Classic: pull away from the puck.
      dragX = world.x - puck.body.position.x;
      dragY = world.y - puck.body.position.y;
    }

    const dist = Math.hypot(dragX, dragY);
    if (dist < 6) return null;

    const power = Math.min(1, dist / PROTOTYPE_CONFIG.shot.maxDragPx);
    const angle = Math.atan2(-dragY, -dragX);
    return { angle, power };
  }
}
