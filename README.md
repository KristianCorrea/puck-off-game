# Puck-Off

![Puck-Off](./puck-off-banner.jpeg)

Browser-based 1v1 turn-based physics soccer. See [`docs/PLAN.md`](./docs/PLAN.md) and [`AGENTS.md`](./AGENTS.md).

## Requirements

- Node.js 20+ (see `.nvmrc`)
- npm 10+ (workspaces)

## Setup

```bash
npm install
```

## Run the client

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

**Phase 2:** hot-seat local match — 5 teal (P1) vs 5 coral (P2) pucks. Alternate turns, first to 3 or timer. Tune physics in `prototypeConfig.ts`, match rules in `gameConfig.ts`.

## Workspace

```text
apps/client   Vite + TypeScript + Phaser 3 (+ Matter physics)
docs/         Plan + phase guides
```

## Docs

| Doc | Purpose |
|-----|--------|
| [AGENTS.md](./AGENTS.md) | Short bootstrap for humans / coding agents |
| [docs/PLAN.md](./docs/PLAN.md) | Rules, architecture, MVP scope |
| [docs/phases/](./docs/phases/README.md) | Phase-by-phase guides |

Currently at **Phase 2** — local match. Next: [Phase 3 game engine](./docs/phases/PHASE_03_GAME_ENGINE.md).
