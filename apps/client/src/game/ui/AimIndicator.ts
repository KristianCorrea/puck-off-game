import type Phaser from "phaser";
import { PROTOTYPE_CONFIG, u } from "../config/prototypeConfig";

/**
 * Slingshot aim: drag away from puck; arrow shows launch direction (opposite drag).
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
  ): void {
    this.visible = true;
    const g = this.graphics;
    g.clear();

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
}
