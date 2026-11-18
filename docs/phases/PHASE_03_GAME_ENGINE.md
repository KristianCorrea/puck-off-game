# Phase 3 — Separate Game Engine

**Status:** Complete — client renders one engine sim (no dual Matter)

**Depends on:** Phase 2 (local match works)  
**Unblocks:** Phase 4  
**Primary owners:** engine / shared types

---

## Purpose

Move authoritative match rules into a **UI-free `game-engine` package** so the server can run the same logic later without importing Phaser/React.

The renderer must stop being the source of truth for score, turns, and winners.

---

## Goals

- `packages/game-engine` owns match rules + physics integration
- `packages/shared` holds types, protocol shapes, `GAME_CONFIG`
- Client uses the engine (or a thin adapter) for local play
- Engine has **no** React/Phaser imports
- Unit tests cover core rules

---

## Expected structure (end of Phase 3)

```text
puck-off/
├── apps/
│   └── client/                    # Phaser paints engine state + input
├── packages/
│   ├── game-engine/
│   │   ├── package.json
│   │   └── src/
│   │       ├── Match.ts           # public API (start / applyAction / step / …)
│   │       ├── GameRules.ts
│   │       ├── handleGoal.ts      # ball midfield + pucks reset to start layout
│   │       ├── physics/
│   │       │   ├── MatterWorld.ts
│   │       │   └── settle.ts
│   │       ├── entities/
│   │       └── index.ts
│   └── shared/
│       ├── package.json
│       └── src/
│           ├── constants/GAME_CONFIG.ts
│           ├── types/
│           │   ├── LaunchAction.ts
│           │   ├── MatchState.ts
│           │   └── MatchPhase.ts
│           └── protocol/          # message types (stubs until Phase 4)
└── ...
```

### Public engine shape (shipped)

```ts
const game = new Match();
game.start();

game.applyAction({
  playerId: "player1",
  puckId: "p1_1",
  angle: 1.2,
  power: 0.75,
});

// Local / online shooter: step each frame and paint getState()
game.step(deltaMs);

// On goal: phase → GOAL_RESOLUTION (physics keeps playing through);
// after celebration UI: game.completeGoalResolution();

// Tests / headless batch: game.settle();
const state = game.getState();
```

---

## What to build

| Item | Detail |
|------|--------|
| Match API | start / applyAction / step / completeGoalResolution / settle / getState |
| Validation | turn, ownership, phase, power clamp |
| Physics | Matter fixed-dt until settled + max timeout |
| Scoring | normal + own goal |
| Goals | `handleGoal()` → ball midfield, clear velocities, **pucks reset** to start layout |
| Win / turn timer | First to 3; ~20s turn clock skips turn (same as Phase 2) |
| Layout | defense layout from config |
| Tests | unit tests for rules (see checklist) |

Client is a **view + input** over engine state (local hot-seat; no net yet).

Local play: `applyAction` → `step(delta)` each frame → paint sprites from `getState()`.  
Phaser Matter `autoUpdate` is off — display proxies only, not a second sim.

---

## What NOT to build

- Socket.IO server (Phase 4)
- Net reconcile / rooms
- Production deploy
- New game modes / economy / formations
- Rewriting Phase 1 feel “while we’re here” unless a bug is found

---

## Test checklist (engine)

- [x] Turn switching
- [x] Cannot control opponent puck
- [x] Reusable pucks (no `used` flag required)
- [x] Scoring + own goals (rules + `handleGoalReset`; live match scores via ball-center zones)
- [x] After goal: ball midfield + pucks reset to start layout
- [x] End of turn: eject pucks from goal pockets
- [x] First to 3 ends immediately
- [x] Turn timer expiry skips turn (match continues)
- [x] Invalid action rejected (wrong turn, bad power, etc.)
- [x] Full short match sequence (hot-seat playable end-to-end)

---

## Team expectations

| Role | Focus |
|------|--------|
| Engine | Extract without changing rules |
| Client | Wire scene to `Match` API; keep flick feel |
| Reviewer | Behavior parity with Phase 2; **one** physics truth |

**Parity rule:** a Phase 2 hot-seat match and a Phase 3 engine-driven match should feel the same.

---

## Definition of Done

- [x] `game-engine` builds independently
- [x] Client match uses engine for rules/physics outcomes
- [x] No Phaser/React imports inside `game-engine`
- [x] Shared `GAME_CONFIG` used by engine (and client visuals)
- [x] Rule unit tests pass
- [x] Local match still playable end-to-end

---

## Handoff to Phase 4

Phase 4 will run this engine on Node behind Socket.IO.

Call out early:

- Headless Matter / fixed timestep needs to work in Node (`Match.step` / `settle`)
- `TURN_RESOLVED` payload shape (final positions, score, turn, phase, winner)
- Client should **render the engine** (local copy for shooter snappiness, or apply/replay server result) — **not** a second competing Matter world
