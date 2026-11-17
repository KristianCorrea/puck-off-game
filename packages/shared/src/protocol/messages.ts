/**
 * Protocol stubs for Phase 4+. Shapes only — no transport here.
 */
import type { LaunchAction } from "../types/LaunchAction";
import type { MatchState } from "../types/MatchState";
import type { MatchResult, PlayerId } from "../types/MatchPhase";

export type LaunchPuckMessage = {
  type: "LAUNCH_PUCK";
  action: LaunchAction;
};

export type TurnResolvedMessage = {
  type: "TURN_RESOLVED";
  state: MatchState;
  winner?: MatchResult;
};

export type RejectLaunchMessage = {
  type: "REJECT_LAUNCH";
  reason: string;
  playerId: PlayerId;
};
