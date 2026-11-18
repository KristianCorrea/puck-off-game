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
import { OnlineMatchController } from "./match/OnlineMatchController";
import { bindLetterboxCamera } from "./scale/letterboxCamera";
import { getPlayMode } from "../networking/playMode";
import { runOnlineLobby } from "../networking/OnlineLobby";

type ActiveMatch = MatchController | OnlineMatchController;

/**
 * Arena: local hot-seat (default) or online session (?mode=online / mode pick).
 */
export class ArenaScene extends Phaser.Scene {
  private match: ActiveMatch | null = null;
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
    this.matter.world.autoUpdate = false;

    this.audio = new GameAudio(this);
    this.input.once("pointerdown", () => this.audio?.unlock());
    window.addEventListener("puckoff-play-gesture", this.onPlayGesture);

    const frame = this.add.graphics().setDepth(-1);
    frame.fillStyle(0x050b12, 1);
    frame.fillRect(0, 0, width, height);
    frame.fillStyle(0x0a1622, 1);
    frame.fillRect(0, hudHeight, width, height - hudHeight);

    createWalls(this);
    drawPitchMarkings(this);
    createGoals(this);

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

    const mode = getPlayMode();
    if (mode === "online") {
      void this.startOnline(pucks, ball);
    } else {
      this.match = new MatchController({
        scene: this,
        audio: this.audio,
        pucks,
        ball,
        onRematch: () => this.queueRematch(),
      });
    }

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

  private async startOnline(
    pucks: ReturnType<typeof createPuckAt>[],
    ball: ReturnType<typeof createBall>,
  ): Promise<void> {
    if (!this.audio) return;
    try {
      const lobby = await runOnlineLobby();
      if (!this.sys.isActive()) {
        lobby.socket.disconnect();
        return;
      }
      this.match = new OnlineMatchController({
        scene: this,
        audio: this.audio,
        pucks,
        ball,
        socket: lobby.socket,
        playerId: lobby.playerId,
        matchStart: lobby.matchStart,
        onRematch: () => this.queueRematch(),
        onLeave: () => this.leaveOnline(),
      });
    } catch (err) {
      console.error("[online] lobby failed", err);
    }
  }

  private onPlayGesture = (): void => {
    this.audio?.unlock();
  };

  private queueRematch(): void {
    if (this.rematchQueued || !this.match) return;
    this.rematchQueued = true;
    this.audio?.unlock();
    this.time.delayedCall(0, () => {
      this.match?.rematch();
      this.rematchQueued = false;
    });
  }

  private leaveOnline(): void {
    this.match?.destroy();
    this.match = null;
    sessionStorage.removeItem("puckoff-play-mode");
    window.location.assign(window.location.pathname);
  }
}
