import type Phaser from "phaser";
import {
  MATCH_CONFIG,
  type MatchPhase,
  type MatchResult,
  type PlayerId,
} from "../config/gameConfig";
import { PROTOTYPE_CONFIG, getFieldBounds } from "../config/prototypeConfig";
import type { BallEntity } from "../entities/createBall";
import {
  ballInGoalSide,
  type GoalSensors,
} from "../entities/createGoals";
import type { PuckEntity } from "../entities/createPuck";
import { FlickController } from "../input/FlickController";
import { MatchHud, highlightActivePucks } from "./MatchHud";
import { MatchTimer } from "./MatchTimer";
import { ScoreKeeper } from "./ScoreKeeper";
import { TurnManager } from "./TurnManager";

/**
 * Local match state machine: turn → physics → goal? → end / next turn.
 */
export class MatchController {
  phase: MatchPhase = "PLAYER_TURN";
  result: MatchResult = null;

  readonly score = new ScoreKeeper();
  readonly turns = new TurnManager();
  readonly timer = new MatchTimer();

  private readonly scene: Phaser.Scene;
  private readonly pucks: PuckEntity[];
  private readonly ball: BallEntity;
  private readonly goals: GoalSensors;
  private readonly flick: FlickController;
  private readonly hud: MatchHud;

  private stableFrames = 0;
  private settleElapsedMs = 0;
  private goalPauseMs = 0;

  constructor(opts: {
    scene: Phaser.Scene;
    pucks: PuckEntity[];
    ball: BallEntity;
    goals: GoalSensors;
  }) {
    this.scene = opts.scene;
    this.pucks = opts.pucks;
    this.ball = opts.ball;
    this.goals = opts.goals;
    this.hud = new MatchHud(opts.scene);

    this.flick = new FlickController(opts.scene, {
      getSelectablePucks: () =>
        this.phase === "PLAYER_TURN"
          ? this.pucks.filter((p) => p.ownerId === this.turns.current)
          : [],
      onLaunch: () => this.beginPhysicsResolution(),
    });
    this.flick.bindPucks(this.pucks);
    this.refreshUi();
  }

  destroy(): void {
    this.flick.destroy();
  }

  update(deltaMs: number): void {
    this.dampenAll();

    if (this.phase !== "MATCH_END") {
      if (this.timer.tick(deltaMs)) {
        this.endOnTimer();
        return;
      }
    }

    if (this.phase === "PHYSICS_RESOLUTION") {
      this.updatePhysicsResolution(deltaMs);
    } else if (this.phase === "GOAL_RESOLUTION") {
      this.updateGoalResolution(deltaMs);
    }

    this.refreshUi();
  }

  private beginPhysicsResolution(): void {
    this.phase = "PHYSICS_RESOLUTION";
    this.flick.setEnabled(false);
    this.stableFrames = 0;
    this.settleElapsedMs = 0;
  }

  private updatePhysicsResolution(deltaMs: number): void {
    this.settleElapsedMs += deltaMs;

    if (this.bodiesSettled()) {
      this.stableFrames += 1;
    } else {
      this.stableFrames = 0;
    }

    const settled =
      this.stableFrames >= MATCH_CONFIG.settleStableFrames ||
      this.settleElapsedMs >= MATCH_CONFIG.settleMaxMs;

    if (!settled) return;

    const side = ballInGoalSide(this.ball.body, this.goals);
    if (side) {
      this.handleGoal(side);
      return;
    }

    this.turns.advance();
    this.phase = "PLAYER_TURN";
    this.flick.setEnabled(true);
  }

  private handleGoal(goalSide: PlayerId): void {
    this.phase = "GOAL_RESOLUTION";
    this.flick.setEnabled(false);
    this.score.awardForGoalIn(goalSide);
    this.resetBallMidfield();
    this.goalPauseMs = 900;

    const winner = this.score.hasWinner();
    if (winner) {
      this.result = winner;
      // Still show brief Goal! then end
    }
  }

  /**
   * Isolated ball reset after a goal — pucks stay where they are.
   */
  private resetBallMidfield(): void {
    const field = getFieldBounds();
    const matter = this.scene.matter;
    const body = this.ball.body;
    body.isSleeping = false;
    matter.body.setPosition(body, { x: field.centerX, y: field.centerY });
    matter.body.setVelocity(body, { x: 0, y: 0 });
    matter.body.setAngularVelocity(body, 0);
  }

  private updateGoalResolution(deltaMs: number): void {
    this.goalPauseMs -= deltaMs;
    if (this.goalPauseMs > 0) return;

    if (this.result) {
      this.phase = "MATCH_END";
      this.timer.running = false;
      this.flick.setEnabled(false);
      return;
    }

    this.turns.advance();
    this.phase = "PLAYER_TURN";
    this.flick.setEnabled(true);
  }

  private endOnTimer(): void {
    this.flick.setEnabled(false);
    const outcome = this.score.winnerOnTimerExpiry();
    this.result = outcome === "draw" ? "draw" : outcome;
    this.phase = "MATCH_END";
  }

  private bodiesSettled(): boolean {
    const stop = PROTOTYPE_CONFIG.settle.stopSpeed;
    const bodies = [this.ball.body, ...this.pucks.map((p) => p.body)];
    return bodies.every((b) => {
      const speed = Math.hypot(b.velocity.x, b.velocity.y);
      return speed <= stop;
    });
  }

  private dampenAll(): void {
    const stop = PROTOTYPE_CONFIG.settle.stopSpeed;
    const matter = this.scene.matter;
    const bodies = [this.ball.body, ...this.pucks.map((p) => p.body)];
    for (const body of bodies) {
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed > 0 && speed < stop) {
        matter.body.setVelocity(body, { x: 0, y: 0 });
        matter.body.setAngularVelocity(body, 0);
      }
    }
  }

  private refreshUi(): void {
    this.hud.refresh({
      score: this.score,
      turn: this.turns,
      timer: this.timer,
      phase: this.phase,
      result: this.result,
    });
    highlightActivePucks(this.pucks, this.turns.current, this.phase);
  }
}
