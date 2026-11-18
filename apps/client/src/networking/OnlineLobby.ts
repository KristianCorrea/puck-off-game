import type { Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  type CountdownPayload,
  type MatchResumePayload,
  type MatchStartPayload,
  type PlayerId,
  type RoomCreatedPayload,
  type RoomPlayerInfo,
  type RoomStatePayload,
} from "@puck-off/shared";
import {
  clearResumeSession,
  loadResumeSession,
  saveResumeSession,
} from "./resumeSession";
import { enterPlayMode } from "../mobile/playShell";
import { connectSocket } from "./socket";

export type OnlineLobbyResult = {
  socket: Socket;
  playerId: PlayerId;
  code: string;
  matchStart: MatchStartPayload;
};

type LobbyStage = "gate" | "room" | "countdown";

/**
 * DOM lobby: create / join / seat cards / ready toggle / countdown / reconnect.
 * Resolves on MATCH_START or MATCH_RESUME.
 */
export function runOnlineLobby(): Promise<OnlineLobbyResult> {
  return new Promise((resolve, reject) => {
    const root = document.getElementById("online-lobby");
    const statusEl = document.getElementById("lobby-status");
    const codeEl = document.getElementById("lobby-code");
    const countdownEl = document.getElementById("lobby-countdown");
    const hintEl = document.getElementById("lobby-hint");
    const joinInput = document.getElementById(
      "lobby-join-input",
    ) as HTMLInputElement | null;
    const createBtn = document.getElementById("lobby-create-btn");
    const joinBtn = document.getElementById("lobby-join-btn");
    const readyBtn = document.getElementById("lobby-ready-btn");
    const leaveBtn = document.getElementById("lobby-leave-btn");
    const copyBtn = document.getElementById("lobby-copy-btn");
    const seatP1 = document.getElementById("lobby-seat-p1");
    const seatP2 = document.getElementById("lobby-seat-p2");

    if (!root) {
      reject(new Error("Missing #online-lobby"));
      return;
    }

    let stage: LobbyStage = "gate";
    let myReady = false;

    const setStatus = (msg: string): void => {
      if (statusEl) statusEl.textContent = msg;
    };

    const setHint = (msg: string): void => {
      if (hintEl) hintEl.textContent = msg;
    };

    const setStage = (next: LobbyStage): void => {
      stage = next;
      root.classList.remove("is-gate", "is-room", "is-countdown");
      root.classList.add(`is-${next}`);
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

    const setGateEnabled = (enabled: boolean): void => {
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

    const syncReadyButton = (ready: boolean, enabled: boolean): void => {
      myReady = ready;
      if (!readyBtn) return;
      readyBtn.textContent = ready ? "UNREADY" : "READY";
      readyBtn.classList.toggle("is-ready-on", ready);
      if (enabled) readyBtn.removeAttribute("disabled");
      else readyBtn.setAttribute("disabled", "true");
    };

    const paintSeat = (
      el: HTMLElement | null,
      info: RoomPlayerInfo | undefined,
      you: boolean,
    ): void => {
      if (!el) return;
      const statusEl = el.querySelector(".lobby-seat-status");
      const youEl = el.querySelector(".lobby-seat-you") as HTMLElement | null;

      el.classList.toggle("is-you", you);
      el.classList.toggle("is-empty", !info?.connected);
      el.classList.toggle("is-ready", Boolean(info?.connected && info.ready));

      if (youEl) youEl.hidden = !you;

      if (!statusEl) return;
      if (!info?.connected) {
        statusEl.textContent = "Waiting…";
      } else if (info.ready) {
        statusEl.textContent = "Ready ✓";
      } else {
        statusEl.textContent = you ? "Not ready" : "Joined";
      }
    };

    const paintSeats = (
      players: RoomPlayerInfo[],
      yourId: PlayerId | null,
    ): void => {
      const p1 = players.find((p) => p.playerId === "player1");
      const p2 = players.find((p) => p.playerId === "player2");
      paintSeat(seatP1, p1, yourId === "player1");
      paintSeat(seatP2, p2, yourId === "player2");

      const bothIn = Boolean(p1?.connected && p2?.connected);
      const bothReady = Boolean(p1?.ready && p2?.ready);
      if (!bothIn) {
        setHint(
          yourId === "player1"
            ? "Share the code — waiting for opponent."
            : "Waiting for host…",
        );
      } else if (!bothReady) {
        setHint("Both players must Ready to start.");
      } else {
        setHint("Both ready — starting…");
      }
    };

    const enterRoomUi = (code: string): void => {
      if (codeEl) codeEl.textContent = code;
      setStage("room");
      setCountdown(null);
      setGateEnabled(false);
      leaveBtn?.removeAttribute("disabled");
      syncReadyButton(false, true);
    };

    root.classList.add("is-visible");
    root.setAttribute("aria-hidden", "false");
    setStage("gate");
    setStatus("Connecting…");
    setHint("Share the code, then both Ready.");
    setCountdown(null);
    paintSeats([], null);

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
      setStage("gate");
    };

    const finish = (payload: MatchStartPayload): void => {
      if (settled || !myPlayerId || !roomCode) return;
      settled = true;
      cleanupUi();
      // Best-effort if Ready already entered fullscreen; no-ops when already on.
      void enterPlayMode();
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
        setGateEnabled(false);
        socket.emit(SOCKET_EVENTS.RECONNECT_ROOM, {
          code: resume.code,
          resumeToken: resume.resumeToken,
        });
        return;
      }
      setStatus("Create or join a room.");
      setStage("gate");
      setGateEnabled(true);
    });

    socket.on("connect_error", () => {
      setStatus("Cannot reach the server — try again in a moment.");
    });

    socket.on(SOCKET_EVENTS.ERROR, (payload: { message?: string }) => {
      const msg = payload?.message ?? "Server error";
      if (
        msg.toLowerCase().includes("resume") ||
        msg.toLowerCase().includes("not found") ||
        msg.toLowerCase().includes("reconnect")
      ) {
        clearResumeSession();
        setStage("gate");
        setGateEnabled(true);
        syncReadyButton(false, false);
        leaveBtn?.setAttribute("disabled", "true");
      }
      fail(msg);
    });

    socket.on(SOCKET_EVENTS.ROOM_CREATED, (payload: RoomCreatedPayload) => {
      myPlayerId = payload.playerId;
      roomCode = payload.code;
      persistResume(payload.resumeToken);
      enterRoomUi(payload.code);
      setStatus("Room created");
      paintSeats(
        [
          {
            playerId: "player1",
            ready: false,
            connected: payload.playerId === "player1",
          },
          {
            playerId: "player2",
            ready: false,
            connected: payload.playerId === "player2",
          },
        ],
        myPlayerId,
      );
    });

    socket.on(SOCKET_EVENTS.ROOM_STATE, (payload: RoomStatePayload) => {
      myPlayerId = payload.yourPlayerId ?? myPlayerId;
      roomCode = payload.code;
      if (codeEl) codeEl.textContent = payload.code;
      persistResume(payload.resumeToken);

      const me = payload.players.find((p) => p.playerId === myPlayerId);
      paintSeats(payload.players, myPlayerId);

      if (payload.phase === "countdown") {
        setStage("countdown");
        setGateEnabled(false);
        syncReadyButton(true, false);
        leaveBtn?.removeAttribute("disabled");
        setStatus("Match starting…");
        return;
      }

      if (payload.phase === "lobby") {
        setStage("room");
        setCountdown(null);
        setGateEnabled(false);
        leaveBtn?.removeAttribute("disabled");
        syncReadyButton(Boolean(me?.ready), true);
        setStatus(payload.code);
        return;
      }

      // playing / ended — keep room chrome until MATCH_START/RESUME finishes.
      setStage("room");
      syncReadyButton(Boolean(me?.ready), false);
      setStatus(payload.code);
    });

    socket.on(SOCKET_EVENTS.COUNTDOWN, (payload: CountdownPayload) => {
      setStage("countdown");
      setGateEnabled(false);
      syncReadyButton(true, false);
      setCountdown(payload.seconds);
      setHint(
        payload.seconds > 0
          ? `Match starts in ${payload.seconds}…`
          : "Match starting!",
      );
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
    });

    readyBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (stage !== "room") return;
      const becomingReady = !myReady;
      socket.emit(SOCKET_EVENTS.READY);
      // Optimistic label; ROOM_STATE corrects if needed.
      syncReadyButton(becomingReady, true);
      setStatus(becomingReady ? "Ready" : "Not ready");
      // Fullscreen on Ready (user gesture) — not on ONLINE mode pick.
      if (becomingReady) void enterPlayMode();
    });

    copyBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const code = roomCode ?? codeEl?.textContent ?? "";
      if (!code || code.includes("—")) {
        setStatus("No room code yet");
        return;
      }
      void navigator.clipboard?.writeText(code).then(
        () => setStatus(`Copied ${code}`),
        () => setStatus(`Code: ${code}`),
      );
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

    syncReadyButton(false, false);
    leaveBtn?.setAttribute("disabled", "true");
  });
}
