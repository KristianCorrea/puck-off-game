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
  const { wallThickness, wallColor, wallInner, floorColor, floorAccent } =
    PROTOTYPE_CONFIG.arena;
  const { openingHeight, depth } = PROTOTYPE_CONFIG.goal;
  const field = getFieldBounds();
  const matter = scene.matter;

  const sideWallHeight = (field.height - openingHeight) / 2;
  const halfOpen = openingHeight / 2;

  // Pitch floor with subtle two-tone bands
  const floor = scene.add.graphics().setDepth(0);
  floor.fillStyle(floorColor, 1);
  floor.fillRoundedRect(
    field.left,
    field.top,
    field.width,
    field.height,
    8,
  );
  floor.fillStyle(floorAccent, 0.35);
  const band = 48;
  for (let y = field.top; y < field.bottom; y += band * 2) {
    floor.fillRect(field.left, y, field.width, band);
  }

  const top = matter.add.rectangle(
    field.centerX,
    field.top + wallThickness / 2,
    field.width,
    wallThickness,
    wallOpts,
  );

  const bottom = matter.add.rectangle(
    field.centerX,
    field.bottom - wallThickness / 2,
    field.width,
    wallThickness,
    wallOpts,
  );

  const leftTop = matter.add.rectangle(
    field.left + wallThickness / 2,
    field.top + sideWallHeight / 2,
    wallThickness,
    sideWallHeight,
    wallOpts,
  );

  const leftBottom = matter.add.rectangle(
    field.left + wallThickness / 2,
    field.bottom - sideWallHeight / 2,
    wallThickness,
    sideWallHeight,
    wallOpts,
  );

  const rightTop = matter.add.rectangle(
    field.right - wallThickness / 2,
    field.top + sideWallHeight / 2,
    wallThickness,
    sideWallHeight,
    wallOpts,
  );

  const rightBottom = matter.add.rectangle(
    field.right - wallThickness / 2,
    field.bottom - sideWallHeight / 2,
    wallThickness,
    sideWallHeight,
    wallOpts,
  );

  const g = scene.add.graphics().setDepth(2);

  // Outer neon rail
  g.fillStyle(wallColor, 1);
  g.fillRect(field.left, field.top, field.width, wallThickness);
  g.fillRect(
    field.left,
    field.bottom - wallThickness,
    field.width,
    wallThickness,
  );
  g.fillRect(field.left, field.top, wallThickness, sideWallHeight);
  g.fillRect(
    field.left,
    field.bottom - sideWallHeight,
    wallThickness,
    sideWallHeight,
  );
  g.fillRect(
    field.right - wallThickness,
    field.top,
    wallThickness,
    sideWallHeight,
  );
  g.fillRect(
    field.right - wallThickness,
    field.bottom - sideWallHeight,
    wallThickness,
    sideWallHeight,
  );

  // Inner bevel
  g.fillStyle(wallInner, 0.85);
  const inset = 5;
  g.fillRect(
    field.left + inset,
    field.top + inset,
    field.width - inset * 2,
    wallThickness - inset,
  );
  g.fillRect(
    field.left + inset,
    field.bottom - wallThickness,
    field.width - inset * 2,
    wallThickness - inset,
  );

  // Pocket floors (mouth yellow trim is drawn with the goals)
  g.fillStyle(0x0a1624, 1);
  g.fillRect(
    0,
    field.centerY - halfOpen,
    depth,
    openingHeight,
  );
  g.fillRect(
    field.right,
    field.centerY - halfOpen,
    depth,
    openingHeight,
  );

  return { top, bottom, leftTop, leftBottom, rightTop, rightBottom };
}
