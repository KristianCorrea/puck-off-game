import type Phaser from "phaser";
import {
  PROTOTYPE_CONFIG,
  getFieldBounds,
  u,
} from "../config/prototypeConfig";
import type { MatchPhase, MatchResult, PlayerId } from "../config/gameConfig";
import { MATCH_CONFIG } from "../config/gameConfig";
import type { GameAudio } from "../audio/GameAudio";
import { GoalCelebration } from "../ui/GoalCelebration";
import type { ScoreKeeper } from "./ScoreKeeper";
import type { MatchTimer } from "./MatchTimer";
import type { TurnManager } from "./TurnManager";
import { TurnPlate } from "./TurnPlate";

const FONT = '"Nunito", system-ui, sans-serif';
const DISPLAY = '"Teko", "Arial Narrow", Impact, sans-serif';

export type MatchHudOnlineOpts = {
  myPlayerId: PlayerId;
  onLeave: () => void;
};

export class MatchHud {
  private readonly scene: Phaser.Scene;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly brandText: Phaser.GameObjects.Text;
  private readonly plates: Record<PlayerId, TurnPlate>;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly turnText: Phaser.GameObjects.Text;
  private readonly metaText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly rematchText: Phaser.GameObjects.Text;
  private readonly leaveText: Phaser.GameObjects.Text | null;
  private readonly celebration: GoalCelebration;
  private readonly onRematch: () => void;
  private readonly online: MatchHudOnlineOpts | null;
  private readonly audio: GameAudio | null;
  private countdownSeconds: number | null = null;
  private statusHint: string | null = null;

  constructor(
    scene: Phaser.Scene,
    opts: {
      onRematch: () => void;
      online?: MatchHudOnlineOpts;
      audio?: GameAudio | null;
    },
  ) {
    this.scene = scene;
    this.onRematch = opts.onRematch;
    this.online = opts.online ?? null;
    this.audio = opts.audio ?? null;
    this.celebration = new GoalCelebration(scene);

    const { width, hudHeight } = PROTOTYPE_CONFIG.arena;
    const field = getFieldBounds();

    // World-space HUD (scrolls/zooms with letterboxed camera — bars stay on-canvas).
    this.panel = scene.add.graphics().setDepth(40);
    this.panel.fillStyle(0x0b1a28, 0.98);
    this.panel.fillRect(0, 0, width, hudHeight);
    this.panel.fillStyle(0x134e4a, 1);
    this.panel.fillRect(0, hudHeight - u(4), width * 0.5, u(4));
    this.panel.fillStyle(0x9f1239, 1);
    this.panel.fillRect(width * 0.5, hudHeight - u(4), width * 0.5, u(4));
    this.panel.lineStyle(u(1), 0x2dd4bf, 0.25);
    this.panel.lineBetween(0, hudHeight - 1, width, hudHeight - 1);

    this.brandText = scene.add
      .text(u(28), u(18), "PUCK OFF", {
        fontFamily: DISPLAY,
        fontSize: `${u(34)}px`,
        color: "#e2e8f0",
        letterSpacing: u(2),
      })
      .setOrigin(0, 0)
      .setDepth(41);

    this.metaText = scene.add
      .text(
        u(28),
        u(54),
        `FIRST TO ${MATCH_CONFIG.maxGoals}  ·  ${MATCH_CONFIG.turnDurationMs / 1000}S TURNS`,
        {
          fontFamily: FONT,
          fontSize: `${u(11)}px`,
          color: "#64748b",
          fontStyle: "700",
        },
      )
      .setOrigin(0, 0)
      .setDepth(41);

    this.scoreText = scene.add
      .text(field.centerX, u(10), "0  —  0", {
        fontFamily: DISPLAY,
        fontSize: `${u(56)}px`,
        color: "#f8fafc",
      })
      .setOrigin(0.5, 0)
      .setDepth(41);

    this.turnText = scene.add
      .text(width - u(28), u(22), "Player 1 — your turn", {
        fontFamily: FONT,
        fontSize: `${u(16)}px`,
        color: "#2dd4bf",
        fontStyle: "700",
      })
      .setOrigin(1, 0)
      .setDepth(41);

    this.plates = {
      player1: new TurnPlate(
        scene,
        "player1",
        field.centerX - u(168),
        u(62),
      ),
      player2: new TurnPlate(
        scene,
        "player2",
        field.centerX + u(168),
        u(62),
      ),
    };

    this.bannerText = scene.add
      .text(field.centerX, field.centerY - u(24), "", {
        fontFamily: DISPLAY,
        fontSize: `${u(64)}px`,
        color: "#ffe066",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setVisible(false);

    this.rematchText = scene.add
      .text(
        field.centerX - (this.online ? u(90) : 0),
        field.centerY + u(56),
        "PLAY AGAIN  ·  R",
        {
          fontFamily: FONT,
          fontSize: `${u(18)}px`,
          color: "#0f172a",
          backgroundColor: "#fbbf24",
          fontStyle: "800",
          padding: { x: u(28), y: u(16) },
        },
      )
      .setOrigin(0.5)
      .setDepth(51)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    this.rematchText.on("pointerover", () => {
      this.rematchText.setStyle({ backgroundColor: "#fde68a" });
    });
    this.rematchText.on("pointerout", () => {
      this.rematchText.setStyle({ backgroundColor: "#fbbf24" });
    });
    this.rematchText.on("pointerdown", () => {
      this.onRematch();
    });

    if (this.online) {
      this.leaveText = scene.add
        .text(field.centerX + u(110), field.centerY + u(56), "LEAVE", {
          fontFamily: FONT,
          fontSize: `${u(18)}px`,
          color: "#e2e8f0",
          backgroundColor: "#334155",
          fontStyle: "800",
          padding: { x: u(28), y: u(16) },
        })
        .setOrigin(0.5)
        .setDepth(51)
        .setVisible(false)
        .setInteractive({ useHandCursor: true });

      this.leaveText.on("pointerover", () => {
        this.leaveText?.setStyle({ backgroundColor: "#475569" });
      });
      this.leaveText.on("pointerout", () => {
        this.leaveText?.setStyle({ backgroundColor: "#334155" });
      });
      this.leaveText.on("pointerdown", () => {
        this.online?.onLeave();
      });
    } else {
      this.leaveText = null;
    }

    scene.input.keyboard?.on("keydown-R", this.onRematchKey, this);
  }

  /** Online rematch countdown (3…2…1…0). Null clears. */
  setCountdown(seconds: number | null): void {
    this.countdownSeconds = seconds;
  }

  /** Extra status line for online waiting / reject hints. */
  setStatusHint(hint: string | null): void {
    this.statusHint = hint;
  }

  playGoalCelebration(): void {
    this.celebration.play();
  }

  stopGoalCelebration(): void {
    this.celebration.stop();
  }

  destroy(): void {
    this.scene.input.keyboard?.off("keydown-R", this.onRematchKey, this);
    this.celebration.destroy();
    this.rematchText.destroy();
    this.leaveText?.destroy();
    this.bannerText.destroy();
    this.turnText.destroy();
    this.scoreText.destroy();
    this.plates.player1.destroy();
    this.plates.player2.destroy();
    this.brandText.destroy();
    this.metaText.destroy();
    this.panel.destroy();
  }

  refresh(opts: {
    score: ScoreKeeper;
    turn: TurnManager;
    timer: MatchTimer;
    phase: MatchPhase;
    result: MatchResult;
    selectedPuckId?: string | null;
    awaitingServer?: boolean;
  }): void {
    const {
      score,
      turn,
      timer,
      phase,
      result,
      selectedPuckId = null,
      awaitingServer = false,
    } = opts;

    this.scoreText.setText(`${score.player1}  —  ${score.player2}`);
    this.plates.player1.setActive(turn.current === "player1");
    this.plates.player2.setActive(turn.current === "player2");

    if (this.countdownSeconds !== null) {
      this.clearClocks();
      this.turnText.setText("");
      this.rematchText.setVisible(false);
      this.leaveText?.setVisible(false);
      const label =
        this.countdownSeconds > 0
          ? String(this.countdownSeconds)
          : "GO!";
      this.bannerText.setText(label);
      this.bannerText.setVisible(true);
      return;
    }

    if (phase === "MATCH_END") {
      this.clearClocks();
      this.turnText.setText("");
      this.showResult(result);
      this.rematchText.setVisible(true);
      this.leaveText?.setVisible(true);
      return;
    }

    this.rematchText.setVisible(false);
    this.leaveText?.setVisible(false);
    this.bannerText.setVisible(false);

    if (phase === "PLAYER_TURN") {
      this.plates[turn.current].setTime(
        timer.remainingMs,
        MATCH_CONFIG.turnDurationMs,
        {
          onTick: (secondsLeft) => this.audio?.playTick(secondsLeft),
        },
      );
    } else {
      this.clearClocks();
    }

    if (awaitingServer) {
      this.turnText.setColor("#94a3b8");
      this.turnText.setText(this.statusHint ?? "Waiting for server…");
      return;
    }

    if (phase === "PHYSICS_RESOLUTION") {
      this.turnText.setColor("#94a3b8");
      this.turnText.setText(
        this.online ? "Replay…" : "Physics resolving…",
      );
      return;
    }

    if (phase === "GOAL_RESOLUTION") {
      this.turnText.setColor("#fbbf24");
      this.turnText.setText("GOAL!!!");
      return;
    }

    if (this.statusHint) {
      this.turnText.setColor("#fbbf24");
      this.turnText.setText(this.statusHint);
      return;
    }

    if (this.online) {
      const mine = turn.current === this.online.myPlayerId;
      const p = MATCH_CONFIG.players[turn.current];
      this.turnText.setColor(phaserColorToCss(p.color));
      if (mine) {
        this.turnText.setText(
          selectedPuckId
            ? "Selected — drag anywhere"
            : "Your turn — flick a puck",
        );
      } else {
        this.turnText.setText("Opponent's turn…");
      }
      return;
    }

    const p = MATCH_CONFIG.players[turn.current];
    this.turnText.setColor(phaserColorToCss(p.color));
    this.turnText.setText(
      selectedPuckId
        ? `${p.short} selected — drag anywhere`
        : `${p.label} — your turn`,
    );
  }

  private clearClocks(): void {
    this.plates.player1.clearClock();
    this.plates.player2.clearClock();
  }

  private onRematchKey = (): void => {
    if (this.rematchText.visible) this.onRematch();
  };

  private showResult(result: MatchResult): void {
    let msg = "DRAW";
    if (this.online) {
      if (result === this.online.myPlayerId) msg = "YOU WIN!";
      else if (result === "player1" || result === "player2") msg = "YOU LOSE";
    } else {
      if (result === "player1") msg = "PLAYER 1 WINS!";
      if (result === "player2") msg = "PLAYER 2 WINS!";
    }
    this.bannerText.setText(msg);
    this.bannerText.setVisible(true);
  }
}

function phaserColorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function highlightActivePucks(
  pucks: {
    id: string;
    ownerId: PlayerId;
    sprite: Phaser.GameObjects.Arc;
  }[],
  current: PlayerId,
  phase: MatchPhase,
  selectedPuckId: string | null = null,
): void {
  const active = phase === "PLAYER_TURN";
  for (const puck of pucks) {
    const mine = puck.ownerId === current;
    const selected = selectedPuckId === puck.id;
    const shine = puck.sprite.getData("shine") as
      | Phaser.GameObjects.Arc
      | undefined;
    const base = MATCH_CONFIG.players[puck.ownerId].color;
    const stroke = MATCH_CONFIG.players[puck.ownerId].strokeColor;

    // Opaque always — alpha gray-out let pitch lines show “through” the puck.
    puck.sprite.setAlpha(1);
    if (active && mine) {
      puck.sprite.setFillStyle(base, 1);
      shine?.setAlpha(0.9);
    } else if (active) {
      puck.sprite.setFillStyle(mixTowardSlate(base, 0.55), 1);
      shine?.setAlpha(0.12);
    } else {
      puck.sprite.setFillStyle(mixTowardSlate(base, 0.35), 1);
      shine?.setAlpha(0.2);
    }

    if (selected && active) {
      puck.sprite.setStrokeStyle(u(5), 0xfbbf24);
    } else {
      puck.sprite.setStrokeStyle(u(4), stroke, mine && active ? 0.95 : 0.45);
    }
  }
}

/** Blend player color toward slate so inactive pucks read as dimmed, not transparent. */
function mixTowardSlate(color: number, amount: number): number {
  const slate = 0x334155;
  const lerp = (a: number, b: number) =>
    Math.round(a + (b - a) * amount);
  const r = lerp((color >> 16) & 0xff, (slate >> 16) & 0xff);
  const g = lerp((color >> 8) & 0xff, (slate >> 8) & 0xff);
  const b = lerp(color & 0xff, slate & 0xff);
  return (r << 16) | (g << 8) | b;
}
