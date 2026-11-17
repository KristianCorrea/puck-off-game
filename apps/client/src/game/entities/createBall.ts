import Phaser from "phaser";
import { PROTOTYPE_CONFIG, getFieldBounds, u } from "../config/prototypeConfig";

export type BallEntity = {
  sprite: Phaser.GameObjects.Arc;
  body: MatterJS.BodyType;
};

export function createBall(scene: Phaser.Scene): BallEntity {
  const field = getFieldBounds();
  const cfg = PROTOTYPE_CONFIG.ball;

  const glow = scene.add.circle(
    field.centerX,
    field.centerY,
    cfg.radius + u(8),
    0xfbbf24,
    0.18,
  );
  glow.setDepth(10.5);

  const sprite = scene.add.circle(
    field.centerX,
    field.centerY,
    cfg.radius,
    cfg.color,
  );
  sprite.setStrokeStyle(u(3), cfg.strokeColor, 1);
  sprite.setDepth(11);

  // Visual proxy only — engine owns ball physics; Matter autoUpdate is off.
  scene.matter.add.gameObject(sprite, {
    shape: { type: "circle", radius: cfg.radius },
    label: "ball",
    friction: cfg.friction,
    frictionAir: cfg.frictionAir,
    restitution: cfg.restitution,
    frictionStatic: 0.1,
  });

  const body = sprite.body as MatterJS.BodyType;
  scene.matter.body.setMass(body, cfg.mass);

  const sync = (): void => {
    glow.setPosition(sprite.x, sprite.y);
  };
  scene.events.on("postupdate", sync);
  sprite.on("destroy", () => {
    scene.events.off("postupdate", sync);
    glow.destroy();
  });

  return { sprite, body };
}
