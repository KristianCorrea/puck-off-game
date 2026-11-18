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

**Local:** engine-driven hot-seat — 5v5, first to 3, ~20s turns. Shared rules in `packages/shared` + `packages/game-engine`.

### Run the multiplayer server

```bash
npm run dev:server
```

Listens on `http://localhost:3001` (`GET /health`).

Client: choose **ONLINE** on the start screen (or `?mode=online`). Create/join room → Ready on both windows. Optional `?server=http://host:3001`.

## Deploy

Thin production split (static client + Socket.IO server): see **[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)**.

```bash
# Server (Fly example)
fly secrets set CLIENT_ORIGIN=https://YOUR_CLIENT_ORIGIN
fly deploy

# Client build
VITE_SERVER_URL=https://YOUR_APP.fly.dev npm run build:client
# → publish apps/client/dist
```

## Workspace

```text
apps/client            Vite + TypeScript + Phaser 3 (view + input)
apps/server            Node + Socket.IO + game-engine Match (authority)
packages/shared        GAME_CONFIG, types, socket protocol
packages/game-engine   Authoritative Match + Matter
docs/                  Plan + phase guides + DEPLOYMENT.md
```

## Docs

| Doc | Purpose |
|-----|--------|
| [AGENTS.md](./AGENTS.md) | Short bootstrap for humans / coding agents |
| [docs/PLAN.md](./docs/PLAN.md) | Rules, architecture, MVP scope |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Prod env, Fly/static host, smoke test |
| [docs/phases/](./docs/phases/README.md) | Phase-by-phase guides |

Online path through Phase 6 (reliability) is in; Phase 10 thin deploy docs/Docker/Fly config are ready to ship.
