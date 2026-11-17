/**
 * Visual/physics config — re-exported from @puck-off/shared (Phase 3).
 */
export {
  DESIGN_SCALE,
  u,
  ARENA_CONFIG as PROTOTYPE_ARENA,
  getFieldBounds,
  type GoalSide,
  GAME_CONFIG,
} from "@puck-off/shared";

import {
  ARENA_CONFIG,
  BALL_CONFIG,
  GOAL_CONFIG,
  PUCK_CONFIG,
  SETTLE_CONFIG,
  SHOT_CONFIG,
} from "@puck-off/shared";

/** Back-compat shape used across the Phaser client. */
export const PROTOTYPE_CONFIG = {
  arena: ARENA_CONFIG,
  goal: GOAL_CONFIG,
  puck: PUCK_CONFIG,
  ball: BALL_CONFIG,
  shot: SHOT_CONFIG,
  settle: SETTLE_CONFIG,
} as const;
