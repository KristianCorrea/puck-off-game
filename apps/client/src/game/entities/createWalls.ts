import type Phaser from "phaser";
import { PROTOTYPE_CONFIG, getFieldBounds } from "../config/prototypeConfig";

export type WallBodies = {
  top: MatterJS.BodyType;
  bottom: MatterJS.BodyType;
  leftTop: MatterJS.BodyType;
  leftBottom: MatterJS.BodyType;
  rightTop: MatterJS.BodyType;
  rightBottom: MatterJS.BodyType;
};

const wallOpts = {
  isStatic: true,
  label: "wall",
  friction: 0.2,
  restitution: 0.7,
} as const;

/**
 * Field walls with goal mouths open into recessed pockets (created in createGoals).
 */
export function createWalls(scene: Phaser.Scene): WallBodies {
  const { height, wallThickness, wallColor, floorColor } = PROTOTYPE_CONFIG.arena;
  const { openingHeight, depth, color } = PROTOTYPE_CONFIG.goal;
  const field = getFieldBounds();
  const matter = scene.matter;

  const sideWallHeight = (height - openingHeight) / 2;
  const halfOpen = openingHeight / 2;

  // Pitch floor (between pockets)
  scene.add
    .rectangle(field.centerX, field.centerY, field.width, height, floorColor)
    .setDepth(0);

  const top = matter.add.rectangle(
    field.centerX,
    wallThickness / 2,
    field.width,
    wallThickness,
    wallOpts,
  );

  const bottom = matter.add.rectangle(
    field.centerX,
    height - wallThickness / 2,
    field.width,
    wallThickness,
    wallOpts,
  );

  // Left side split around goal opening
  const leftTop = matter.add.rectangle(
    field.left + wallThickness / 2,
    sideWallHeight / 2,
    wallThickness,
    sideWallHeight,
    wallOpts,
  );

  const leftBottom = matter.add.rectangle(
    field.left + wallThickness / 2,
    height - sideWallHeight / 2,
    wallThickness,
    sideWallHeight,
    wallOpts,
  );

  // Right side split around goal opening
  const rightTop = matter.add.rectangle(
    field.right - wallThickness / 2,
    sideWallHeight / 2,
    wallThickness,
    sideWallHeight,
    wallOpts,
  );

  const rightBottom = matter.add.rectangle(
    field.right - wallThickness / 2,
    height - sideWallHeight / 2,
    wallThickness,
    sideWallHeight,
    wallOpts,
  );

  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(wallColor, 1);

  // Top / bottom boards
  g.fillRect(field.left, 0, field.width, wallThickness);
  g.fillRect(field.left, height - wallThickness, field.width, wallThickness);

  // Side boards (above/below mouths)
  g.fillRect(field.left, 0, wallThickness, sideWallHeight);
  g.fillRect(field.left, height - sideWallHeight, wallThickness, sideWallHeight);
  g.fillRect(field.right - wallThickness, 0, wallThickness, sideWallHeight);
  g.fillRect(
    field.right - wallThickness,
    height - sideWallHeight,
    wallThickness,
    sideWallHeight,
  );

  // Mouth edge highlights
  g.lineStyle(3, color, 0.95);
  g.strokeRect(
    field.left,
    height / 2 - halfOpen,
    wallThickness,
    openingHeight,
  );
  g.strokeRect(
    field.right - wallThickness,
    height / 2 - halfOpen,
    wallThickness,
    openingHeight,
  );

  // Subtle pocket floors
  g.fillStyle(0x101c2e, 1);
  g.fillRect(0, height / 2 - halfOpen, depth, openingHeight);
  g.fillRect(field.right, height / 2 - halfOpen, depth, openingHeight);

  return { top, bottom, leftTop, leftBottom, rightTop, rightBottom };
}
