# Arkive 002 — Step 1 stabilization handoff

Date: 2026-09-23  
Status: implemented and locally verified; not committed, pushed, or deployed.  
Scope: stabilize the existing prototype without redesigning the canvas or connecting a live provider.

## Outcome

Infinite, Radial 2c, and Multi-room 2d remain the three canvas views. They share room-scoped context, drafts, and action state. This pass repairs context correctness, manifest revocation, policy controls, draft retention, action feedback, and misleading capability labels. It does **not** make Arkive ready for private business data.

## Recovery checkpoint and change boundary

- Repository: `/Users/xela/Documents/GITHUB/arkive-002`.
- Starting branch/commit: `main` at `1e31c25eda24592885e276c149d3bb2ba4ae54d2`.
- The checkout already contained substantial uncommitted implementation work. Those changes were preserved, not reset or replaced.
- Before edits, a source-only checkpoint captured 96 files, file hashes, Git status, and the tracked patch at `/Users/xela/Documents/Codex/2026-08-17/referenced-chatgpt-conversation-this-is-an/output/step1-source-checkpoint-vhxl79/`.
- The checkpoint excludes credentials, environment files, dependency/build directories, and original datasets. It is a recovery copy, not a complete data backup or Git commit.
- No prior white papers were changed. No seed, cloud migration, provider connection, remote push, or deployment was performed.

## Implemented changes

### 1. One effective context per room

Context resolution now distinguishes these cases:

1. An explicitly selected manifest governs the request.
2. An explicit object selection replaces the room default. An empty selection stays empty; it does not reopen the default scope.
3. Otherwise, the room follows its saved manifest pointer.

Eligible sources still pass through the configured tier filter. A source's always-load flag cannot override exclusion. Accepted memory objects are eligible for retrieval. The `ask` mode fails closed until an actual approval path is implemented.

Vault add/remove actions update the active room's shared selection. Loading a saved manifest clears that room's temporary selection override only after the mutation succeeds. Other rooms and their drafts are unchanged. Graph scope saving receives the active room instead of hardcoding Hermes; unmapped demo nodes are not silently converted into real source permissions.

The graph renderer is still a prototype visualization. Its layout and connecting lines do not constitute authorization or a completed business knowledge graph.

### 2. Preview-to-send consistency

The context preview exposes a fingerprint of its effective manifest, object identity/content/path/tier bindings, and policy state. Chat and canvas sends include the fingerprint and wait for a valid loaded preview.

The backend revalidates it before writing the message or snapshot. A room pointer, source, membership, or policy change between preview and send fails the request with a visible error rather than silently using different context. Later source/policy changes also cancel queued simulated replies when their pinned references are no longer valid.

This is consistency checking, **not** cryptographic signing, identity verification, or endpoint authorization. The fingerprint argument remains optional for compatibility with existing callers; current UI send paths provide it. Future external clients need a stricter authenticated API contract.

### 3. Real manifest state transitions

- Revocation is now a persisted, audited mutation, not a local card label.
- Repeating revocation is idempotent and does not duplicate its audit entry.
- A room pointing to a revoked manifest stays blocked until a fresh scope is deliberately selected. Revocation never falls back to broader defaults.
- Loading/rollback rejects revoked, expired, missing, or invalid manifests.
- New scope records bind exact object IDs as well as hashes, paths, and tiers, preventing expansion to a different object that happens to share a hash.
- Existing legacy hash-based manifests and explicitly marked fixture-path manifests retain compatibility. Those legacy bindings are weaker and are not equivalent to the new object-bound records.
- Load/revoke controls await completion and display pending, success, and failure states.

Production durability follows the Convex mutation path in code; this turn tested it through handler-level state and re-query tests. No live Convex instance or cross-device persistence was verified.

### 4. Draft recovery

- Chat composer text is stored separately for each room and restored after reload.
- Capture keeps independent note and task text, plus its selected mode/title/routing draft fields.
- Cartridge builder drafts retain their step, templates, purpose, sources, guidance, and scope fields. Save/close and resume do not discard the draft.
- Failed sends retain text. A successful older submission cannot erase newer text typed while the submission was pending.
- Storage is bounded, versioned, and validated; corrupt, unknown-version, oversized, or unavailable storage produces a warning rather than silently inventing a valid draft.
- Pending operations, source selections, grants, or authority are never restored from draft storage.

These are unencrypted local browser drafts, not a backup, server sync, multi-tab collaboration, or a security boundary. Original-file storage/export remains a separate subsystem.

### 5. Policy and action feedback

- Policy re-enable sends the supported `include` value instead of the rejected `allow` value.
- Relevant policy/settings, grant/request, Library, manifest, and canvas pause controls now await mutations, guard duplicate clicks, and surface errors.
- Team revocation targets the selected grant ID, including when multiple grants share a principal.
- Shared grant status is attached to the actual selected row, not a global optimistic success flag.
- Canvas pause/resume uses shared model feedback in all three layouts.
- Connector text says “overlapping pinned references” instead of claiming that an agent is currently reading the selected manifest.
- On narrow screens the floating Rooms button no longer covers Capture's close control.

### 6. Truthful prototype boundaries

The app now makes the sample-data/simulated-agent boundary visible. Unconnected settings and controls are disabled or explicitly marked as previews. Labels distinguish saved configuration/metadata from working integrations.

In particular, this pass does not claim working authentication, per-user retrieval permissions, cryptographic signatures, keychain storage, encryption, relay pairing, filesystem watching, reindexing, cartridge publication/installation, microphone capture, transcription, live agent execution, or external sharing.

Grant and sharing records are prototype metadata, not enforced access control. The Vault “reindex” and desktop power controls are unavailable rather than running a fake scan. Source integrity and execution displays remain qualified by what the app has actually verified.

## Verification

All commands were run from `/Users/xela/Documents/GITHUB/arkive-002/app` unless noted.

| Check | Result |
| --- | --- |
| Baseline `npm test` before repairs | 37 passed |
| Final `npm test` | 64 passed; 0 failures |
| `npm run build` | Passed: application TypeScript and Vite production build |
| `./node_modules/.bin/tsc --noEmit -p convex/tsconfig.json` | Passed |
| `node tests/ui/run.mjs --build` | Passed: isolated fixture UI build |
| `git diff --check` from repository root | Passed |

Regression coverage includes exact context snapshots, cross-room isolation, explicit empty scope, persistent manifest revocation, invalid rollback, object/hash ambiguity, memory eligibility, policy exclusion, preview/send drift, queued-reply cancellation, duplicate actions, failed sends, per-room draft restoration, full cartridge draft serialization, storage failure, and pause failure/retry/pending behavior.

### Browser checks

The local preview at `http://127.0.0.1:1421/` was run using the isolated in-memory fixture entry point. Its banner identifies that it has no cloud/model connection. Browser checks covered:

- Chat draft recovery after reload and visibility in Infinite, Radial 2c, and Multi-room 2d.
- Independent Hermes and Xela drafts; injected send failure retained both; successful retry cleared only the submitted draft.
- Adding a curated source in Vault changed only Hermes to five explicit references. Loading its saved manifest returned it to four references and removed the temporary override.
- Revoking Hermes's saved manifest displayed zero usable references and disabled its send, while the other rooms retained their own four-reference scopes.
- Capture note and task drafts both recovered after reload.
- A cartridge draft resumed with its saved name, purpose, and builder step after reload.
- Canon policy exclude/include changed preview scope from four references to zero and back to four.
- Pause/resume updated the selected agent's simulated state.
- The Capture close button worked after the narrow-screen overlap fix; desktop canvas layout remained intact.

Only synthetic test text was entered. Test text was cleared; no original file was imported or private data registered. Browser reload deliberately resets the fixture database, so these checks are **not evidence of deployed backend persistence**. The fixture harness imports backend handlers in-browser and emits known Convex diagnostic warnings; a clean console is not claimed. No installer/native runtime or real network integration was tested in this turn.

## Code map

- Context/manifests: `app/convex/lib.ts`, `workspace.ts`, `chat.ts`, `ops.ts`, `schema.ts`.
- Shared room views: `app/src/RoomSession.tsx`, `RoomCanvasModel.ts`, `ChatPanel.tsx`, `RoomCanvasView.tsx`, `AlternateRoomCanvas.tsx`, `RoomsRail.tsx`, `hooks.ts`.
- Context controls: `app/src/GraphOverlay.tsx`, `VaultFiles.tsx`, `Manifests.tsx`, `Policies.tsx`, `Tray.tsx`.
- Drafts: `app/src/draftStorage.ts`, `useLocalDraft.ts`, `CaptureDock.tsx`, `Library.tsx`.
- Action feedback and truthful settings: `app/src/useMutationFeedback.ts`, `SettingsOverlay.tsx`, `Team.tsx`, `Shared.tsx`, `Shell.tsx`, `App.css`.
- Regression/fixture checks: `app/tests/backend.test.mjs`, `roomCanvasModel.test.mjs`, `ui/fixture.ts`, `ui/fixture.test.mjs`, `app/src/RoomSession.test.mjs`, `draftStorage.test.mjs`, `draftTestLoader.mjs`, and the package test command.

This map describes the stabilization work, not ownership of every diff against HEAD; the checkout contained earlier work at the start.

## Next gate — before private beta data

Step 1 is complete as a prototype stabilization pass. The next implementation gate is verified owner identity plus fail-closed authorization at every backend entry point, including discovery, graph expansion, retrieval, compilation, caches, citations, approvals, and execution. Team/grant metadata alone is insufficient.

After that gate, connect durable original-to-Brain registration and export/restore, then one bounded real harness/action with approval and receipts. Keep the current UI and three canvas views. Do not connect private business data or real autonomous actions merely because this prototype builds and its simulations pass.
