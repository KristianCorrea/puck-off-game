export type MatchPhase =
  | "PLAYER_TURN"
  | "PHYSICS_RESOLUTION"
  | "GOAL_RESOLUTION"
  | "MATCH_END";

export type PlayerId = "player1" | "player2";

export type GoalSide = PlayerId;

export type MatchResult = PlayerId | "draw" | null;
