/**
 * Centralized prototype tuning. Phase 2+ will evolve this into GAME_CONFIG.
 */
export const PROTOTYPE_CONFIG = {
  arena: {
    /** Full canvas including HUD band + recessed goal pockets */
    width: 1240,
    /** Dedicated top chrome for score / turn / clock */
    hudHeight: 104,
    /** Playable pitch height (below HUD) */
    playHeight: 640,
    /** Total canvas height = hudHeight + playHeight */
    height: 744,
    wallThickness: 26,
    cornerRadius: 18,
    backgroundColor: 0x071018,
    floorColor: 0x0f2740,
    floorAccent: 0x143352,
    wallColor: 0x5ec8ff,
    wallInner: 0x1a3a55,
    lineColor: 0x7dd3fc,
  },

  goal: {
    openingHeight: 200,
    /** Recessed pocket depth (Soccer Stars–style cage behind the mouth) */
    depth: 78,
    postThickness: 18,
    sensorPadding: 10,
    color: 0xffb703,
    netColor: 0xe09f3e,
    sensorAlpha: 0.14,
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
    color: 0xfff7ed,
    strokeColor: 0xfbbf24,
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

/** Playable pitch between the recessed goal pockets (below the HUD band). */
export function getFieldBounds() {
  const { width, height, hudHeight, playHeight } = PROTOTYPE_CONFIG.arena;
  const depth = PROTOTYPE_CONFIG.goal.depth;
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
