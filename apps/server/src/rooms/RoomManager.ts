import { randomBytes } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  MATCH_CONFIG,
  SOCKET_EVENTS,
  type AimUpdatePayload,
  type JoinRoomPayload,
  type LaunchPuckPayload,
  type PlayerId,
  type ReconnectRoomPayload,
  type RoomPlayerInfo,
  type RoomStatePayload,
  type TurnResolvedPayload,
} from "@puck-off/shared";
import { LaunchActionGuard } from "../matches/actionGuard";
import {
  DISCONNECT_POLICY,
  winnerOnAbandon,
} from "../matches/disconnectPolicy";
import { MatchManager, toTurnResolved } from "../matches/MatchManager";
import {
  parseAimPayload,
  parseLaunchPayload,
} from "../networking/validation";
import { generateRoomCode, normalizeRoomCode } from "./roomCode";

type Seat = {
  playerId: PlayerId;
  socketId: string | null;
  ready: boolean;
  resumeToken: string;
};

type PendingDisconnect = {
  playerId: PlayerId;
  deadlineMs: number;
  timer: ReturnType<typeof setTimeout>;
};

type Room = {
  code: string;
  seats: { player1: Seat; player2: Seat };
  phase: "lobby" | "countdown" | "playing" | "ended";
  match: MatchManager;
  launchGuard: LaunchActionGuard;
  /**
   * Don't tick the turn clock / accept launches until clients finish keyframe replay.
   * 0 = unlocked.
   */
  replayUnlockAtMs: number;
  countdownTimer: ReturnType<typeof setTimeout> | null;
  pendingDisconnect: PendingDisconnect | null;
};

const TICK_MS = 250;

function newResumeToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Private rooms (capacity 2) + authoritative Match per room.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly socketRoom = new Map<string, string>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly io: Server) {
    this.tickTimer = setInterval(() => this.tickAll(), TICK_MS);
  }

  destroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    for (const room of this.rooms.values()) {
      this.clearCountdown(room);
      this.clearPendingDisconnect(room);
      room.match.destroy();
    }
    this.rooms.clear();
    this.socketRoom.clear();
  }

  createRoom(socket: Socket): void {
    this.leaveCurrent(socket, { intentional: true });

    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const room: Room = {
      code,
      seats: {
        player1: {
          playerId: "player1",
          socketId: socket.id,
          ready: false,
          resumeToken: newResumeToken(),
        },
        player2: {
          playerId: "player2",
          socketId: null,
          ready: false,
          resumeToken: newResumeToken(),
        },
      },
      phase: "lobby",
      match: new MatchManager(),
      launchGuard: new LaunchActionGuard(),
      replayUnlockAtMs: 0,
      countdownTimer: null,
      pendingDisconnect: null,
    };
    this.rooms.set(code, room);
    this.socketRoom.set(socket.id, code);
    void socket.join(code);

    socket.emit(SOCKET_EVENTS.ROOM_CREATED, {
      code,
      playerId: "player1" as PlayerId,
      resumeToken: room.seats.player1.resumeToken,
    });
    this.emitRoomState(room);
  }

  joinRoom(socket: Socket, payload: JoinRoomPayload): void {
    const code = normalizeRoomCode(
      typeof payload?.code === "string" ? payload.code : "",
    );
    if (code.length < 4) {
      this.emitError(socket, "Invalid room code");
      return;
    }

    const room = this.rooms.get(code);
    if (!room) {
      this.emitError(socket, "Room not found");
      return;
    }
    if (room.phase !== "lobby") {
      this.emitError(socket, "Match already started — use reconnect if you disconnected");
      return;
    }

    // Already seated in this room (duplicate join).
    const existing = this.seatForSocket(room, socket.id);
    if (existing) {
      this.emitRoomState(room);
      return;
    }

    const free =
      room.seats.player1.socketId === null
        ? room.seats.player1
        : room.seats.player2.socketId === null
          ? room.seats.player2
          : null;

    if (!free) {
      this.emitError(socket, "Room is full");
      return;
    }

    this.leaveCurrent(socket, { intentional: true });
    free.socketId = socket.id;
    free.ready = false;
    free.resumeToken = newResumeToken();
    this.socketRoom.set(socket.id, code);
    void socket.join(code);

    this.io.to(code).emit(SOCKET_EVENTS.PLAYER_JOINED, {
      code,
      playerId: free.playerId,
      players: this.playerInfos(room),
    });
    this.emitRoomState(room);
  }

  reconnect(socket: Socket, payload: ReconnectRoomPayload): void {
    const code = normalizeRoomCode(
      typeof payload?.code === "string" ? payload.code : "",
    );
    const token =
      typeof payload?.resumeToken === "string" ? payload.resumeToken : "";
    if (code.length < 4 || token.length < 8) {
      this.emitError(socket, "Invalid reconnect");
      return;
    }

    const room = this.rooms.get(code);
    if (!room) {
      this.emitError(socket, "Room not found");
      return;
    }

    const seat = this.seatForToken(room, token);
    if (!seat) {
      this.emitError(socket, "Invalid resume token");
      return;
    }

    // Drop any other room this socket was in.
    if (this.socketRoom.get(socket.id) !== code) {
      this.leaveCurrent(socket, { intentional: true });
    }

    // If this seat still has an old socket, detach it.
    if (seat.socketId && seat.socketId !== socket.id) {
      this.socketRoom.delete(seat.socketId);
      const old = this.io.sockets.sockets.get(seat.socketId);
      if (old) void old.leave(code);
    }

    seat.socketId = socket.id;
    this.socketRoom.set(socket.id, code);
    void socket.join(code);

    if (
      room.pendingDisconnect &&
      room.pendingDisconnect.playerId === seat.playerId
    ) {
      this.clearPendingDisconnect(room);
    }

    const state = room.match.getState();
    if (
      state &&
      (room.phase === "playing" ||
        room.phase === "ended" ||
        room.phase === "countdown")
    ) {
      const opponentMs = room.pendingDisconnect
        ? Math.max(0, room.pendingDisconnect.deadlineMs - Date.now())
        : undefined;
      socket.emit(SOCKET_EVENTS.MATCH_RESUME, {
        code: room.code,
        playerId: seat.playerId,
        state,
        opponentReconnectMs: opponentMs,
      });
    }

    this.emitRoomState(room);
  }

  ready(socket: Socket): void {
    const room = this.roomForSocket(socket.id);
    if (!room) {
      this.emitError(socket, "Not in a room");
      return;
    }
    if (room.phase !== "lobby") return;
    if (room.pendingDisconnect) return;

    const seat = this.seatForSocket(room, socket.id);
    if (!seat) return;
    seat.ready = true;
    this.emitRoomState(room);

    const bothReady =
      room.seats.player1.socketId !== null &&
      room.seats.player2.socketId !== null &&
      room.seats.player1.ready &&
      room.seats.player2.ready;

    if (!bothReady) return;
    this.beginCountdown(room);
  }

  launch(socket: Socket, payload: LaunchPuckPayload): void {
    const room = this.roomForSocket(socket.id);
    if (!room) {
      this.emitError(socket, "Not in a room");
      return;
    }
    if (room.phase !== "playing") {
      socket.emit(SOCKET_EVENTS.REJECT_LAUNCH, { reason: "WRONG_PHASE" });
      return;
    }
    if (room.pendingDisconnect) {
      socket.emit(SOCKET_EVENTS.REJECT_LAUNCH, {
        reason: "OPPONENT_DISCONNECTED",
      });
      return;
    }
    if (Date.now() < room.replayUnlockAtMs) {
      socket.emit(SOCKET_EVENTS.REJECT_LAUNCH, { reason: "REPLAY_IN_PROGRESS" });
      return;
    }
    if (!room.launchGuard.tryBegin()) {
      socket.emit(SOCKET_EVENTS.REJECT_LAUNCH, { reason: "DUPLICATE_LAUNCH" });
      return;
    }

    const seat = this.seatForSocket(room, socket.id);
    if (!seat) {
      room.launchGuard.end();
      socket.emit(SOCKET_EVENTS.REJECT_LAUNCH, { reason: "NOT_IN_ROOM" });
      return;
    }

    const parsed = parseLaunchPayload(payload);
    if (!parsed.ok) {
      room.launchGuard.end();
      socket.emit(SOCKET_EVENTS.REJECT_LAUNCH, { reason: parsed.reason });
      return;
    }

    try {
      const result = room.match.applyLaunch({
        playerId: seat.playerId,
        puckId: parsed.payload.puckId,
        angle: parsed.payload.angle,
        power: parsed.payload.power,
      });

      if (!result.ok) {
        socket.emit(SOCKET_EVENTS.REJECT_LAUNCH, { reason: result.reason });
        return;
      }

      this.lockReplayWindow(room, result.payload);
      this.emitAimClear(room);
      this.io.to(room.code).emit(SOCKET_EVENTS.TURN_RESOLVED, result.payload);

      if (result.payload.phase === "MATCH_END") {
        room.phase = "ended";
        room.replayUnlockAtMs = 0;
        this.emitRoomState(room);
      }
    } finally {
      room.launchGuard.end();
    }
  }

  /**
   * Cosmetic aim relay — not authoritative. Quietly ignore bad / out-of-turn aim.
   */
  aimUpdate(socket: Socket, payload: AimUpdatePayload): void {
    const room = this.roomForSocket(socket.id);
    if (!room || room.phase !== "playing") return;
    if (room.pendingDisconnect) return;
    if (Date.now() < room.replayUnlockAtMs) return;

    const seat = this.seatForSocket(room, socket.id);
    if (!seat) return;

    const state = room.match.getState();
    if (!state || state.phase !== "PLAYER_TURN") return;
    if (state.currentTurn !== seat.playerId) return;

    const parsed = parseAimPayload(payload);
    if (!parsed.ok) return;

    const puck = state.pucks.find((p) => p.id === parsed.payload.puckId);
    if (!puck || puck.ownerId !== seat.playerId) return;

    socket.to(room.code).emit(SOCKET_EVENTS.AIM_UPDATE, parsed.payload);
  }

  aimClear(socket: Socket): void {
    const room = this.roomForSocket(socket.id);
    if (!room || room.phase !== "playing") return;
    const seat = this.seatForSocket(room, socket.id);
    if (!seat) return;
    socket.to(room.code).emit(SOCKET_EVENTS.AIM_CLEAR, {});
  }

  rematch(socket: Socket): void {
    const room = this.roomForSocket(socket.id);
    if (!room) {
      this.emitError(socket, "Not in a room");
      return;
    }
    if (room.phase !== "ended") return;
    if (room.pendingDisconnect) {
      this.emitError(socket, "Waiting for opponent to reconnect");
      return;
    }
    if (!room.seats.player1.socketId || !room.seats.player2.socketId) {
      this.emitError(socket, "Both players must be connected to rematch");
      return;
    }

    room.seats.player1.ready = true;
    room.seats.player2.ready = true;
    this.beginCountdown(room, { rematch: true });
  }

  /** Intentional leave — abandon mid-match immediately. */
  leave(socket: Socket): void {
    this.leaveCurrent(socket, { intentional: true });
  }

  /** Transport drop — start reconnect window when in a match. */
  onDisconnect(socket: Socket): void {
    this.leaveCurrent(socket, { intentional: false });
  }

  private tickAll(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.phase !== "playing") continue;
      if (room.pendingDisconnect) continue;
      if (now < room.replayUnlockAtMs) continue;

      const ticked = room.match.tick(TICK_MS);
      if (!ticked?.skipped) continue;
      room.replayUnlockAtMs = 0;
      this.emitAimClear(room);
      this.io.to(room.code).emit(
        SOCKET_EVENTS.TURN_RESOLVED,
        toTurnResolved(ticked.state, "timeout"),
      );
    }
  }

  private lockReplayWindow(room: Room, payload: TurnResolvedPayload): void {
    const frames = payload.keyframes ?? [];
    const replayMs =
      frames.length > 0 ? frames[frames.length - 1]!.atMs : 0;
    const scored = frames.some((f) => f.goal);
    const holdMs = scored ? MATCH_CONFIG.onlineGoalHoldMs : 0;
    room.replayUnlockAtMs = Date.now() + replayMs + holdMs;
  }

  private beginCountdown(
    room: Room,
    opts?: { rematch?: boolean },
  ): void {
    this.clearCountdown(room);

    room.phase = "countdown";
    room.replayUnlockAtMs = Number.MAX_SAFE_INTEGER;
    this.emitRoomState(room);

    let remaining = MATCH_CONFIG.countdownSeconds;

    const tickCountdown = (): void => {
      if (!this.rooms.has(room.code)) return;
      if (room.pendingDisconnect) {
        // Pause countdown digits until reconnect resolves.
        room.countdownTimer = setTimeout(tickCountdown, 500);
        return;
      }
      if (
        room.seats.player1.socketId === null ||
        room.seats.player2.socketId === null
      ) {
        room.countdownTimer = null;
        room.phase = "lobby";
        room.seats.player1.ready = false;
        room.seats.player2.ready = false;
        room.replayUnlockAtMs = 0;
        this.emitRoomState(room);
        return;
      }

      this.io.to(room.code).emit(SOCKET_EVENTS.COUNTDOWN, {
        code: room.code,
        seconds: remaining,
      });

      if (remaining <= 0) {
        room.countdownTimer = null;
        room.phase = "playing";
        room.replayUnlockAtMs = 0;
        const state = opts?.rematch ? room.match.rematch() : room.match.start();
        this.io.to(room.code).emit(SOCKET_EVENTS.MATCH_START, {
          code: room.code,
          state,
        });
        this.emitRoomState(room);
        return;
      }

      remaining -= 1;
      room.countdownTimer = setTimeout(tickCountdown, 1000);
    };

    tickCountdown();
  }

  private leaveCurrent(
    socket: Socket,
    opts: { intentional: boolean },
  ): void {
    const code = this.socketRoom.get(socket.id);
    if (!code) return;
    this.socketRoom.delete(socket.id);
    void socket.leave(code);

    const room = this.rooms.get(code);
    if (!room) return;

    const seat = this.seatForSocket(room, socket.id);
    if (!seat) return;

    seat.socketId = null;
    seat.ready = false;

    const empty =
      room.seats.player1.socketId === null &&
      room.seats.player2.socketId === null;

    if (empty) {
      this.clearCountdown(room);
      this.clearPendingDisconnect(room);
      room.match.destroy();
      this.rooms.delete(code);
      return;
    }

    // Lobby: just free the seat.
    if (room.phase === "lobby") {
      this.emitRoomState(room);
      return;
    }

    // Countdown: cancel back to lobby for the remaining player.
    if (room.phase === "countdown") {
      this.clearCountdown(room);
      this.clearPendingDisconnect(room);
      room.phase = "lobby";
      room.seats.player1.ready = false;
      room.seats.player2.ready = false;
      room.replayUnlockAtMs = 0;
      room.match.destroy();
      this.emitRoomState(room);
      return;
    }

    // Playing / ended.
    if (opts.intentional) {
      if (room.phase === "playing") {
        this.abandonMatch(room, seat.playerId, "leave");
      } else {
        // Ended: remaining player can sit in lobby-like rematch wait.
        this.emitRoomState(room);
      }
      return;
    }

    // Soft disconnect — reconnect window.
    this.startReconnectWindow(room, seat.playerId);
  }

  private startReconnectWindow(room: Room, playerId: PlayerId): void {
    this.clearPendingDisconnect(room);
    this.emitAimClear(room);

    const reconnectMs = DISCONNECT_POLICY.reconnectWindowMs;
    const deadlineMs = Date.now() + reconnectMs;

    this.io.to(room.code).emit(SOCKET_EVENTS.OPPONENT_DISCONNECTED, {
      code: room.code,
      playerId,
      reconnectMs,
    });

    const timer = setTimeout(() => {
      if (!this.rooms.has(room.code)) return;
      if (!room.pendingDisconnect) return;
      if (room.pendingDisconnect.playerId !== playerId) return;

      if (room.phase === "playing") {
        this.abandonMatch(room, playerId, "disconnect_timeout");
      } else if (room.phase === "ended") {
        room.pendingDisconnect = null;
        this.emitRoomState(room);
      } else {
        room.pendingDisconnect = null;
        room.phase = "lobby";
        room.seats.player1.ready = false;
        room.seats.player2.ready = false;
        this.emitRoomState(room);
      }
    }, reconnectMs);

    room.pendingDisconnect = { playerId, deadlineMs, timer };
    this.emitRoomState(room);
  }

  private abandonMatch(
    room: Room,
    disconnectedPlayerId: PlayerId,
    reason: "disconnect_timeout" | "leave",
  ): void {
    this.clearCountdown(room);
    this.clearPendingDisconnect(room);
    this.emitAimClear(room);
    room.launchGuard.end();
    room.replayUnlockAtMs = 0;

    const winner = winnerOnAbandon(disconnectedPlayerId);
    let state = room.match.getState();
    if (state && state.phase !== "MATCH_END") {
      state = room.match.abandon(winner) ?? state;
    } else if (!state) {
      // Match never started properly — synthesize lobby.
      room.phase = "lobby";
      room.seats.player1.ready = false;
      room.seats.player2.ready = false;
      this.emitRoomState(room);
      return;
    } else {
      // Already ended — still notify remaining client.
    }

    room.phase = "ended";
    const finalState = state;

    this.io.to(room.code).emit(SOCKET_EVENTS.MATCH_ABANDONED, {
      code: room.code,
      reason,
      disconnectedPlayerId,
      winner,
      state: finalState,
    });
    this.io.to(room.code).emit(
      SOCKET_EVENTS.TURN_RESOLVED,
      toTurnResolved(finalState, "abandon"),
    );
    this.emitRoomState(room);
  }

  private clearCountdown(room: Room): void {
    if (room.countdownTimer) {
      clearTimeout(room.countdownTimer);
      room.countdownTimer = null;
    }
  }

  private clearPendingDisconnect(room: Room): void {
    if (room.pendingDisconnect) {
      clearTimeout(room.pendingDisconnect.timer);
      room.pendingDisconnect = null;
    }
  }

  private emitAimClear(room: Room): void {
    this.io.to(room.code).emit(SOCKET_EVENTS.AIM_CLEAR, {});
  }

  private roomForSocket(socketId: string): Room | null {
    const code = this.socketRoom.get(socketId);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }

  private seatForSocket(room: Room, socketId: string): Seat | null {
    if (room.seats.player1.socketId === socketId) return room.seats.player1;
    if (room.seats.player2.socketId === socketId) return room.seats.player2;
    return null;
  }

  private seatForToken(room: Room, token: string): Seat | null {
    if (room.seats.player1.resumeToken === token) return room.seats.player1;
    if (room.seats.player2.resumeToken === token) return room.seats.player2;
    return null;
  }

  private playerInfos(room: Room): RoomPlayerInfo[] {
    return [
      {
        playerId: "player1",
        ready: room.seats.player1.ready,
        connected: room.seats.player1.socketId !== null,
      },
      {
        playerId: "player2",
        ready: room.seats.player2.ready,
        connected: room.seats.player2.socketId !== null,
      },
    ];
  }

  private emitRoomState(room: Room): void {
    for (const seat of [room.seats.player1, room.seats.player2]) {
      if (!seat.socketId) continue;
      const payload: RoomStatePayload = {
        code: room.code,
        players: this.playerInfos(room),
        phase: room.phase,
        yourPlayerId: seat.playerId,
        resumeToken: seat.resumeToken,
        pausedForDisconnect: room.pendingDisconnect !== null,
      };
      this.io.to(seat.socketId).emit(SOCKET_EVENTS.ROOM_STATE, payload);
    }
  }

  private emitError(socket: Socket, message: string): void {
    socket.emit(SOCKET_EVENTS.ERROR, { message });
  }
}
