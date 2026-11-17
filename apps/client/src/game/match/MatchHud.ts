import type Phaser from "phaser";
import { getFieldBounds } from "../config/prototypeConfig";
import type { MatchPhase, MatchResult, PlayerId } from "../config/gameConfig";
import { MATCH_CONFIG } from "../config/gameConfig";
import type { ScoreKeeper } from "./ScoreKeeper";
import type { MatchTimer } from "./MatchTimer";
import type { TurnManager } from "./TurnManager";

export class MatchHud {
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly turnText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const field = getFieldBounds();
    const style = {
      fontFamily: "system-ui, sans-serif",
      fontSize: "18px",
      color: "#e8eef7",
    };

    this.scoreText = scene.add
      .text(field.centerX, 14, "P1  0 - 0  P2", style)
      .setOrigin(0.5, 0)
      .setDepth(40)
      .setScrollFactor(0);

    this.timerText = scene.add
      .text(field.centerX, 40, "3:00", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#8ba3c7",
      })
      .setOrigin(0.5, 0)
      .setDepth(40)
      .setScrollFactor(0);

    this.turnText = scene.add
      .text(field.centerX, 64, "Player 1 — your turn", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "15px",
        color: "#2ec4b6",
      })
      .setOrigin(0.5, 0)
      .setDepth(40)
      .setScrollFactor(0);

    this.bannerText = scene.add
      .text(field.centerX, field.centerY, "", {
        fontFamily: "Georgia, serif",
        fontSize: "42px",
        color: "#ffe066",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setVisible(false);
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
    this.scoreText.setText(
      `P1  ${score.player1} - ${score.player2}  P2`,
    );
    this.timerText.setText(timer.format());

    if (phase === "MATCH_END") {
      this.turnText.setText("");
      this.showResult(result);
      return;
    }

    this.bannerText.setVisible(false);

    if (phase === "PHYSICS_RESOLUTION") {
      this.turnText.setColor("#8ba3c7");
      this.turnText.setText("Physics resolving…");
      return;
    }

    if (phase === "GOAL_RESOLUTION") {
      this.turnText.setColor("#ffe066");
      this.turnText.setText("Goal!");
      this.bannerText.setText("GOAL!");
      this.bannerText.setVisible(true);
      return;
    }

    const p = MATCH_CONFIG.players[turn.current];
    this.turnText.setColor(phaserColorToCss(p.color));
    this.turnText.setText(
      selectedPuckId
        ? `${p.label} — drag anywhere to flick`
        : `${p.label} — your turn (tap puck for remote aim)`,
    );
  }

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
