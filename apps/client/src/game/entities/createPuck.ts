import Phaser from "phaser";
import { PROTOTYPE_CONFIG } from "../config/prototypeConfig";
import type { PlayerId } from "../config/gameConfig";
import { MATCH_CONFIG } from "../config/gameConfig";

export type PuckEntity = {
  id: string;
  ownerId: PlayerId;
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
  sprite.setStrokeStyle(3, colors.strokeColor);
  sprite.setDepth(10);
  sprite.setData("puckId", opts.id);

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

  return {
    id: opts.id,
    ownerId: opts.ownerId,
    sprite,
    body,
  };
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
