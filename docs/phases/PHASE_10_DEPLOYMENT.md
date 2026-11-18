# Phase 10 — Deployment

**Status:** Thin ship path ready (host credentials + live smoke still on you)  
**Depends on:** Phase 5+ stable enough; Phase 6 reliability recommended  
**Unblocks:** real users / next iteration  
**Primary owners:** fullstack / devops-lite

---

## Purpose

Deploy **client and server** so people can play without running the repo locally.

Do not freeze infrastructure choices before local multiplayer works — by this phase, it should already work.

---

## Goals

- Public (or team-shared) client URL
- Public WebSocket-capable server URL
- Client configured to talk to the deployed server
- Basic runbook: how to deploy, how to roll back, known limits
- HTTPS / WSS in production

---

## Repo pieces (thin)

```text
Dockerfile                 # server image (repo root)
fly.toml                   # Fly.io server (min 1 machine, no auto-stop)
apps/server/.env.example
apps/client/.env.example
apps/client/.env.production.example
docs/DEPLOYMENT.md         # runbook — follow this
```

### Suggested split

| Piece | Hosting style |
|-------|----------------|
| Client | Static frontend (`apps/client/dist`) |
| Server | Long-lived Node process (Socket.IO) |

Avoid “serverless only” hosts that don’t fit sticky WebSocket sessions unless you know what you’re doing.

---

## What is in repo

| Item | Detail |
|------|--------|
| Env config | `VITE_SERVER_URL`; server `PORT` / `HOST` / `CLIENT_ORIGIN` (comma-separated) |
| Production start | `npm run start:server` (tsx); Docker `CMD` same |
| CORS / origins | Allowlisted via `CLIENT_ORIGIN` |
| Health check | `GET /health` |
| Docs | [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) |
| Fly | `fly.toml` keeps one warm machine (in-memory rooms) |

---

## What NOT to build

- Full observability platform
- Multi-region active-active (unless needed)
- Account systems “for deploy”
- Database for MVP room state (in-memory OK if documented; expect cold starts / single instance limits)
- CDN physics authority nonsense — server remains authority

---

## Smoke test in production

- [ ] Open client URL
- [ ] Create room → code works
- [ ] Second device/browser joins
- [ ] Complete a short match
- [ ] Refresh / mild disconnect behaves as documented
- [ ] WSS works (no mixed-content issues)

---

## Definition of Done

- [x] Deploy runbook + Docker/Fly skeleton in repo
- [x] Env examples for client + server
- [ ] Teammates can play from the deployed URLs without local servers *(after you run fly deploy + static publish)*
- [x] `docs/DEPLOYMENT.md` documents limits + rollback
- [x] Known limits documented (single server memory rooms, no persistence, etc.)

---

## After Phase 10

MVP loop is closed. Next work should come from playtest backlog and conscious new phases — not silent scope expansion into economy/accounts.

Return to the [phase index](./README.md) and [`docs/PLAN.md`](../PLAN.md) for rules that still govern future features.
