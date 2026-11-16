import Phaser from "phaser";
import { PROTOTYPE_CONFIG, getFieldBounds } from "./config/prototypeConfig";
import { createBall, type BallEntity } from "./entities/createBall";
import {
  ballInGoalSide,
  createGoals,
  type GoalSensors,
} from "./entities/createGoals";
import { createPuck, type PuckEntity } from "./entities/createPuck";
import { createWalls } from "./entities/createWalls";
import { FlickController } from "./input/FlickController";

/**
 * Phase 1 playground: flick one puck at the ball.
 * No turns/scoring yet — goal sensors log for handoff to Phase 2.
 */
export class ArenaScene extends Phaser.Scene {
  private puck!: PuckEntity;
  private ball!: BallEntity;
  private goals!: GoalSensors;
  private flick!: FlickController;
  private statusText!: Phaser.GameObjects.Text;
  private lastGoalLog = "";

  constructor() {
    super("ArenaScene");
  }

  create(): void {
    const { width, height, backgroundColor } = PROTOTYPE_CONFIG.arena;
    const field = getFieldBounds();

    this.cameras.main.setBackgroundColor(backgroundColor);
    this.matter.world.setBounds(0, 0, width, height, 0, false, false, false, false);
    this.matter.world.disableGravity();

    createWalls(this);
    this.goals = createGoals(this);

    // Midfield markings on the pitch
    const mid = this.add.graphics().setDepth(1);
    mid.lineStyle(2, 0x2a3f5f, 0.8);
    mid.lineBetween(field.centerX, 0, field.centerX, height);
    mid.strokeCircle(field.centerX, field.centerY, 56);

    this.ball = createBall(this);
    this.puck = createPuck(this);
    this.flick = new FlickController(this, this.puck);

    this.statusText = this.add
      .text(field.left + 16, 12, "Drag the teal puck, release to flick", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "15px",
        color: "#b8c9e0",
      })
      .setScrollFactor(0)
      .setDepth(30);

    this.add
      .text(field.right - 16, 12, "Phase 1 — physics prototype", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        color: "#6b84a3",
      })
      .setOrigin(1, 0)
      .setDepth(30);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.flick.destroy();
    });
  }

  update(): void {
    this.dampenIfSettling(this.puck.body);
    this.dampenIfSettling(this.ball.body);
    this.watchGoalSensors();
  }

  private dampenIfSettling(body: MatterJS.BodyType): void {
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    if (speed > 0 && speed < PROTOTYPE_CONFIG.settle.stopSpeed) {
      this.matter.body.setVelocity(body, { x: 0, y: 0 });
      this.matter.body.setAngularVelocity(body, 0);
    }
  }

  private watchGoalSensors(): void {
    const side = ballInGoalSide(this.ball.body, this.goals);
    if (!side) {
      if (this.lastGoalLog) {
        this.lastGoalLog = "";
        this.statusText.setText("Drag the teal puck, release to flick");
      }
      return;
    }

    const msg =
      side === "player1"
        ? "Ball in P1 goal pocket"
        : "Ball in P2 goal pocket";
    if (msg !== this.lastGoalLog) {
      this.lastGoalLog = msg;
      this.statusText.setText(msg);
    }
  }
}
