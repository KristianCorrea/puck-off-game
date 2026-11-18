import { Match } from "@puck-off/game-engine";
import {
  MATCH_CONFIG,
  type LaunchAction,
  type MatchState,
  type PhysicsKeyframe,
  type TurnResolvedPayload,
} from "@puck-off/shared";

/**
 * Wraps one authoritative Match for a room.
 * Settles shots in-process and attaches keyframes for client replay.
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
   * Apply launch intent and settle to finals + keyframes.
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
      payload: toTurnResolved(settled.state, "launch", settled.keyframes),
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
  keyframes: PhysicsKeyframe[] = [],
): TurnResolvedPayload {
  const every = Math.max(1, MATCH_CONFIG.keyframeEverySteps);
  return {
    state,
    score: { ...state.score },
    currentTurn: state.phase === "MATCH_END" ? null : state.currentTurn,
    phase: state.phase,
    winner: state.result,
    remainingTimeMs: state.turnRemainingMs,
    reason,
    keyframes,
    keyframeDtMs: MATCH_CONFIG.fixedStepMs * every,
  };
}
