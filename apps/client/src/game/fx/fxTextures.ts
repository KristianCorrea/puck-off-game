import type Phaser from "phaser";

export const FX_PARTICLE_KEY = "puck_off_fx_particle";

/** Tiny white circle used by all cosmetic particle emitters. */
export function ensureFxParticleTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(FX_PARTICLE_KEY)) return;
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture(FX_PARTICLE_KEY, 8, 8);
  g.destroy();
}
