import type { Server, Socket } from "socket.io";
import {
  SOCKET_EVENTS,
  type AimUpdatePayload,
  type JoinRoomPayload,
  type LaunchPuckPayload,
  type ReconnectRoomPayload,
} from "@puck-off/shared";
import type { RoomManager } from "../rooms/RoomManager";

/** Bind Socket.IO events to RoomManager. */
export function bindSocketHandlers(io: Server, rooms: RoomManager): void {
  io.on("connection", (socket: Socket) => {
    socket.on(SOCKET_EVENTS.CREATE_ROOM, () => {
      try {
        rooms.createRoom(socket);
      } catch (err) {
        console.error("[server] CREATE_ROOM", err);
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Server error" });
      }
    });

    socket.on(SOCKET_EVENTS.JOIN_ROOM, (payload: JoinRoomPayload) => {
      try {
        rooms.joinRoom(socket, payload);
      } catch (err) {
        console.error("[server] JOIN_ROOM", err);
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Server error" });
      }
    });

    socket.on(SOCKET_EVENTS.RECONNECT_ROOM, (payload: ReconnectRoomPayload) => {
      try {
        rooms.reconnect(socket, payload);
      } catch (err) {
        console.error("[server] RECONNECT_ROOM", err);
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Server error" });
      }
    });

    socket.on(SOCKET_EVENTS.READY, () => {
      try {
        rooms.ready(socket);
      } catch (err) {
        console.error("[server] READY", err);
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Server error" });
      }
    });

    socket.on(SOCKET_EVENTS.LAUNCH_PUCK, (payload: LaunchPuckPayload) => {
      try {
        rooms.launch(socket, payload);
      } catch (err) {
        console.error("[server] LAUNCH_PUCK", err);
        socket.emit(SOCKET_EVENTS.REJECT_LAUNCH, { reason: "SERVER_ERROR" });
      }
    });

    socket.on(SOCKET_EVENTS.AIM_UPDATE, (payload: AimUpdatePayload) => {
      try {
        rooms.aimUpdate(socket, payload);
      } catch (err) {
        console.error("[server] AIM_UPDATE", err);
      }
    });

    socket.on(SOCKET_EVENTS.AIM_CLEAR, () => {
      try {
        rooms.aimClear(socket);
      } catch (err) {
        console.error("[server] AIM_CLEAR", err);
      }
    });

    socket.on(SOCKET_EVENTS.REMATCH, () => {
      try {
        rooms.rematch(socket);
      } catch (err) {
        console.error("[server] REMATCH", err);
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Server error" });
      }
    });

    socket.on(SOCKET_EVENTS.LEAVE_ROOM, () => {
      try {
        rooms.leave(socket);
      } catch (err) {
        console.error("[server] LEAVE_ROOM", err);
      }
    });

    socket.on("disconnect", () => {
      try {
        rooms.onDisconnect(socket);
      } catch (err) {
        console.error("[server] disconnect", err);
      }
    });
  });
}
