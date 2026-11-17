import type Phaser from "phaser";
import {
  PROTOTYPE_CONFIG,
  getFieldBounds,
  type GoalSide,
} from "../config/prototypeConfig";

/** Axis-aligned goal zone — ball/puck **center** counts if inside. */
export type GoalZone = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type GoalSensors = {
  player1: MatterJS.BodyType;
  player2: MatterJS.BodyType;
  /** Authoritative scoring / eject regions (mouth through pocket). */
  zones: Record<GoalSide, GoalZone>;
};

const cageOpts = {
  isStatic: true,
  label: "goal_cage",
  friction: 0.2,
  restitution: 0.7,
} as const;

/**
 * Recessed goals with solid cages.
 * Score / eject zone = entire region from the pitch-side mouth line
 * through the pocket to the back board.
 */
export function createGoals(scene: Phaser.Scene): GoalSensors {
  const { wallThickness } = PROTOTYPE_CONFIG.arena;
  const { openingHeight, depth, postThickness, color, netColor, sensorAlpha } =
    PROTOTYPE_CONFIG.goal;
  const field = getFieldBounds();
  const matter = scene.matter;

  const mouthTop = field.centerY - openingHeight / 2;
  const mouthBottom = mouthTop + openingHeight;

  const topPostY = mouthTop - postThickness / 2;
  const bottomPostY = mouthBottom + postThickness / 2;

  // --- Left cage (P1) ---
  matter.add.rectangle(
    postThickness / 2,
    field.centerY,
    postThickness,
    openingHeight + postThickness * 2,
    cageOpts,
  );
  matter.add.rectangle(depth / 2, topPostY, depth, postThickness, cageOpts);
  matter.add.rectangle(depth / 2, bottomPostY, depth, postThickness, cageOpts);
  matter.add.rectangle(
    depth / 2,
    field.top + wallThickness / 2,
    depth,
    wallThickness,
    cageOpts,
  );
  matter.add.rectangle(
    depth / 2,
    field.bottom - wallThickness / 2,
    depth,
    wallThickness,
    cageOpts,
  );

  // --- Right cage (P2) ---
  matter.add.rectangle(
    field.right + depth - postThickness / 2,
    field.centerY,
    postThickness,
    openingHeight + postThickness * 2,
    cageOpts,
  );
  matter.add.rectangle(
    field.right + depth / 2,
    topPostY,
    depth,
    postThickness,
    cageOpts,
  );
  matter.add.rectangle(
    field.right + depth / 2,
    bottomPostY,
    depth,
    postThickness,
    cageOpts,
  );
  matter.add.rectangle(
    field.right + depth / 2,
    field.top + wallThickness / 2,
    depth,
    wallThickness,
    cageOpts,
  );
  matter.add.rectangle(
    field.right + depth / 2,
    field.bottom - wallThickness / 2,
    depth,
    wallThickness,
    cageOpts,
  );

  const zones: Record<GoalSide, GoalZone> = {
    player1: {
      minX: postThickness,
      maxX: field.left + wallThickness,
      minY: mouthTop,
      maxY: mouthBottom,
    },
    player2: {
      minX: field.right - wallThickness,
      maxX: field.right + depth - postThickness,
      minY: mouthTop,
      maxY: mouthBottom,
    },
  };

  const player1 = addZoneSensor(matter, zones.player1, "goal_player1");
  const player2 = addZoneSensor(matter, zones.player2, "goal_player2");

  drawGoalVisuals(scene, {
    depth,
    openingHeight,
    mouthTop,
    mouthBottom,
    postThickness,
    wallThickness,
    color,
    netColor,
    sensorAlpha,
    fieldLeft: field.left,
    fieldRight: field.right,
    zones,
  });

  return { player1, player2, zones };
}

function addZoneSensor(
  matter: Phaser.Physics.Matter.MatterPhysics,
  zone: GoalZone,
  label: string,
): MatterJS.BodyType {
  const w = zone.maxX - zone.minX;
  const h = zone.maxY - zone.minY;
  return matter.add.rectangle(zone.minX + w / 2, zone.minY + h / 2, w, h, {
    isStatic: true,
    isSensor: true,
    label,
  });
}

function drawGoalVisuals(
  scene: Phaser.Scene,
  opts: {
    depth: number;
    openingHeight: number;
    mouthTop: number;
    mouthBottom: number;
    postThickness: number;
    wallThickness: number;
    color: number;
    netColor: number;
    sensorAlpha: number;
    fieldLeft: number;
    fieldRight: number;
    zones: Record<GoalSide, GoalZone>;
  },
): void {
  const {
    depth,
    openingHeight,
    mouthTop,
    mouthBottom,
    postThickness,
    wallThickness,
    color,
    netColor,
    sensorAlpha,
    fieldLeft,
    fieldRight,
    zones,
  } = opts;

  const g = scene.add.graphics().setDepth(3);

  g.fillStyle(netColor, 0.4);
  g.fillRect(postThickness, mouthTop, depth - postThickness, openingHeight);
  g.fillRect(fieldRight, mouthTop, depth - postThickness, openingHeight);

  g.fillStyle(color, 0.98);
  g.fillRect(
    0,
    mouthTop - postThickness,
    postThickness,
    openingHeight + postThickness * 2,
  );
  g.fillRect(0, mouthTop - postThickness, depth, postThickness);
  g.fillRect(0, mouthBottom, depth, postThickness);
  g.fillRect(
    fieldRight + depth - postThickness,
    mouthTop - postThickness,
    postThickness,
    openingHeight + postThickness * 2,
  );
  g.fillRect(fieldRight, mouthTop - postThickness, depth, postThickness);
  g.fillRect(fieldRight, mouthBottom, depth, postThickness);

  g.lineStyle(3, color, 1);
  g.strokeRect(fieldLeft, mouthTop, wallThickness, openingHeight);
  g.strokeRect(
    fieldRight - wallThickness,
    mouthTop,
    wallThickness,
    openingHeight,
  );

  g.fillStyle(color, sensorAlpha);
  for (const side of ["player1", "player2"] as GoalSide[]) {
    const z = zones[side];
    g.fillRect(z.minX, z.minY, z.maxX - z.minX, z.maxY - z.minY);
  }

  g.lineStyle(1, 0xfff3c4, 0.4);
  const netStep = 14;
  for (let x = postThickness + netStep; x < depth - 2; x += netStep) {
    g.lineBetween(x, mouthTop, x, mouthBottom);
  }
  for (let y = mouthTop + netStep; y < mouthBottom; y += netStep) {
    g.lineBetween(postThickness, y, depth - 2, y);
  }
  for (
    let x = fieldRight + netStep;
    x < fieldRight + depth - postThickness;
    x += netStep
  ) {
    g.lineBetween(x, mouthTop, x, mouthBottom);
  }
  for (let y = mouthTop + netStep; y < mouthBottom; y += netStep) {
    g.lineBetween(fieldRight, y, fieldRight + depth - postThickness, y);
  }
}

/** Goal if body **center** is in the zone (mouth line → back of pocket). */
export function ballInGoalSide(
  ball: MatterJS.BodyType,
  goals: GoalSensors,
): GoalSide | null {
  return pointInGoalSide(ball.position.x, ball.position.y, goals);
}

export function pointInGoalSide(
  x: number,
  y: number,
  goals: GoalSensors,
): GoalSide | null {
  if (pointInZone(x, y, goals.zones.player1)) return "player1";
  if (pointInZone(x, y, goals.zones.player2)) return "player2";
  return null;
}

function pointInZone(x: number, y: number, zone: GoalZone): boolean {
  return x >= zone.minX && x <= zone.maxX && y >= zone.minY && y <= zone.maxY;
}
