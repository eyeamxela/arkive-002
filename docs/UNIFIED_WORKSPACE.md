# Arkive unified workspace

The desktop beta brings the original Arkive workspace concepts into the cleaner Personal interface. One encrypted node supplies the conversations, source objects, reviewed memories, tasks and saved context. Changing a view does not change the underlying Brain.

## Open the unified beta

Use this worktree, not the original comparison checkout:

`/Users/xela/Documents/Codex/2026-08-17/referenced-chatgpt-conversation-this-is-an/arkive-personal-node`

From its `app` directory, run `npm run desktop:personal`. The macOS bundle is produced by `npm run bundle:personal` at `app/src-tauri/target/release/bundle/macos/Arkive Personal.app`.

For a browser, start the authenticated node as described in [Personal node setup](PERSONAL_NODE_BETA.md), then run `npm run dev:personal`. Both the Personal development root and `/local.html` serve the unified interface. The generic `npm run dev` / `index.html` cloud entry remains the legacy comparison application. The native Personal configuration explicitly selects `local.html`.

No Clerk or Convex project is required for the Personal beta. No old cloud records, browser drafts or vault content are silently imported. A separate, reviewed migration is needed if those records should become part of this Brain.

## What each area does

| Area | Working behavior | Boundary |
| --- | --- | --- |
| Chat | Create independent rooms; select exact Brain sources; read actual transcripts; send through the configured completion adapter | External requests require consent; no simulated fallback or tool execution |
| Canvas | Infinite, Radial and Multi-room presentations of the same room records; pan, zoom, move and choose visible rooms | Camera and draft state stay in memory; visual connectors are presentation, not new graph edges or permissions |
| Brain | Obsidian-style linked-note graph, GitNexus code snapshots, Files, Freeform object canvas and revision Timeline | Graphs use recorded relationships; code snapshots are bounded and separate from note links |
| Capture | Create and edit local notes, preserving revisions; import standalone UTF-8 Markdown/text copies up to 1 MiB | Connected files require Sources & sync write preview; uploaded copies do not establish sync; voice/audio/transcription are not connected |
| Memory inbox | Propose source-backed knowledge and explicitly accept or reject it | No conversation or generated answer silently becomes approved memory |
| Work | Create/edit tasks, attach sources, assign a saved profile and change Board/List status | Assignment and Done status do not execute an agent or certify a result |
| Agents | Save provider/source profiles and open a prepared chat; inspect actual assistant responses | Profiles are not independent principals or autonomous teams; descriptions are metadata, not model instructions |
| Context presets | Save named source sets and explicitly apply them to a room or new chat | These are unsigned manifests following current revisions, not signed/pinned authorization bundles |
| Library | Save source collections and open them as context | No cartridge installation, publishing, paid marketplace or behavior injection |
| Sources and sync | Folder/Obsidian read refresh, GitHub snapshots, exact reviewed source writes, code graph imports | No automatic file watcher or unattended writes; existing adapter restrictions remain |
| Policies | Inspect the single-owner, disclosure, review and encryption boundaries | Room source selection is not multi-user access control |
| Shared | Explain current privacy and recovery boundaries; navigate to export/recovery | Team invitations and public sharing are not enabled |
| Audit | Search actual node events, inspect metadata and open linked records | No synthetic activity, author signatures or tamper-proof ledger claim |
| Personal node | Inspect adapters, manual trusted-node replication, conflicts, encrypted export and recovery | Hermes, channels, unattended tools and droplet provisioning remain unconnected |

The previous fixture-only voice recorder, workflow timer, hardcoded agent hierarchy and fake installation controls are not represented as working services.

The old cloud include/ask/exclude tiers and always-load metadata are not silently transferred. This beta starts every room with explicit source selection instead of automatic preload. Legacy originals-only JSON migration remains a separate reviewed operation; old browser originals are preserved, not automatically copied.

## State and authority

Chat drafts, provider choices, canvas positions and cameras live only in the mounted React session. They survive presentation changes but not locking, closing or reloading the app. Tokens, passphrases and private drafts are not written to browser storage. A remote lock is detected on the next node refresh or action; this beta has no idle push notification.

Rooms, transcripts, source selections, proposals and workspace records live in the encrypted Brain. Old Brains without a `workspace` field receive an empty projection until the first workspace mutation. Saved categories are tasks, agents, manifests and collections. Each mutation validates source IDs and server-owned timestamps and records an audit event.

Encrypted recovery exports retain these records. Peer replicas deliberately omit them and cannot override the destination's local profile, task, preset or collection choices. Source/revision replication is not full workspace synchronization. Upgrade all cooperating node binaries before exchanging data that uses the extended optional schema; older binaries may reject fields they do not recognize.

Context presets replace a room's source list only on an explicit user action. Object-canvas selection adds chosen IDs to the selected room only when the user presses Use in chat. Neither operation sends a model request. Per-request external consent is tied to the message, room, provider and selected revision identities.

## Module handoff

- `PersonalApp.tsx` owns connection/unlock/lock, root navigation, Brain operations and shared API feedback.
- `ChatWorkspace.tsx` owns room presentation, draft/provider/consent state and real chat actions.
- `SpatialCanvas.tsx` reuses the original tested camera math without importing the cloud provider or unencrypted draft storage.
- `ObjectCanvas.tsx` projects real Brain objects into Freeform and Timeline.
- `WorkspacePanels.tsx` provides Work, profiles, presets, collections, Policies, Shared and Audit.
- `personal-node/workspace.mjs` validates organization metadata. `brain.mjs` persists it transactionally; `server.mjs` exposes owner-authenticated upserts.
- `BrainGraph`, `CodeGraph` and `SourcesPanel` retain the source and graph work from the previous beta.

The canonical checkout and existing white papers are preserved. This is a local beta integration, not a deployment or proof of live provider credentials.

## Release checks

Run the original application tests, Personal service/model tests, TypeScript, both production builds, browser smoke and focused graph browser checks before bundling. Use synthetic temporary Brains and a loopback mock model for automated browser tests. The verification record lists actual results and explicitly separates them from untested live providers, user folders and cloud deployment.

Before using the beta with valuable information, create a small non-sensitive Brain, make and restore an encrypted backup, connect an intentionally limited folder, and configure a model endpoint only when ready to authorize a test request.
