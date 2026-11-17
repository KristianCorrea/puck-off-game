import type { GoalSide, PlayerId } from "@puck-off/shared";
import type { MatterWorld } from "./physics/MatterWorld";

/** Ball entered this goal → opponent scores. */
export function scorerForGoalIn(goalSide: GoalSide): PlayerId {
  return goalSide === "player1" ? "player2" : "player1";
}

/**
 * Locked post-goal reset: ball → midfield, all pucks → defense spawn.
 */
export function handleGoalReset(world: MatterWorld): void {
  world.resetBallMidfield();
  world.resetAllPucksToSpawn();
}
