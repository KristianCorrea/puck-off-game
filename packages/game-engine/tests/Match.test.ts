import { describe, expect, it } from "vitest";
import { MATCH_CONFIG } from "@puck-off/shared";
import { Match } from "../src/Match";

function launchAndSettle(
  match: Match,
  action: {
    playerId: "player1" | "player2";
    puckId: string;
    angle: number;
    power: number;
  },
) {
  const started = match.applyAction(action);
  expect(started.ok).toBe(true);
  return match.settle();
}

describe("Match engine", () => {
  it("starts in PLAYER_TURN for player1 with 5+5 pucks", () => {
    const match = new Match();
    const state = match.start();
    expect(state.phase).toBe("PLAYER_TURN");
    expect(state.currentTurn).toBe("player1");
    expect(state.pucks).toHaveLength(MATCH_CONFIG.pucksPerPlayer * 2);
    expect(state.score).toEqual({ player1: 0, player2: 0 });
    match.destroy();
  });

  it("rejects opponent puck control", () => {
    const match = new Match();
    match.start();
    const result = match.applyAction({
      playerId: "player1",
      puckId: "p2_1",
      angle: 0,
      power: 0.5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NOT_OWNER");
    match.destroy();
  });

  it("rejects wrong turn", () => {
    const match = new Match();
    match.start();
    const result = match.applyAction({
      playerId: "player2",
      puckId: "p2_1",
      angle: 0,
      power: 0.5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("WRONG_TURN");
    match.destroy();
  });

  it("rejects invalid power", () => {
    const match = new Match();
    match.start();
    const result = match.applyAction({
      playerId: "player1",
      puckId: "p1_1",
      angle: 0,
      power: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INVALID_POWER");
    match.destroy();
  });

  it("advances turn after a settled flick", () => {
    const match = new Match();
    match.start();
    // Flick gently away from goals so we settle without scoring.
    const result = launchAndSettle(match, {
      playerId: "player1",
      puckId: "p1_2",
      angle: Math.PI / 2,
      power: 0.15,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.phase).toBe("PLAYER_TURN");
      expect(result.state.currentTurn).toBe("player2");
      expect(result.events.some((e) => e.type === "turn_advanced")).toBe(true);
      expect(result.keyframes.length).toBeGreaterThan(1);
      expect(result.keyframes[0]!.atMs).toBe(0);
    }
    match.destroy();
  });

  it("allows the same puck on a later turn (reusable)", () => {
    const match = new Match();
    match.start();
    launchAndSettle(match, {
      playerId: "player1",
      puckId: "p1_1",
      angle: Math.PI / 2,
      power: 0.12,
    });
    launchAndSettle(match, {
      playerId: "player2",
      puckId: "p2_1",
      angle: -Math.PI / 2,
      power: 0.12,
    });
    const again = launchAndSettle(match, {
      playerId: "player1",
      puckId: "p1_1",
      angle: Math.PI / 2,
      power: 0.12,
    });
    expect(again.ok).toBe(true);
    match.destroy();
  });

  it("skips turn on timer expiry", () => {
    const match = new Match();
    match.start();
    const { skipped, state } = match.tick(MATCH_CONFIG.turnDurationMs + 1);
    expect(skipped).toBe(true);
    expect(state.currentTurn).toBe("player2");
    expect(state.phase).toBe("PLAYER_TURN");
    match.destroy();
  });

  it("rematch resets score and turn", () => {
    const match = new Match();
    match.start();
    match.skipTurn();
    const state = match.rematch();
    expect(state.score).toEqual({ player1: 0, player2: 0 });
    expect(state.currentTurn).toBe("player1");
    expect(state.phase).toBe("PLAYER_TURN");
    match.destroy();
  });

  it("adoptState restores snapshot fields and body poses", () => {
    const match = new Match();
    match.start();
    launchAndSettle(match, {
      playerId: "player1",
      puckId: "p1_2",
      angle: Math.PI / 2,
      power: 0.2,
    });
    const snapshot = match.getState();
    match.rematch();
    match.adoptState(snapshot);
    const restored = match.getState();
    expect(restored.currentTurn).toBe(snapshot.currentTurn);
    expect(restored.score).toEqual(snapshot.score);
    expect(restored.ball.position.x).toBeCloseTo(snapshot.ball.position.x, 5);
    match.destroy();
  });

  it("step advances bodies after applyAction without settling instantly", () => {
    const match = new Match();
    match.start();
    const before = match.getState().pucks.find((p) => p.id === "p1_2")!;
    const started = match.applyAction({
      playerId: "player1",
      puckId: "p1_2",
      angle: Math.PI / 2,
      power: 0.4,
    });
    expect(started.ok).toBe(true);
    expect(match.getState().phase).toBe("PHYSICS_RESOLUTION");

    const stepped = match.step(MATCH_CONFIG.fixedStepMs * 3);
    expect(stepped.shotComplete).toBe(false);
    const after = stepped.state.pucks.find((p) => p.id === "p1_2")!;
    expect(after.position.y).not.toBeCloseTo(before.position.y, 1);
    match.destroy();
  });
});
