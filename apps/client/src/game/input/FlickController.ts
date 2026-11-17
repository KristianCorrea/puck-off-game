import type Phaser from "phaser";
import { PROTOTYPE_CONFIG } from "../config/prototypeConfig";
import { applyImpulse, type PuckEntity } from "../entities/createPuck";
import { AimIndicator } from "../ui/AimIndicator";

type DragState = {
  active: boolean;
  pointerId: number;
  puck: PuckEntity | null;
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
 * Multi-puck slingshot: only selectable pucks respond to pointerdown.
 */
export class FlickController {
  private readonly scene: Phaser.Scene;
  private readonly aim: AimIndicator;
  private readonly opts: FlickControllerOptions;
  private readonly drag: DragState = {
    active: false,
    pointerId: -1,
    puck: null,
  };
  private enabled = true;
  private readonly handlers = new Map<string, PuckHandler>();
  private boundPucks: PuckEntity[] = [];

  constructor(scene: Phaser.Scene, opts: FlickControllerOptions) {
    this.scene = scene;
    this.opts = opts;
    this.aim = new AimIndicator(scene);

    scene.input.on("pointermove", this.onPointerMove, this);
    scene.input.on("pointerup", this.onPointerUp, this);
    scene.input.on("pointerupoutside", this.onPointerUp, this);
  }

  bindPucks(pucks: PuckEntity[]): void {
    this.unbindPucks();
    this.boundPucks = pucks;
    for (const puck of pucks) {
      const handler: PuckHandler = (pointer, _lx, _ly, event) => {
        this.beginDrag(puck, pointer, event);
      };
      this.handlers.set(puck.id, handler);
      puck.sprite.on("pointerdown", handler);
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) this.cancelDrag();
  }

  destroy(): void {
    this.unbindPucks();
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

  private beginDrag(
    puck: PuckEntity,
    pointer: Phaser.Input.Pointer,
    event: Phaser.Types.Input.EventData,
  ): void {
    if (!this.enabled || this.drag.active) return;
    const selectable = this.opts.getSelectablePucks();
    if (!selectable.some((p) => p.id === puck.id)) return;

    event.stopPropagation();
    this.drag.active = true;
    this.drag.pointerId = pointer.id;
    this.drag.puck = puck;
    this.updateAim(pointer);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.drag.active || pointer.id !== this.drag.pointerId) return;
    this.updateAim(pointer);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.drag.active || pointer.id !== this.drag.pointerId) return;

    const puck = this.drag.puck;
    const shot = puck ? this.computeShot(pointer, puck) : null;
    this.cancelDrag();

    if (!puck || !shot) return;

    applyImpulse(puck, shot.angle, shot.power);
    this.opts.onLaunch?.(puck);
  }

  private cancelDrag(): void {
    this.drag.active = false;
    this.drag.puck = null;
    this.aim.hide();
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
    const { x, y } = puck.body.position;
    const world = this.pointerWorld(pointer);
    const dragX = world.x - x;
    const dragY = world.y - y;
    const dist = Math.hypot(dragX, dragY);
    if (dist < 6) return null;

    const power = Math.min(1, dist / PROTOTYPE_CONFIG.shot.maxDragPx);
    const angle = Math.atan2(-dragY, -dragX);
    return { angle, power };
  }
}
