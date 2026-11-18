/**
 * Socket protocol shapes for Phase 4+.
 * Transport-agnostic — no Socket.IO imports here.
 */
import type { MatchPhase, MatchResult, PlayerId } from "../types/MatchPhase";
import type { MatchState } from "../types/MatchState";
import type { PhysicsKeyframe } from "../types/PhysicsKeyframe";

/** Socket.IO event names (client ↔ server). */
export const SOCKET_EVENTS = {
  // Client → server
  CREATE_ROOM: "CREATE_ROOM",
  JOIN_ROOM: "JOIN_ROOM",
  READY: "READY",
  LAUNCH_PUCK: "LAUNCH_PUCK",
  /** Live aim preview (cosmetic); server relays to opponent. */
  AIM_UPDATE: "AIM_UPDATE",
  AIM_CLEAR: "AIM_CLEAR",
  REMATCH: "REMATCH",
  LEAVE_ROOM: "LEAVE_ROOM",
  RECONNECT_ROOM: "RECONNECT_ROOM",

  // Server → client
  ROOM_CREATED: "ROOM_CREATED",
  ROOM_STATE: "ROOM_STATE",
  PLAYER_JOINED: "PLAYER_JOINED",
  COUNTDOWN: "COUNTDOWN",
  MATCH_START: "MATCH_START",
  MATCH_RESUME: "MATCH_RESUME",
  TURN_RESOLVED: "TURN_RESOLVED",
  REJECT_LAUNCH: "REJECT_LAUNCH",
  OPPONENT_DISCONNECTED: "OPPONENT_DISCONNECTED",
  MATCH_ABANDONED: "MATCH_ABANDONED",
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

/** Cosmetic aim preview — origin is puck position on each client. */
export type AimUpdatePayload = {
  puckId: string;
  /** Radians */
  angle: number;
  /** 0..1 */
  power: number;
};

export type AimClearPayload = Record<string, never>;

export type RematchPayload = Record<string, never>;

export type ReconnectRoomPayload = {
  code: string;
  resumeToken: string;
};

// ── Server → client payloads ───────────────────────────────────────────

export type RoomCreatedPayload = {
  code: string;
  playerId: PlayerId;
  resumeToken: string;
};

export type RoomPlayerInfo = {
  playerId: PlayerId;
  ready: boolean;
  connected: boolean;
};

export type RoomStatePayload = {
  code: string;
  players: RoomPlayerInfo[];
  phase: "lobby" | "countdown" | "playing" | "ended";
  yourPlayerId: PlayerId | null;
  resumeToken: string | null;
  /** True while waiting for a disconnected seat to reconnect. */
  pausedForDisconnect?: boolean;
};

export type PlayerJoinedPayload = {
  code: string;
  playerId: PlayerId;
  players: RoomPlayerInfo[];
};

export type CountdownPayload = {
  code: string;
  seconds: number;
};

export type MatchStartPayload = {
  code: string;
  state: MatchState;
};

export type MatchResumePayload = {
  code: string;
  playerId: PlayerId;
  state: MatchState;
  /** Remaining reconnect grace for the other seat, if any. */
  opponentReconnectMs?: number;
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
  reason: "launch" | "timeout" | "rematch" | "abandon";
  /**
   * Server-authored shot path for both clients to replay.
   * Empty for timeout/rematch (snap to `state` only).
   */
  keyframes?: PhysicsKeyframe[];
  /** Duration each keyframe interval represents (ms). */
  keyframeDtMs?: number;
};

export type RejectLaunchPayload = {
  reason: string;
};

export type OpponentDisconnectedPayload = {
  code: string;
  playerId: PlayerId;
  reconnectMs: number;
};

export type MatchAbandonedPayload = {
  code: string;
  reason: "disconnect_timeout" | "leave";
  disconnectedPlayerId: PlayerId;
  winner: PlayerId;
  state: MatchState;
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
