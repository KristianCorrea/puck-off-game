# AGENTS.md — Puck Off

Bootstrapping notes for humans and coding agents working in this repo.

## What this project is

**Puck Off** is a browser-based **1v1 turn-based physics soccer** game. Players flick permanent pucks into a ball and try to score into the opponent’s goal. **First to 3** wins. Each turn has a **~20s** move clock; expiry skips the turn.

## Read these first

1. **[`docs/PLAN.md`](./docs/PLAN.md)** — game rules, architecture, stack, MVP scope (source of truth)
2. **[`docs/phases/README.md`](./docs/phases/README.md)** — phase-by-phase team guides (structure, DoD, handoffs)

If a phase guide disagrees with `docs/PLAN.md`, **follow the plan** and update the phase guide.

## Current build posture

- **Thin first:** prove the flick (Phase 0–1) before full monorepo / server / engine.
- **Do not** invent economy, accounts, matchmaking, cosmetics, or formation pickers for MVP.
- If something is ambiguous, choose the simplest option that preserves core play and isolate it (config / small function).
- Phase 10 thin ready: `docs/DEPLOYMENT.md`, Dockerfile, `fly.toml`. Set `VITE_SERVER_URL` + `CLIENT_ORIGIN`, then deploy. Local hot-seat via **LOCAL** still default.

## Locked MVP decisions (quick)

| Topic | Decision |
|--------|----------|
| Pucks | 5 per player, reusable |
| Start layout | Defense-oriented |
| Own goal | Opponent +1 |
| After goal | Ball → midfield; **pucks reset** to start layout |
| Goal detect | Ball **center** enters pocket → score immediately |
| Pucks in pocket | Eject onto pitch at end of turn |
| Win | First to **3** (no match-duration clock) |
| Turn timer | ~20s; expiry **skips** turn |
| Net feel | Both clients replay server keyframes from `TURN_RESOLVED` |
| Authority | `game-engine` Matter = truth; Phaser paints keyframes / finals (no second sim) |

## Stack (MVP)

- Client: React + Vite + TypeScript + Phaser 3 + Matter.js
- Server: Node + TypeScript + Socket.IO
- Packages: `game-engine`, `shared`
- Server: `apps/server` — `npm run dev:server` (default `http://localhost:3001`)

## Ownership cheat sheet

| Concern | Owner |
|--------|--------|
| Menus / lobby / HUD chrome | React |
| Arena / aim / bodies | Phaser |
| Official score, turns, physics | `game-engine` (local now; server in Phase 4) |
| Snappy flick animation | Render engine steps immediately after launch |

## Working rules for agents

- Prefer the **active phase** guide’s in/out of scope lists.
- Don’t put continuous physics positions in React state.
- Clients send **intent** (`LAUNCH_PUCK`); never trust client score/winner/timer/physics results.
- Don’t send physics every frame over the network.
- After goals: ball → midfield and pucks reset to start layout via `handleGoal()`.
- Goal when the **ball center** enters the pocket (immediate; don’t wait for settle).
- Pucks may not rest inside a goal — eject them onto the pitch at end of turn.
- Prefer soft rematch (reset match state) over tearing down the Matter scene when possible.

## First milestone

> Can I flick a puck at a ball and does the collision feel satisfying?

**Phase 3 local match is engine-driven.** Run `npm run dev` for hot-seat play (5v5 pucks, turns, score, turn timer). Tune shared physics/rules in `packages/shared` (`GAME_CONFIG`); client paints `Match` state.
