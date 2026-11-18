import type Phaser from "phaser";
import { Match } from "@puck-off/game-engine";
import type { MatchState } from "@puck-off/shared";
import {
  MATCH_CONFIG,
  type MatchPhase,
  type MatchResult,
} from "../config/gameConfig";
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
 * Local hot-seat: one Match engine owns physics; Phaser only paints + input.
 */
export class MatchController {
  phase: MatchPhase = "PLAYER_TURN";
  result: MatchResult = null;

  readonly score = new ScoreKeeper();
  readonly turns = new TurnManager();
  readonly timer = new MatchTimer();

  private readonly scene: Phaser.Scene;
  private readonly audio: GameAudio;
  private readonly pucks: PuckEntity[];
  private readonly ball: BallEntity;
  private readonly flick: FlickController;
  private readonly hud: MatchHud;
  private readonly fx: GameFx;
  private readonly engine: Match;

  private goalPauseMs = 0;
  private turnAnnounce = false;

  constructor(opts: {
    scene: Phaser.Scene;
    audio: GameAudio;
    pucks: PuckEntity[];
    ball: BallEntity;
    onRematch: () => void;
  }) {
    this.scene = opts.scene;
    this.audio = opts.audio;
    this.pucks = opts.pucks;
    this.ball = opts.ball;
    this.engine = new Match();
    this.engine.start();

    this.hud = new MatchHud(opts.scene, { onRematch: opts.onRematch });
    this.fx = new GameFx(opts.scene, {
      pucks: opts.pucks,
      ball: opts.ball,
      audio: opts.audio,
    });

    this.flick = new FlickController(opts.scene, {
      getSelectablePucks: () =>
        this.phase === "PLAYER_TURN"
          ? this.pucks.filter((p) => p.ownerId === this.turns.current)
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
        this.audio.playFlick(shot.power);
        this.fx.playLaunch(
          puck.body.position.x,
          puck.body.position.y,
          shot.angle,
          shot.power,
          puck.sprite.fillColor,
        );

        const started = this.engine.applyAction({
          playerId: this.turns.current,
          puckId: puck.id,
          angle: shot.angle,
          power: shot.power,
        });
        if (!started.ok) return;

        this.fx.resetMotionTracking();
        this.syncFromEngine(started.state, { paintBodies: true });
        this.timer.stop();
        this.flick.setEnabled(false);
      },
    });
    this.flick.bindPucks(this.pucks);
    this.syncFromEngine(this.engine.getState(), { paintBodies: true });
    this.enterPlayerTurnFromEngine();
    this.refreshUi();
  }

  destroy(): void {
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
    this.turnAnnounce = false;

    const state = this.engine.rematch();
    this.syncFromEngine(state, { paintBodies: true });
    this.enterPlayerTurnFromEngine();
    this.refreshUi();
  }

  update(deltaMs: number): void {
    this.fx.update(deltaMs);

    if (this.phase === "PLAYER_TURN") {
      const { skipped, state } = this.engine.tick(deltaMs);
      this.syncFromEngine(state, { paintBodies: skipped });
      if (skipped) {
        this.audio.playTimeout();
        if (this.turnAnnounce) this.audio.playTurn();
        this.turnAnnounce = true;
        this.flick.setEnabled(true);
        this.refreshUi();
        return;
      }
      this.timer.remainingMs = state.turnRemainingMs;
      this.timer.running = true;
    } else if (this.phase === "PHYSICS_RESOLUTION") {
      this.updatePhysicsResolution(deltaMs);
    } else if (this.phase === "GOAL_RESOLUTION") {
      this.updateGoalResolution(deltaMs);
    }

    this.refreshUi();
  }

  private updatePhysicsResolution(deltaMs: number): void {
    const stepped = this.engine.step(deltaMs);
    this.syncFromEngine(stepped.state, { paintBodies: true });

    if (!stepped.shotComplete) return;

    if (stepped.events.some((e) => e.type === "goal")) {
      this.beginGoalCelebration();
      return;
    }

    // Settled — engine already advanced turn.
    if (stepped.state.phase === "MATCH_END") {
      this.audio.playWin();
      this.flick.setEnabled(false);
      return;
    }

    this.enterPlayerTurnFromEngine();
  }

  private beginGoalCelebration(): void {
    this.phase = "GOAL_RESOLUTION";
    this.goalPauseMs = MATCH_CONFIG.goalCelebrationMs;
    this.audio.playGoal();
    this.hud.playGoalCelebration();
  }

  private updateGoalResolution(deltaMs: number): void {
    // Keep stepping so the ball plays through the net during celebration.
    const stepped = this.engine.step(deltaMs);
    this.syncFromEngine(stepped.state, { paintBodies: true });

    this.goalPauseMs -= deltaMs;
    if (this.goalPauseMs > 0) return;

    this.hud.stopGoalCelebration();
    const state = this.engine.completeGoalResolution();
    this.syncFromEngine(state, { paintBodies: true });

    if (state.phase === "MATCH_END") {
      this.audio.playWin();
      this.flick.setEnabled(false);
      return;
    }

    this.enterPlayerTurnFromEngine();
  }

  private enterPlayerTurnFromEngine(): void {
    this.phase = "PLAYER_TURN";
    this.timer.reset();
    this.timer.remainingMs = this.engine.getState().turnRemainingMs;
    this.flick.setEnabled(true);
    if (this.turnAnnounce) this.audio.playTurn();
    this.turnAnnounce = true;
  }

  private syncFromEngine(
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
    if (opts.paintBodies) this.paintBodiesFromEngine(state);
  }

  private paintBodiesFromEngine(state: MatchState): void {
    paintMatchState(this.scene, state, this.ball, this.pucks, this.fx);
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
