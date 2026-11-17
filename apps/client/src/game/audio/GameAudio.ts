import type Phaser from "phaser";

/** Phaser sound keys loaded from /public/audio (Kenney CC0). */
export const SFX = {
  flick: "sfx_flick",
  select: "sfx_select",
  turn: "sfx_turn",
  timeout: "sfx_timeout",
  goal: "sfx_goal",
  goalPunch: "sfx_goal_punch",
  win: "sfx_win",
  hitSoft: "sfx_hit_soft",
  hitLight: "sfx_hit_light",
  hitMed: "sfx_hit_med",
  hitHard: "sfx_hit_hard",
  hitWall: "sfx_hit_wall",
} as const;

const MANIFEST: { key: string; path: string }[] = [
  { key: SFX.flick, path: "audio/flick.ogg" },
  { key: SFX.select, path: "audio/select.ogg" },
  { key: SFX.turn, path: "audio/turn.ogg" },
  { key: SFX.timeout, path: "audio/timeout.ogg" },
  { key: SFX.goal, path: "audio/goal.ogg" },
  { key: SFX.goalPunch, path: "audio/goal_punch.ogg" },
  { key: SFX.win, path: "audio/win.ogg" },
  { key: SFX.hitSoft, path: "audio/hit_soft.ogg" },
  { key: SFX.hitLight, path: "audio/hit_light.ogg" },
  { key: SFX.hitMed, path: "audio/hit_med.ogg" },
  { key: SFX.hitHard, path: "audio/hit_hard.ogg" },
  { key: SFX.hitWall, path: "audio/hit_wall.ogg" },
];

/**
 * Thin SFX helper. Missing/locked audio never throws — juice stays optional.
 */
export class GameAudio {
  private readonly scene: Phaser.Scene;
  private lastHitAt = 0;
  private unlocked = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Queue all SFX in the scene loader (call from preload). */
  static queue(scene: Phaser.Scene): void {
    for (const entry of MANIFEST) {
      if (!scene.cache.audio.exists(entry.key)) {
        scene.load.audio(entry.key, entry.path);
      }
    }
  }

  /** Call from a user gesture (tap-to-play / rematch). */
  unlock(): void {
    try {
      this.scene.sound.unlock();
      // Warm a silent tick so later plays are less likely to be blocked.
      if (!this.unlocked && this.scene.cache.audio.exists(SFX.select)) {
        this.scene.sound.play(SFX.select, { volume: 0.001 });
      }
      this.unlocked = true;
    } catch {
      // ignore
    }
  }

  playFlick(power: number): void {
    const p = clamp01(power);
    this.play(SFX.flick, {
      volume: 0.35 + p * 0.45,
      rate: 0.92 + p * 0.28,
    });
  }

  playSelect(): void {
    this.play(SFX.select, { volume: 0.35, rate: 1.05 });
  }

  playTurn(): void {
    this.play(SFX.turn, { volume: 0.4 });
  }

  playTimeout(): void {
    this.play(SFX.timeout, { volume: 0.45 });
  }

  playGoal(): void {
    this.play(SFX.goalPunch, { volume: 0.55, rate: 0.95 });
    this.scene.time.delayedCall(80, () => {
      this.play(SFX.goal, { volume: 0.7 });
    });
  }

  playWin(): void {
    this.play(SFX.win, { volume: 0.75 });
  }

  /**
   * Collision juice. `intensity` 0..1 from relative speed.
   * `againstWall` picks a woodier sample.
   */
  playHit(intensity: number, againstWall = false): void {
    const now = this.scene.time.now;
    if (now - this.lastHitAt < 40) return;
    this.lastHitAt = now;

    const i = clamp01(intensity);
    if (i < 0.08) return;

    let key: string = SFX.hitSoft;
    if (againstWall) {
      key = SFX.hitWall;
    } else if (i > 0.75) {
      key = SFX.hitHard;
    } else if (i > 0.45) {
      key = SFX.hitMed;
    } else if (i > 0.22) {
      key = SFX.hitLight;
    }

    this.play(key, {
      volume: 0.2 + i * 0.55,
      rate: 0.88 + Math.random() * 0.2 + i * 0.1,
    });
  }

  private play(
    key: string,
    config?: Phaser.Types.Sound.SoundConfig,
  ): void {
    try {
      if (!this.scene.cache.audio.exists(key)) return;
      this.scene.sound.play(key, config);
    } catch {
      // Autoplay / missing decode — keep playing silently.
    }
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
