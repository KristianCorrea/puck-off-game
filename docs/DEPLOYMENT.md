# Deployment (Phase 10 — thin)

Ship a **static client** + **one long-lived Socket.IO server**. Rooms are **in-memory** on a single Node process — do not scale to multiple server instances without sticky sessions / shared state (out of MVP scope).

## Architecture

```text
Browser ──HTTPS──▶ Client (static: Vercel / Netlify / Cloudflare Pages / …)
   │
   └──WSS────────▶ Server (Fly.io / Railway / Render / …)
                     game-engine Match authority
                     GET /health
```

| Piece | Env | Notes |
|-------|-----|--------|
| Client build | `VITE_SERVER_URL` | Baked in at `vite build`. Use `https://…` so Socket.IO uses WSS. |
| Server | `PORT`, `HOST`, `CLIENT_ORIGIN` | `CLIENT_ORIGIN` = exact browser origin(s), comma-separated. |

Override at runtime (dev/debug): open client with `?server=https://your-api.example`.

## Local prod-like check

```bash
# Terminal A — server
CLIENT_ORIGIN=http://localhost:4173 npm run start:server

# Terminal B — client build + preview
VITE_SERVER_URL=http://localhost:3001 npm run build:client
npm run preview
```

Open the preview URL → **ONLINE** → create/join room.

## Server — Fly.io (recommended thin path)

Prereqs: [flyctl](https://fly.io/docs/hands-on/install-flyctl/) logged in.

```bash
# From repo root (edit fly.toml `app` name if taken)
fly apps create puck-off-server   # once
fly secrets set CLIENT_ORIGIN=https://YOUR_CLIENT_ORIGIN
fly deploy
```

Health: `https://YOUR_APP.fly.dev/health` → `{ "ok": true, … }`.

**Important:** `fly.toml` keeps `min_machines_running = 1` and `auto_stop_machines = "off"` so in-memory rooms survive idle time. Turning auto-stop on will wipe matches when the machine sleeps.

### Other Node hosts (Railway / Render)

- Build: Docker (`Dockerfile` at repo root) **or** `npm ci && npm run start -w @puck-off/server`
- Start command: `npm run start -w @puck-off/server`
- Set `CLIENT_ORIGIN` to your client HTTPS origin
- Expose the HTTP port the host injects as `PORT`
- Prefer a **single** always-on instance

## Client — static host

Build from repo root (workspaces need the monorepo):

```bash
npm ci
VITE_SERVER_URL=https://YOUR_APP.fly.dev npm run build:client
# output: apps/client/dist
```

| Host | Build command | Output dir | Env |
|------|---------------|------------|-----|
| Cloudflare Pages | `npm ci && npm run build:client` | `apps/client/dist` | `VITE_SERVER_URL` |
| Vercel | same (root directory = repo) | `apps/client/dist` | `VITE_SERVER_URL` |
| Netlify | same | `apps/client/dist` | `VITE_SERVER_URL` |

Publish `apps/client/dist`. Then set server `CLIENT_ORIGIN` to the **exact** client origin (scheme + host, no trailing slash), e.g. `https://puck-off.pages.dev`.

Examples live in:

- `apps/client/.env.example`
- `apps/client/.env.production.example`
- `apps/server/.env.example`

## Smoke test (prod)

1. Open the client URL over **HTTPS**
2. Create room → share code
3. Second browser/device joins → both Ready → countdown → play
4. Finish a short match; try rematch
5. Soft refresh mid-match within 30s → should resume
6. Confirm no mixed-content / blocked WSS in DevTools

## Rollback

- **Fly:** `fly releases` → `fly deploy --image` previous release, or redeploy a known-good git SHA
- **Client:** redeploy previous static build / git SHA on the static host

## Known limits

- One server process; restart clears all rooms
- No multi-region / no Redis room store
- Resume tokens are browser `sessionStorage` (same device/session)
- Do not put the API behind a host that kills idle WebSockets without sticky routing

## Security notes (MVP)

- No accounts; room codes are the access gate
- CORS is origin allowlist only — keep `CLIENT_ORIGIN` tight
- Server never trusts client score / winner / timer
