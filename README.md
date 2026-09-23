# ARKIVE // 002

sovereign relay + spatial context selection + a voice you can talk to.

this repo is the implementation of the arkive prototype. the design is the spec.

## layout

- `design/arkive-v2.html` — the standalone prototype. **source of truth for UI + behavior.** open it in a browser; every screen, state and handler is readable in its `Component` class.
- `design/arkive-chat-canvas-2a-2b.html` — the preserved room chat/canvas design reference; it supplements rather than replaces the canonical prototype.
- `docs/HANDOFF.md` — screen inventory, seven journeys (acceptance tests), engineering annotations, deferred list.
- `docs/CHAT-CANVAS-HANDOVER.md` — preserved design intent and acceptance notes for the rooms rail and room-scoped canvas projection.
- `docs/STATE-SCHEMA.md` — BrainObject model + every prototype state key → its convex home.
- `docs/GRAPH-BRAIN-ARCHITECTURE.md` — the original architecture spec.
- `.cursor/rules/arkive.mdc` — rules cursor follows while porting.
- `app/` — tauri + react + convex scaffold. `Shell.tsx` is the 7-pill shell skeleton.

## run

Start with [the owner-beta setup guide](docs/ARKIVE_OWNER_BETA_SETUP.md).
Clerk/Convex projects have not been connected. The production entry remains locked
until configured; the synthetic canvas preview needs neither account:

```sh
cd app
npm ci
npm run test:ui       # http://127.0.0.1:1421 — isolated synthetic UI only
```

For a configured browser beta (follow the guide before running Convex commands):

```
cd app
npx convex dev        # terminal 1 — dedicated dev deployment; never demo-seed it
npm run dev           # terminal 2 — browser on :1420
npm run typecheck
```

Native Tauri sign-in is not verified. This slice is single-owner access enforcement,
not team RBAC, live Hermes connectivity, encryption, sync, or production readiness.

## staged plan (one PR each)

1. shell + nav (layout only)
2. BrainObject in convex — everything depends on this
3. vault: tree + reading view + inbox review
4. capture + recorder (real mic via tauri; extraction stubbed)
5. agents network + work + log
6. cartridges (library / shared)
7. relay phase — buzz/nostr fills the adapter seams. **not before.**

## rules that never bend

- originals are never modified by derivation
- no durable brain mutation without review — accepts are signed events
- assigning work never widens an agent's access — grants are per-run leases
- ▣ executable capability is a separate consent, never rides an install or update
- no crypto/relay claims in the UI until the relay phase ships them for real
