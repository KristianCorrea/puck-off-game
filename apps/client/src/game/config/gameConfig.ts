import { PROTOTYPE_CONFIG } from "./prototypeConfig";

/** Match rules for Phase 2 local play (evolves into shared GAME_CONFIG). */
export const MATCH_CONFIG = {
  pucksPerPlayer: 5,
  maxGoals: 3,
  /** 3 minutes */
  matchDurationMs: 180_000,
  /** Frames all bodies must stay under stopSpeed before settle */
  settleStableFrames: 14,
  /** Safety cap so a turn cannot hang forever */
  settleMaxMs: 10_000,
  /** Hold the scored positions so players can see the goal before reset */
  goalCelebrationMs: 5_000,
  players: {
    player1: {
      id: "player1" as const,
      label: "Player 1",
      short: "P1",
      color: 0x2ec4b6,
      strokeColor: 0x1a9e93,
    },
    player2: {
      id: "player2" as const,
      label: "Player 2",
      short: "P2",
      color: 0xe76f51,
      strokeColor: 0xc45a3c,
    },
  },
} as const;

export type PlayerId = keyof typeof MATCH_CONFIG.players;

export type MatchPhase =
  | "PLAYER_TURN"
  | "PHYSICS_RESOLUTION"
  | "GOAL_RESOLUTION"
  | "MATCH_END";

export type MatchResult = "player1" | "player2" | "draw" | null;

/** Physics + arena still live in prototypeConfig for Phase 1 continuity. */
export { PROTOTYPE_CONFIG, getFieldBounds, type GoalSide } from "./prototypeConfig";

export const GAME_CONFIG = {
  ...PROTOTYPE_CONFIG,
  match: MATCH_CONFIG,
} as const;
