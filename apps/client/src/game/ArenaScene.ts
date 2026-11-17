import Phaser from "phaser";
import { MATCH_CONFIG } from "./config/gameConfig";
import { PROTOTYPE_CONFIG, getFieldBounds } from "./config/prototypeConfig";
import { createBall } from "./entities/createBall";
import { createGoals } from "./entities/createGoals";
import { createPuckAt } from "./entities/createPuck";
import { createWalls } from "./entities/createWalls";
import { getDefenseLayout } from "./match/layouts/defenseLayout";
import { MatchController } from "./match/MatchController";

/**
 * Phase 2: full local hot-seat match on one machine.
 */
export class ArenaScene extends Phaser.Scene {
  private match!: MatchController;

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
    const goals = createGoals(this);

    const mid = this.add.graphics().setDepth(1);
    mid.lineStyle(2, 0x2a3f5f, 0.8);
    mid.lineBetween(field.centerX, 0, field.centerX, height);
    mid.strokeCircle(field.centerX, field.centerY, 56);

    const ball = createBall(this);
    const layout = getDefenseLayout();
    const pucks = [
      ...layout.player1.map((pos, i) =>
        createPuckAt(this, {
          id: `p1_${i + 1}`,
          ownerId: "player1",
          x: pos.x,
          y: pos.y,
        }),
      ),
      ...layout.player2.map((pos, i) =>
        createPuckAt(this, {
          id: `p2_${i + 1}`,
          ownerId: "player2",
          x: pos.x,
          y: pos.y,
        }),
      ),
    ];

    this.match = new MatchController({
      scene: this,
      pucks,
      ball,
      goals,
      onRematch: () => {
        this.scene.restart();
      },
    });

    this.add
      .text(field.right - 16, height - 16, "Phase 2 — local match", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
        color: "#6b84a3",
      })
      .setOrigin(1, 1)
      .setDepth(30);

    this.add
      .text(
        field.left + 16,
        height - 16,
        `First to ${MATCH_CONFIG.maxGoals} · ${MATCH_CONFIG.turnDurationMs / 1000}s / turn`,
        {
          fontFamily: "system-ui, sans-serif",
          fontSize: "12px",
          color: "#6b84a3",
        },
      )
      .setOrigin(0, 1)
      .setDepth(30);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.match.destroy();
    });
  }

  update(_time: number, delta: number): void {
    this.match.update(delta);
  }
}
