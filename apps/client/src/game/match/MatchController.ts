import type Phaser from "phaser";
import {
  MATCH_CONFIG,
  type MatchPhase,
  type MatchResult,
  type PlayerId,
} from "../config/gameConfig";
import { PROTOTYPE_CONFIG, getFieldBounds, u } from "../config/prototypeConfig";
import type { BallEntity } from "../entities/createBall";
import {
  ballInGoalSide,
  pointInGoalSide,
  type GoalSensors,
} from "../entities/createGoals";
import {
  resetPuckToSpawn,
  type PuckEntity,
} from "../entities/createPuck";
import { GameFx } from "../fx/GameFx";
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
  private readonly fx: GameFx;

  private stableFrames = 0;
  private settleElapsedMs = 0;
  private goalPauseMs = 0;

  constructor(opts: {
    scene: Phaser.Scene;
    pucks: PuckEntity[];
    ball: BallEntity;
    goals: GoalSensors;
    onRematch: () => void;
  }) {
    this.scene = opts.scene;
    this.pucks = opts.pucks;
    this.ball = opts.ball;
    this.goals = opts.goals;
    this.hud = new MatchHud(opts.scene, { onRematch: opts.onRematch });
    this.fx = new GameFx(opts.scene, {
      pucks: opts.pucks,
      ball: opts.ball,
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
      onLaunch: (puck, shot) => {
        this.fx.playLaunch(
          puck.body.position.x,
          puck.body.position.y,
          shot.angle,
          shot.power,
          puck.sprite.fillColor,
        );
        this.beginPhysicsResolution();
      },
    });
    this.flick.bindPucks(this.pucks);
    this.enterPlayerTurn();
    this.refreshUi();
  }

  destroy(): void {
    this.flick.destroy();
    this.hud.destroy();
    this.fx.destroy();
  }

  update(deltaMs: number): void {
    this.dampenAll();
    this.fx.update(deltaMs);

    // Only the active player's move clock runs.
    if (this.phase === "PLAYER_TURN") {
      if (this.timer.tick(deltaMs)) {
        this.skipTurnOnTimeout();
        this.refreshUi();
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

  private enterPlayerTurn(): void {
    this.phase = "PLAYER_TURN";
    this.timer.reset();
    this.flick.setEnabled(true);
  }

  private beginPhysicsResolution(): void {
    this.phase = "PHYSICS_RESOLUTION";
    this.timer.stop();
    this.flick.setEnabled(false);
    this.stableFrames = 0;
    this.settleElapsedMs = 0;
  }

  private updatePhysicsResolution(deltaMs: number): void {
    // Goal as soon as ball *center* enters a pocket — do not wait for settle.
    const scoredSide = ballInGoalSide(this.ball.body, this.goals);
    if (scoredSide) {
      this.handleGoal(scoredSide);
      return;
    }

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

    // Pucks may not rest inside a goal — push them back onto the pitch.
    this.ejectPucksFromGoals();

    this.turns.advance();
    this.enterPlayerTurn();
  }

  private skipTurnOnTimeout(): void {
    this.flick.setEnabled(false);
    this.ejectPucksFromGoals();
    this.turns.advance();
    this.enterPlayerTurn();
  }

  private handleGoal(goalSide: PlayerId): void {
    this.phase = "GOAL_RESOLUTION";
    this.timer.stop();
    this.flick.setEnabled(false);

    this.score.awardForGoalIn(goalSide);
    this.goalPauseMs = MATCH_CONFIG.goalCelebrationMs;
    this.hud.playGoalCelebration();

    const winner = this.score.hasWinner();
    if (winner) {
      this.result = winner;
    }
  }

  /** Ball → midfield after a goal. */
  private resetBallMidfield(): void {
    const field = getFieldBounds();
    const matter = this.scene.matter;
    const body = this.ball.body;
    body.isSleeping = false;
    matter.body.setPosition(body, { x: field.centerX, y: field.centerY });
    matter.body.setVelocity(body, { x: 0, y: 0 });
    matter.body.setAngularVelocity(body, 0);
  }

  /** After a goal, all pucks return to the defense starting layout. */
  private resetAllPucksToSpawn(): void {
    for (const puck of this.pucks) {
      resetPuckToSpawn(this.scene, puck);
    }
  }

  /**
   * If a puck center is inside a goal pocket at end of turn, shove it
   * well onto the pitch (anti-turtling) instead of parking it at the mouth.
   */
  private ejectPucksFromGoals(): void {
    const field = getFieldBounds();
    const { wallThickness } = PROTOTYPE_CONFIG.arena;
    const margin = PROTOTYPE_CONFIG.puck.radius + u(10);
    const matter = this.scene.matter;
    const minY = field.top + wallThickness + margin;
    const maxY = field.bottom - wallThickness - margin;
    const inset = field.width * MATCH_CONFIG.goalEjectFieldRatio;

    for (const puck of this.pucks) {
      const side = pointInGoalSide(
        puck.body.position.x,
        puck.body.position.y,
        this.goals,
      );
      if (!side) continue;

      const x =
        side === "player1"
          ? field.left + inset
          : field.right - inset;
      const y = Math.min(maxY, Math.max(minY, puck.body.position.y));

      puck.body.isSleeping = false;
      matter.body.setPosition(puck.body, { x, y });
      matter.body.setVelocity(puck.body, { x: 0, y: 0 });
      matter.body.setAngularVelocity(puck.body, 0);
    }
  }

  private updateGoalResolution(deltaMs: number): void {
    this.goalPauseMs -= deltaMs;
    if (this.goalPauseMs > 0) return;

    this.hud.stopGoalCelebration();
    this.resetBallMidfield();
    this.resetAllPucksToSpawn();

    if (this.result) {
      this.phase = "MATCH_END";
      this.timer.stop();
      this.flick.setEnabled(false);
      return;
    }

    this.turns.advance();
    this.enterPlayerTurn();
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
