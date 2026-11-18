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

**Local (Phase 3):** engine-driven hot-seat — 5v5, first to 3, ~20s turns. Shared rules in `packages/shared` + `packages/game-engine`.

### Run the multiplayer server

```bash
npm run dev:server
```

Listens on `http://localhost:3001` (`GET /health`).

Client: choose **ONLINE** on the start screen (or `?mode=online`). Create/join room → Ready on both windows. Optional `?server=http://host:3001`.

## Workspace

```text
apps/client            Vite + TypeScript + Phaser 3 (view + input)
apps/server            Node + Socket.IO + game-engine Match (authority)
packages/shared        GAME_CONFIG, types, socket protocol
packages/game-engine   Authoritative Match + Matter
docs/                  Plan + phase guides
```

## Docs

| Doc | Purpose |
|-----|--------|
| [AGENTS.md](./AGENTS.md) | Short bootstrap for humans / coding agents |
| [docs/PLAN.md](./docs/PLAN.md) | Rules, architecture, MVP scope |
| [docs/phases/](./docs/phases/README.md) | Phase-by-phase guides |

Currently at **Phase 4 in progress** — server rooms + Match authority up; client online session next. See [Phase 4](./docs/phases/PHASE_04_MULTIPLAYER_SERVER.md).
