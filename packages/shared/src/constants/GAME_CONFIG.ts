/** Design-pixel → world scale (high fixed resolution). */
export const DESIGN_SCALE = 2;

export function u(n: number): number {
  return n * DESIGN_SCALE;
}

export const ARENA_CONFIG = {
  width: u(1240),
  hudHeight: u(104),
  playHeight: u(640),
  height: u(744),
  wallThickness: u(26),
  cornerRadius: u(18),
  backgroundColor: 0x071018,
  floorColor: 0x0f2740,
  floorAccent: 0x143352,
  wallColor: 0x5ec8ff,
  wallInner: 0x1a3a55,
  lineColor: 0x7dd3fc,
} as const;

export const GOAL_CONFIG = {
  openingHeight: u(200),
  depth: u(78),
  postThickness: u(18),
  sensorPadding: u(10),
  color: 0xffb703,
  netColor: 0xe09f3e,
  sensorAlpha: 0.14,
} as const;

export const PUCK_CONFIG = {
  radius: u(28),
  color: 0x2ec4b6,
  strokeColor: 0x1a9e93,
  mass: 10,
  friction: 0.04,
  frictionAir: 0.02,
  restitution: 0.55,
  startXRatio: 0.22,
  startYRatio: 0.5,
} as const;

export const BALL_CONFIG = {
  radius: u(16),
  color: 0xfff7ed,
  strokeColor: 0xfbbf24,
  mass: 1.2,
  friction: 0.02,
  frictionAir: 0.015,
  restitution: 0.85,
} as const;

export const SHOT_CONFIG = {
  maxDragPx: u(160),
  maxSpeed: u(16),
  minPower: 0.08,
} as const;

export const SETTLE_CONFIG = {
  sleepSpeed: u(0.08),
  stopSpeed: u(0.045),
} as const;

export const MATCH_CONFIG = {
  pucksPerPlayer: 5,
  maxGoals: 3,
  turnDurationMs: 20_000,
  settleStableFrames: 14,
  settleMaxMs: 10_000,
  /** Client celebration hold; engine waits in GOAL_RESOLUTION then resets. */
  goalCelebrationMs: 5_000,
  goalEjectFieldRatio: 0.187,
  /** Fixed Matter step for headless sim (ms). */
  fixedStepMs: 1000 / 60,
  players: {
    player1: {
      id: "player1" as const,
      label: "Player 1",
      short: "P1",
      color: 0x2dd4bf,
      strokeColor: 0xf0fdfa,
    },
    player2: {
      id: "player2" as const,
      label: "Player 2",
      short: "P2",
      color: 0xfb7185,
      strokeColor: 0xfff1f2,
    },
  },
} as const;

/** Playable pitch between recessed goal pockets (below HUD). */
export function getFieldBounds() {
  const { width, height, hudHeight, playHeight } = ARENA_CONFIG;
  const depth = GOAL_CONFIG.depth;
  const left = depth;
  const right = width - depth;
  const top = hudHeight;
  const bottom = height;
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: playHeight,
    centerX: (left + right) / 2,
    centerY: top + playHeight / 2,
    hudHeight,
  };
}

export const GAME_CONFIG = {
  designScale: DESIGN_SCALE,
  arena: ARENA_CONFIG,
  goal: GOAL_CONFIG,
  puck: PUCK_CONFIG,
  ball: BALL_CONFIG,
  shot: SHOT_CONFIG,
  settle: SETTLE_CONFIG,
  match: MATCH_CONFIG,
  ballReset: "midfield" as const,
  startingLayout: "defense" as const,
  pucksResetAfterGoal: true,
} as const;

export type GameConfig = typeof GAME_CONFIG;
