import { Match } from "@puck-off/game-engine";
import {
  type LaunchAction,
  type MatchState,
  type TurnResolvedPayload,
} from "@puck-off/shared";

/**
 * Wraps one authoritative Match for a room.
 * Settles shots in-process (no per-frame socket spam).
 */
export class MatchManager {
  private match: Match | null = null;

  start(): MatchState {
    this.match?.destroy();
    this.match = new Match();
    return this.match.start();
  }

  rematch(): MatchState {
    return this.start();
  }

  destroy(): void {
    this.match?.destroy();
    this.match = null;
  }

  getState(): MatchState | null {
    if (!this.match) return null;
    return this.match.getState();
  }

  /** Advance turn clock; returns state if a skip happened. */
  tick(deltaMs: number): { skipped: boolean; state: MatchState } | null {
    if (!this.match) return null;
    return this.match.tick(deltaMs);
  }

  /**
   * Apply launch intent and settle to finals.
   * Goals auto-complete via Match.settle() (no celebration wait on server).
   */
  applyLaunch(action: LaunchAction):
    | { ok: true; payload: TurnResolvedPayload }
    | { ok: false; reason: string } {
    if (!this.match) {
      return { ok: false, reason: "MATCH_NOT_STARTED" };
    }

    const started = this.match.applyAction(action);
    if (!started.ok) {
      return { ok: false, reason: started.reason };
    }

    const settled = this.match.settle();
    return {
      ok: true,
      payload: toTurnResolved(settled.state, "launch"),
    };
  }

  skipTurnPayload(): TurnResolvedPayload | null {
    if (!this.match) return null;
    const state = this.match.skipTurn();
    return toTurnResolved(state, "timeout");
  }
}

export function toTurnResolved(
  state: MatchState,
  reason: TurnResolvedPayload["reason"],
): TurnResolvedPayload {
  return {
    state,
    score: { ...state.score },
    currentTurn: state.phase === "MATCH_END" ? null : state.currentTurn,
    phase: state.phase,
    winner: state.result,
    remainingTimeMs: state.turnRemainingMs,
    reason,
  };
}
