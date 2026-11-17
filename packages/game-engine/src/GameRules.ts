import {
  MATCH_CONFIG,
  SHOT_CONFIG,
  type LaunchAction,
  type MatchPhase,
  type PlayerId,
} from "@puck-off/shared";
import type { MatterWorld } from "./physics/MatterWorld";

export type ValidationError =
  | "MATCH_NOT_STARTED"
  | "MATCH_ENDED"
  | "WRONG_PHASE"
  | "WRONG_TURN"
  | "UNKNOWN_PUCK"
  | "NOT_OWNER"
  | "INVALID_POWER"
  | "INVALID_ANGLE";

export function validateLaunch(
  phase: MatchPhase,
  currentTurn: PlayerId,
  world: MatterWorld,
  action: LaunchAction,
): ValidationError | null {
  if (phase === "MATCH_END") return "MATCH_ENDED";
  if (phase !== "PLAYER_TURN") return "WRONG_PHASE";
  if (action.playerId !== currentTurn) return "WRONG_TURN";

  const puck = world.getPuck(action.puckId);
  if (!puck) return "UNKNOWN_PUCK";
  if (puck.ownerId !== action.playerId) return "NOT_OWNER";

  if (
    !Number.isFinite(action.power) ||
    action.power < SHOT_CONFIG.minPower ||
    action.power > 1
  ) {
    return "INVALID_POWER";
  }
  if (!Number.isFinite(action.angle)) return "INVALID_ANGLE";

  return null;
}

export function clampPower(power: number): number {
  return Math.min(1, Math.max(SHOT_CONFIG.minPower, power));
}

export function hasWinner(score: {
  player1: number;
  player2: number;
}): PlayerId | null {
  if (score.player1 >= MATCH_CONFIG.maxGoals) return "player1";
  if (score.player2 >= MATCH_CONFIG.maxGoals) return "player2";
  return null;
}
