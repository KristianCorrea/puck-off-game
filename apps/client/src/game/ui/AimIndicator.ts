import type Phaser from "phaser";
import { PROTOTYPE_CONFIG, u } from "../config/prototypeConfig";

export type AimStretch = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

/**
 * Slingshot aim: drag away from puck; arrow shows launch direction (opposite drag).
 * Optional stretch band for select-then-drag-anywhere (local only).
 * Charge rings are drawn by GameFx — this stays arrow-only.
 */
export class AimIndicator {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private visible = false;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(20);
  }

  show(
    originX: number,
    originY: number,
    angle: number,
    power: number,
    color = 0xffe066,
    stretch?: AimStretch,
  ): void {
    this.visible = true;
    const g = this.graphics;
    g.clear();

    if (stretch) this.drawStretch(stretch, power, color);

    const length =
      u(40) + power * (PROTOTYPE_CONFIG.shot.maxDragPx * 0.85);
    const endX = originX + Math.cos(angle) * length;
    const endY = originY + Math.sin(angle) * length;

    const strength = 0.45 + power * 0.55;
    const tipColor = power > 0.7 ? 0xff6b6b : color;

    // Soft power glow behind the arrow
    g.lineStyle(u(10), tipColor, 0.12 + power * 0.18);
    g.beginPath();
    g.moveTo(originX, originY);
    g.lineTo(endX, endY);
    g.strokePath();

    g.lineStyle(u(4), tipColor, strength);
    g.beginPath();
    g.moveTo(originX, originY);
    g.lineTo(endX, endY);
    g.strokePath();

    const head = u(14) + power * u(8);
    const left = angle + Math.PI * 0.82;
    const right = angle - Math.PI * 0.82;
    g.fillStyle(tipColor, strength);
    g.fillTriangle(
      endX,
      endY,
      endX + Math.cos(left) * head,
      endY + Math.sin(left) * head,
      endX + Math.cos(right) * head,
      endY + Math.sin(right) * head,
    );

    const ticks = 5;
    for (let i = 1; i <= ticks; i++) {
      const t = i / ticks;
      if (t > power) break;
      const px = originX + Math.cos(angle) * (u(18) + t * u(28));
      const py = originY + Math.sin(angle) * (u(18) + t * u(28));
      g.fillStyle(0xff9f1c, 0.9);
      g.fillCircle(px, py, u(3));
    }
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }

  /** Rubber-band from click-hold origin to current finger (secondary flick). */
  private drawStretch(
    stretch: AimStretch,
    power: number,
    color: number,
  ): void {
    const g = this.graphics;
    const { fromX, fromY, toX, toY } = stretch;
    const alpha = 0.35 + power * 0.45;

    g.lineStyle(u(8), color, 0.12 + power * 0.12);
    g.beginPath();
    g.moveTo(fromX, fromY);
    g.lineTo(toX, toY);
    g.strokePath();

    g.lineStyle(u(3), 0xf8fafc, alpha);
    g.beginPath();
    g.moveTo(fromX, fromY);
    g.lineTo(toX, toY);
    g.strokePath();

    // Anchor = click-hold; tip = finger.
    g.fillStyle(0xf8fafc, 0.9);
    g.fillCircle(fromX, fromY, u(5));
    g.lineStyle(u(2), color, 0.85);
    g.strokeCircle(fromX, fromY, u(5));

    g.fillStyle(color, 0.75 + power * 0.25);
    g.fillCircle(toX, toY, u(4) + power * u(2));
  }
}
