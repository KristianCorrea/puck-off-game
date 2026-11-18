import type Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { Match } from "@puck-off/game-engine";
import {
  MATCH_CONFIG,
  SOCKET_EVENTS,
  type AimUpdatePayload,
  type CountdownPayload,
  type MatchAbandonedPayload,
  type MatchPhase,
  type MatchResult,
  type MatchResumePayload,
  type MatchStartPayload,
  type MatchState,
  type OpponentDisconnectedPayload,
  type PlayerId,
  type RejectLaunchPayload,
  type RoomStatePayload,
  type TurnResolvedPayload,
} from "@puck-off/shared";
import type { BallEntity } from "../entities/createBall";
import type { GameAudio } from "../audio/GameAudio";
import type { PuckEntity } from "../entities/createPuck";
import { GameFx } from "../fx/GameFx";
import { FlickController } from "../input/FlickController";
import { AimIndicator } from "../ui/AimIndicator";
import {
  clearResumeSession,
  loadResumeSession,
} from "../../networking/resumeSession";
import { KeyframeReplay } from "./KeyframeReplay";
import { MatchHud, highlightActivePucks } from "./MatchHud";
import { MatchTimer } from "./MatchTimer";
import { ScoreKeeper } from "./ScoreKeeper";
import { TurnManager } from "./TurnManager";
import { paintMatchState } from "./paintMatchState";

const AIM_EMIT_MIN_MS = 50;

/**
 * Online session: server Match is authority.
 * Shots replay server keyframes (no competing client Matter path).
 */
export class OnlineMatchController {
  phase: MatchPhase = "PLAYER_TURN";
  result: MatchResult = null;

  readonly score = new ScoreKeeper();
  readonly turns = new TurnManager();
  readonly timer = new MatchTimer();

  private readonly scene: Phaser.Scene;
  private readonly audio: GameAudio;
  private readonly pucks: PuckEntity[];
  private readonly ball: BallEntity;
  private readonly socket: Socket;
  private readonly myPlayerId: PlayerId;
  private readonly roomCode: string;
  private readonly flick: FlickController;
  private readonly hud: MatchHud;
  private readonly fx: GameFx;
  private readonly engine: Match;
  /** Opponent's live fling arrow (cosmetic relay). */
  private readonly remoteAim: AimIndicator;

  private goalPauseMs = 0;
  private turnAnnounce = false;
  /** Waiting for TURN_RESOLVED after we launched. */
  private awaitingResolve = false;
  private replay: KeyframeReplay | null = null;
  /** Final post-goal reset — applied only after celebration holds ball-in-net. */
  private pendingAuthority: MatchState | null = null;
  private preShotState: MatchState | null = null;
  private destroyed = false;
  private pausedForDisconnect = false;
  private selfDisconnected = false;
  private lastAimEmitAt = 0;
  private readonly onLeave: () => void;

  constructor(opts: {
    scene: Phaser.Scene;
    audio: GameAudio;
    pucks: PuckEntity[];
    ball: BallEntity;
    socket: Socket;
    playerId: PlayerId;
    roomCode: string;
    matchStart: MatchStartPayload;
    onRematch: () => void;
    onLeave: () => void;
  }) {
    this.scene = opts.scene;
    this.audio = opts.audio;
    this.pucks = opts.pucks;
    this.ball = opts.ball;
    this.socket = opts.socket;
    this.myPlayerId = opts.playerId;
    this.roomCode = opts.roomCode;
    this.onLeave = opts.onLeave;

    this.engine = new Match();
    this.engine.start();
    this.engine.adoptState(opts.matchStart.state);

    this.hud = new MatchHud(opts.scene, {
      onRematch: opts.onRematch,
      onLeave: () => this.leave(),
      audio: opts.audio,
      online: {
        myPlayerId: opts.playerId,
      },
    });
    this.fx = new GameFx(opts.scene, {
      pucks: opts.pucks,
      ball: opts.ball,
      audio: opts.audio,
    });
    this.remoteAim = new AimIndicator(opts.scene);

    this.flick = new FlickController(opts.scene, {
      getSelectablePucks: () =>
        this.canFlick()
          ? this.pucks.filter((p) => p.ownerId === this.myPlayerId)
          : [],
      onAim: (puck, shot) => {
        this.fx.showCharge(
          puck.body.position.x,
          puck.body.position.y,
          shot.power,
          puck.sprite.fillColor,
        );
        this.emitAimUpdate(puck, shot);
      },
      onAimEnd: () => {
        this.fx.hideCharge();
        this.emitAimClear();
      },
      onSelect: (puck) => {
        if (puck) this.audio.playSelect();
      },
      onLaunch: (puck, shot) => {
        if (!this.canFlick()) return;

        this.emitAimClear();
        this.audio.playFlick(shot.power);
        this.fx.playLaunch(
          puck.body.position.x,
          puck.body.position.y,
          shot.angle,
          shot.power,
          puck.sprite.fillColor,
        );

        this.preShotState = this.engine.getState();
        this.awaitingResolve = true;
        this.replay = null;
        this.phase = "PHYSICS_RESOLUTION";
        this.timer.stop();
        this.flick.setEnabled(false);
        this.fx.resetMotionTracking();
        this.hud.setStatusHint(null);

        this.socket.emit(SOCKET_EVENTS.LAUNCH_PUCK, {
          puckId: puck.id,
          angle: shot.angle,
          power: shot.power,
        });
      },
    });
    this.flick.bindPucks(this.pucks);

    this.bindSocket();
    this.syncFromState(opts.matchStart.state, { paintBodies: true });
    this.enterPlayerTurnFromState(opts.matchStart.state);
    this.refreshUi();
  }

  destroy(): void {
    this.destroyed = true;
    this.socket.off(SOCKET_EVENTS.TURN_RESOLVED, this.onTurnResolved);
    this.socket.off(SOCKET_EVENTS.REJECT_LAUNCH, this.onRejectLaunch);
    this.socket.off(SOCKET_EVENTS.MATCH_START, this.onMatchStart);
    this.socket.off(SOCKET_EVENTS.MATCH_RESUME, this.onMatchResume);
    this.socket.off(SOCKET_EVENTS.COUNTDOWN, this.onCountdown);
    this.socket.off(SOCKET_EVENTS.ROOM_STATE, this.onRoomState);
    this.socket.off(SOCKET_EVENTS.OPPONENT_DISCONNECTED, this.onOpponentDisconnected);
    this.socket.off(SOCKET_EVENTS.MATCH_ABANDONED, this.onMatchAbandoned);
    this.socket.off(SOCKET_EVENTS.AIM_UPDATE, this.onAimUpdate);
    this.socket.off(SOCKET_EVENTS.AIM_CLEAR, this.onAimClear);
    this.socket.off(SOCKET_EVENTS.ERROR, this.onError);
    this.socket.off("disconnect", this.onSocketDisconnect);
    this.socket.off("connect", this.onSocketConnect);
    this.remoteAim.destroy();
    this.flick.destroy();
    this.hud.destroy();
    this.fx.destroy();
    this.engine.destroy();
  }

  rematch(): void {
    this.hud.stopGoalCelebration();
    this.fx.hideCharge();
    this.flick.setEnabled(false);
    this.goalPauseMs = 0;
    this.awaitingResolve = false;
    this.replay = null;
    this.pendingAuthority = null;
    this.preShotState = null;
    this.hud.setStatusHint(null);
    this.socket.emit(SOCKET_EVENTS.REMATCH);
  }

  leave(): void {
    if (this.destroyed) return;
    this.emitAimClear();
    clearResumeSession();
    this.socket.emit(SOCKET_EVENTS.LEAVE_ROOM);
    this.socket.disconnect();
    this.onLeave();
  }

  update(deltaMs: number): void {
    if (this.destroyed) return;
    this.fx.update(deltaMs);

    if (
      this.phase === "PLAYER_TURN" &&
      !this.awaitingResolve &&
      !this.replay &&
      !this.pausedForDisconnect &&
      !this.selfDisconnected
    ) {
      this.timer.remainingMs = Math.max(0, this.timer.remainingMs - deltaMs);
      this.timer.running = true;
    }

    if (this.replay) {
      this.updateReplay(deltaMs);
    } else if (this.phase === "GOAL_RESOLUTION") {
      this.updateGoalCelebration(deltaMs);
    }

    this.refreshUi();
  }

  private canFlick(): boolean {
    return (
      this.phase === "PLAYER_TURN" &&
      !this.awaitingResolve &&
      !this.replay &&
      !this.pausedForDisconnect &&
      !this.selfDisconnected &&
      this.turns.current === this.myPlayerId
    );
  }

  private bindSocket(): void {
    this.socket.on(SOCKET_EVENTS.TURN_RESOLVED, this.onTurnResolved);
    this.socket.on(SOCKET_EVENTS.REJECT_LAUNCH, this.onRejectLaunch);
    this.socket.on(SOCKET_EVENTS.MATCH_START, this.onMatchStart);
    this.socket.on(SOCKET_EVENTS.MATCH_RESUME, this.onMatchResume);
    this.socket.on(SOCKET_EVENTS.COUNTDOWN, this.onCountdown);
    this.socket.on(SOCKET_EVENTS.ROOM_STATE, this.onRoomState);
    this.socket.on(SOCKET_EVENTS.OPPONENT_DISCONNECTED, this.onOpponentDisconnected);
    this.socket.on(SOCKET_EVENTS.MATCH_ABANDONED, this.onMatchAbandoned);
    this.socket.on(SOCKET_EVENTS.AIM_UPDATE, this.onAimUpdate);
    this.socket.on(SOCKET_EVENTS.AIM_CLEAR, this.onAimClear);
    this.socket.on(SOCKET_EVENTS.ERROR, this.onError);
    this.socket.on("disconnect", this.onSocketDisconnect);
    this.socket.on("connect", this.onSocketConnect);
  }

  private emitAimUpdate(
    puck: PuckEntity,
    shot: { angle: number; power: number },
  ): void {
    if (!this.canFlick()) return;
    const now = Date.now();
    if (now - this.lastAimEmitAt < AIM_EMIT_MIN_MS) return;
    this.lastAimEmitAt = now;
    this.socket.emit(SOCKET_EVENTS.AIM_UPDATE, {
      puckId: puck.id,
      angle: shot.angle,
      power: shot.power,
    } satisfies AimUpdatePayload);
  }

  private emitAimClear(): void {
    this.lastAimEmitAt = 0;
    if (this.destroyed) return;
    this.socket.emit(SOCKET_EVENTS.AIM_CLEAR, {});
  }

  private hideRemoteAim(): void {
    this.remoteAim.hide();
  }

  private onAimUpdate = (payload: AimUpdatePayload): void => {
    if (this.destroyed) return;
    // Only paint while watching the opponent's turn.
    if (this.turns.current === this.myPlayerId) return;
    if (this.phase !== "PLAYER_TURN") return;
    if (this.pausedForDisconnect || this.selfDisconnected) return;

    const puck = this.pucks.find((p) => p.id === payload.puckId);
    if (!puck || puck.ownerId === this.myPlayerId) return;

    const power = Math.max(0, Math.min(1, payload.power));
    if (!Number.isFinite(payload.angle) || power <= 0) {
      this.hideRemoteAim();
      return;
    }

    this.remoteAim.show(
      puck.body.position.x,
      puck.body.position.y,
      payload.angle,
      power,
      puck.sprite.fillColor,
    );
  };

  private onAimClear = (): void => {
    if (!this.destroyed) this.hideRemoteAim();
  };

  private onSocketDisconnect = (): void => {
    if (this.destroyed) return;
    this.selfDisconnected = true;
    this.flick.setEnabled(false);
    this.hud.setStatusHint("Disconnected — reconnecting…");
  };

  private onSocketConnect = (): void => {
    if (this.destroyed) return;
    const resume = loadResumeSession();
    if (!resume || resume.code !== this.roomCode) return;
    this.hud.setStatusHint("Rejoining match…");
    this.socket.emit(SOCKET_EVENTS.RECONNECT_ROOM, {
      code: resume.code,
      resumeToken: resume.resumeToken,
    });
  };

  private onTurnResolved = (payload: TurnResolvedPayload): void => {
    if (this.destroyed) return;

    this.hideRemoteAim();

    if (payload.reason === "timeout") {
      this.audio.playTimeout();
    }

    this.awaitingResolve = false;
    this.preShotState = null;
    this.pendingAuthority = null;
    this.pausedForDisconnect = false;
    this.hud.setStatusHint(null);

    if (payload.reason === "abandon") {
      this.finishWithAuthority(payload.state, { scored: false });
      return;
    }

    const frames = payload.keyframes ?? [];
    if (payload.reason === "launch" && frames.length > 0) {
      this.fx.resetMotionTracking();
      this.replay = new KeyframeReplay(frames, payload.state);
      this.phase = "PHYSICS_RESOLUTION";
      this.timer.stop();
      this.flick.setEnabled(false);
      this.updateReplay(0);
      return;
    }

    this.finishWithAuthority(payload.state, {
      scored:
        payload.state.score.player1 !== this.score.player1 ||
        payload.state.score.player2 !== this.score.player2,
    });
  };

  private onRejectLaunch = (payload: RejectLaunchPayload): void => {
    if (this.destroyed) return;
    this.hideRemoteAim();
    this.awaitingResolve = false;
    this.replay = null;
    this.pendingAuthority = null;
    const restore = this.preShotState ?? this.engine.getState();
    this.preShotState = null;
    this.hud.stopGoalCelebration();
    this.hud.setStatusHint(`Launch rejected (${payload.reason})`);
    this.applyAuthority(restore);
    this.enterPlayerTurnFromState(restore);
    console.warn("[online] launch rejected:", payload.reason);
  };

  private onCountdown = (payload: CountdownPayload): void => {
    if (this.destroyed) return;
    this.hideRemoteAim();
    this.flick.setEnabled(false);
    this.hud.setCountdown(payload.seconds);
    this.hud.setStatusHint(null);
  };

  private onMatchStart = (payload: MatchStartPayload): void => {
    if (this.destroyed) return;
    this.hideRemoteAim();
    this.awaitingResolve = false;
    this.replay = null;
    this.pendingAuthority = null;
    this.preShotState = null;
    this.goalPauseMs = 0;
    this.turnAnnounce = false;
    this.pausedForDisconnect = false;
    this.selfDisconnected = false;
    this.hud.setCountdown(null);
    this.hud.setStatusHint(null);
    this.hud.stopGoalCelebration();
    this.applyAuthority(payload.state);
    this.enterPlayerTurnFromState(payload.state);
  };

  private onMatchResume = (payload: MatchResumePayload): void => {
    if (this.destroyed) return;
    this.selfDisconnected = false;
    this.pausedForDisconnect = Boolean(
      payload.opponentReconnectMs && payload.opponentReconnectMs > 0,
    );
    this.awaitingResolve = false;
    this.replay = null;
    this.pendingAuthority = null;
    this.preShotState = null;
    this.goalPauseMs = 0;
    this.hud.setCountdown(null);
    this.hud.stopGoalCelebration();
    this.hud.setStatusHint(
      this.pausedForDisconnect
        ? `Opponent reconnecting (${Math.ceil((payload.opponentReconnectMs ?? 0) / 1000)}s)…`
        : null,
    );
    this.applyAuthority(payload.state);
    if (payload.state.phase === "MATCH_END") {
      this.flick.setEnabled(false);
      return;
    }
    if (payload.state.phase === "PLAYER_TURN" && !this.pausedForDisconnect) {
      this.enterPlayerTurnFromState(payload.state);
    } else {
      this.flick.setEnabled(false);
    }
  };

  private onOpponentDisconnected = (
    payload: OpponentDisconnectedPayload,
  ): void => {
    if (this.destroyed) return;
    if (payload.playerId === this.myPlayerId) return;
    this.hideRemoteAim();
    this.pausedForDisconnect = true;
    this.flick.setEnabled(false);
    this.timer.stop();
    this.hud.setStatusHint(
      `Opponent disconnected — ${Math.ceil(payload.reconnectMs / 1000)}s to return`,
    );
  };

  private onMatchAbandoned = (payload: MatchAbandonedPayload): void => {
    if (this.destroyed) return;
    this.pausedForDisconnect = false;
    this.selfDisconnected = false;
    this.awaitingResolve = false;
    this.replay = null;
    this.pendingAuthority = null;
    this.hud.setCountdown(null);
    this.hud.setStatusHint(
      payload.reason === "leave"
        ? "Opponent left — match over"
        : "Opponent timed out — match over",
    );
    this.finishWithAuthority(payload.state, { scored: false });
  };

  private onRoomState = (payload: RoomStatePayload): void => {
    if (this.destroyed) return;

    if (payload.resumeToken) {
      // keep token fresh via lobby helper path — mirrored here for mid-match
      try {
        const raw = sessionStorage.getItem("puckoff-resume");
        const prev = raw ? (JSON.parse(raw) as { code?: string }) : null;
        if (prev?.code === payload.code || !prev) {
          sessionStorage.setItem(
            "puckoff-resume",
            JSON.stringify({
              code: payload.code,
              playerId: payload.yourPlayerId ?? this.myPlayerId,
              resumeToken: payload.resumeToken,
            }),
          );
        }
      } catch {
        // ignore
      }
    }

    if (payload.pausedForDisconnect) {
      this.pausedForDisconnect = true;
      this.flick.setEnabled(false);
      return;
    }

    // Opponent reconnected (or pause cleared).
    if (this.pausedForDisconnect && !payload.pausedForDisconnect) {
      this.pausedForDisconnect = false;
      this.hud.setStatusHint(null);
      const state = this.engine.getState();
      if (state.phase === "PLAYER_TURN") {
        this.enterPlayerTurnFromState(state);
      }
    }

    // Countdown cancelled back to lobby before MATCH_START lived here —
    // mid-match we only bounce if both seats emptied (room gone → ERROR).
    if (payload.phase === "lobby" && this.phase !== "MATCH_END") {
      this.hud.setStatusHint("Match cancelled — returning…");
      clearResumeSession();
      this.onLeave();
    }
  };

  private onError = (payload: { message?: string }): void => {
    if (!this.destroyed) {
      this.hud.setStatusHint(payload?.message ?? "Server error");
    }
    console.warn("[online]", payload?.message ?? "error");
  };

  private updateReplay(deltaMs: number): void {
    if (!this.replay) return;

    const pose = this.replay.update(deltaMs);
    if (pose) {
      this.paintReplayPose(pose);
      this.phase = pose.goal ? "GOAL_RESOLUTION" : "PHYSICS_RESOLUTION";
      return;
    }

    const scored = this.replay.scoredDuringReplay;
    const state = this.replay.authority;
    const freeze = this.replay.getFreezePose();
    this.replay = null;

    if (scored) {
      this.paintReplayPose(freeze);
      this.pendingAuthority = state;
      this.score.player1 = state.score.player1;
      this.score.player2 = state.score.player2;
      this.result = state.result;
      this.audio.playGoal();
      this.hud.playGoalCelebration();
      this.goalPauseMs = MATCH_CONFIG.goalCelebrationMs;
      this.phase = "GOAL_RESOLUTION";
      this.flick.setEnabled(false);
      return;
    }

    this.finishWithAuthority(state, { scored: false });
  }

  private paintReplayPose(pose: {
    ball: { x: number; y: number; vx: number; vy: number };
    pucks: Array<{
      id: string;
      x: number;
      y: number;
      vx: number;
      vy: number;
    }>;
  }): void {
    const synth: MatchState = {
      ...this.engine.getState(),
      phase: "PHYSICS_RESOLUTION",
      ball: {
        id: "ball",
        position: { x: pose.ball.x, y: pose.ball.y },
        velocity: { x: pose.ball.vx, y: pose.ball.vy },
        angularVelocity: 0,
      },
      pucks: pose.pucks.map((p) => {
        const prev = this.engine.getState().pucks.find((x) => x.id === p.id);
        return {
          id: p.id,
          ownerId: prev?.ownerId ?? "player1",
          spawn: prev?.spawn ?? { x: p.x, y: p.y },
          position: { x: p.x, y: p.y },
          velocity: { x: p.vx, y: p.vy },
          angularVelocity: 0,
        };
      }),
    };
    paintMatchState(this.scene, synth, this.ball, this.pucks, this.fx);
  }

  private finishWithAuthority(
    state: MatchState,
    opts: { scored: boolean },
  ): void {
    this.applyAuthority(state);

    if (state.phase === "MATCH_END") {
      if (opts.scored) this.audio.playGoal();
      this.audio.playWin();
      this.flick.setEnabled(false);
      return;
    }

    this.enterPlayerTurnFromState(state);
  }

  private updateGoalCelebration(deltaMs: number): void {
    this.goalPauseMs -= deltaMs;
    if (this.goalPauseMs > 0) return;

    this.hud.stopGoalCelebration();

    const pending = this.pendingAuthority;
    this.pendingAuthority = null;
    if (pending) {
      this.applyAuthority(pending);
      if (pending.phase === "MATCH_END") {
        this.audio.playWin();
        this.flick.setEnabled(false);
        return;
      }
      this.enterPlayerTurnFromState(pending);
      return;
    }

    const state = this.engine.getState();
    if (state.phase === "MATCH_END") {
      this.audio.playWin();
      this.flick.setEnabled(false);
      return;
    }
    this.enterPlayerTurnFromState(state);
  }

  private applyAuthority(state: MatchState): void {
    this.awaitingResolve = false;
    this.replay = null;
    this.engine.adoptState(state);
    this.syncFromState(state, { paintBodies: true });
  }

  private enterPlayerTurnFromState(state: MatchState): void {
    this.phase = "PLAYER_TURN";
    this.turns.current = state.currentTurn;
    this.timer.reset();
    this.timer.remainingMs = state.turnRemainingMs;
    this.timer.running = true;
    this.flick.setEnabled(
      !this.pausedForDisconnect &&
        !this.selfDisconnected &&
        state.currentTurn === this.myPlayerId &&
        state.phase === "PLAYER_TURN",
    );
    if (this.turnAnnounce) this.audio.playTurn();
    this.turnAnnounce = true;
  }

  private syncFromState(
    state: MatchState,
    opts: { paintBodies: boolean },
  ): void {
    this.phase = state.phase;
    this.result = state.result;
    this.turns.current = state.currentTurn;
    this.score.player1 = state.score.player1;
    this.score.player2 = state.score.player2;
    this.timer.remainingMs = state.turnRemainingMs;
    if (state.phase === "PLAYER_TURN") this.timer.running = true;
    else this.timer.stop();
    if (opts.paintBodies) {
      paintMatchState(this.scene, state, this.ball, this.pucks, this.fx);
    }
  }

  private refreshUi(): void {
    const awaiting =
      (this.awaitingResolve && !this.replay) ||
      this.pausedForDisconnect ||
      this.selfDisconnected;
    this.hud.refresh({
      score: this.score,
      turn: this.turns,
      timer: this.timer,
      phase: this.phase,
      result: this.result,
      selectedPuckId: this.flick.selectedPuckId,
      awaitingServer: awaiting,
    });
    highlightActivePucks(
      this.pucks,
      this.turns.current,
      this.phase,
      this.flick.selectedPuckId,
    );
  }
}
