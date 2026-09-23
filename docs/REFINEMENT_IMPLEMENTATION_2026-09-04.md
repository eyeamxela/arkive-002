# Arkive 002 — canvas-preserving implementation

Status: implemented locally and exercised with isolated fixtures; NOT a connected private-data beta.

Canvas follow-up: two additional shared-state views, **Radial · 2c** and **Multi-room · 2d**, are now available alongside Infinite. See `CANVAS_VIEWS_2C_2D.md` for source provenance, implementation boundaries and updated verification (37 passing tests).

The dark instrument-style interface, existing navigation, graph and read → room → do canvas grammar remain intact. No white paper or standalone design HTML was replaced. Work started from `1e31c25eda24592885e276c149d3bb2ba4ae54d2` in `/Users/xela/Documents/GITHUB/arkive-002`. No commit, push, hosted deployment, authentication configuration, model request or desktop package release was performed.

## Implemented

- Room-owned drafts, selection, TTL, context-overlay state and send state live above presentation changes in `RoomSessionProvider`. They survive room/chat/canvas switching, but not an app reload. They are UI state, not permission grants.
- The canvas tab is now a shared infinite coordinate plane, not a finite scrolling page. The current room and one pinned room are movable groups with their own conversations, context cards and derived connections. Pan by dragging the background, middle-dragging, space-dragging or scrolling; Ctrl/Command-scroll zooms around the pointer. The toolbar offers a hand tool, zoom controls, 100% zoom and fit view. Focused-canvas arrows pan and 0 fits; focused group-handle arrows move the group. Native buttons, typing and chat scrolling remain independent.
- Canvas camera and group positions survive chat/canvas switching during the session, but not an app reload. Coordinates can extend in every direction; zoom is bounded to 20–200%. Narrow screens retain the same world-space layout with fixed on-screen navigation controls. SVG connection geometry is normalized for camera scaling. These positions and drawn links are presentation state, never BrainObjects or permission grants.
- Mobile chat has a deliberate rooms drawer, wrapping scope controls, visible composer and 2×2 metrics. Reduced-motion preferences are respected.
- Send is awaited; errors retain the draft and offer retry. An older successful send cannot erase newer typing. Autoscroll follows new messages only when already near the bottom.
- Chat, tray, rail and canvas use one server-side effective-context resolver. Explicit permitted selection overrides the default canon-only scope, but never a tier exclusion. Saved manifests resolve exact hashes rather than random members. A selected manifest must belong to the room and be unexpired.
- Send stores a context snapshot; delayed simulated replies use its references. Policy, path, tier, lifecycle, hash, expiry or revocation changes cancel the reply rather than broadening context silently. These are reference snapshots, not a completed prompt compiler with real model tokenization.
- Accepted proposals materialize task rows, relation edges, provenance and supersession records. Explicit consent reaches the mutation and is required for memory proposals. Failed acceptance keeps the edited draft visible.
- Dispatch respects paused agents and avoids duplicate active runs. Completion validates task/run/grant ownership. Approve/deny requires the actual run ID, updates only an eligible linked task, revokes its grant, and records an audit event. All execution remains simulated.
- Capture now saves real text notes, tasks and .md/.txt originals in local IndexedDB. Original UTF-8 content, including BOM and line endings, is preserved and SHA-256 checked. The local library previews exact text and supports validated, atomic additive restore and export. Capture does not upload real text to the existing anonymous backend.
- Internal-only backend source functions implement text ingestion, byte/content equality checks, source versions, checksum validation, export and restore. They are deliberately not callable from the frontend until authentication is approved and wired.
- ReadingView displays stored content when present and labels seed-body previews. Capture, gauges, signatures, token estimates, folder sync and execution labels distinguish prototype illustrations from implemented checks. A presentation error boundary gives a matching-backend/setup explanation instead of a blank screen.
- Graph, freeform canvas, capture and settings load on demand. With the infinite room canvas, the initial production JS bundle is about 419 KB (120 KB gzip); other panels are separate chunks. This removes the prior over-500-KB entry warning. It is not a measured end-to-end load-time claim.

## Run and inspect safely

From `/Users/xela/Documents/GITHUB/arkive-002/app`:

```sh
npm test
npm run build
npm run test:ui
```

Open `http://127.0.0.1:1421` for the isolated fixture preview. This separate entry renders the actual components and executes public handlers against synthetic in-memory tables; it does not construct a Convex client or call a model. Its CSP blocks non-local connections. Scheduled internal jobs do not run there; its chat arrival is explicitly synthetic. The normal production entry and deployment configuration are unchanged. The normal `npm run dev` frontend requires a matching backend revision; the old hosted functions have not been upgraded in this task.

## Verification

- 30 automated tests: 15 domain-handler tests, 3 room-state tests, 3 local-original format tests, 3 isolated UI-fixture/runtime tests, and 6 infinite-canvas math tests. Canvas math covers unbounded positive/negative panning, pointer-anchored zoom, fitting, scaled room movement, zoom limits and invalid inputs.
- Production TypeScript and Vite build pass; separate Convex TypeScript check passes.
- Actual-handler tests use a partial synthetic transactional DB, not hosted Convex. They cover exact scope, explicit curated selection under default deny, cross-room manifest rejection, policy/source drift, consent, tasks, relations, supersession, path validation, dispatch/approval ownership, idempotence and source integrity.
- Browser at 1280×720: both pinned chat composers visible simultaneously; separate drafts retained; existing canvas bands and connection lines preserved.
- Infinite-canvas browser checks: background drag moved camera X beyond 1000px; scrolling moved Y below -2000px; fit view recovered both groups. A 120×60px group drag at 62.17% zoom moved the group approximately 193×96.5 world units. Zoom and moved positions remained identical after chat/canvas switching. Space activated zoom/send buttons normally. Scrolling one room changed only its message scroll position, not the camera or other room. SVG start anchors matched their card edges to within 0.001px at the tested zoom.
- Infinite canvas at 390×844: page width remained 390px, the canvas stayed within its viewport and the navigation toolbar remained visible. This is a responsive-layout check, not a physical touch-device test. Viewport reset afterward.
- Browser: injected send failure displays an error and retains the draft; retry succeeds and clears it only after success.
- Browser: local multiline note saved, exact content previewed with a full SHA-256; restore of `valid-originals.json` adds an original without replacing the saved note. Corrupt archives are rejected in automated validation tests; the corrupt-file chooser flow was not separately exercised in the browser.
- Browser at 390×844: document width and scroll width both 390px; metrics columns both 179.5px; composer lies within the viewport (top 522px, bottom 656px). Rooms drawer is absent until explicitly opened and can be closed. Viewport reset afterward.
- Git diff whitespace checks pass. GitNexus overall change detection reports high aggregate risk across the expected chat/context/capture/proposal surfaces; individual pre-change impacts were low. This breadth merits staged review before deployment.

## Boundaries and activation blockers

1. **Authentication is not enforced.** Automatic approval review rejected first a shared owner-key design and then the subject-only wiring because they change the existing access boundary. No shared owner-key implementation remains. `convex/auth.ts` is an unwired proposal only; its tests are NOT evidence that public endpoints enforce it. Existing public prototype handlers remain anonymous. Do not deploy real business records or treat the current tier filters as user/workspace authorization.
2. Obtain explicit approval to require verified owner sign-in and deny anonymous access. This can lock out the existing anonymous prototype until its identity provider/client are configured. Then wire and test every public read/write, retrieval, context compilation, scheduled work, export and administrative path. Add workspace/principal isolation and negative cross-user tests before multi-user use. Do not promote fixture-mode flags into an authorization bypass.
3. Select and connect one live harness only after that boundary is verified. Hermes, Codex and Claude Code availability was inspected; no live harness was connected. Provider/model selection is not the same as sandboxing. Prove bounded tool permissions, cancellation, deadlines, approval suspension/resume, immutable context and idempotent completion with synthetic tasks first. Keep adapters modular.
4. Local originals currently use browser/desktop-webview IndexedDB, not a native watched filesystem. The archive is **unencrypted** and contains originals only, not the full Brain graph, chat, permissions, tasks or audit history. Clearing app data can remove local copies. Save exports privately. Same-content imports deduplicate by hash and retain the first stored name/kind. UI imports are capped at 1 MiB per original, 20 MiB per archive and 1000 archive entries.
5. Internal backend source exports use a separate `arkive-sources-v1` protocol, 256 KiB text sources and batches of at most 100. No bridge to the local-originals archive is claimed. Full Brain portability, native storage, encryption, sync, recovery, microphone/transcription and a packaged desktop release remain future work.
6. No live acceptance test has proved provider execution, hosted identity enforcement, cross-device sync, cryptographic signing, retrieval-level user permissions or desktop packaging. The current result is a refined, testable local implementation with explicit security gates—not the entire production platform.

Orbit persistence was unavailable due workspace quota exhaustion. This repository note is the durable handoff for this change set; no successful Orbit filing is claimed.
