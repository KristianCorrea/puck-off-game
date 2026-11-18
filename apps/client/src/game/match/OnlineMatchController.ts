import type Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { Match } from "@puck-off/game-engine";
import {
  MATCH_CONFIG,
  SOCKET_EVENTS,
  type MatchPhase,
  type MatchResult,
  type MatchStartPayload,
  type MatchState,
  type PlayerId,
  type RejectLaunchPayload,
  type TurnResolvedPayload,
} from "@puck-off/shared";
import type { BallEntity } from "../entities/createBall";
import type { GameAudio } from "../audio/GameAudio";
import type { PuckEntity } from "../entities/createPuck";
import { GameFx } from "../fx/GameFx";
import { FlickController } from "../input/FlickController";
import { MatchHud, highlightActivePucks } from "./MatchHud";
import { MatchTimer } from "./MatchTimer";
import { ScoreKeeper } from "./ScoreKeeper";
import { TurnManager } from "./TurnManager";
import { paintMatchState } from "./paintMatchState";

/**
 * Online session: server Match is authority.
 * Shooter steps a local Match copy for snappy feel, then reconciles on TURN_RESOLVED.
 * Opponent waits and paints TURN_RESOLVED (no second Matter world).
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
  private readonly flick: FlickController;
  private readonly hud: MatchHud;
  private readonly fx: GameFx;
  private readonly engine: Match;

  private goalPauseMs = 0;
  private turnAnnounce = false;
  /** Local prediction in progress (we are the shooter). */
  private predicting = false;
  /** Local anim done; waiting for TURN_RESOLVED. */
  private awaitingServer = false;
  private pendingServer: MatchState | null = null;
  private preShotState: MatchState | null = null;
  private destroyed = false;

  constructor(opts: {
    scene: Phaser.Scene;
    audio: GameAudio;
    pucks: PuckEntity[];
    ball: BallEntity;
    socket: Socket;
    playerId: PlayerId;
    matchStart: MatchStartPayload;
    onRematch: () => void;
  }) {
    this.scene = opts.scene;
    this.audio = opts.audio;
    this.pucks = opts.pucks;
    this.ball = opts.ball;
    this.socket = opts.socket;
    this.myPlayerId = opts.playerId;

    this.engine = new Match();
    this.engine.start();
    this.engine.adoptState(opts.matchStart.state);

    this.hud = new MatchHud(opts.scene, { onRematch: opts.onRematch });
    this.fx = new GameFx(opts.scene, {
      pucks: opts.pucks,
      ball: opts.ball,
      audio: opts.audio,
    });

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
      },
      onAimEnd: () => this.fx.hideCharge(),
      onSelect: (puck) => {
        if (puck) this.audio.playSelect();
      },
      onLaunch: (puck, shot) => {
        if (!this.canFlick()) return;

        this.audio.playFlick(shot.power);
        this.fx.playLaunch(
          puck.body.position.x,
          puck.body.position.y,
          shot.angle,
          shot.power,
          puck.sprite.fillColor,
        );

        this.preShotState = this.engine.getState();
        const started = this.engine.applyAction({
          playerId: this.myPlayerId,
          puckId: puck.id,
          angle: shot.angle,
          power: shot.power,
        });
        if (!started.ok) {
          this.preShotState = null;
          return;
        }

        this.predicting = true;
        this.awaitingServer = false;
        this.pendingServer = null;
        this.fx.resetMotionTracking();
        this.syncFromState(started.state, { paintBodies: true });
        this.timer.stop();
        this.flick.setEnabled(false);

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
    this.socket.off(SOCKET_EVENTS.ERROR, this.onError);
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
    this.predicting = false;
    this.awaitingServer = false;
    this.pendingServer = null;
    this.preShotState = null;
    this.socket.emit(SOCKET_EVENTS.REMATCH);
  }

  update(deltaMs: number): void {
    if (this.destroyed) return;
    this.fx.update(deltaMs);

    if (this.phase === "PLAYER_TURN" && !this.predicting && !this.awaitingServer) {
      this.timer.remainingMs = Math.max(0, this.timer.remainingMs - deltaMs);
      this.timer.running = true;
    }

    if (this.predicting && this.phase === "PHYSICS_RESOLUTION") {
      this.updateLocalPrediction(deltaMs);
    } else if (this.phase === "GOAL_RESOLUTION") {
      this.updateGoalCelebration(deltaMs);
    }

    this.refreshUi();
  }

  private canFlick(): boolean {
    return (
      this.phase === "PLAYER_TURN" &&
      !this.predicting &&
      !this.awaitingServer &&
      this.turns.current === this.myPlayerId
    );
  }

  private bindSocket(): void {
    this.socket.on(SOCKET_EVENTS.TURN_RESOLVED, this.onTurnResolved);
    this.socket.on(SOCKET_EVENTS.REJECT_LAUNCH, this.onRejectLaunch);
    this.socket.on(SOCKET_EVENTS.MATCH_START, this.onMatchStart);
    this.socket.on(SOCKET_EVENTS.ERROR, this.onError);
  }

  private onTurnResolved = (payload: TurnResolvedPayload): void => {
    if (this.destroyed) return;
    const state = payload.state;

    if (this.predicting || this.awaitingServer) {
      this.pendingServer = state;
      if (!this.predicting) {
        this.applyAuthority(state);
        if (state.phase === "MATCH_END") {
          this.audio.playWin();
          this.flick.setEnabled(false);
          return;
        }
        this.enterPlayerTurnFromState(state);
      }
      return;
    }

    const scored =
      state.score.player1 !== this.score.player1 ||
      state.score.player2 !== this.score.player2;

    if (payload.reason === "timeout") {
      this.audio.playTimeout();
    }

    this.applyAuthority(state);

    if (scored && state.phase !== "MATCH_END") {
      this.audio.playGoal();
      this.hud.playGoalCelebration();
      this.goalPauseMs = Math.min(1200, MATCH_CONFIG.goalCelebrationMs);
      this.phase = "GOAL_RESOLUTION";
      this.flick.setEnabled(false);
      return;
    }

    if (state.phase === "MATCH_END") {
      this.audio.playWin();
      this.flick.setEnabled(false);
      return;
    }

    this.enterPlayerTurnFromState(state);
  };

  private onRejectLaunch = (payload: RejectLaunchPayload): void => {
    if (this.destroyed) return;
    this.predicting = false;
    this.awaitingServer = false;
    this.pendingServer = null;
    const restore = this.preShotState ?? this.engine.getState();
    this.preShotState = null;
    this.hud.stopGoalCelebration();
    this.applyAuthority(restore);
    this.enterPlayerTurnFromState(restore);
    console.warn("[online] launch rejected:", payload.reason);
  };

  private onMatchStart = (payload: MatchStartPayload): void => {
    if (this.destroyed) return;
    this.predicting = false;
    this.awaitingServer = false;
    this.pendingServer = null;
    this.preShotState = null;
    this.goalPauseMs = 0;
    this.turnAnnounce = false;
    this.hud.stopGoalCelebration();
    this.applyAuthority(payload.state);
    this.enterPlayerTurnFromState(payload.state);
  };

  private onError = (payload: { message?: string }): void => {
    console.warn("[online]", payload?.message ?? "error");
  };

  private updateLocalPrediction(deltaMs: number): void {
    const stepped = this.engine.step(deltaMs);
    this.syncFromState(stepped.state, { paintBodies: true });

    if (!stepped.shotComplete) return;

    if (stepped.events.some((e) => e.type === "goal")) {
      this.beginGoalCelebration();
      return;
    }

    this.endLocalPrediction();
  }

  private beginGoalCelebration(): void {
    this.phase = "GOAL_RESOLUTION";
    this.goalPauseMs = MATCH_CONFIG.goalCelebrationMs;
    this.audio.playGoal();
    this.hud.playGoalCelebration();
  }

  private updateGoalCelebration(deltaMs: number): void {
    if (this.predicting) {
      const stepped = this.engine.step(deltaMs);
      this.syncFromState(stepped.state, { paintBodies: true });
    }

    this.goalPauseMs -= deltaMs;
    if (this.goalPauseMs > 0) return;

    this.hud.stopGoalCelebration();
    if (this.predicting) {
      this.endLocalPrediction();
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

  private endLocalPrediction(): void {
    this.predicting = false;
    this.preShotState = null;

    // Capture before applyAuthority — it clears this.pendingServer.
    const state = this.pendingServer;
    if (state) {
      this.applyAuthority(state);

      if (state.phase === "MATCH_END") {
        this.audio.playWin();
        this.flick.setEnabled(false);
        return;
      }
      this.enterPlayerTurnFromState(state);
      return;
    }

    // Local finished first — hold until TURN_RESOLVED.
    this.awaitingServer = true;
    this.phase = "PHYSICS_RESOLUTION";
    this.flick.setEnabled(false);
  }

  private applyAuthority(state: MatchState): void {
    this.awaitingServer = false;
    this.pendingServer = null;
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
      state.currentTurn === this.myPlayerId && state.phase === "PLAYER_TURN",
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
    this.hud.refresh({
      score: this.score,
      turn: this.turns,
      timer: this.timer,
      phase: this.phase,
      result: this.result,
      selectedPuckId: this.flick.selectedPuckId,
    });
    highlightActivePucks(
      this.pucks,
      this.turns.current,
      this.phase,
      this.flick.selectedPuckId,
    );
  }
}
