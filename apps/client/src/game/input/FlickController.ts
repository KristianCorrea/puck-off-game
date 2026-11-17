import type Phaser from "phaser";
import { PROTOTYPE_CONFIG, u } from "../config/prototypeConfig";
import type { PuckEntity } from "../entities/createPuck";
import { AimIndicator } from "../ui/AimIndicator";

/** World-space travel below this on release counts as a tap (select), not a flick. */
const TAP_MAX_MOVE_WORLD = u(10);

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
  startWorldX: number;
  startWorldY: number;
};

export type FlickControllerOptions = {
  getSelectablePucks: () => PuckEntity[];
  onLaunch?: (
    puck: PuckEntity,
    shot: { angle: number; power: number },
  ) => void;
  onAim?: (
    puck: PuckEntity,
    shot: { angle: number; power: number },
  ) => void;
  onAimEnd?: () => void;
  onSelect?: (puck: PuckEntity | null) => void;
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
 *
 * Letterbox bars are on-canvas (camera letterbox + Scale.RESIZE), so normal
 * Phaser pointer events keep tracking there. Document listeners are a backup.
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
  private domTracking = false;

  constructor(scene: Phaser.Scene, opts: FlickControllerOptions) {
    this.scene = scene;
    this.opts = opts;
    this.aim = new AimIndicator(scene);

    scene.input.on("pointerdown", this.onScenePointerDown, this);
    scene.input.on("pointermove", this.onPointerMove, this);
    scene.input.on("pointerup", this.onPointerUp, this);
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
      this.disarmDomTracking();
    }
  }

  destroy(): void {
    this.disarmDomTracking();
    this.unbindPucks();
    this.scene.input.off("pointerdown", this.onScenePointerDown, this);
    this.scene.input.off("pointermove", this.onPointerMove, this);
    this.scene.input.off("pointerup", this.onPointerUp, this);
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

  private armDomTracking(pointer: Phaser.Input.Pointer): void {
    const evt = pointer.event as PointerEvent | undefined;
    const canvas = this.scene.game.canvas;
    if (evt && typeof evt.pointerId === "number") {
      try {
        canvas.setPointerCapture?.(evt.pointerId);
      } catch {
        // ignore
      }
    }

    if (this.domTracking) return;
    this.domTracking = true;
    // Capture phase on document: survives leaving the canvas element entirely.
    document.addEventListener("pointermove", this.onDomPointerMove, true);
    document.addEventListener("pointerup", this.onDomPointerUp, true);
    document.addEventListener("pointercancel", this.onDomPointerCancel, true);
    document.addEventListener("touchmove", this.onDomTouchMove, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchend", this.onDomTouchEnd, true);
    document.addEventListener("touchcancel", this.onDomTouchCancel, true);
  }

  private disarmDomTracking(): void {
    if (!this.domTracking) return;
    this.domTracking = false;
    document.removeEventListener("pointermove", this.onDomPointerMove, true);
    document.removeEventListener("pointerup", this.onDomPointerUp, true);
    document.removeEventListener("pointercancel", this.onDomPointerCancel, true);
    document.removeEventListener("touchmove", this.onDomTouchMove, true);
    document.removeEventListener("touchend", this.onDomTouchEnd, true);
    document.removeEventListener("touchcancel", this.onDomTouchCancel, true);
  }

  /** Map viewport client coords → world via canvas bounds + camera. */
  private clientToWorld(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const canvas = this.scene.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const gameX =
      ((clientX - rect.left) / Math.max(rect.width, 1)) *
      this.scene.scale.width;
    const gameY =
      ((clientY - rect.top) / Math.max(rect.height, 1)) *
      this.scene.scale.height;
    return this.scene.cameras.main.getWorldPoint(gameX, gameY);
  }

  private pointerWorld(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    return this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  private beginPuckPress(
    puck: PuckEntity,
    pointer: Phaser.Input.Pointer,
    event: Phaser.Types.Input.EventData,
  ): void {
    if (!this.enabled || this.drag.active || this.pending) return;
    if (!this.isSelectable(puck)) return;

    event.stopPropagation();
    const world = this.pointerWorld(pointer);
    this.pending = {
      pointerId: pointer.id,
      puck,
      startWorldX: world.x,
      startWorldY: world.y,
    };
    this.armDomTracking(pointer);
  }

  private onScenePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || this.drag.active) return;
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
    if (!this.gestureOwns(pointer.id)) return;
    this.handleMoveWorld(this.pointerWorld(pointer));
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.gestureOwns(pointer.id)) return;
    this.handleUpWorld(this.pointerWorld(pointer));
  }

  private onDomPointerMove = (event: PointerEvent): void => {
    if (!this.hasGesture()) return;
    this.handleMoveWorld(this.clientToWorld(event.clientX, event.clientY));
  };

  private onDomPointerUp = (event: PointerEvent): void => {
    if (!this.hasGesture()) return;
    this.handleUpWorld(this.clientToWorld(event.clientX, event.clientY));
  };

  private onDomPointerCancel = (): void => {
    if (!this.hasGesture()) return;
    this.pending = null;
    this.cancelDrag();
    this.disarmDomTracking();
  };

  private onDomTouchMove = (event: TouchEvent): void => {
    if (!this.hasGesture() || event.touches.length === 0) return;
    event.preventDefault();
    const t = event.touches[0]!;
    this.handleMoveWorld(this.clientToWorld(t.clientX, t.clientY));
  };

  private onDomTouchEnd = (event: TouchEvent): void => {
    if (!this.hasGesture()) return;
    const t = event.changedTouches[0];
    if (!t) return;
    this.handleUpWorld(this.clientToWorld(t.clientX, t.clientY));
  };

  private onDomTouchCancel = (): void => {
    this.onDomPointerCancel();
  };

  private hasGesture(): boolean {
    return this.drag.active || this.pending !== null;
  }

  private gestureOwns(pointerId: number): boolean {
    if (this.drag.active) return pointerId === this.drag.pointerId;
    if (this.pending) return pointerId === this.pending.pointerId;
    return false;
  }

  private handleMoveWorld(world: { x: number; y: number }): void {
    if (this.pending) {
      const dx = world.x - this.pending.startWorldX;
      const dy = world.y - this.pending.startWorldY;
      if (Math.hypot(dx, dy) >= TAP_MAX_MOVE_WORLD) {
        const puck = this.pending.puck;
        const pointerId = this.pending.pointerId;
        this.pending = null;
        this.beginDragAt(
          puck,
          pointerId,
          world.x,
          world.y,
          /* relativeToGesture */ false,
        );
      }
      return;
    }

    if (!this.drag.active) return;
    this.updateAimWorld(world.x, world.y);
  }

  private handleUpWorld(world: { x: number; y: number }): void {
    if (this.pending) {
      const puck = this.pending.puck;
      this.pending = null;
      this.disarmDomTracking();
      if (this.selected?.id === puck.id) {
        this.clearSelection();
        this.opts.onSelect?.(null);
      } else {
        this.selected = puck;
        this.opts.onSelect?.(puck);
      }
      return;
    }

    if (!this.drag.active) return;

    const puck = this.drag.puck;
    const shot = puck ? this.computeShotWorld(world.x, world.y, puck) : null;
    this.cancelDrag();
    this.disarmDomTracking();

    if (!puck || !shot) {
      if (this.selected) this.clearSelection();
      return;
    }

    this.clearSelection();
    this.opts.onAimEnd?.();
    // Physics lives in @puck-off/game-engine — MatchController applies the shot.
    this.opts.onLaunch?.(puck, shot);
  }

  private beginDrag(
    puck: PuckEntity,
    pointer: Phaser.Input.Pointer,
    relativeToGesture: boolean,
  ): void {
    this.armDomTracking(pointer);
    const world = this.pointerWorld(pointer);
    this.beginDragAt(
      puck,
      pointer.id,
      world.x,
      world.y,
      relativeToGesture,
    );
  }

  private beginDragAt(
    puck: PuckEntity,
    pointerId: number,
    worldX: number,
    worldY: number,
    relativeToGesture: boolean,
  ): void {
    this.drag.active = true;
    this.drag.pointerId = pointerId;
    this.drag.puck = puck;
    this.drag.originX = worldX;
    this.drag.originY = worldY;
    this.drag.relativeToGesture = relativeToGesture;
    this.updateAimWorld(worldX, worldY);
  }

  private cancelDrag(): void {
    this.drag.active = false;
    this.drag.puck = null;
    this.drag.relativeToGesture = false;
    this.aim.hide();
    this.opts.onAimEnd?.();
  }

  private clearSelection(): void {
    this.selected = null;
  }

  private updateAimWorld(worldX: number, worldY: number): void {
    const puck = this.drag.puck;
    if (!puck) return;
    const shot = this.computeShotWorld(worldX, worldY, puck);
    if (!shot) {
      this.aim.hide();
      this.opts.onAimEnd?.();
      return;
    }
    const { x, y } = puck.body.position;
    this.aim.show(x, y, shot.angle, shot.power, puck.sprite.fillColor);
    this.opts.onAim?.(puck, shot);
  }

  private computeShotWorld(
    worldX: number,
    worldY: number,
    puck: PuckEntity,
  ): { angle: number; power: number } | null {
    let dragX: number;
    let dragY: number;

    if (this.drag.relativeToGesture) {
      dragX = worldX - this.drag.originX;
      dragY = worldY - this.drag.originY;
    } else {
      dragX = worldX - puck.body.position.x;
      dragY = worldY - puck.body.position.y;
    }

    const dist = Math.hypot(dragX, dragY);
    if (dist < u(6)) return null;

    const power = Math.min(1, dist / PROTOTYPE_CONFIG.shot.maxDragPx);
    const angle = Math.atan2(-dragY, -dragX);
    return { angle, power };
  }
}
