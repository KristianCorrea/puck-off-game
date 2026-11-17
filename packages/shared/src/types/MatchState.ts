import type { MatchPhase, MatchResult, PlayerId } from "./MatchPhase";

export type Vec2 = { x: number; y: number };

export type BodyState = {
  id: string;
  position: Vec2;
  velocity: Vec2;
  angularVelocity: number;
};

export type PuckState = BodyState & {
  ownerId: PlayerId;
  spawn: Vec2;
};

export type MatchState = {
  phase: MatchPhase;
  result: MatchResult;
  currentTurn: PlayerId;
  turnRemainingMs: number;
  score: { player1: number; player2: number };
  ball: BodyState;
  pucks: PuckState[];
};
