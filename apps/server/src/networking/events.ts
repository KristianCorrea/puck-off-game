import type { Server, Socket } from "socket.io";
import {
  SOCKET_EVENTS,
  type JoinRoomPayload,
  type LaunchPuckPayload,
} from "@puck-off/shared";
import type { RoomManager } from "../rooms/RoomManager";

/** Bind Socket.IO events to RoomManager. */
export function bindSocketHandlers(io: Server, rooms: RoomManager): void {
  io.on("connection", (socket: Socket) => {
    socket.on(SOCKET_EVENTS.CREATE_ROOM, () => {
      rooms.createRoom(socket);
    });

    socket.on(SOCKET_EVENTS.JOIN_ROOM, (payload: JoinRoomPayload) => {
      rooms.joinRoom(socket, payload);
    });

    socket.on(SOCKET_EVENTS.READY, () => {
      rooms.ready(socket);
    });

    socket.on(SOCKET_EVENTS.LAUNCH_PUCK, (payload: LaunchPuckPayload) => {
      rooms.launch(socket, payload);
    });

    socket.on(SOCKET_EVENTS.REMATCH, () => {
      rooms.rematch(socket);
    });

    socket.on(SOCKET_EVENTS.LEAVE_ROOM, () => {
      rooms.leave(socket);
    });

    socket.on("disconnect", () => {
      rooms.onDisconnect(socket);
    });
  });
}
