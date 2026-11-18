import type { Server, Socket } from "socket.io";
import {
  SOCKET_EVENTS,
  type JoinRoomPayload,
  type LaunchPuckPayload,
  type PlayerId,
  type RoomPlayerInfo,
  type RoomStatePayload,
} from "@puck-off/shared";
import { MatchManager, toTurnResolved } from "../matches/MatchManager";
import { generateRoomCode, normalizeRoomCode } from "./roomCode";

type Seat = {
  playerId: PlayerId;
  socketId: string | null;
  ready: boolean;
};

type Room = {
  code: string;
  seats: { player1: Seat; player2: Seat };
  phase: "lobby" | "playing" | "ended";
  match: MatchManager;
};

const TICK_MS = 250;

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
      room.match.destroy();
    }
    this.rooms.clear();
    this.socketRoom.clear();
  }

  createRoom(socket: Socket): void {
    this.leaveCurrent(socket);

    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const room: Room = {
      code,
      seats: {
        player1: { playerId: "player1", socketId: socket.id, ready: false },
        player2: { playerId: "player2", socketId: null, ready: false },
      },
      phase: "lobby",
      match: new MatchManager(),
    };
    this.rooms.set(code, room);
    this.socketRoom.set(socket.id, code);
    void socket.join(code);

    socket.emit(SOCKET_EVENTS.ROOM_CREATED, {
      code,
      playerId: "player1" as PlayerId,
    });
    this.emitRoomState(room);
  }

  joinRoom(socket: Socket, payload: JoinRoomPayload): void {
    const code = normalizeRoomCode(payload?.code ?? "");
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
      this.emitError(socket, "Match already started");
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

    this.leaveCurrent(socket);
    free.socketId = socket.id;
    free.ready = false;
    this.socketRoom.set(socket.id, code);
    void socket.join(code);

    this.io.to(code).emit(SOCKET_EVENTS.PLAYER_JOINED, {
      code,
      playerId: free.playerId,
      players: this.playerInfos(room),
    });
    this.emitRoomState(room);
  }

  ready(socket: Socket): void {
    const room = this.roomForSocket(socket.id);
    if (!room) {
      this.emitError(socket, "Not in a room");
      return;
    }
    if (room.phase !== "lobby") return;

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

    room.phase = "playing";
    const state = room.match.start();
    this.io.to(room.code).emit(SOCKET_EVENTS.MATCH_START, {
      code: room.code,
      state,
    });
    this.emitRoomState(room);
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

    const seat = this.seatForSocket(room, socket.id);
    if (!seat) {
      socket.emit(SOCKET_EVENTS.REJECT_LAUNCH, { reason: "NOT_IN_ROOM" });
      return;
    }

    if (
      !payload ||
      typeof payload.puckId !== "string" ||
      !Number.isFinite(payload.angle) ||
      !Number.isFinite(payload.power)
    ) {
      socket.emit(SOCKET_EVENTS.REJECT_LAUNCH, { reason: "INVALID_PAYLOAD" });
      return;
    }

    const result = room.match.applyLaunch({
      playerId: seat.playerId,
      puckId: payload.puckId,
      angle: payload.angle,
      power: payload.power,
    });

    if (!result.ok) {
      socket.emit(SOCKET_EVENTS.REJECT_LAUNCH, { reason: result.reason });
      return;
    }

    this.io.to(room.code).emit(SOCKET_EVENTS.TURN_RESOLVED, result.payload);

    if (result.payload.phase === "MATCH_END") {
      room.phase = "ended";
      this.emitRoomState(room);
    }
  }

  rematch(socket: Socket): void {
    const room = this.roomForSocket(socket.id);
    if (!room) {
      this.emitError(socket, "Not in a room");
      return;
    }
    if (room.phase !== "ended" && room.phase !== "playing") return;

    // Soft rematch: both must be connected; reset ready in lobby style then start.
    room.seats.player1.ready = false;
    room.seats.player2.ready = false;
    room.phase = "lobby";
    this.emitRoomState(room);

    // Auto-ready both if still connected (MVP: rematch = immediate restart).
    if (room.seats.player1.socketId && room.seats.player2.socketId) {
      room.seats.player1.ready = true;
      room.seats.player2.ready = true;
      room.phase = "playing";
      const state = room.match.rematch();
      this.io.to(room.code).emit(SOCKET_EVENTS.MATCH_START, {
        code: room.code,
        state,
      });
      this.io.to(room.code).emit(
        SOCKET_EVENTS.TURN_RESOLVED,
        toTurnResolved(state, "rematch"),
      );
      this.emitRoomState(room);
    }
  }

  onDisconnect(socket: Socket): void {
    this.leaveCurrent(socket);
  }

  private tickAll(): void {
    for (const room of this.rooms.values()) {
      if (room.phase !== "playing") continue;
      const ticked = room.match.tick(TICK_MS);
      if (!ticked?.skipped) continue;
      this.io.to(room.code).emit(
        SOCKET_EVENTS.TURN_RESOLVED,
        toTurnResolved(ticked.state, "timeout"),
      );
    }
  }

  private leaveCurrent(socket: Socket): void {
    const code = this.socketRoom.get(socket.id);
    if (!code) return;
    this.socketRoom.delete(socket.id);
    void socket.leave(code);

    const room = this.rooms.get(code);
    if (!room) return;

    const seat = this.seatForSocket(room, socket.id);
    if (seat) {
      seat.socketId = null;
      seat.ready = false;
    }

    const empty =
      room.seats.player1.socketId === null &&
      room.seats.player2.socketId === null;

    if (empty) {
      room.match.destroy();
      this.rooms.delete(code);
      return;
    }

    // If someone left mid-match, return to lobby so the remaining player can wait.
    if (room.phase === "playing" || room.phase === "ended") {
      room.phase = "lobby";
      room.seats.player1.ready = false;
      room.seats.player2.ready = false;
      room.match.destroy();
    }
    this.emitRoomState(room);
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
      };
      this.io.to(seat.socketId).emit(SOCKET_EVENTS.ROOM_STATE, payload);
    }
  }

  private emitError(socket: Socket, message: string): void {
    socket.emit(SOCKET_EVENTS.ERROR, { message });
  }
}
