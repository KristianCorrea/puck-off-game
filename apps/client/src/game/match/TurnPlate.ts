import type Phaser from "phaser";
import { MATCH_CONFIG, type PlayerId } from "../config/gameConfig";
import { u } from "../config/prototypeConfig";

const FONT = '"Nunito", system-ui, sans-serif';

const PLATE_W = () => u(128);
const PLATE_H = () => u(44);
const BAR_H = () => u(5);
const WARN_MS = 10_000;
const CRITICAL_MS = 5_000;

/**
 * Combined nameplate + turn clock: identity, seconds, drain bar, urgency shake.
 */
export class TurnPlate {
  readonly container: Phaser.GameObjects.Container;
  readonly playerId: PlayerId;

  private readonly scene: Phaser.Scene;
  private readonly baseX: number;
  private readonly color: number;
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly barTrack: Phaser.GameObjects.Rectangle;
  private readonly barFill: Phaser.GameObjects.Rectangle;
  private readonly dot: Phaser.GameObjects.Arc;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private readonly timeLabel: Phaser.GameObjects.Text;
  private readonly barMaxW: number;

  private active: boolean | null = null;
  private lastCeilSec: number | null = null;
  private shakeTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, playerId: PlayerId, x: number, y: number) {
    this.scene = scene;
    this.playerId = playerId;
    this.baseX = x;
    this.color = MATCH_CONFIG.players[playerId].color;

    const w = PLATE_W();
    const h = PLATE_H();
    const barH = BAR_H();
    const pad = u(6);
    this.barMaxW = w - pad * 2;

    this.bg = scene.add
      .rectangle(0, 0, w, h, 0x122033, 0.95)
      .setStrokeStyle(u(2), this.color, 0.85);

    this.barTrack = scene.add
      .rectangle(0, h / 2 - pad - barH / 2, this.barMaxW, barH, 0x0f172a, 0.95)
      .setOrigin(0.5);

    this.barFill = scene.add
      .rectangle(
        -this.barMaxW / 2,
        h / 2 - pad - barH / 2,
        this.barMaxW,
        barH,
        this.color,
        1,
      )
      .setOrigin(0, 0.5);

    this.dot = scene.add.circle(-w / 2 + u(16), -u(4), u(7), this.color);

    this.nameLabel = scene.add
      .text(-w / 2 + u(28), -u(4), MATCH_CONFIG.players[playerId].short, {
        fontFamily: FONT,
        fontSize: `${u(15)}px`,
        color: "#f8fafc",
        fontStyle: "800",
      })
      .setOrigin(0, 0.5);

    this.timeLabel = scene.add
      .text(w / 2 - u(10), -u(4), "", {
        fontFamily: FONT,
        fontSize: `${u(14)}px`,
        color: "#e2e8f0",
        fontStyle: "800",
      })
      .setOrigin(1, 0.5)
      .setVisible(false);

    this.container = scene.add
      .container(x, y, [
        this.bg,
        this.barTrack,
        this.barFill,
        this.dot,
        this.nameLabel,
        this.timeLabel,
      ])
      .setDepth(41);

    this.setActive(false);
    this.clearClock();
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.stopShake();
    const scale = active ? 1.06 : 0.92;
    this.container.setScale(scale);
    this.container.setAlpha(active ? 1 : 0.55);
    this.bg.setStrokeStyle(u(2), this.color, active ? 0.95 : 0.45);
    this.nameLabel.setColor(
      active
        ? this.playerId === "player1"
          ? "#f0fdfa"
          : "#fff1f2"
        : "#94a3b8",
    );
    if (!active) this.clearClock();
  }

  /**
   * Update drain bar + seconds. Fires onTick when displayed second drops ≤10.
   */
  setTime(
    remainingMs: number,
    durationMs: number,
    opts?: { onTick?: (secondsLeft: number) => void },
  ): void {
    if (!this.active) {
      this.clearClock();
      return;
    }

    const ratio = Math.max(0, Math.min(1, remainingMs / Math.max(1, durationMs)));
    const ceilSec = Math.max(0, Math.ceil(remainingMs / 1000));
    const warn = remainingMs > 0 && remainingMs <= WARN_MS;
    const critical = remainingMs > 0 && remainingMs <= CRITICAL_MS;

    this.timeLabel.setVisible(true);
    this.timeLabel.setText(`${ceilSec}s`);
    this.timeLabel.setColor(critical ? "#fecaca" : warn ? "#fde68a" : "#e2e8f0");

    this.barFill.displayWidth = this.barMaxW * ratio;
    if (critical) this.barFill.setFillStyle(0xf87171, 1);
    else if (warn) this.barFill.setFillStyle(0xfbbf24, 1);
    else this.barFill.setFillStyle(this.color, 1);

    this.barTrack.setVisible(true);
    this.barFill.setVisible(true);

    if (
      warn &&
      ceilSec > 0 &&
      this.lastCeilSec !== null &&
      ceilSec < this.lastCeilSec
    ) {
      this.pulseTick(ceilSec);
      opts?.onTick?.(ceilSec);
    }
    this.lastCeilSec = ceilSec;
  }

  clearClock(): void {
    this.lastCeilSec = null;
    this.timeLabel.setText("");
    this.timeLabel.setVisible(false);
    this.barFill.displayWidth = 0;
    this.barTrack.setVisible(false);
    this.barFill.setVisible(false);
    this.stopShake();
    this.container.x = this.baseX;
  }

  destroy(): void {
    this.stopShake();
    this.container.destroy(true);
  }

  private pulseTick(secondsLeft: number): void {
    const amp =
      secondsLeft <= 3 ? u(4) : secondsLeft <= 5 ? u(3) : u(2);
    const scalePop = secondsLeft <= 3 ? 1.12 : secondsLeft <= 5 ? 1.09 : 1.06;

    this.stopShake();
    this.container.x = this.baseX;
    this.shakeTween = this.scene.tweens.add({
      targets: this.container,
      x: this.baseX + amp,
      duration: 40,
      yoyo: true,
      repeat: secondsLeft <= 3 ? 3 : secondsLeft <= 5 ? 2 : 1,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.container.x = this.baseX;
        this.shakeTween = null;
      },
    });

    this.scene.tweens.add({
      targets: this.container,
      scaleX: scalePop,
      scaleY: scalePop,
      duration: 70,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  private stopShake(): void {
    if (this.shakeTween) {
      this.shakeTween.stop();
      this.shakeTween = null;
    }
    this.container.x = this.baseX;
  }
}
