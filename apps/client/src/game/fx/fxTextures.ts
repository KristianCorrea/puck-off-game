import type Phaser from "phaser";
import { u } from "../config/prototypeConfig";

export const FX_PARTICLE_KEY = "puck_off_fx_particle";

/** Tiny white circle used by all cosmetic particle emitters. */
export function ensureFxParticleTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(FX_PARTICLE_KEY)) return;
  const g = scene.make.graphics({ x: 0, y: 0 });
  const r = u(4);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(r, r, r);
  g.generateTexture(FX_PARTICLE_KEY, r * 2, r * 2);
  g.destroy();
}
