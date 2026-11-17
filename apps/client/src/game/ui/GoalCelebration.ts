import Phaser from "phaser";
import { getFieldBounds, u } from "../config/prototypeConfig";
import { MATCH_CONFIG } from "../config/gameConfig";

const PARTICLE_KEY = "goal_party_particle";
const CONFETTI_COLORS = [
  0xffe066,
  0xff6b6b,
  0x2ec4b6,
  0xe76f51,
  0x4cc9f0,
  0xf72585,
  0xb5179e,
  0x80ffdb,
];

/**
 * Over-the-top goal party: shake, flash, confetti, exploding GOAL!!! text.
 */
export class GoalCelebration {
  private readonly scene: Phaser.Scene;
  private readonly goalText: Phaser.GameObjects.Text;
  private readonly glowText: Phaser.GameObjects.Text;
  private readonly flash: Phaser.GameObjects.Rectangle;
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private playing = false;
  private burstTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureParticleTexture(scene);

    const field = getFieldBounds();
    const { width, height } = scene.scale;

    this.flash = scene.add
      .rectangle(width / 2, height / 2, width * 2, height * 2, 0xfff5c2, 0)
      .setDepth(48)
      .setScrollFactor(0);

    this.glowText = scene.add
      .text(field.centerX, field.centerY - u(24), "GOAL!!!", {
        fontFamily: "Impact, Haettenschweiler, Arial Black, sans-serif",
        fontSize: `${u(96)}px`,
        color: "#ff9f1c",
        stroke: "#ff6b00",
        strokeThickness: u(14),
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(49)
      .setScrollFactor(0)
      .setAlpha(0)
      .setVisible(false);

    this.goalText = scene.add
      .text(field.centerX, field.centerY - u(24), "GOAL!!!", {
        fontFamily: "Impact, Haettenschweiler, Arial Black, sans-serif",
        fontSize: `${u(88)}px`,
        color: "#ffe066",
        stroke: "#7a3e00",
        strokeThickness: u(12),
        align: "center",
        shadow: {
          offsetX: 0,
          offsetY: u(6),
          color: "#000000",
          blur: u(16),
          fill: true,
          stroke: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setScrollFactor(0)
      .setAlpha(0)
      .setVisible(false);
  }

  play(): void {
    this.stop();
    this.playing = true;

    const cam = this.scene.cameras.main;
    cam.shake(450, 0.018);
    this.scene.time.delayedCall(280, () => {
      if (this.playing) cam.shake(700, 0.01);
    });
    this.scene.time.delayedCall(900, () => {
      if (this.playing) cam.shake(500, 0.006);
    });

    this.flash.setAlpha(0.85);
    this.scene.tweens.add({
      targets: this.flash,
      alpha: 0,
      duration: 420,
      ease: "Cubic.easeOut",
    });

    this.animateGoalText();
    this.spawnConfettiStorm();
  }

  stop(): void {
    this.playing = false;
    this.burstTimer?.remove(false);
    this.burstTimer = undefined;
    this.scene.tweens.killTweensOf(this.goalText);
    this.scene.tweens.killTweensOf(this.glowText);
    this.scene.tweens.killTweensOf(this.flash);
    this.flash.setAlpha(0);

    for (const emitter of this.emitters) {
      emitter.stop();
      emitter.destroy();
    }
    this.emitters = [];

    this.goalText.setVisible(false).setAlpha(0).setScale(1).setAngle(0);
    this.glowText.setVisible(false).setAlpha(0).setScale(1).setAngle(0);
  }

  destroy(): void {
    this.stop();
    this.goalText.destroy();
    this.glowText.destroy();
    this.flash.destroy();
  }

  private animateGoalText(): void {
    const field = getFieldBounds();
    const texts = [this.glowText, this.goalText];

    for (const t of texts) {
      t.setPosition(field.centerX, field.centerY - u(24));
      t.setVisible(true);
      t.setAlpha(0);
      t.setScale(0.15);
      t.setAngle(Phaser.Math.Between(-18, 18));
    }

    // Glow punches in bigger/behind.
    this.scene.tweens.add({
      targets: this.glowText,
      alpha: { from: 0, to: 0.55 },
      scale: { from: 0.2, to: 1.55 },
      angle: 0,
      duration: 380,
      ease: "Back.easeOut",
    });

    // Main GOAL!!! slam.
    this.scene.tweens.add({
      targets: this.goalText,
      alpha: { from: 0, to: 1 },
      scale: { from: 0.15, to: 1.35 },
      angle: 0,
      duration: 420,
      ease: "Back.easeOut",
      onComplete: () => {
        if (!this.playing) return;
        this.pulseGoalText();
      },
    });

    // Color party on the main text.
    this.scene.tweens.addCounter({
      from: 0,
      to: CONFETTI_COLORS.length * 4,
      duration: MATCH_CONFIG.goalCelebrationMs - 900,
      onUpdate: (tween) => {
        if (!this.playing) return;
        const i = Math.floor(tween.getValue() ?? 0) % CONFETTI_COLORS.length;
        this.goalText.setColor(phaserColorToCss(CONFETTI_COLORS[i]!));
      },
    });
  }

  private pulseGoalText(): void {
    this.scene.tweens.add({
      targets: [this.goalText, this.glowText],
      scale: "*=1.12",
      duration: 160,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
    });

    this.scene.tweens.add({
      targets: this.goalText,
      angle: { from: -6, to: 6 },
      duration: 90,
      yoyo: true,
      repeat: 10,
      ease: "Sine.easeInOut",
    });

    // Explode near the end of the celebration window.
    const explodeAt = Math.max(800, MATCH_CONFIG.goalCelebrationMs - 1100);
    this.scene.time.delayedCall(explodeAt, () => {
      if (!this.playing) return;
      this.explodeGoalText();
    });
  }

  private explodeGoalText(): void {
    const { x, y } = this.goalText;
    this.burstConfetti(x, y, 140);

    this.scene.cameras.main.shake(350, 0.014);

    this.scene.tweens.add({
      targets: [this.goalText, this.glowText],
      scale: 3.2,
      alpha: 0,
      angle: Phaser.Math.Between(-25, 25),
      duration: 480,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.goalText.setVisible(false);
        this.glowText.setVisible(false);
      },
    });

    // Scatter letter-like shards.
    const shards = "GOAL!!!".split("");
    for (let i = 0; i < shards.length; i++) {
      const shard = this.scene.add
        .text(x + (i - 3) * u(18), y, shards[i]!, {
          fontFamily: "Impact, Haettenschweiler, Arial Black, sans-serif",
          fontSize: `${u(42)}px`,
          color: phaserColorToCss(
            CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
          ),
        })
        .setOrigin(0.5)
        .setDepth(52)
        .setScrollFactor(0);

      const angle = Phaser.Math.DegToRad(-160 + i * 40 + Phaser.Math.Between(-10, 10));
      const dist = Phaser.Math.Between(u(160), u(280));
      this.scene.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        angle: Phaser.Math.Between(-400, 400),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(500, 750),
        ease: "Cubic.easeOut",
        onComplete: () => shard.destroy(),
      });
    }
  }

  private spawnConfettiStorm(): void {
    const field = getFieldBounds();
    this.burstConfetti(field.centerX, field.centerY - u(40), 90);
    this.burstConfetti(field.centerX - u(180), field.centerY - u(80), 50);
    this.burstConfetti(field.centerX + u(180), field.centerY - u(80), 50);

    // Keep the party going with top-rain bursts.
    this.burstTimer = this.scene.time.addEvent({
      delay: 280,
      repeat: Math.floor(MATCH_CONFIG.goalCelebrationMs / 280) - 1,
      callback: () => {
        if (!this.playing) return;
        const x =
          field.left +
          u(40) +
          Math.random() * (field.width - u(80));
        this.burstConfetti(x, u(40), 28);
      },
    });
  }

  private burstConfetti(x: number, y: number, count: number): void {
    const emitter = this.scene.add.particles(x, y, PARTICLE_KEY, {
      speed: { min: u(180), max: u(520) },
      angle: { min: 0, max: 360 },
      lifespan: { min: 900, max: 1800 },
      scale: { start: 1.1, end: 0.15 },
      gravityY: u(520),
      quantity: count,
      frequency: -1,
      blendMode: "ADD",
      tint: CONFETTI_COLORS,
      rotate: { min: 0, max: 360 },
      alpha: { start: 1, end: 0 },
    });
    emitter.setDepth(47);
    emitter.explode(count);
    this.emitters.push(emitter);

    this.scene.time.delayedCall(2000, () => {
      if (this.emitters.includes(emitter)) {
        emitter.destroy();
        this.emitters = this.emitters.filter((e) => e !== emitter);
      }
    });
  }
}

function ensureParticleTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PARTICLE_KEY)) return;
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(u(6), u(6), u(6));
  g.fillStyle(0xffffff, 1);
  g.fillRect(u(2), u(2), u(8), u(4));
  g.generateTexture(PARTICLE_KEY, u(12), u(12));
  g.destroy();
}

function phaserColorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
