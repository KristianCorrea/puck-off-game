import type { Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  type CountdownPayload,
  type MatchResumePayload,
  type MatchStartPayload,
  type PlayerId,
  type RoomCreatedPayload,
  type RoomStatePayload,
} from "@puck-off/shared";
import {
  clearResumeSession,
  loadResumeSession,
  saveResumeSession,
} from "./resumeSession";
import { connectSocket, getServerUrl } from "./socket";

export type OnlineLobbyResult = {
  socket: Socket;
  playerId: PlayerId;
  code: string;
  matchStart: MatchStartPayload;
};

/**
 * Minimal DOM lobby: create / join / ready / countdown / reconnect.
 * Resolves on MATCH_START or MATCH_RESUME.
 */
export function runOnlineLobby(): Promise<OnlineLobbyResult> {
  return new Promise((resolve, reject) => {
    const root = document.getElementById("online-lobby");
    const statusEl = document.getElementById("lobby-status");
    const codeEl = document.getElementById("lobby-code");
    const countdownEl = document.getElementById("lobby-countdown");
    const joinInput = document.getElementById(
      "lobby-join-input",
    ) as HTMLInputElement | null;
    const createBtn = document.getElementById("lobby-create-btn");
    const joinBtn = document.getElementById("lobby-join-btn");
    const readyBtn = document.getElementById("lobby-ready-btn");
    const leaveBtn = document.getElementById("lobby-leave-btn");
    const serverEl = document.getElementById("lobby-server");

    if (!root) {
      reject(new Error("Missing #online-lobby"));
      return;
    }

    const setStatus = (msg: string): void => {
      if (statusEl) statusEl.textContent = msg;
    };

    const setCountdown = (seconds: number | null): void => {
      if (!countdownEl) return;
      if (seconds === null) {
        countdownEl.textContent = "";
        countdownEl.classList.remove("is-visible");
        return;
      }
      countdownEl.textContent = seconds > 0 ? String(seconds) : "GO";
      countdownEl.classList.add("is-visible");
    };

    const setLobbyControlsEnabled = (enabled: boolean): void => {
      if (enabled) {
        createBtn?.removeAttribute("disabled");
        joinBtn?.removeAttribute("disabled");
        joinInput?.removeAttribute("disabled");
      } else {
        createBtn?.setAttribute("disabled", "true");
        joinBtn?.setAttribute("disabled", "true");
        joinInput?.setAttribute("disabled", "true");
      }
    };

    root.classList.add("is-visible");
    root.setAttribute("aria-hidden", "false");
    if (serverEl) serverEl.textContent = getServerUrl();
    setStatus("Connecting…");
    setCountdown(null);

    const socket = connectSocket();
    let myPlayerId: PlayerId | null = null;
    let roomCode: string | null = null;
    let settled = false;

    const persistResume = (token: string | null | undefined): void => {
      if (!myPlayerId || !roomCode || !token) return;
      saveResumeSession({
        code: roomCode,
        playerId: myPlayerId,
        resumeToken: token,
      });
    };

    const cleanupUi = (): void => {
      root.classList.remove("is-visible");
      root.setAttribute("aria-hidden", "true");
      setCountdown(null);
    };

    const finish = (payload: MatchStartPayload): void => {
      if (settled || !myPlayerId || !roomCode) return;
      settled = true;
      cleanupUi();
      resolve({
        socket,
        playerId: myPlayerId,
        code: roomCode,
        matchStart: payload,
      });
    };

    const fail = (message: string): void => {
      if (settled) return;
      setStatus(message);
    };

    socket.on("connect", () => {
      const resume = loadResumeSession();
      if (resume) {
        setStatus(`Reconnecting to ${resume.code}…`);
        setLobbyControlsEnabled(false);
        socket.emit(SOCKET_EVENTS.RECONNECT_ROOM, {
          code: resume.code,
          resumeToken: resume.resumeToken,
        });
        return;
      }
      setStatus("Connected. Create or join a room.");
    });

    socket.on("connect_error", () => {
      setStatus(`Cannot reach ${getServerUrl()} — is the server running?`);
    });

    socket.on(SOCKET_EVENTS.ERROR, (payload: { message?: string }) => {
      const msg = payload?.message ?? "Server error";
      // Stale resume token — clear and let them create/join.
      if (
        msg.toLowerCase().includes("resume") ||
        msg.toLowerCase().includes("not found") ||
        msg.toLowerCase().includes("reconnect")
      ) {
        clearResumeSession();
        setLobbyControlsEnabled(true);
      }
      fail(msg);
    });

    socket.on(SOCKET_EVENTS.ROOM_CREATED, (payload: RoomCreatedPayload) => {
      myPlayerId = payload.playerId;
      roomCode = payload.code;
      if (codeEl) codeEl.textContent = payload.code;
      persistResume(payload.resumeToken);
      setStatus(`Room ${payload.code} — waiting for opponent, then Ready.`);
      readyBtn?.removeAttribute("disabled");
      leaveBtn?.removeAttribute("disabled");
    });

    socket.on(SOCKET_EVENTS.ROOM_STATE, (payload: RoomStatePayload) => {
      myPlayerId = payload.yourPlayerId ?? myPlayerId;
      roomCode = payload.code;
      if (codeEl) codeEl.textContent = payload.code;
      persistResume(payload.resumeToken);

      const p1 = payload.players.find((p) => p.playerId === "player1");
      const p2 = payload.players.find((p) => p.playerId === "player2");
      const seatLine = `P1 ${p1?.connected ? (p1.ready ? "ready" : "in") : "—"} · P2 ${p2?.connected ? (p2.ready ? "ready" : "in") : "—"}`;

      if (payload.phase === "countdown") {
        setLobbyControlsEnabled(false);
        readyBtn?.setAttribute("disabled", "true");
        setStatus(`${payload.code} · starting…`);
        return;
      }

      if (payload.phase === "lobby") {
        setCountdown(null);
        setLobbyControlsEnabled(true);
        readyBtn?.removeAttribute("disabled");
        leaveBtn?.removeAttribute("disabled");
        setStatus(`${payload.code} · ${seatLine}`);
        return;
      }

      setStatus(`${payload.code} · ${seatLine}`);
    });

    socket.on(SOCKET_EVENTS.COUNTDOWN, (payload: CountdownPayload) => {
      setLobbyControlsEnabled(false);
      readyBtn?.setAttribute("disabled", "true");
      setCountdown(payload.seconds);
      setStatus(
        payload.seconds > 0
          ? `Match starts in ${payload.seconds}…`
          : "Match starting!",
      );
    });

    socket.on(SOCKET_EVENTS.MATCH_START, (payload: MatchStartPayload) => {
      finish(payload);
    });

    socket.on(SOCKET_EVENTS.MATCH_RESUME, (payload: MatchResumePayload) => {
      myPlayerId = payload.playerId;
      roomCode = payload.code;
      finish({ code: payload.code, state: payload.state });
    });

    createBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearResumeSession();
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
      clearResumeSession();
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, { code });
      setStatus(`Joining ${code.toUpperCase()}…`);
      readyBtn?.removeAttribute("disabled");
      leaveBtn?.removeAttribute("disabled");
    });

    readyBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      socket.emit(SOCKET_EVENTS.READY);
      setStatus("Ready — waiting for both players…");
    });

    leaveBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (settled) return;
      clearResumeSession();
      socket.emit(SOCKET_EVENTS.LEAVE_ROOM);
      socket.disconnect();
      sessionStorage.removeItem("puckoff-play-mode");
      window.location.assign(window.location.pathname);
    });

    readyBtn?.setAttribute("disabled", "true");
    leaveBtn?.setAttribute("disabled", "true");
  });
}
