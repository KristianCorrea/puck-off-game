import Phaser from "phaser";
import { PROTOTYPE_CONFIG, u } from "../config/prototypeConfig";
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
  sprite.setStrokeStyle(u(4), colors.strokeColor, 0.95);
  // Above pitch markings (depth 1) and walls/goals (2–3).
  sprite.setDepth(12);
  sprite.setData("puckId", opts.id);

  // Soft highlight — cosmetic only; position synced each frame.
  const ring = scene.add.circle(opts.x, opts.y, cfg.radius - u(7), 0xffffff, 0.12);
  ring.setStrokeStyle(u(2), 0xffffff, 0.2);
  ring.setDepth(12.1);
  sprite.setData("shine", ring);

  // Visual proxy only — ArenaScene disables Matter autoUpdate; Match paints these.
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
  scene.matter.body.setPosition(puck.body, { x: puck.spawnX, y: puck.spawnY });
  scene.matter.body.setVelocity(puck.body, { x: 0, y: 0 });
  scene.matter.body.setAngularVelocity(puck.body, 0);
}
