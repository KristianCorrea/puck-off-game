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

**Phase 3:** engine-driven hot-seat match — 5 teal (P1) vs 5 coral (P2) pucks. Alternate turns, first to 3, ~20s turn timer. Shared rules/physics in `packages/shared` + `packages/game-engine`; client paints Match state.

## Workspace

```text
apps/client            Vite + TypeScript + Phaser 3 (view + input)
packages/shared        GAME_CONFIG, types, protocol stubs
packages/game-engine   Authoritative Match + Matter (local now; server later)
docs/                  Plan + phase guides
```

## Docs

| Doc | Purpose |
|-----|--------|
| [AGENTS.md](./AGENTS.md) | Short bootstrap for humans / coding agents |
| [docs/PLAN.md](./docs/PLAN.md) | Rules, architecture, MVP scope |
| [docs/phases/](./docs/phases/README.md) | Phase-by-phase guides |

Currently at **Phase 3 complete** — engine-driven local match. Next: [Phase 4 multiplayer server](./docs/phases/PHASE_04_MULTIPLAYER_SERVER.md).
