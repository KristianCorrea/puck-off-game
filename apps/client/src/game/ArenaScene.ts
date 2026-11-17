import Phaser from "phaser";
import { GameAudio } from "./audio/GameAudio";
import { PROTOTYPE_CONFIG } from "./config/prototypeConfig";
import { createBall } from "./entities/createBall";
import { createGoals } from "./entities/createGoals";
import { createPuckAt } from "./entities/createPuck";
import { createWalls } from "./entities/createWalls";
import { drawPitchMarkings } from "./entities/drawPitch";
import { getDefenseLayout } from "./match/layouts/defenseLayout";
import { MatchController } from "./match/MatchController";
import { bindLetterboxCamera } from "./scale/letterboxCamera";

/**
 * Phase 2: full local hot-seat match on one machine.
 */
export class ArenaScene extends Phaser.Scene {
  private match: MatchController | null = null;
  private audio: GameAudio | null = null;
  private rematchQueued = false;

  constructor() {
    super("ArenaScene");
  }

  preload(): void {
    GameAudio.queue(this);
  }

  create(): void {
    this.rematchQueued = false;
    const { width, height, hudHeight } = PROTOTYPE_CONFIG.arena;

    bindLetterboxCamera(this);
    this.matter.world.setBounds(0, 0, width, height, 0, false, false, false, false);
    this.matter.world.disableGravity();
    // One physics truth: @puck-off/game-engine. Client Matter is display/input only.
    this.matter.world.autoUpdate = false;

    this.audio = new GameAudio(this);
    // Desktop / already-playing: unlock on first pointer in the scene.
    this.input.once("pointerdown", () => this.audio?.unlock());
    window.addEventListener("puckoff-play-gesture", this.onPlayGesture);

    // Dim frame behind / around the pitch
    const frame = this.add.graphics().setDepth(-1);
    frame.fillStyle(0x050b12, 1);
    frame.fillRect(0, 0, width, height);
    frame.fillStyle(0x0a1622, 1);
    frame.fillRect(0, hudHeight, width, height - hudHeight);

    createWalls(this);
    drawPitchMarkings(this);
    createGoals(this); // visual cages; scoring is engine-side

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
      audio: this.audio,
      pucks,
      ball,
      onRematch: () => this.queueRematch(),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("puckoff-play-gesture", this.onPlayGesture);
      this.match?.destroy();
      this.match = null;
      this.audio = null;
    });
  }

  update(_time: number, delta: number): void {
    this.match?.update(delta);
  }

  private onPlayGesture = (): void => {
    this.audio?.unlock();
  };

  /** Soft rematch next tick — never tear down the Matter scene. */
  private queueRematch(): void {
    if (this.rematchQueued || !this.match) return;
    this.rematchQueued = true;
    this.audio?.unlock();
    this.time.delayedCall(0, () => {
      this.match?.rematch();
      this.rematchQueued = false;
    });
  }
}
