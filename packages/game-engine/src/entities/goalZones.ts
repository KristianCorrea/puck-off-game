import {
  ARENA_CONFIG,
  GOAL_CONFIG,
  getFieldBounds,
  type GoalSide,
} from "@puck-off/shared";

export type GoalZone = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export function createGoalZones(): Record<GoalSide, GoalZone> {
  const { wallThickness } = ARENA_CONFIG;
  const { openingHeight, depth, postThickness } = GOAL_CONFIG;
  const field = getFieldBounds();
  const mouthTop = field.centerY - openingHeight / 2;
  const mouthBottom = mouthTop + openingHeight;

  return {
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
}

export function pointInGoalSide(
  x: number,
  y: number,
  zones: Record<GoalSide, GoalZone>,
): GoalSide | null {
  for (const side of ["player1", "player2"] as GoalSide[]) {
    const z = zones[side];
    if (x >= z.minX && x <= z.maxX && y >= z.minY && y <= z.maxY) return side;
  }
  return null;
}
