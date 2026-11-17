import Matter from "matter-js";
import {
  ARENA_CONFIG,
  BALL_CONFIG,
  GOAL_CONFIG,
  MATCH_CONFIG,
  PUCK_CONFIG,
  SHOT_CONFIG,
  getFieldBounds,
  type PlayerId,
} from "@puck-off/shared";
import { getDefenseLayout } from "../layouts/defenseLayout";
import { createGoalZones, type GoalZone } from "../entities/goalZones";
import { bodiesSettled, dampenBodies } from "./settle";

const { Engine, World, Bodies, Body } = Matter;

export type EnginePuck = {
  id: string;
  ownerId: PlayerId;
  spawnX: number;
  spawnY: number;
  body: Matter.Body;
};

/**
 * Headless Matter arena — no Phaser/DOM.
 * Geometry mirrors the client walls + recessed goal cages.
 */
export class MatterWorld {
  readonly engine: Matter.Engine;
  readonly ball: Matter.Body;
  readonly pucks: EnginePuck[] = [];
  readonly zones: Record<"player1" | "player2", GoalZone>;

  constructor() {
    this.engine = Engine.create({
      gravity: { x: 0, y: 0, scale: 0.001 },
      enableSleeping: false,
      positionIterations: 8,
      velocityIterations: 6,
    });

    this.zones = createGoalZones();
    this.addWallsAndCages();
    this.ball = this.createBall();
    this.createPucks();
  }

  destroy(): void {
    World.clear(this.engine.world, false);
    Engine.clear(this.engine);
  }

  resetBallMidfield(): void {
    const field = getFieldBounds();
    Body.setPosition(this.ball, { x: field.centerX, y: field.centerY });
    Body.setVelocity(this.ball, { x: 0, y: 0 });
    Body.setAngularVelocity(this.ball, 0);
  }

  resetAllPucksToSpawn(): void {
    for (const puck of this.pucks) {
      Body.setPosition(puck.body, { x: puck.spawnX, y: puck.spawnY });
      Body.setVelocity(puck.body, { x: 0, y: 0 });
      Body.setAngularVelocity(puck.body, 0);
    }
  }

  applyImpulse(puckId: string, angle: number, power: number): boolean {
    const puck = this.pucks.find((p) => p.id === puckId);
    if (!puck) return false;
    const clamped = Math.min(1, Math.max(SHOT_CONFIG.minPower, power));
    const speed = clamped * SHOT_CONFIG.maxSpeed;
    Body.setAngularVelocity(puck.body, 0);
    Body.setVelocity(puck.body, {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    });
    return true;
  }

  getPuck(puckId: string): EnginePuck | undefined {
    return this.pucks.find((p) => p.id === puckId);
  }

  allDynamicBodies(): Matter.Body[] {
    return [this.ball, ...this.pucks.map((p) => p.body)];
  }

  stepOnce(): void {
    dampenBodies(
      this.allDynamicBodies(),
      (b, v) => Body.setVelocity(b, v),
      (b, w) => Body.setAngularVelocity(b, w),
    );
    Engine.update(this.engine, MATCH_CONFIG.fixedStepMs);
  }

  isSettled(): boolean {
    return bodiesSettled(this.allDynamicBodies());
  }

  private createBall(): Matter.Body {
    const field = getFieldBounds();
    const cfg = BALL_CONFIG;
    const ball = Bodies.circle(field.centerX, field.centerY, cfg.radius, {
      label: "ball",
      friction: cfg.friction,
      frictionAir: cfg.frictionAir,
      restitution: cfg.restitution,
      frictionStatic: 0.1,
    });
    Body.setMass(ball, cfg.mass);
    World.add(this.engine.world, ball);
    return ball;
  }

  private createPucks(): void {
    const layout = getDefenseLayout();
    const cfg = PUCK_CONFIG;
    for (const ownerId of ["player1", "player2"] as PlayerId[]) {
      layout[ownerId].forEach((pos, index) => {
        const n = index + 1;
        const id = ownerId === "player1" ? `p1_${n}` : `p2_${n}`;
        const body = Bodies.circle(pos.x, pos.y, cfg.radius, {
          label: id,
          friction: cfg.friction,
          frictionAir: cfg.frictionAir,
          restitution: cfg.restitution,
          frictionStatic: 0.2,
        });
        Body.setMass(body, cfg.mass);
        World.add(this.engine.world, body);
        this.pucks.push({
          id,
          ownerId,
          spawnX: pos.x,
          spawnY: pos.y,
          body,
        });
      });
    }
  }

  private addWallsAndCages(): void {
    const { wallThickness } = ARENA_CONFIG;
    const { openingHeight, depth, postThickness } = GOAL_CONFIG;
    const field = getFieldBounds();
    const sideWallHeight = (field.height - openingHeight) / 2;
    const halfOpen = openingHeight / 2;
    const mouthTop = field.centerY - halfOpen;
    const mouthBottom = mouthTop + openingHeight;
    const topPostY = mouthTop - postThickness / 2;
    const bottomPostY = mouthBottom + postThickness / 2;

    const wall = (x: number, y: number, w: number, h: number, label: string) =>
      Bodies.rectangle(x, y, w, h, {
        isStatic: true,
        label,
        friction: 0.2,
        restitution: 0.7,
      });

    const walls: Matter.Body[] = [
      wall(field.centerX, field.top + wallThickness / 2, field.width, wallThickness, "wall"),
      wall(field.centerX, field.bottom - wallThickness / 2, field.width, wallThickness, "wall"),
      wall(field.left + wallThickness / 2, field.top + sideWallHeight / 2, wallThickness, sideWallHeight, "wall"),
      wall(field.left + wallThickness / 2, field.bottom - sideWallHeight / 2, wallThickness, sideWallHeight, "wall"),
      wall(field.right - wallThickness / 2, field.top + sideWallHeight / 2, wallThickness, sideWallHeight, "wall"),
      wall(field.right - wallThickness / 2, field.bottom - sideWallHeight / 2, wallThickness, sideWallHeight, "wall"),
      // Left cage
      wall(postThickness / 2, field.centerY, postThickness, openingHeight + postThickness * 2, "goal_cage"),
      wall(depth / 2, topPostY, depth, postThickness, "goal_cage"),
      wall(depth / 2, bottomPostY, depth, postThickness, "goal_cage"),
      wall(depth / 2, field.top + wallThickness / 2, depth, wallThickness, "goal_cage"),
      wall(depth / 2, field.bottom - wallThickness / 2, depth, wallThickness, "goal_cage"),
      // Right cage
      wall(field.right + depth - postThickness / 2, field.centerY, postThickness, openingHeight + postThickness * 2, "goal_cage"),
      wall(field.right + depth / 2, topPostY, depth, postThickness, "goal_cage"),
      wall(field.right + depth / 2, bottomPostY, depth, postThickness, "goal_cage"),
      wall(field.right + depth / 2, field.top + wallThickness / 2, depth, wallThickness, "goal_cage"),
      wall(field.right + depth / 2, field.bottom - wallThickness / 2, depth, wallThickness, "goal_cage"),
    ];

    World.add(this.engine.world, walls);
  }
}
