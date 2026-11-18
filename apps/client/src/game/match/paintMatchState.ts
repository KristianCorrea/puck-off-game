import type Phaser from "phaser";
import type { MatchState } from "@puck-off/shared";
import type { BallEntity } from "../entities/createBall";
import type { PuckEntity } from "../entities/createPuck";
import type { GameFx } from "../fx/GameFx";

/** Copy engine MatchState onto Phaser display proxies (Matter autoUpdate is off). */
export function paintMatchState(
  scene: Phaser.Scene,
  state: MatchState,
  ball: BallEntity,
  pucks: PuckEntity[],
  fx?: GameFx,
): void {
  const matter = scene.matter;

  matter.body.setPosition(ball.body, state.ball.position);
  matter.body.setVelocity(ball.body, state.ball.velocity);
  matter.body.setAngularVelocity(ball.body, state.ball.angularVelocity);
  ball.sprite.setPosition(state.ball.position.x, state.ball.position.y);

  const samples: {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
  }[] = [
    {
      id: "ball",
      x: state.ball.position.x,
      y: state.ball.position.y,
      vx: state.ball.velocity.x,
      vy: state.ball.velocity.y,
    },
  ];

  for (const puckState of state.pucks) {
    const puck = pucks.find((p) => p.id === puckState.id);
    if (!puck) continue;
    matter.body.setPosition(puck.body, puckState.position);
    matter.body.setVelocity(puck.body, puckState.velocity);
    matter.body.setAngularVelocity(puck.body, puckState.angularVelocity);
    puck.sprite.setPosition(puckState.position.x, puckState.position.y);
    puck.spawnX = puckState.spawn.x;
    puck.spawnY = puckState.spawn.y;
    samples.push({
      id: puckState.id,
      x: puckState.position.x,
      y: puckState.position.y,
      vx: puckState.velocity.x,
      vy: puckState.velocity.y,
    });
  }

  if (
    fx &&
    (state.phase === "PHYSICS_RESOLUTION" ||
      state.phase === "GOAL_RESOLUTION")
  ) {
    fx.observeMotion(samples);
  }
}
