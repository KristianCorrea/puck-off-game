/**
 * Centralized prototype tuning. Phase 2+ will evolve this into GAME_CONFIG.
 */
export const PROTOTYPE_CONFIG = {
  arena: {
    /** Full canvas including recessed goal pockets on left/right */
    width: 1240,
    height: 640,
    wallThickness: 28,
    cornerRadius: 0,
    backgroundColor: 0x0e1a2b,
    floorColor: 0x152238,
    wallColor: 0x3d5a80,
  },

  goal: {
    openingHeight: 200,
    /** Recessed pocket depth (Soccer Stars–style cage behind the mouth) */
    depth: 78,
    postThickness: 18,
    sensorPadding: 10,
    color: 0xf4a261,
    netColor: 0xc9783a,
    sensorAlpha: 0.22,
  },

  puck: {
    radius: 28,
    color: 0x2ec4b6,
    strokeColor: 0x1a9e93,
    mass: 10,
    friction: 0.04,
    frictionAir: 0.02,
    restitution: 0.55,
    /** Fraction across the playable field (not including goal pockets) */
    startXRatio: 0.22,
    startYRatio: 0.5,
  },

  ball: {
    radius: 16,
    color: 0xf8f4ec,
    strokeColor: 0xc9c2b4,
    mass: 1.2,
    friction: 0.02,
    frictionAir: 0.015,
    restitution: 0.85,
  },

  shot: {
    /** Drag distance (px) that maps to power 1.0 */
    maxDragPx: 160,
    /** Launch speed at power 1.0 (Matter velocity units) */
    maxSpeed: 16,
    minPower: 0.08,
  },

  settle: {
    /** Speed below this counts as nearly stopped */
    sleepSpeed: 0.08,
    /** Clamp micro-velocities each frame when below this */
    stopSpeed: 0.045,
  },
} as const;

export type GoalSide = "player1" | "player2";

/** Playable pitch between the recessed goal pockets. */
export function getFieldBounds() {
  const { width, height } = PROTOTYPE_CONFIG.arena;
  const depth = PROTOTYPE_CONFIG.goal.depth;
  const left = depth;
  const right = width - depth;
  return {
    left,
    right,
    top: 0,
    bottom: height,
    width: right - left,
    height,
    centerX: (left + right) / 2,
    centerY: height / 2,
  };
}
