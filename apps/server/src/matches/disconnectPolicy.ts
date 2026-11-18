import { MATCH_CONFIG, type PlayerId } from "@puck-off/shared";

/**
 * Isolated disconnect / abandon policy (Phase 6).
 * Change here without touching room join / launch logic.
 */
export const DISCONNECT_POLICY = {
  reconnectWindowMs: MATCH_CONFIG.reconnectWindowMs,
  /** Mid-match abandon (timeout or intentional leave): remaining player wins. */
  abandonRule: "opponent_wins" as const,
};

export function winnerOnAbandon(disconnected: PlayerId): PlayerId {
  return disconnected === "player1" ? "player2" : "player1";
}
