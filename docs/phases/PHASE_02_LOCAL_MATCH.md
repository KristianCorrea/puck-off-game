# Phase 2 — Complete Local Match

**Status:** Local gameplay MVP  
**Depends on:** Phase 1 (flick feels good)  
**Unblocks:** Phase 3  
**Primary owners:** gameplay / rules

---

## Purpose

Turn the flick prototype into a **complete match on one computer** (hot-seat / pass-the-keyboard).

Two people should finish a real game: turns, goals, win, rematch — no network yet.

---

## Goals

- 5 pucks per player, reusable
- Defense-oriented starting layout
- Alternating turns
- Scoring including own goals
- After goal: ball → midfield **and pucks reset** to start layout
- First to 3 wins immediately
- Per-turn move clock (~20s → skip turn)
- Clear match-end state + soft rematch

---

## Locked rules to implement here

| Rule | Behavior |
|------|----------|
| Pucks | Exactly 5 each; reusable; no ammo |
| Start | Defense-oriented, symmetric halves; ball midfield |
| Own goal | Ball in your goal → opponent +1 |
| After goal | **Pucks reset** to start layout; ball to midfield; clear velocities |
| Goal timing | Ball **center** in pocket → score immediately (no settle wait) |
| Pucks in pocket | At end of turn, eject puck centers out onto the pitch |
| Win | First to 3 ends immediately |
| Turn timer | ~20s; expiry **skips** the turn (does not end the match) |

Isolate post-goal handling in something like `handleGoal()` even if still inside the client.

---

## Expected structure (end of Phase 2)

Still client-centric; rules may live next to the scene for now:

```text
apps/client/src/game/
├── ArenaScene.ts
├── match/
│   ├── MatchController.ts     # phase: turn → physics → goal → end
│   ├── TurnManager.ts
│   ├── ScoreKeeper.ts
│   ├── MatchTimer.ts          # per-turn clock
│   └── layouts/
│       └── defenseLayout.ts   # 5+5 spawn positions
├── input/FlickController.ts
├── entities/
└── config/gameConfig.ts       # pucksPerPlayer, maxGoals, turnDurationMs, physics
```

Suggested match phases (local):

```ts
type MatchPhase =
  | "PLAYER_TURN"
  | "PHYSICS_RESOLUTION"
  | "GOAL_RESOLUTION"
  | "MATCH_END";
```

HUD can be Phaser text or a thin React overlay — keep it simple.

---

## What to build

| Item | Detail |
|------|--------|
| Ownership | Only current player’s pucks selectable |
| Turns | One flick → wait until settled → other player |
| Settling | Velocity threshold + stability frames + max timeout |
| Goals | Detect side; apply score / own-goal rule |
| After goal | Ball midfield + **reset all pucks** to defense layout |
| Turn timer | Counts during `PLAYER_TURN`; expiry skips turn |
| End states | Win banner + soft rematch (no full scene restart required) |

Local “Player 1 / Player 2” labels are enough. No accounts.

---

## What NOT to build

- Socket.IO / rooms
- Optimistic net reconcile (no server yet)
- Formation picker UI
- Accounts / economy
- Full `packages/game-engine` extraction (Phase 3)
- Match-duration clock / timer-expiry win-draw (not MVP)
- Fancy VFX beyond what’s needed to read turn/score (extra juice is Phase 8)

---

## Manual playtest script

- [ ] P1 scores on P2 → score 1-0; **pucks reset**; ball midfield
- [ ] P2 own-goals → P1 gets the point; pucks reset again
- [ ] Reach 3 goals → match ends immediately
- [ ] Let turn timer expire → turn skips; match continues
- [ ] Cannot flick opponent puck
- [ ] Cannot flick while bodies still moving
- [ ] Same puck usable every turn (between goals)
- [ ] Soft rematch returns to 0–0 without freezing

---

## Team expectations

| Role | Focus |
|------|--------|
| Rules | Turn machine, scoring, turn-timer skip, post-goal reset |
| Gameplay | Layout spacing; goal size; turn length feel |
| Reviewer | Play a full match hot-seat before approving |

---

## Definition of Done

- [ ] Full match playable without refresh hacks
- [ ] All locked rules above behave correctly
- [ ] HUD shows score, turn clock, whose turn
- [ ] Team can play without a developer narrating the rules
- [ ] Known ambiguities (if any) documented for Phase 3 isolation

---

## Handoff to Phase 3

Phase 3 will lift rules out of the scene. Prefer:

- Match state as plain data (`score`, `pucks[]`, `ball`, `currentTurn`, `phase`)
- `applyAction({ playerId, puckId, angle, power })` style entry point
- `GAME_CONFIG` already centralized
- `handleGoal()` resets ball **and** pucks (locked)

Renderer should already be separable from “who won.”
