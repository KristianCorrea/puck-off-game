import Phaser from "phaser";
import { PROTOTYPE_CONFIG } from "../config/prototypeConfig";
import type { PlayerId } from "../config/gameConfig";
import { MATCH_CONFIG } from "../config/gameConfig";

export type PuckEntity = {
  id: string;
  ownerId: PlayerId;
  spawnX: number;
  spawnY: number;
  sprite: Phaser.GameObjects.Arc;
  body: MatterJS.BodyType;
};

export function createPuckAt(
  scene: Phaser.Scene,
  opts: { id: string; ownerId: PlayerId; x: number; y: number },
): PuckEntity {
  const cfg = PROTOTYPE_CONFIG.puck;
  const colors = MATCH_CONFIG.players[opts.ownerId];

  const sprite = scene.add.circle(opts.x, opts.y, cfg.radius, colors.color);
  sprite.setStrokeStyle(4, colors.strokeColor, 0.95);
  // Above pitch markings (depth 1) and walls/goals (2–3).
  sprite.setDepth(12);
  sprite.setData("puckId", opts.id);

  // Soft highlight — cosmetic only; position synced each frame.
  const ring = scene.add.circle(opts.x, opts.y, cfg.radius - 7, 0xffffff, 0.12);
  ring.setStrokeStyle(2, 0xffffff, 0.2);
  ring.setDepth(12.1);
  sprite.setData("shine", ring);

  scene.matter.add.gameObject(sprite, {
    shape: { type: "circle", radius: cfg.radius },
    label: opts.id,
    friction: cfg.friction,
    frictionAir: cfg.frictionAir,
    restitution: cfg.restitution,
    frictionStatic: 0.2,
  });

  const body = sprite.body as MatterJS.BodyType;
  scene.matter.body.setMass(body, cfg.mass);
  sprite.setInteractive({ useHandCursor: true });

  // Keep shine glued to the Matter-driven sprite each frame via scene update hook
  // on the sprite's preupdate — Phaser arcs don't parent automatically.
  sprite.on("destroy", () => ring.destroy());
  const sync = (): void => {
    ring.setPosition(sprite.x, sprite.y);
    ring.setVisible(sprite.visible);
  };
  scene.events.on("postupdate", sync);
  sprite.on("destroy", () => scene.events.off("postupdate", sync));

  return {
    id: opts.id,
    ownerId: opts.ownerId,
    spawnX: opts.x,
    spawnY: opts.y,
    sprite,
    body,
  };
}

export function resetPuckToSpawn(
  scene: Phaser.Scene,
  puck: PuckEntity,
): void {
  const body = puck.body;
  body.isSleeping = false;
  scene.matter.body.setPosition(body, { x: puck.spawnX, y: puck.spawnY });
  scene.matter.body.setVelocity(body, { x: 0, y: 0 });
  scene.matter.body.setAngularVelocity(body, 0);
}

/** Apply a normalized shot. angle is radians; power is 0..1. */
export function applyImpulse(
  puck: PuckEntity,
  angle: number,
  power: number,
): void {
  const clamped = Math.min(
    1,
    Math.max(PROTOTYPE_CONFIG.shot.minPower, power),
  );
  const speed = clamped * PROTOTYPE_CONFIG.shot.maxSpeed;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;

  const body = puck.body;
  body.isSleeping = false;

  const matterBody = puck.sprite.scene.matter.body;
  matterBody.setAngularVelocity(body, 0);
  matterBody.setVelocity(body, { x: vx, y: vy });
}
