import type Phaser from "phaser";
import { PROTOTYPE_CONFIG, getFieldBounds } from "../config/prototypeConfig";

/** Center line, circle, and half accents — sits under pucks. */
export function drawPitchMarkings(scene: Phaser.Scene): void {
  const field = getFieldBounds();
  const { lineColor, wallThickness } = PROTOTYPE_CONFIG.arena;
  const g = scene.add.graphics().setDepth(1);

  const pad = wallThickness + 4;
  const innerLeft = field.left + pad;
  const innerRight = field.right - pad;
  const innerTop = field.top + pad;
  const innerBottom = field.bottom - pad;

  // Soft inner pitch outline
  g.lineStyle(2, lineColor, 0.22);
  g.strokeRoundedRect(
    innerLeft,
    innerTop,
    innerRight - innerLeft,
    innerBottom - innerTop,
    12,
  );

  // Halfway line
  g.lineStyle(3, lineColor, 0.45);
  g.lineBetween(field.centerX, innerTop, field.centerX, innerBottom);

  // Center circle + spot
  g.lineStyle(3, lineColor, 0.5);
  g.strokeCircle(field.centerX, field.centerY, 64);
  g.fillStyle(lineColor, 0.55);
  g.fillCircle(field.centerX, field.centerY, 5);

  // Kickoff dashes toward each goal
  g.lineStyle(2, lineColor, 0.28);
  for (const dir of [-1, 1]) {
    const x0 = field.centerX + dir * 90;
    g.lineBetween(x0, field.centerY - 18, x0 + dir * 36, field.centerY - 18);
    g.lineBetween(x0, field.centerY + 18, x0 + dir * 36, field.centerY + 18);
  }
}
