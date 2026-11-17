import type { PlayerId } from "./MatchPhase";

/** Client intent — never trust score/winner/physics from the client. */
export type LaunchAction = {
  playerId: PlayerId;
  puckId: string;
  /** Radians */
  angle: number;
  /** 0..1 */
  power: number;
};
