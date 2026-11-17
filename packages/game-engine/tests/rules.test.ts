import { describe, expect, it } from "vitest";
import { MATCH_CONFIG, getFieldBounds } from "@puck-off/shared";
import { createGoalZones, pointInGoalSide } from "../src/entities/goalZones";
import { hasWinner, scorerForGoalIn } from "../src";
import { MatterWorld } from "../src/physics/MatterWorld";
import { handleGoalReset } from "../src/handleGoal";
import Matter from "matter-js";

describe("scoring rules", () => {
  it("own goal awards the opponent", () => {
    expect(scorerForGoalIn("player1")).toBe("player2");
    expect(scorerForGoalIn("player2")).toBe("player1");
  });

  it("first to maxGoals wins", () => {
    expect(hasWinner({ player1: 2, player2: 1 })).toBeNull();
    expect(hasWinner({ player1: MATCH_CONFIG.maxGoals, player2: 1 })).toBe(
      "player1",
    );
    expect(hasWinner({ player1: 0, player2: MATCH_CONFIG.maxGoals })).toBe(
      "player2",
    );
  });

  it("detects ball center in goal zones", () => {
    const zones = createGoalZones();
    const z1 = zones.player1;
    expect(
      pointInGoalSide((z1.minX + z1.maxX) / 2, (z1.minY + z1.maxY) / 2, zones),
    ).toBe("player1");
    const field = getFieldBounds();
    expect(pointInGoalSide(field.centerX, field.centerY, zones)).toBeNull();
  });

  it("handleGoalReset returns ball midfield and pucks to spawn", () => {
    const world = new MatterWorld();
    Matter.Body.setPosition(world.ball, { x: 10, y: 10 });
    Matter.Body.setPosition(world.pucks[0]!.body, { x: 50, y: 50 });
    handleGoalReset(world);
    const field = getFieldBounds();
    expect(world.ball.position.x).toBeCloseTo(field.centerX, 0);
    expect(world.ball.position.y).toBeCloseTo(field.centerY, 0);
    const p = world.pucks[0]!;
    expect(p.body.position.x).toBeCloseTo(p.spawnX, 0);
    expect(p.body.position.y).toBeCloseTo(p.spawnY, 0);
    world.destroy();
  });
});
