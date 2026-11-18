import type { Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  type MatchStartPayload,
  type PlayerId,
  type RoomCreatedPayload,
  type RoomStatePayload,
} from "@puck-off/shared";
import { connectSocket, getServerUrl } from "./socket";

export type OnlineLobbyResult = {
  socket: Socket;
  playerId: PlayerId;
  code: string;
  matchStart: MatchStartPayload;
};

/**
 * Minimal DOM lobby: create / join / ready. Resolves when MATCH_START fires.
 */
export function runOnlineLobby(): Promise<OnlineLobbyResult> {
  return new Promise((resolve, reject) => {
    const root = document.getElementById("online-lobby");
    const statusEl = document.getElementById("lobby-status");
    const codeEl = document.getElementById("lobby-code");
    const joinInput = document.getElementById(
      "lobby-join-input",
    ) as HTMLInputElement | null;
    const createBtn = document.getElementById("lobby-create-btn");
    const joinBtn = document.getElementById("lobby-join-btn");
    const readyBtn = document.getElementById("lobby-ready-btn");
    const serverEl = document.getElementById("lobby-server");

    if (!root) {
      reject(new Error("Missing #online-lobby"));
      return;
    }

    const setStatus = (msg: string): void => {
      if (statusEl) statusEl.textContent = msg;
    };

    root.classList.add("is-visible");
    root.setAttribute("aria-hidden", "false");
    if (serverEl) serverEl.textContent = getServerUrl();
    setStatus("Connecting…");

    const socket = connectSocket();
    let myPlayerId: PlayerId | null = null;
    let roomCode: string | null = null;
    let settled = false;

    const cleanupUi = (): void => {
      root.classList.remove("is-visible");
      root.setAttribute("aria-hidden", "true");
    };

    const fail = (message: string): void => {
      if (settled) return;
      setStatus(message);
    };

    socket.on("connect", () => {
      setStatus("Connected. Create or join a room.");
    });

    socket.on("connect_error", () => {
      setStatus(`Cannot reach ${getServerUrl()} — is the server running?`);
    });

    socket.on(SOCKET_EVENTS.ERROR, (payload: { message?: string }) => {
      fail(payload?.message ?? "Server error");
    });

    socket.on(SOCKET_EVENTS.ROOM_CREATED, (payload: RoomCreatedPayload) => {
      myPlayerId = payload.playerId;
      roomCode = payload.code;
      if (codeEl) codeEl.textContent = payload.code;
      setStatus(`Room ${payload.code} — waiting for opponent, then Ready.`);
      readyBtn?.removeAttribute("disabled");
    });

    socket.on(SOCKET_EVENTS.ROOM_STATE, (payload: RoomStatePayload) => {
      myPlayerId = payload.yourPlayerId ?? myPlayerId;
      roomCode = payload.code;
      if (codeEl) codeEl.textContent = payload.code;
      const p1 = payload.players.find((p) => p.playerId === "player1");
      const p2 = payload.players.find((p) => p.playerId === "player2");
      setStatus(
        `${payload.code} · P1 ${p1?.connected ? (p1.ready ? "ready" : "in") : "—"} · P2 ${p2?.connected ? (p2.ready ? "ready" : "in") : "—"}`,
      );
      if (payload.phase === "lobby") readyBtn?.removeAttribute("disabled");
    });

    socket.on(SOCKET_EVENTS.MATCH_START, (payload: MatchStartPayload) => {
      if (settled || !myPlayerId || !roomCode) return;
      settled = true;
      cleanupUi();
      resolve({
        socket,
        playerId: myPlayerId,
        code: roomCode,
        matchStart: payload,
      });
    });

    createBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      socket.emit(SOCKET_EVENTS.CREATE_ROOM);
      setStatus("Creating room…");
    });

    joinBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const code = (joinInput?.value ?? "").trim();
      if (!code) {
        setStatus("Enter a room code");
        return;
      }
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, { code });
      setStatus(`Joining ${code.toUpperCase()}…`);
      readyBtn?.removeAttribute("disabled");
    });

    readyBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      socket.emit(SOCKET_EVENTS.READY);
      setStatus("Ready — waiting for both players…");
    });

    readyBtn?.setAttribute("disabled", "true");
  });
}
