import Matter from "matter-js";
import {
  ARENA_CONFIG,
  MATCH_CONFIG,
  PUCK_CONFIG,
  u,
  getFieldBounds,
  type LaunchAction,
  type MatchPhase,
  type MatchResult,
  type MatchState,
  type PhysicsKeyframe,
  type PlayerId,
} from "@puck-off/shared";
import { pointInGoalSide } from "./entities/goalZones";
import { handleGoalReset, scorerForGoalIn } from "./handleGoal";
import { clampPower, hasWinner, validateLaunch } from "./GameRules";
import { MatterWorld } from "./physics/MatterWorld";

const { Body } = Matter;

export type MatchEvent =
  | { type: "goal"; goalSide: PlayerId; scorer: PlayerId }
  | { type: "turn_advanced"; currentTurn: PlayerId }
  | { type: "match_end"; result: MatchResult }
  | { type: "turn_skipped" };

export type ApplyActionResult =
  | { ok: true; state: MatchState; events: MatchEvent[] }
  | { ok: false; reason: string; state: MatchState };

export type SettleResult =
  | {
      ok: true;
      state: MatchState;
      events: MatchEvent[];
      keyframes: PhysicsKeyframe[];
    }
  | { ok: false; reason: string; state: MatchState; keyframes: [] };

export type StepResult = {
  state: MatchState;
  events: MatchEvent[];
  /** True when the shot stopped (settled or goal). */
  shotComplete: boolean;
};

/**
 * Authoritative headless match.
 * No Phaser/React — safe for Node (Phase 4 server).
 *
 * Local / online clients should call applyAction, then step(delta) each frame
 * and render getState() — one sim, one view.
 */
export class Match {
  private world: MatterWorld | null = null;
  private phase: MatchPhase = "PLAYER_TURN";
  private result: MatchResult = null;
  private currentTurn: PlayerId = "player1";
  private turnRemainingMs: number = MATCH_CONFIG.turnDurationMs;
  private score = { player1: 0, player2: 0 };
  private started = false;

  private physicsElapsedMs = 0;
  private stableFrames = 0;
  private stepAccumulatorMs = 0;

  start(): MatchState {
    this.world?.destroy();
    this.world = new MatterWorld();
    this.phase = "PLAYER_TURN";
    this.result = null;
    this.currentTurn = "player1";
    this.turnRemainingMs = MATCH_CONFIG.turnDurationMs;
    this.score = { player1: 0, player2: 0 };
    this.started = true;
    this.resetPhysicsCounters();
    return this.getState();
  }

  rematch(): MatchState {
    return this.start();
  }

  destroy(): void {
    this.world?.destroy();
    this.world = null;
    this.started = false;
  }

  getState(): MatchState {
    const world = this.requireWorld();
    return {
      phase: this.phase,
      result: this.result,
      currentTurn: this.currentTurn,
      turnRemainingMs: this.turnRemainingMs,
      score: { ...this.score },
      ball: {
        id: "ball",
        position: { ...world.ball.position },
        velocity: { ...world.ball.velocity },
        angularVelocity: world.ball.angularVelocity,
      },
      pucks: world.pucks.map((p) => ({
        id: p.id,
        ownerId: p.ownerId,
        spawn: { x: p.spawnX, y: p.spawnY },
        position: { ...p.body.position },
        velocity: { ...p.body.velocity },
        angularVelocity: p.body.angularVelocity,
      })),
    };
  }

  /**
   * Reconcile to an authoritative snapshot (online TURN_RESOLVED / MATCH_START).
   * Overwrites rules fields and body transforms; resets physics counters.
   */
  adoptState(state: MatchState): MatchState {
    const world = this.requireWorld();
    this.phase = state.phase;
    this.result = state.result;
    this.currentTurn = state.currentTurn;
    this.turnRemainingMs = state.turnRemainingMs;
    this.score = { ...state.score };
    this.resetPhysicsCounters();

    Body.setPosition(world.ball, { ...state.ball.position });
    Body.setVelocity(world.ball, { ...state.ball.velocity });
    Body.setAngularVelocity(world.ball, state.ball.angularVelocity);

    for (const puckState of state.pucks) {
      const puck = world.getPuck(puckState.id);
      if (!puck) continue;
      puck.spawnX = puckState.spawn.x;
      puck.spawnY = puckState.spawn.y;
      Body.setPosition(puck.body, { ...puckState.position });
      Body.setVelocity(puck.body, { ...puckState.velocity });
      Body.setAngularVelocity(puck.body, puckState.angularVelocity);
    }

    return this.getState();
  }

  /**
   * Advance turn clock while in PLAYER_TURN.
   * @returns true if the turn was skipped due to expiry
   */
  tick(deltaMs: number): { skipped: boolean; state: MatchState } {
    if (!this.started || this.phase !== "PLAYER_TURN") {
      return { skipped: false, state: this.getState() };
    }
    this.turnRemainingMs = Math.max(0, this.turnRemainingMs - deltaMs);
    if (this.turnRemainingMs > 0) {
      return { skipped: false, state: this.getState() };
    }
    this.skipTurn();
    return { skipped: true, state: this.getState() };
  }

  skipTurn(): MatchState {
    const world = this.requireWorld();
    if (this.phase === "MATCH_END") return this.getState();
    this.ejectPucksFromGoals(world);
    this.advanceTurn();
    return this.getState();
  }

  /** Force MATCH_END for disconnect/leave abandon (Phase 6). */
  abandon(winner: PlayerId): MatchState {
    const world = this.requireWorld();
    this.phase = "MATCH_END";
    this.result = winner;
    this.turnRemainingMs = 0;
    Body.setVelocity(world.ball, { x: 0, y: 0 });
    Body.setAngularVelocity(world.ball, 0);
    for (const puck of world.pucks) {
      Body.setVelocity(puck.body, { x: 0, y: 0 });
      Body.setAngularVelocity(puck.body, 0);
    }
    return this.getState();
  }

  /**
   * Validate + apply impulse. Does not settle — call step() each frame
   * (or settle() for tests / headless batch).
   */
  applyAction(action: LaunchAction): ApplyActionResult {
    const world = this.requireWorld();
    const err = validateLaunch(this.phase, this.currentTurn, world, action);
    if (err) {
      return { ok: false, reason: err, state: this.getState() };
    }

    const power = clampPower(action.power);
    world.applyImpulse(action.puckId, action.angle, power);
    this.phase = "PHYSICS_RESOLUTION";
    this.turnRemainingMs = 0;
    this.resetPhysicsCounters();

    return { ok: true, state: this.getState(), events: [] };
  }

  /**
   * Fixed-timestep physics while resolving a shot (and during goal celebration play-through).
   * On goal: scores once, enters GOAL_RESOLUTION, keeps velocities (client celebrates while
   * bodies keep moving until completeGoalResolution).
   * On settle: ejects pocketed pucks and advances turn.
   */
  step(deltaMs: number): StepResult {
    if (
      !this.started ||
      (this.phase !== "PHYSICS_RESOLUTION" &&
        this.phase !== "GOAL_RESOLUTION")
    ) {
      return { state: this.getState(), events: [], shotComplete: false };
    }

    const world = this.requireWorld();
    const stepMs = MATCH_CONFIG.fixedStepMs;
    const events: MatchEvent[] = [];

    this.stepAccumulatorMs += Math.max(0, deltaMs);

    while (this.stepAccumulatorMs >= stepMs) {
      this.stepAccumulatorMs -= stepMs;
      world.stepOnce();
      this.physicsElapsedMs += stepMs;

      // Celebration play-through — no re-score / settle; just keep animating.
      if (this.phase === "GOAL_RESOLUTION") {
        continue;
      }

      const goalSide = pointInGoalSide(
        world.ball.position.x,
        world.ball.position.y,
        world.zones,
      );
      if (goalSide) {
        const scorer = scorerForGoalIn(goalSide);
        this.score[scorer] += 1;
        this.phase = "GOAL_RESOLUTION";
        events.push({ type: "goal", goalSide, scorer });

        const winner = hasWinner(this.score);
        if (winner) {
          this.result = winner;
        }

        // Keep velocities — ball plays into the net during celebration.
        return { state: this.getState(), events, shotComplete: true };
      }

      if (world.isSettled()) {
        this.stableFrames += 1;
      } else {
        this.stableFrames = 0;
      }

      if (
        this.stableFrames >= MATCH_CONFIG.settleStableFrames ||
        this.physicsElapsedMs >= MATCH_CONFIG.settleMaxMs
      ) {
        this.ejectPucksFromGoals(world);
        this.advanceTurn();
        events.push({
          type: "turn_advanced",
          currentTurn: this.currentTurn,
        });
        this.resetPhysicsCounters();
        return { state: this.getState(), events, shotComplete: true };
      }
    }

    return { state: this.getState(), events, shotComplete: false };
  }

  /**
   * After GOAL_RESOLUTION celebration: reset layout and advance (or end match).
   */
  completeGoalResolution(): MatchState {
    const world = this.requireWorld();
    if (this.phase !== "GOAL_RESOLUTION") return this.getState();

    handleGoalReset(world);
    this.resetPhysicsCounters();

    if (this.result) {
      this.phase = "MATCH_END";
      return this.getState();
    }

    this.advanceTurn();
    return this.getState();
  }

  /**
   * Run physics to completion (tests / server batch). Auto-completes goals.
   * Records compact keyframes for client replay (online).
   */
  settle(): SettleResult {
    if (this.phase !== "PHYSICS_RESOLUTION" && this.phase !== "GOAL_RESOLUTION") {
      return { ok: true, state: this.getState(), events: [], keyframes: [] };
    }

    const events: MatchEvent[] = [];
    const stepMs = MATCH_CONFIG.fixedStepMs;
    const every = Math.max(1, MATCH_CONFIG.keyframeEverySteps);
    const keyframes: PhysicsKeyframe[] = [];
    let steps = 0;

    const record = (opts?: { goal?: boolean }): void => {
      keyframes.push(this.captureKeyframe(steps * stepMs, opts));
    };

    // Pose right after impulse (shot start).
    record();

    while (this.phase === "PHYSICS_RESOLUTION") {
      const r = this.step(stepMs);
      steps += 1;
      events.push(...r.events);

      const scored = r.events.some((e) => e.type === "goal");
      if (scored || steps % every === 0 || r.shotComplete) {
        record({ goal: scored || undefined });
      }
    }

    if (this.phase === "GOAL_RESOLUTION") {
      const before = this.result;
      this.completeGoalResolution();
      if (before) {
        events.push({ type: "match_end", result: before });
      } else {
        events.push({
          type: "turn_advanced",
          currentTurn: this.currentTurn,
        });
      }
    }

    return { ok: true, state: this.getState(), events, keyframes };
  }

  private captureKeyframe(
    atMs: number,
    opts?: { goal?: boolean },
  ): PhysicsKeyframe {
    const world = this.requireWorld();
    return {
      atMs,
      ball: { x: world.ball.position.x, y: world.ball.position.y },
      pucks: world.pucks.map((p) => ({
        id: p.id,
        x: p.body.position.x,
        y: p.body.position.y,
      })),
      ...(opts?.goal ? { goal: true } : {}),
    };
  }

  private advanceTurn(): void {
    this.currentTurn =
      this.currentTurn === "player1" ? "player2" : "player1";
    this.phase = "PLAYER_TURN";
    this.turnRemainingMs = MATCH_CONFIG.turnDurationMs;
  }

  private resetPhysicsCounters(): void {
    this.physicsElapsedMs = 0;
    this.stableFrames = 0;
    this.stepAccumulatorMs = 0;
  }

  private ejectPucksFromGoals(world: MatterWorld): void {
    const field = getFieldBounds();
    const { wallThickness } = ARENA_CONFIG;
    const margin = PUCK_CONFIG.radius + u(10);
    const minY = field.top + wallThickness + margin;
    const maxY = field.bottom - wallThickness - margin;
    const inset = field.width * MATCH_CONFIG.goalEjectFieldRatio;

    for (const puck of world.pucks) {
      const side = pointInGoalSide(
        puck.body.position.x,
        puck.body.position.y,
        world.zones,
      );
      if (!side) continue;
      const x =
        side === "player1" ? field.left + inset : field.right - inset;
      const y = Math.min(maxY, Math.max(minY, puck.body.position.y));
      Body.setPosition(puck.body, { x, y });
      Body.setVelocity(puck.body, { x: 0, y: 0 });
      Body.setAngularVelocity(puck.body, 0);
    }
  }

  private requireWorld(): MatterWorld {
    if (!this.world || !this.started) {
      throw new Error("Match not started — call start() first");
    }
    return this.world;
  }
}
