import Phaser from "phaser";
import { PROTOTYPE_CONFIG } from "./config/prototypeConfig";
import { createBall } from "./entities/createBall";
import { createGoals } from "./entities/createGoals";
import { createPuckAt } from "./entities/createPuck";
import { createWalls } from "./entities/createWalls";
import { drawPitchMarkings } from "./entities/drawPitch";
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
    const { width, height, backgroundColor, hudHeight } = PROTOTYPE_CONFIG.arena;

    this.cameras.main.setBackgroundColor(backgroundColor);
    this.matter.world.setBounds(0, 0, width, height, 0, false, false, false, false);
    this.matter.world.disableGravity();

    // Dim frame behind / around the pitch
    const frame = this.add.graphics().setDepth(-1);
    frame.fillStyle(0x050b12, 1);
    frame.fillRect(0, 0, width, height);
    frame.fillStyle(0x0a1622, 1);
    frame.fillRect(0, hudHeight, width, height - hudHeight);

    createWalls(this);
    drawPitchMarkings(this);
    const goals = createGoals(this);

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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.match.destroy();
    });
  }

  update(_time: number, delta: number): void {
    this.match.update(delta);
  }
}
