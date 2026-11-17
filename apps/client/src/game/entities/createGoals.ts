import type Phaser from "phaser";
import {
  PROTOTYPE_CONFIG,
  getFieldBounds,
  type GoalSide,
} from "../config/prototypeConfig";

export type GoalSensors = {
  player1: MatterJS.BodyType;
  player2: MatterJS.BodyType;
};

const cageOpts = {
  isStatic: true,
  label: "goal_cage",
  friction: 0.2,
  restitution: 0.7,
} as const;

/**
 * Soccer Stars–style recessed goals:
 * solid back + posts (bounce) and an inner sensor (score detection).
 */
export function createGoals(scene: Phaser.Scene): GoalSensors {
  const { height, wallThickness } = PROTOTYPE_CONFIG.arena;
  const {
    openingHeight,
    depth,
    postThickness,
    sensorPadding,
    color,
    netColor,
    sensorAlpha,
  } = PROTOTYPE_CONFIG.goal;
  const field = getFieldBounds();
  const matter = scene.matter;

  const halfOpen = openingHeight / 2;
  const mouthTop = height / 2 - halfOpen;
  const mouthBottom = height / 2 + halfOpen;
  const sensorH = openingHeight - sensorPadding * 2;
  const sensorW = Math.max(24, depth - postThickness - 12);

  // --- Left cage (P1) ---
  matter.add.rectangle(
    postThickness / 2,
    height / 2,
    postThickness,
    openingHeight + postThickness * 2,
    cageOpts,
  );
  matter.add.rectangle(
    depth / 2,
    mouthTop + postThickness / 2,
    depth,
    postThickness,
    cageOpts,
  );
  matter.add.rectangle(
    depth / 2,
    mouthBottom - postThickness / 2,
    depth,
    postThickness,
    cageOpts,
  );
  // Seal pocket to arena top/bottom so nothing leaves the canvas
  matter.add.rectangle(depth / 2, wallThickness / 2, depth, wallThickness, cageOpts);
  matter.add.rectangle(
    depth / 2,
    height - wallThickness / 2,
    depth,
    wallThickness,
    cageOpts,
  );

  // --- Right cage (P2) ---
  matter.add.rectangle(
    field.right + depth - postThickness / 2,
    height / 2,
    postThickness,
    openingHeight + postThickness * 2,
    cageOpts,
  );
  matter.add.rectangle(
    field.right + depth / 2,
    mouthTop + postThickness / 2,
    depth,
    postThickness,
    cageOpts,
  );
  matter.add.rectangle(
    field.right + depth / 2,
    mouthBottom - postThickness / 2,
    depth,
    postThickness,
    cageOpts,
  );
  matter.add.rectangle(
    field.right + depth / 2,
    wallThickness / 2,
    depth,
    wallThickness,
    cageOpts,
  );
  matter.add.rectangle(
    field.right + depth / 2,
    height - wallThickness / 2,
    depth,
    wallThickness,
    cageOpts,
  );

  // Sensors sit inside the pocket (not the outer rim)
  const player1 = matter.add.rectangle(
    postThickness + sensorW / 2,
    height / 2,
    sensorW,
    sensorH,
    {
      isStatic: true,
      isSensor: true,
      label: "goal_player1",
    },
  );

  const player2 = matter.add.rectangle(
    field.right + depth - postThickness - sensorW / 2,
    height / 2,
    sensorW,
    sensorH,
    {
      isStatic: true,
      isSensor: true,
      label: "goal_player2",
    },
  );

  drawGoalVisuals(scene, {
    depth,
    openingHeight,
    mouthTop,
    postThickness,
    color,
    netColor,
    sensorAlpha,
    sensorW,
    sensorH,
    fieldRight: field.right,
  });

  scene.add
    .text(field.left + wallThickness + 10, height / 2, "P1", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      color: "#f4a261",
    })
    .setOrigin(0, 0.5)
    .setDepth(5);

  scene.add
    .text(field.right - wallThickness - 10, height / 2, "P2", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      color: "#f4a261",
    })
    .setOrigin(1, 0.5)
    .setDepth(5);

  return { player1, player2 };
}

function drawGoalVisuals(
  scene: Phaser.Scene,
  opts: {
    depth: number;
    openingHeight: number;
    mouthTop: number;
    postThickness: number;
    color: number;
    netColor: number;
    sensorAlpha: number;
    sensorW: number;
    sensorH: number;
    fieldRight: number;
  },
): void {
  const {
    depth,
    openingHeight,
    mouthTop,
    postThickness,
    color,
    netColor,
    sensorAlpha,
    sensorW,
    sensorH,
    fieldRight,
  } = opts;
  const { height } = PROTOTYPE_CONFIG.arena;

  const g = scene.add.graphics().setDepth(3);

  // Net fill
  g.fillStyle(netColor, 0.35);
  g.fillRect(postThickness, mouthTop + postThickness, depth - postThickness, openingHeight - postThickness * 2);
  g.fillRect(
    fieldRight,
    mouthTop + postThickness,
    depth - postThickness,
    openingHeight - postThickness * 2,
  );

  // Posts / back (solid look)
  g.fillStyle(color, 0.95);
  // Left back + posts
  g.fillRect(0, mouthTop - postThickness, postThickness, openingHeight + postThickness * 2);
  g.fillRect(0, mouthTop, depth, postThickness);
  g.fillRect(0, mouthTop + openingHeight - postThickness, depth, postThickness);
  // Right back + posts
  g.fillRect(
    fieldRight + depth - postThickness,
    mouthTop - postThickness,
    postThickness,
    openingHeight + postThickness * 2,
  );
  g.fillRect(fieldRight, mouthTop, depth, postThickness);
  g.fillRect(fieldRight, mouthTop + openingHeight - postThickness, depth, postThickness);

  // Sensor tint
  g.fillStyle(color, sensorAlpha);
  g.fillRect(postThickness, height / 2 - sensorH / 2, sensorW, sensorH);
  g.fillRect(
    fieldRight + depth - postThickness - sensorW,
    height / 2 - sensorH / 2,
    sensorW,
    sensorH,
  );

  // Net lines
  g.lineStyle(1, 0xffe0c2, 0.35);
  const netStep = 14;
  for (let x = postThickness + netStep; x < depth - 2; x += netStep) {
    g.lineBetween(x, mouthTop + postThickness, x, mouthTop + openingHeight - postThickness);
  }
  for (let y = mouthTop + postThickness + netStep; y < mouthTop + openingHeight - postThickness; y += netStep) {
    g.lineBetween(postThickness, y, depth - 2, y);
  }
  for (let x = fieldRight + netStep; x < fieldRight + depth - postThickness; x += netStep) {
    g.lineBetween(x, mouthTop + postThickness, x, mouthTop + openingHeight - postThickness);
  }
  for (let y = mouthTop + postThickness + netStep; y < mouthTop + openingHeight - postThickness; y += netStep) {
    g.lineBetween(fieldRight, y, fieldRight + depth - postThickness, y);
  }
}

/**
 * Goal if the body's **center** is inside a goal sensor (not the full circle).
 */
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
  if (pointInBodyBounds(x, y, goals.player1)) return "player1";
  if (pointInBodyBounds(x, y, goals.player2)) return "player2";
  return null;
}

function pointInBodyBounds(
  x: number,
  y: number,
  body: MatterJS.BodyType,
): boolean {
  const { min, max } = body.bounds;
  return x >= min.x && x <= max.x && y >= min.y && y <= max.y;
}
