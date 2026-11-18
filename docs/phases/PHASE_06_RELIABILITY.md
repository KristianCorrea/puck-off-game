# Phase 6 — Reliability

**Status:** Hardening complete (MVP policy locked)  
**Depends on:** Phase 5 (happy-path online match)  
**Unblocks:** Phase 7 (UI polish on a stable core) / Phase 10 deploy  
**Primary owners:** backend / QA

---

## Purpose

Make the online game **safe under bad input and bad networks**. Invalid actions must fail cleanly; disconnects must not corrupt match state.

The server must reject garbage without crashing or desyncing the honest client.

---

## Goals

- Validate every action against phase / turn / ownership / bounds
- Reject duplicates and out-of-turn launches
- Cancel local engine playback when rejected
- Short reconnect window (don’t instantly destroy the match)
- Explicit abandonment rule if reconnect fails
- Documented test matrix green (or consciously deferred with tickets)

---

## Structure

```text
apps/server/src/
├── networking/validation.ts       # LAUNCH_PUCK parse / clamps
├── networking/events.ts           # try/catch around handlers
├── matches/
│   ├── MatchManager.ts
│   ├── disconnectPolicy.ts        # reconnect window + opponent_wins
│   └── actionGuard.ts             # duplicate launch gate
apps/client/src/
├── networking/
│   ├── resumeSession.ts           # sessionStorage resume token
│   └── OnlineLobby.ts             # RECONNECT_ROOM on boot
└── game/match/OnlineMatchController.ts
packages/game-engine/
└── Match.abandon()                # force MATCH_END
```

---

## Locked abandon policy

| Case | Behavior |
|------|----------|
| Soft disconnect mid-match | Pause turns/launches; `OPPONENT_DISCONNECTED`; **30s** reconnect window |
| Reconnect in window | `RECONNECT_ROOM` + `MATCH_RESUME` with authoritative state |
| Window expires | Remaining player **wins** (`MATCH_ABANDONED` + `TURN_RESOLVED` reason `abandon`) |
| Intentional `LEAVE_ROOM` mid-match | Immediate abandon — opponent wins (no wait) |
| Disconnect in lobby | Free seat only |
| Disconnect during countdown | Cancel countdown → lobby for remaining player |
| Refresh mid-match | Resume via `sessionStorage` resume token (same browser tab session) |

---

## Test matrix

### Actions / validation

- [x] Duplicate click / double `LAUNCH_PUCK` → `DUPLICATE_LAUNCH` / `WRONG_PHASE`
- [x] Action during `PHYSICS_RESOLUTION` → engine `WRONG_PHASE`
- [x] Action during opponent’s turn → `WRONG_TURN`
- [x] Action after `MATCH_END` → `MATCH_ENDED` / room `WRONG_PHASE`
- [x] Selecting / launching opponent puck → `NOT_OWNER` (engine + client filter)
- [x] Invalid puck ID → `INVALID_PUCK_ID` / `UNKNOWN_PUCK`
- [x] Invalid power (<min, >1, NaN) → `INVALID_POWER`
- [x] Invalid angle (NaN / non-finite) → `INVALID_ANGLE`
- [x] Join when room is full → ERROR "Room is full"
- [x] Leave before match starts → seat freed; room kept for remaining

### Network / session

- [x] Temporary disconnect + reconnect within window → `MATCH_RESUME`
- [x] Disconnect during match past window → abandon, opponent wins
- [x] Refresh mid-match → reconnect with stored resume token
- [ ] High latency (throttle in DevTools) — **deferred playtest** (keyframe replay already hides dual-sim)

### Rules still correct under stress

- [x] Own goal scoring (engine)
- [x] After goal: ball midfield + pucks reset (engine `handleGoal`)
- [x] Turn timer skip paused while opponent disconnected / replay lock
- [x] Rejected shot restores shooter local state (`preShotState`)

---

## Known sharp edges (ok for Phase 7 / playtest)

- Resume tokens are per-browser `sessionStorage` — new device cannot steal a seat
- Both players disconnecting deletes the room (no spectate / archive)
- Countdown disconnect cancels start (no 30s hold during 3-2-1)
- No ranked / accounts

---

## Definition of Done

- [x] Matrix items checked or explicitly ticketed with reason
- [x] Server never trusts client score/timer/winner
- [x] No crash on malformed events (handler try/catch + parse guards)
- [x] Reconnect window behaves as documented
- [x] Team comfortable inviting outsiders without “don’t click twice” warnings

---

## Handoff to Phase 7 / 10

Core is stable enough that UI work won’t paper over desync bugs. Next: optional Phase 7 lobby chrome, or Phase 10 deploy (`VITE_SERVER_URL`, `CLIENT_ORIGIN`, `docs/DEPLOYMENT.md`).
