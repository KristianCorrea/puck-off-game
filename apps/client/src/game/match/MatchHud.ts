import type Phaser from "phaser";
import {
  PROTOTYPE_CONFIG,
  getFieldBounds,
  u,
} from "../config/prototypeConfig";
import type { MatchPhase, MatchResult, PlayerId } from "../config/gameConfig";
import { MATCH_CONFIG } from "../config/gameConfig";
import { GoalCelebration } from "../ui/GoalCelebration";
import type { ScoreKeeper } from "./ScoreKeeper";
import type { MatchTimer } from "./MatchTimer";
import type { TurnManager } from "./TurnManager";

const FONT = '"Nunito", system-ui, sans-serif';
const DISPLAY = '"Teko", "Arial Narrow", Impact, sans-serif';

export class MatchHud {
  private readonly scene: Phaser.Scene;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly brandText: Phaser.GameObjects.Text;
  private readonly p1Chip: Phaser.GameObjects.Container;
  private readonly p2Chip: Phaser.GameObjects.Container;
  private readonly p1Name: Phaser.GameObjects.Text;
  private readonly p2Name: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly turnText: Phaser.GameObjects.Text;
  private readonly timerPill: Phaser.GameObjects.Graphics;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly metaText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly rematchText: Phaser.GameObjects.Text;
  private readonly celebration: GoalCelebration;
  private readonly onRematch: () => void;

  constructor(scene: Phaser.Scene, opts: { onRematch: () => void }) {
    this.scene = scene;
    this.onRematch = opts.onRematch;
    this.celebration = new GoalCelebration(scene);

    const { width, hudHeight } = PROTOTYPE_CONFIG.arena;
    const field = getFieldBounds();

    this.panel = scene.add.graphics().setDepth(40).setScrollFactor(0);
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
      .setDepth(41)
      .setScrollFactor(0);

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
      .setDepth(41)
      .setScrollFactor(0);

    this.scoreText = scene.add
      .text(field.centerX, u(10), "0  —  0", {
        fontFamily: DISPLAY,
        fontSize: `${u(56)}px`,
        color: "#f8fafc",
      })
      .setOrigin(0.5, 0)
      .setDepth(41)
      .setScrollFactor(0);

    this.timerPill = scene.add.graphics().setDepth(41).setScrollFactor(0);
    this.timerText = scene.add
      .text(field.centerX, u(68), "20s", {
        fontFamily: FONT,
        fontSize: `${u(15)}px`,
        color: "#e2e8f0",
        fontStyle: "800",
      })
      .setOrigin(0.5)
      .setDepth(42)
      .setScrollFactor(0);

    this.turnText = scene.add
      .text(width - u(28), u(22), "Player 1 — your turn", {
        fontFamily: FONT,
        fontSize: `${u(16)}px`,
        color: "#2dd4bf",
        fontStyle: "700",
      })
      .setOrigin(1, 0)
      .setDepth(41)
      .setScrollFactor(0);

    const p1 = this.makePlayerChip("player1", field.centerX - u(168), u(58));
    const p2 = this.makePlayerChip("player2", field.centerX + u(168), u(58));
    this.p1Chip = p1.container;
    this.p2Chip = p2.container;
    this.p1Name = p1.label;
    this.p2Name = p2.label;

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
      .text(field.centerX, field.centerY + u(56), "PLAY AGAIN  ·  R", {
        fontFamily: FONT,
        fontSize: `${u(18)}px`,
        color: "#0f172a",
        backgroundColor: "#fbbf24",
        fontStyle: "800",
        padding: { x: u(22), y: u(12) },
      })
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

    scene.input.keyboard?.on("keydown-R", this.onRematchKey, this);
    this.drawTimerPill(false);
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
    this.bannerText.destroy();
    this.turnText.destroy();
    this.timerText.destroy();
    this.timerPill.destroy();
    this.scoreText.destroy();
    this.p1Chip.destroy();
    this.p2Chip.destroy();
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
  }): void {
    const { score, turn, timer, phase, result, selectedPuckId = null } = opts;

    this.scoreText.setText(`${score.player1}  —  ${score.player2}`);
    this.setChipActive(turn.current);

    if (phase === "MATCH_END") {
      this.timerText.setText("");
      this.timerPill.clear();
      this.turnText.setText("");
      this.showResult(result);
      this.rematchText.setVisible(true);
      return;
    }

    this.rematchText.setVisible(false);
    this.bannerText.setVisible(false);

    if (phase === "PLAYER_TURN") {
      this.timerText.setText(timer.format());
      this.timerText.setColor(timer.urgent ? "#fecaca" : "#e2e8f0");
      this.drawTimerPill(timer.urgent);
    } else {
      this.timerText.setText("—");
      this.timerText.setColor("#64748b");
      this.drawTimerPill(false);
    }

    if (phase === "PHYSICS_RESOLUTION") {
      this.turnText.setColor("#94a3b8");
      this.turnText.setText("Physics resolving…");
      return;
    }

    if (phase === "GOAL_RESOLUTION") {
      this.turnText.setColor("#fbbf24");
      this.turnText.setText("GOAL!!!");
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

  private makePlayerChip(
    id: PlayerId,
    x: number,
    y: number,
  ): { container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text } {
    const p = MATCH_CONFIG.players[id];
    const bg = this.scene.add
      .rectangle(0, 0, u(108), u(32), 0x122033, 0.95)
      .setStrokeStyle(u(2), p.color, 0.85);
    const dot = this.scene.add.circle(-u(36), 0, u(7), p.color);
    const label = this.scene.add
      .text(-u(18), 0, p.short, {
        fontFamily: FONT,
        fontSize: `${u(15)}px`,
        color: "#f8fafc",
        fontStyle: "800",
      })
      .setOrigin(0, 0.5);
    const container = this.scene.add
      .container(x, y, [bg, dot, label])
      .setDepth(41)
      .setScrollFactor(0);
    return { container, label };
  }

  private setChipActive(current: PlayerId): void {
    const scaleActive = 1.08;
    const scaleIdle = 0.92;
    this.p1Chip.setScale(current === "player1" ? scaleActive : scaleIdle);
    this.p2Chip.setScale(current === "player2" ? scaleActive : scaleIdle);
    this.p1Chip.setAlpha(current === "player1" ? 1 : 0.55);
    this.p2Chip.setAlpha(current === "player2" ? 1 : 0.55);
    this.p1Name.setColor(current === "player1" ? "#f0fdfa" : "#94a3b8");
    this.p2Name.setColor(current === "player2" ? "#fff1f2" : "#94a3b8");
  }

  private drawTimerPill(urgent: boolean): void {
    const field = getFieldBounds();
    const w = u(72);
    const h = u(28);
    const x = field.centerX - w / 2;
    const y = u(68) - h / 2;
    this.timerPill.clear();
    this.timerPill.fillStyle(urgent ? 0x7f1d1d : 0x1e293b, 0.95);
    this.timerPill.fillRoundedRect(x, y, w, h, u(14));
    this.timerPill.lineStyle(u(2), urgent ? 0xf87171 : 0x334155, 1);
    this.timerPill.strokeRoundedRect(x, y, w, h, u(14));
  }

  private onRematchKey = (): void => {
    if (this.rematchText.visible) this.onRematch();
  };

  private showResult(result: MatchResult): void {
    let msg = "DRAW";
    if (result === "player1") msg = "PLAYER 1 WINS!";
    if (result === "player2") msg = "PLAYER 2 WINS!";
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
