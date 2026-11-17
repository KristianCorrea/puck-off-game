import type Phaser from "phaser";
import { getFieldBounds } from "../config/prototypeConfig";
import type { MatchPhase, MatchResult, PlayerId } from "../config/gameConfig";
import { MATCH_CONFIG } from "../config/gameConfig";
import { GoalCelebration } from "../ui/GoalCelebration";
import type { ScoreKeeper } from "./ScoreKeeper";
import type { MatchTimer } from "./MatchTimer";
import type { TurnManager } from "./TurnManager";

export class MatchHud {
  private readonly scene: Phaser.Scene;
  private readonly p1Label: Phaser.GameObjects.Text;
  private readonly p2Label: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly turnText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly rematchText: Phaser.GameObjects.Text;
  private readonly celebration: GoalCelebration;
  private readonly onRematch: () => void;

  constructor(scene: Phaser.Scene, opts: { onRematch: () => void }) {
    this.scene = scene;
    this.onRematch = opts.onRematch;
    this.celebration = new GoalCelebration(scene);
    const field = getFieldBounds();
    const pad = 24;

    this.p1Label = scene.add
      .text(field.left + pad, 16, MATCH_CONFIG.players.player1.label, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: phaserColorToCss(MATCH_CONFIG.players.player1.color),
      })
      .setOrigin(0, 0)
      .setDepth(40)
      .setScrollFactor(0);

    this.p2Label = scene.add
      .text(field.right - pad, 16, MATCH_CONFIG.players.player2.label, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: phaserColorToCss(MATCH_CONFIG.players.player2.color),
      })
      .setOrigin(1, 0)
      .setDepth(40)
      .setScrollFactor(0);

    this.scoreText = scene.add
      .text(field.centerX, 14, "0  —  0", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        color: "#e8eef7",
      })
      .setOrigin(0.5, 0)
      .setDepth(40)
      .setScrollFactor(0);

    this.timerText = scene.add
      .text(field.centerX, 48, "20s", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#8ba3c7",
      })
      .setOrigin(0.5, 0)
      .setDepth(40)
      .setScrollFactor(0);

    this.turnText = scene.add
      .text(field.centerX, 72, "Player 1 — your turn", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "15px",
        color: "#2ec4b6",
      })
      .setOrigin(0.5, 0)
      .setDepth(40)
      .setScrollFactor(0);

    this.bannerText = scene.add
      .text(field.centerX, field.centerY - 24, "", {
        fontFamily: "Georgia, serif",
        fontSize: "42px",
        color: "#ffe066",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setVisible(false);

    this.rematchText = scene.add
      .text(field.centerX, field.centerY + 48, "Play again  ·  R", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#e8eef7",
        backgroundColor: "#1a2a44",
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(51)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    this.rematchText.on("pointerover", () => {
      this.rematchText.setColor("#ffe066");
    });
    this.rematchText.on("pointerout", () => {
      this.rematchText.setColor("#e8eef7");
    });
    this.rematchText.on("pointerdown", () => {
      this.onRematch();
    });

    scene.input.keyboard?.on("keydown-R", this.onRematchKey, this);
  }

  /** Kick off the party once when a goal is scored. */
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
    this.scoreText.destroy();
    this.p1Label.destroy();
    this.p2Label.destroy();
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

    if (phase === "MATCH_END") {
      this.timerText.setText("");
      this.turnText.setText("");
      this.showResult(result);
      this.rematchText.setVisible(true);
      return;
    }

    this.rematchText.setVisible(false);
    this.bannerText.setVisible(false);

    if (phase === "PLAYER_TURN") {
      this.timerText.setText(timer.format());
      this.timerText.setColor(timer.urgent ? "#ff6b6b" : "#8ba3c7");
    } else {
      this.timerText.setText("");
    }

    if (phase === "PHYSICS_RESOLUTION") {
      this.turnText.setColor("#8ba3c7");
      this.turnText.setText("Physics resolving…");
      return;
    }

    if (phase === "GOAL_RESOLUTION") {
      this.turnText.setColor("#ffe066");
      this.turnText.setText("GOAL!!!");
      // Banner/party owned by GoalCelebration — don't stomp its tweens.
      return;
    }

    const p = MATCH_CONFIG.players[turn.current];
    this.turnText.setColor(phaserColorToCss(p.color));
    this.turnText.setText(
      selectedPuckId
        ? `${p.label} — drag anywhere to flick`
        : `${p.label} — your turn`,
    );
  }

  private onRematchKey = (): void => {
    if (this.rematchText.visible) this.onRematch();
  };

  private showResult(result: MatchResult): void {
    let msg = "Draw";
    if (result === "player1") msg = "Player 1 wins!";
    if (result === "player2") msg = "Player 2 wins!";
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
    puck.sprite.setAlpha(active && mine ? 1 : active ? 0.45 : 0.7);

    const stroke = MATCH_CONFIG.players[puck.ownerId].strokeColor;
    if (selected && active) {
      puck.sprite.setStrokeStyle(5, 0xffe066);
    } else {
      puck.sprite.setStrokeStyle(3, stroke);
    }
  }
}
