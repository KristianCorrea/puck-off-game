/** Compact pose sample for TURN_RESOLVED replay (server-authored). */
export type PhysicsKeyframe = {
  /** Elapsed ms from shot start (fixed-step timeline). */
  atMs: number;
  ball: { x: number; y: number };
  pucks: Array<{ id: string; x: number; y: number }>;
  /** True if ball center entered a goal on/before this frame. */
  goal?: boolean;
};
