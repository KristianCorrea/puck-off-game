import type { MatchState, PhysicsKeyframe } from "@puck-off/shared";

export type ReplayPose = {
  ball: { x: number; y: number; vx: number; vy: number };
  pucks: Array<{
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
  }>;
  goal: boolean;
};

/**
 * Plays server keyframes on a fixed timeline with linear interpolation.
 */
export class KeyframeReplay {
  private readonly frames: PhysicsKeyframe[];
  private readonly finalState: MatchState;
  private elapsedMs = 0;
  private done = false;
  private sawGoal = false;

  constructor(frames: PhysicsKeyframe[], finalState: MatchState) {
    this.frames = frames.length > 0 ? frames : [poseFromState(finalState)];
    this.finalState = finalState;
  }

  get isDone(): boolean {
    return this.done;
  }

  get scoredDuringReplay(): boolean {
    return this.sawGoal;
  }

  get authority(): MatchState {
    return this.finalState;
  }

  /** Advance clock; returns pose to paint (null if finished — use authority). */
  update(deltaMs: number): ReplayPose | null {
    if (this.done) return null;

    this.elapsedMs += Math.max(0, deltaMs);
    const last = this.frames[this.frames.length - 1]!;
    if (this.elapsedMs >= last.atMs) {
      this.done = true;
      if (last.goal) this.sawGoal = true;
      return null;
    }

    // Find segment [i, i+1]
    let i = 0;
    while (
      i < this.frames.length - 2 &&
      this.frames[i + 1]!.atMs <= this.elapsedMs
    ) {
      i += 1;
    }
    const a = this.frames[i]!;
    const b = this.frames[i + 1]!;
    const span = Math.max(1e-6, b.atMs - a.atMs);
    const t = Math.min(1, Math.max(0, (this.elapsedMs - a.atMs) / span));
    if (a.goal || b.goal) this.sawGoal = true;

    const invDt = 1000 / span; // for crude velocity from segment
    return {
      ball: {
        x: lerp(a.ball.x, b.ball.x, t),
        y: lerp(a.ball.y, b.ball.y, t),
        vx: (b.ball.x - a.ball.x) * invDt,
        vy: (b.ball.y - a.ball.y) * invDt,
      },
      pucks: a.pucks.map((pa) => {
        const pb = b.pucks.find((p) => p.id === pa.id) ?? pa;
        return {
          id: pa.id,
          x: lerp(pa.x, pb.x, t),
          y: lerp(pa.y, pb.y, t),
          vx: (pb.x - pa.x) * invDt,
          vy: (pb.y - pa.y) * invDt,
        };
      }),
      goal: Boolean(a.goal || b.goal),
    };
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function poseFromState(state: MatchState): PhysicsKeyframe {
  return {
    atMs: 0,
    ball: { x: state.ball.position.x, y: state.ball.position.y },
    pucks: state.pucks.map((p) => ({
      id: p.id,
      x: p.position.x,
      y: p.position.y,
    })),
  };
}
