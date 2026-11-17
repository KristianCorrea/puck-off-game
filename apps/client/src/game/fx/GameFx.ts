import Phaser from "phaser";
import type { GameAudio } from "../audio/GameAudio";
import {
  PROTOTYPE_CONFIG,
  getFieldBounds,
  u,
} from "../config/prototypeConfig";
import type { BallEntity } from "../entities/createBall";
import type { PuckEntity } from "../entities/createPuck";
import { ensureFxParticleTexture, FX_PARTICLE_KEY } from "./fxTextures";

type MotionSample = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type TrailTarget = {
  id: string;
  getPos: () => { x: number; y: number };
  getSpeed: () => number;
  color: number;
};

/**
 * Cosmetic-only juice: charge aura, launch burst, motion trails, collision sparks.
 * Never writes Matter velocities/positions.
 */
export class GameFx {
  private readonly scene: Phaser.Scene;
  private readonly audio: GameAudio | null;
  private readonly chargeGfx: Phaser.GameObjects.Graphics;
  private readonly trails = new Map<
    string,
    Phaser.GameObjects.Particles.ParticleEmitter
  >();
  private readonly trailTargets: TrailTarget[] = [];
  private charging = false;
  private chargeX = 0;
  private chargeY = 0;
  private chargePower = 0;
  /** Time until the next discrete electric jolt. */
  private chargeJoltCooldownMs = 0;
  private readonly chargeJolts: ChargeJolt[] = [];
  private readonly ephemeral: Phaser.GameObjects.GameObject[] = [];
  private readonly prevMotion = new Map<
    string,
    { vx: number; vy: number; x: number; y: number }
  >();

  constructor(
    scene: Phaser.Scene,
    opts: { pucks: PuckEntity[]; ball: BallEntity; audio?: GameAudio },
  ) {
    this.scene = scene;
    this.audio = opts.audio ?? null;
    ensureFxParticleTexture(scene);
    this.chargeGfx = scene.add.graphics().setDepth(14);

    for (const puck of opts.pucks) {
      this.trailTargets.push({
        id: puck.id,
        getPos: () => ({
          x: puck.sprite.x,
          y: puck.sprite.y,
        }),
        getSpeed: () =>
          Math.hypot(puck.body.velocity.x, puck.body.velocity.y),
        color: puck.sprite.fillColor,
      });
    }
    this.trailTargets.push({
      id: "ball",
      getPos: () => ({
        x: opts.ball.sprite.x,
        y: opts.ball.sprite.y,
      }),
      getSpeed: () =>
        Math.hypot(opts.ball.body.velocity.x, opts.ball.body.velocity.y),
      color: 0xfbbf24,
    });

    for (const t of this.trailTargets) {
      this.trails.set(t.id, this.createTrailEmitter(t.color));
    }
  }

  /** Call when a new shot starts so launch impulse isn't treated as an impact. */
  resetMotionTracking(): void {
    this.prevMotion.clear();
  }

  /**
   * Impact FX from engine-driven velocity changes (no local Matter collisions).
   * Uses |Δv| so elastic wall bounces still register (speed often barely drops).
   */
  observeMotion(samples: MotionSample[]): void {
    const minImpulse = u(1.2);
    const minPrevSpeed = u(0.8);

    for (const s of samples) {
      const prev = this.prevMotion.get(s.id);
      this.prevMotion.set(s.id, { vx: s.vx, vy: s.vy, x: s.x, y: s.y });
      if (!prev) continue;

      const prevSpeed = Math.hypot(prev.vx, prev.vy);
      const speed = Math.hypot(s.vx, s.vy);
      const dv = Math.hypot(s.vx - prev.vx, s.vy - prev.vy);
      if (dv < minImpulse) continue;

      // Heavy puck barely slows vs light ball — first contact often only
      // shows up as the resting body suddenly gaining speed.
      const struckFromRest =
        prevSpeed < minPrevSpeed && speed >= minImpulse;

      const dot = prev.vx * s.vx + prev.vy * s.vy;
      const aligned = prevSpeed * speed > 1e-6 ? dot / (prevSpeed * speed) : 1;
      const slowed = speed < prevSpeed * 0.92;
      const redirected = aligned < 0.85;
      const movingImpact =
        prevSpeed >= minPrevSpeed && (slowed || redirected);

      if (!struckFromRest && !movingImpact) continue;

      const intensity = Math.min(1, dv / u(12));
      if (intensity < 0.08) continue;

      this.audio?.playHit(intensity, this.nearArenaBoundary(s.x, s.y));
      this.spark(s.x, s.y, intensity);
    }
  }

  private nearArenaBoundary(x: number, y: number): boolean {
    const field = getFieldBounds();
    const margin = PROTOTYPE_CONFIG.ball.radius * 2.5;
    return (
      x <= field.left + margin ||
      x >= field.right - margin ||
      y <= field.top + margin ||
      y >= field.bottom - margin
    );
  }

  /**
   * Electric jolts around the aimed puck.
   * Pull power only changes how often shocks fire — not a constant aura.
   */
  showCharge(x: number, y: number, power: number, _color: number): void {
    this.charging = true;
    this.chargeX = x;
    this.chargeY = y;
    this.chargePower = Phaser.Math.Clamp(power, 0, 1);
  }

  hideCharge(): void {
    this.charging = false;
    this.chargePower = 0;
    this.chargeJoltCooldownMs = 0;
    this.chargeJolts.length = 0;
    this.chargeGfx.clear();
  }

  /** Burst when a puck is flicked. */
  playLaunch(
    x: number,
    y: number,
    angle: number,
    power: number,
    color: number,
  ): void {
    this.hideCharge();
    const p = Phaser.Math.Clamp(power, 0, 1);

    for (let i = 0; i < 2; i++) {
      const ring = this.scene.add.graphics().setDepth(15);
      this.ephemeral.push(ring);
      this.scene.tweens.add({
        targets: ring,
        alpha: 0,
        duration: 280 + i * 80,
        ease: "Cubic.easeOut",
        onUpdate: (tween) => {
          const t = tween.progress;
          ring.clear();
          ring.lineStyle(u(3) - i, color, (0.85 - i * 0.25) * (1 - t));
          ring.strokeCircle(
            x,
            y,
            PROTOTYPE_CONFIG.puck.radius +
              u(4) +
              t * (u(28) + p * u(50) + i * u(18)),
          );
        },
        onComplete: () => {
          ring.destroy();
          this.dropEphemeral(ring);
        },
      });
    }

    const deg = Phaser.Math.RadToDeg(angle);
    const jetCount = Math.floor(10 + p * 22);
    const jet = this.scene.add.particles(x, y, FX_PARTICLE_KEY, {
      speed: { min: u(80) + p * u(120), max: u(160) + p * u(280) },
      angle: { min: deg - 28, max: deg + 28 },
      lifespan: { min: 220, max: 480 },
      scale: { start: 0.7 + p * 0.5, end: 0 },
      quantity: jetCount,
      frequency: -1,
      blendMode: "ADD",
      tint: [color, 0xffe066, 0xffffff],
      alpha: { start: 0.95, end: 0 },
    });
    jet.setDepth(16);
    jet.explode(jetCount);
    this.ephemeral.push(jet);
    this.scene.time.delayedCall(600, () => {
      jet.destroy();
      this.dropEphemeral(jet);
    });

    const dustCount = Math.floor(8 + p * 14);
    const flash = this.scene.add.particles(x, y, FX_PARTICLE_KEY, {
      speed: { min: u(40), max: u(140) + p * u(160) },
      angle: { min: 0, max: 360 },
      lifespan: { min: 180, max: 360 },
      scale: { start: 0.55, end: 0 },
      quantity: dustCount,
      frequency: -1,
      blendMode: "ADD",
      tint: [0xffffff, color],
      alpha: { start: 0.8, end: 0 },
    });
    flash.setDepth(16);
    flash.explode(dustCount);
    this.ephemeral.push(flash);
    this.scene.time.delayedCall(500, () => {
      flash.destroy();
      this.dropEphemeral(flash);
    });
  }

  update(deltaMs: number): void {
    this.updateCharge(deltaMs);
    this.updateTrails();
  }

  destroy(): void {
    this.prevMotion.clear();
    this.hideCharge();
    this.chargeGfx.destroy();
    for (const emitter of this.trails.values()) emitter.destroy();
    this.trails.clear();
    for (const obj of this.ephemeral) obj.destroy();
    this.ephemeral.length = 0;
  }

  private updateCharge(deltaMs: number): void {
    if (!this.charging || this.chargePower <= 0.02) {
      this.chargeJolts.length = 0;
      this.chargeGfx.clear();
      return;
    }

    const p = this.chargePower;
    // Low pull: rare shocks. Full pull: frequent spikes.
    const intervalMs = Phaser.Math.Linear(320, 40, p);

    this.chargeJoltCooldownMs -= deltaMs;
    if (this.chargeJoltCooldownMs <= 0) {
      this.spawnChargeJolt(p);
      // At high power, occasionally double-tap a second spike.
      if (p > 0.65 && Math.random() < p * 0.45) {
        this.spawnChargeJolt(p);
      }
      this.chargeJoltCooldownMs =
        intervalMs * (0.65 + Math.random() * 0.7);
    }

    for (const jolt of this.chargeJolts) {
      jolt.lifeMs -= deltaMs;
    }
    for (let i = this.chargeJolts.length - 1; i >= 0; i--) {
      if (this.chargeJolts[i]!.lifeMs <= 0) this.chargeJolts.splice(i, 1);
    }

    this.drawChargeJolts();
  }

  private spawnChargeJolt(power: number): void {
    const seed = Math.floor(Math.random() * 10_000);
    const rim = PROTOTYPE_CONFIG.puck.radius;
    this.chargeJolts.push({
      angle: Math.random() * Math.PI * 2,
      seed,
      lifeMs: 55 + power * 45,
      maxLifeMs: 55 + power * 45,
      reach: rim + u(8) + power * u(10) + Math.random() * (u(4) + power * u(6)),
    });
  }

  private drawChargeJolts(): void {
    const g = this.chargeGfx;
    g.clear();
    if (this.chargeJolts.length === 0) return;

    const rim = PROTOTYPE_CONFIG.puck.radius;
    const cx = this.chargeX;
    const cy = this.chargeY;

    for (const jolt of this.chargeJolts) {
      const fade = Phaser.Math.Clamp(jolt.lifeMs / jolt.maxLifeMs, 0, 1);
      const alpha = 0.35 + fade * 0.55;
      // Soft cyan glow stroke, then bright white core — one clean spike.
      this.strokeJolt(
        g,
        cx,
        cy,
        jolt.angle,
        rim,
        jolt.reach,
        jolt.seed,
        0x67e8f9,
        alpha * 0.4,
        u(2.2),
      );
      this.strokeJolt(
        g,
        cx,
        cy,
        jolt.angle,
        rim,
        jolt.reach * 0.92,
        jolt.seed + 3,
        0xffffff,
        alpha,
        u(1.15),
      );

      // Optional tiny fork near the tip at higher power.
      if (this.chargePower > 0.5 && hash01(jolt.seed + 9) > 0.45) {
        const tipT = 0.55;
        const midR = rim + (jolt.reach - rim) * tipT;
        const forkAng =
          jolt.angle + (hash01(jolt.seed + 11) - 0.5) * 0.9;
        this.strokeJolt(
          g,
          cx + Math.cos(jolt.angle) * midR,
          cy + Math.sin(jolt.angle) * midR,
          forkAng,
          0,
          u(6) + this.chargePower * u(8),
          jolt.seed + 15,
          0xffffff,
          alpha * 0.7,
          u(1),
        );
      }
    }
  }

  /** One short jagged spike (few segments — readable, not scribbly). */
  private strokeJolt(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    angle: number,
    startR: number,
    endR: number,
    seed: number,
    color: number,
    alpha: number,
    width: number,
  ): void {
    const segments = 3;
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(cx + Math.cos(angle) * startR, cy + Math.sin(angle) * startR);

    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const r = startR + (endR - startR) * t;
      const jag = (hash01(seed + s * 11) - 0.5) * u(5) * (1 - t * 0.4);
      const a = angle + jag * 0.05;
      g.lineTo(
        cx + Math.cos(a) * r + Math.cos(a + Math.PI / 2) * jag,
        cy + Math.sin(a) * r + Math.sin(a + Math.PI / 2) * jag,
      );
    }
    g.strokePath();
  }

  private updateTrails(): void {
    const minSpeed = u(1.2);
    for (const t of this.trailTargets) {
      const emitter = this.trails.get(t.id);
      if (!emitter) continue;
      const speed = t.getSpeed();
      const pos = t.getPos();
      emitter.setPosition(pos.x, pos.y);
      if (speed >= minSpeed) {
        const intensity = Math.min(1, (speed - minSpeed) / u(10));
        emitter.setFrequency(32 - intensity * 18);
        emitter.start();
      } else {
        emitter.stop();
      }
    }
  }

  private createTrailEmitter(
    color: number,
  ): Phaser.GameObjects.Particles.ParticleEmitter {
    const emitter = this.scene.add.particles(0, 0, FX_PARTICLE_KEY, {
      speed: { min: u(4), max: u(28) },
      lifespan: { min: 180, max: 420 },
      scale: { start: 0.55, end: 0 },
      frequency: 28,
      quantity: 1,
      blendMode: "ADD",
      tint: [color, 0xffffff],
      alpha: { start: 0.55, end: 0 },
      emitting: false,
    });
    emitter.setDepth(9);
    return emitter;
  }

  private spark(x: number, y: number, intensity: number): void {
    const count = Math.floor(4 + intensity * 14);
    const emitter = this.scene.add.particles(x, y, FX_PARTICLE_KEY, {
      speed: {
        min: u(60) + intensity * u(80),
        max: u(140) + intensity * u(220),
      },
      angle: { min: 0, max: 360 },
      lifespan: { min: 120, max: 320 },
      scale: { start: 0.45 + intensity * 0.35, end: 0 },
      quantity: count,
      frequency: -1,
      blendMode: "ADD",
      tint: [0xffffff, 0xffe066, 0x7dd3fc, 0xfb7185],
      alpha: { start: 0.95, end: 0 },
    });
    emitter.setDepth(17);
    emitter.explode(count);
    this.ephemeral.push(emitter);
    this.scene.time.delayedCall(400, () => {
      emitter.destroy();
      this.dropEphemeral(emitter);
    });

    const flash = this.scene.add.circle(
      x,
      y,
      u(4) + intensity * u(10),
      0xffffff,
      0.55,
    );
    flash.setDepth(17);
    this.ephemeral.push(flash);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2.2,
      duration: 160,
      ease: "Cubic.easeOut",
      onComplete: () => {
        flash.destroy();
        this.dropEphemeral(flash);
      },
    });
  }

  private dropEphemeral(obj: Phaser.GameObjects.GameObject): void {
    const i = this.ephemeral.indexOf(obj);
    if (i >= 0) this.ephemeral.splice(i, 1);
  }
}

type ChargeJolt = {
  angle: number;
  seed: number;
  lifeMs: number;
  maxLifeMs: number;
  reach: number;
};

/** Tiny deterministic 0..1 hash for crackle shapes. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
