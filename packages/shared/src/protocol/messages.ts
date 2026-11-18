/**
 * Socket protocol shapes for Phase 4+.
 * Transport-agnostic — no Socket.IO imports here.
 */
import type { MatchPhase, MatchResult, PlayerId } from "../types/MatchPhase";
import type { MatchState } from "../types/MatchState";

/** Socket.IO event names (client ↔ server). */
export const SOCKET_EVENTS = {
  // Client → server
  CREATE_ROOM: "CREATE_ROOM",
  JOIN_ROOM: "JOIN_ROOM",
  READY: "READY",
  LAUNCH_PUCK: "LAUNCH_PUCK",
  REMATCH: "REMATCH",

  // Server → client
  ROOM_CREATED: "ROOM_CREATED",
  ROOM_STATE: "ROOM_STATE",
  PLAYER_JOINED: "PLAYER_JOINED",
  MATCH_START: "MATCH_START",
  TURN_RESOLVED: "TURN_RESOLVED",
  REJECT_LAUNCH: "REJECT_LAUNCH",
  ERROR: "ERROR",
} as const;

export type SocketEventName =
  (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

// ── Client → server payloads ───────────────────────────────────────────

export type CreateRoomPayload = Record<string, never>;

export type JoinRoomPayload = {
  code: string;
};

export type ReadyPayload = Record<string, never>;

/** Intent only — server assigns playerId from the socket's seat. */
export type LaunchPuckPayload = {
  puckId: string;
  /** Radians */
  angle: number;
  /** 0..1 */
  power: number;
};

export type RematchPayload = Record<string, never>;

// ── Server → client payloads ───────────────────────────────────────────

export type RoomCreatedPayload = {
  code: string;
  playerId: PlayerId;
};

export type RoomPlayerInfo = {
  playerId: PlayerId;
  ready: boolean;
  connected: boolean;
};

export type RoomStatePayload = {
  code: string;
  players: RoomPlayerInfo[];
  phase: "lobby" | "playing" | "ended";
  yourPlayerId: PlayerId | null;
};

export type PlayerJoinedPayload = {
  code: string;
  playerId: PlayerId;
  players: RoomPlayerInfo[];
};

export type MatchStartPayload = {
  code: string;
  state: MatchState;
};

/**
 * Authoritative end-of-shot (or skip) snapshot.
 * Prefer `state` as the full MatchState; flat fields mirror the phase guide.
 */
export type TurnResolvedPayload = {
  state: MatchState;
  /** Convenience mirrors of state (optional for clients). */
  score: { player1: number; player2: number };
  currentTurn: PlayerId | null;
  phase: MatchPhase;
  winner: MatchResult;
  remainingTimeMs: number;
  /** Why this resolve happened */
  reason: "launch" | "timeout" | "rematch";
};

export type RejectLaunchPayload = {
  reason: string;
};

export type ErrorPayload = {
  message: string;
};

// ── Legacy aliases (kept for older stubs) ──────────────────────────────

export type LaunchPuckMessage = {
  type: "LAUNCH_PUCK";
} & LaunchPuckPayload;

export type TurnResolvedMessage = {
  type: "TURN_RESOLVED";
} & TurnResolvedPayload;

export type RejectLaunchMessage = {
  type: "REJECT_LAUNCH";
} & RejectLaunchPayload;
