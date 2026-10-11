# Arkive Personal Node Beta

Arkive Personal combines the original workspace concepts with the cleaner Personal interface and an encrypted, portable Brain. Chat, Infinite/Radial/Multi-room canvases, Brain views, Work, agent profiles, context presets, collections, source sync, memory review and audit now share one local node. The legacy Clerk and Convex entry point is preserved for comparison; it is not the desktop beta's data provider.

Read [Unified workspace](UNIFIED_WORKSPACE.md) for the feature map, storage boundaries and the correct launch path. Existing cloud or browser-vault data is not automatically migrated.

This beta has one administering owner and optional, separately credentialed room members. A room's selected sources remain a context filter; independent server-enforced grants control member access. Read [Room governance and agent activity](ROOM_GOVERNANCE_BETA.md) before sharing. This is not enterprise SSO or a public hosting service; do not expose a node publicly as though those release gates were complete.

## Start on this Mac

From this checkout's `app` directory:

```sh
npm run desktop:personal
```

The macOS app starts its own bundled Node runtime on an ephemeral loopback port. The local owner credential travels through a window-restricted native command and stays in memory. Create a Brain with a unique passphrase of at least 12 characters. There is no password-reset service. Keep the passphrase separately from backups.

For an application bundle:

```sh
npm run bundle:personal
```

The result is `app/src-tauri/target/release/bundle/macos/Arkive Personal.app`. This is a local development build, not a signed and notarized public release. Build preparation copies the installed Node executable for the current platform and architecture; cross-platform builds and public runtime redistribution are separate release tasks.

Tauri stores this mode's Brain in its application-data directory under the identifier `earth.xela.arkive.personal`, in a `brain` subdirectory. It does not read or migrate the old browser vault automatically.

## First test session

1. Create a Brain. Personal, creator and business are starting labels stored on the same schema, not preconfigured employee roles or autonomous teams.
2. Add a note or choose a specific folder containing safe Markdown and text files. Folder import is read-only and refresh is manual. Do not start with a home directory or a folder containing secrets.
3. Open Brain → Obsidian and Files. They display the same note objects; graph lines represent actual wiki-links, relative Markdown links and explicit source relationships, not inferred knowledge. GitNexus is a separate code-graph snapshot view. Freeform arranges real objects; Timeline uses their stored revision dates.
4. Create two chats. Choose a different set of sources for each. Switch to Canvas to compare them in Infinite, Radial or Multi-room layouts. Merely selecting a source or moving a card does not send it to a provider.
5. Configure a model adapter if you want real replies. Confirm the per-request disclosure before sending. An unavailable provider stays unavailable; there is no simulated fallback.
6. Propose a memory from a source, then approve it in the Memory inbox. The approved memory becomes another Brain object with links to its sources.
7. Download an encrypted recovery bundle. Restore it into a separate empty node and inspect its contents before trusting it as your only backup.
8. Lock and reopen the Brain. Closing the native app asks the node to cancel active work and release its writer lock.

For vault connections, GitHub read sync, reviewed writes and code graph import, follow [Sources and graph views](PERSONAL_SOURCES_AND_GRAPHS.md). Source writes require a preview and explicit confirmation; folder refresh remains read-only.

## Local browser and model configuration

The service runs directly on Node 22 or newer without application dependencies. Set `ARKIVE_TOKEN` to a random owner credential of at least 32 characters; never paste a real credential into chat, source code or a URL. Set `ARKIVE_PORT=4317`, then run `npm run node:personal` from `app`. In another terminal, use `npm run dev:personal` and open `http://127.0.0.1:1420/local.html`. Enter the loopback node URL and owner token in the interface.

The adapter reads these environment variables on node startup:

| Variable | Purpose |
| --- | --- |
| `ARKIVE_BRAIN_DIR` | Explicit private storage directory; defaults to the current user's `.arkive/brain` for the headless CLI |
| `ARKIVE_TOKEN` | Owner credential; full access to this node once its Brain is unlocked |
| `ARKIVE_SYNC_TOKEN` | Separate credential restricted to source and revision replication |
| `ARKIVE_MODEL_BASE_URL` | OpenAI-compatible API base, such as a configured local endpoint ending in `/v1` |
| `ARKIVE_MODEL` | Exact model ID understood by that endpoint |
| `ARKIVE_MODEL_API_KEY` | Optional provider credential; remains on the node |
| `ARKIVE_ALLOWED_ORIGINS` | Comma-separated exact browser origins; no wildcard |
| `ARKIVE_UI_DIR` | Optional path to the compiled `app/dist-personal` assets for same-origin browser access |

Remote API endpoints require HTTPS and a public address. HTTP is allowed only for loopback development. Private network and metadata addresses are rejected by the outbound adapter; this beta does not have a private-network exception registry.

The current adapter sends the current user prompt and permitted selected source revisions. It does **not** resend chat history. Room layers, profile scope, pinned manifests and active members are checked before execution. Participants submit requests for owner approval; readers cannot submit. Source evidence is untrusted input. The model has no shell, filesystem or tool-execution capability through this adapter, and its replies are recorded as unverified model output. Durable run receipts identify exact inputs and outcomes, not proof that every generated claim is correct.

Hermes is displayed as unavailable until a real harness adapter is implemented and connected. Selecting an OpenAI-compatible model does not imply that Hermes, Claude Code or Codex tool execution is integrated.

## Personal server and phone access

The same node service can run on a personal server and serve the responsive browser UI. `personal-node/Dockerfile`, `compose.yaml`, `.env.personal.example` and `Caddyfile.example` are deployment preparation, not a created droplet.

Before activating a server:

1. Choose the host, region, domain, budget and backup destination. Provisioning incurs cost and needs an explicit operator decision.
2. Review and pin the container base image to a digest. Build and scan the image. The container runs as a non-root user, has no source-folder mounts, and publishes its HTTP port only to the host's loopback interface.
3. Copy `.env.personal.example` to repository-root `.env.personal`; enter separate random owner and sync credentials and the exact HTTPS origin. Restrict file permissions to the owner. Never store the Brain passphrase there by default.
4. Configure a TLS reverse proxy on the host using the example, with DNS and firewall rules for the chosen domain. Never expose port 4317 directly to the internet.
5. Build and start the reviewed configuration with `docker compose -f personal-node/compose.yaml up -d --build` only after these choices are approved. Do not run `down -v`: it removes the persistent Brain volume.
6. Open the HTTPS URL from a browser. Enter the server owner token. Restore the desktop's encrypted recovery bundle into the empty server, using its original passphrase. Recovery preserves Brain identity but deliberately clears folder grants.
7. On desktop, use Personal node → Sync with the server URL and its **sync** credential. Pair only a node trusted to read every source and revision in this Brain.

The phone browser accesses the server's stored replica, not an offline laptop's live filesystem. A running, unlocked server can answer while the desktop is closed. Desktop viewing, importing and editing work without network access; remote model calls, replication and phone access still require a network. There is no mobile offline cache or service worker in this beta.

The server starts locked after restart unless explicitly given `ARKIVE_BRAIN_PASSPHRASE`. Persisting that environment value weakens separation between the encrypted data and its unlock secret; manual unlock is the default. A passphrase supplied in the browser crosses the TLS connection and is held in the trusted server's memory. This is not a blind, end-to-end encrypted storage relay.

## Storage and replication contract

```text
Chosen folders / authored notes
              |
              v
     Encrypted local Brain
     objects + revision graph
       /                 \
 Graph / Files        Selected chat context
       |                    |
 memory proposal      approved model request
       |
 human review -> memory object

 encrypted recovery bundle -> empty trusted server
              |
              v
 manual authenticated source/revision sync
              |
              v
 server Brain -> phone browser
```

Logical object IDs and revision IDs are separate. Revisions contain parent IDs and SHA-256 checksums. These detect corruption and conflicting history; they are not author signatures, blockchain finality or proof of identity.

The Brain file uses AES-256-GCM and a passphrase-derived scrypt key. Atomic replacement, private file permissions and a single-writer lock protect normal local writes. Secrets and plaintext are still readable to a sufficiently privileged process while the node is unlocked. JavaScript strings cannot be reliably zeroized.

Replication requires an identical Brain ID established by restore. It transfers **all** source objects and their revision history, including previous content and source-path metadata. It does not transfer room messages, room source selections, pending proposals, tasks, profiles, presets, collections, local audit claims or filesystem grants. These workspace records are retained in encrypted recovery exports, but excluded from peer replication. The sync credential can both read and merge this entire source replica; it is not a read-only or per-object grant. Revoke it by changing the server credential and restarting. Previously disclosed data cannot be recalled.

Fast-forward edits update the current head. Divergent edits retain both histories and produce unresolved conflict records. There is no automatic conflict winner or reconciliation editor yet. A failed push can follow a successful pull; inspect the resulting state and retry. Sync is idempotent for record identities, not a distributed atomic transaction, and it is not a scheduled background process.

## Limits and recovery

The beta stores one encrypted JSON repository, limited to **128 MiB of plaintext state**, 10,000 objects and 50,000 revisions. Current text, immutable history, chat and other metadata all consume this capacity; 128 MiB is not a source-file allowance. Encrypted local files allow 180 MiB and recovery/sync transport allows 192 MiB to accommodate encoding overhead. The encryption and version-one data format are unchanged; existing Brains open without a migration. An older application may not open a Brain that has grown beyond its previous limit.

Folder refresh traverses the entire selected folder tree, with no aggregate 1,000-file, 16 MiB, 5,000-entry or 12-level scan cutoff. It commits batches of at most **100 files or 4 MiB of text**. Markdown (`.md`, `.markdown`) and `.txt` files must be valid UTF-8 and at most 1 MiB each. Hidden files, common secret names, symlinks, hardlinked files and unsupported formats remain excluded and are counted by reason. This filtering cannot detect a password pasted into an ordinary note. Import only trusted folders; the importer is not an OS sandbox against a hostile process changing filesystem paths concurrently.

Use the folder refresh control or **Sources & sync → Read updates**. The scan panel shows entries checked, eligible files, new/changed records, unchanged records, skipped entries and committed batches. **Cancel scan** stops further traversal; a batch already committing may finish. Completed batches remain saved. A stopped or failed scan is explicitly partial and does not replace the last completed scan timestamp/count. Retry starts traversal again, retaining identities and immutable history; unchanged batches do not rewrite encrypted storage. Refreshing the page header reloads the cached Brain, not the source folders.

If storage or a directory cannot be read safely, the scan stops and reports its durable progress rather than claiming full success. An individual unreadable, changed-during-read or excluded file is counted as skipped; check the reason counts even after a completed traversal. Ambiguous duplicate source paths require review rather than silent deduplication. Disconnecting the scan request stops it, and locking clears its session-only progress. Scan status and cancellation are owner-only controls; connecting a folder does not grant room members access to all its notes.

Deleting or renaming an original file does not delete the imported record. Refresh may revise an existing path; disappearance remains available for review. PDF, image, audio, automatic watching, OCR and semantic embedding retrieval are not implemented in this mode.

A crash or forced kill can leave `.brain.lock`. If that happens, first verify that no process is using this exact Brain directory and make a backup of the encrypted file. Only then move the stale lock aside and reopen. Never clear a lock while its writer is still alive. No automated force-unlock command is included.

At schema or size limits, mutations fail rather than silently dropping history. Keep multiple dated encrypted exports and test restores. This beta has no automatic remote backup, key rotation, secure erasure, audit pruning or retention engine.

## Module boundaries and next work

| Module | Current responsibility |
| --- | --- |
| `personal-node/brain.mjs` | Validated object/revision graph, encrypted persistence, room selections, reviewed memory and replica merge |
| `personal-node/folders.mjs` | Explicit read-only source-folder grants, full traversal and atomic bounded text batches |
| `personal-node/limits.mjs` | Shared Brain, encrypted-file, recovery/sync, agent-admission and folder-batch capacities |
| `personal-node/github.mjs` | Pinned GitHub Markdown snapshots and optimistic-concurrency file commits |
| `personal-node/writeback.mjs` | Reviewed local file replacement with containment and stale-source checks |
| `personal-node/sources.mjs` | Request-scoped credentials and expiring, single-use write approvals |
| `personal-node/codegraph.mjs` | Bounded read-only GitNexus export and portable code-graph validation |
| `personal-node/execution.mjs` | Selected-context compilation and one real HTTP completion adapter |
| `personal-node/server.mjs` | Owner/member/peer authentication, lifecycle, API, encrypted export and manual sync |
| `personal-node/governance.mjs` | Room membership, source/layer boundaries, pinned manifests and actual execution receipts |
| `personal-node/static.mjs` | Allowlisted public UI assets only; never a generic file server |
| `personal-node/workspace.mjs` | Strict task, agent-profile, context-preset and collection metadata; no execution authority |
| `app/src/personal` | Unified clean workspace, shared chat/canvas session, Brain views, Work, profiles, presets, collections and audit |
| `app/src-tauri/src/personal.rs` | Restricted native startup bridge, picker and bundled-process lifetime |

Keep the Brain independent of model and harness adapters. Next implementation gates are a conflict-resolution workflow, source-version-aware memory invalidation, scoped device pairing and credential rotation, then a real harness contract with cancellation and approval semantics. Telegram can then be a channel adapter with explicit user/chat allowlists, source grants and an outbound disclosure policy. It is not connected by this change.

The local service now enforces scoped member reads and owner-approved member requests. Verified identities, enterprise teams, unattended tools, droplet creation, P2P discovery, signed cartridges and multi-Brain reconciliation remain separate platform work. The existing cloud authorization implementation is preserved; its account and team guarantees do not automatically apply to local bearer credentials.

## Verification commands

From `app`:

```sh
npm test
npm run test:personal
node --test tests/personal/*.test.mjs
npm run typecheck
npx --no-install tsc --noEmit -p convex/tsconfig.json
npm run build:personal
npm run build
```

The browser smoke test uses a synthetic Brain and mock loopback model endpoint. With Playwright installed, run `node tests/personal/smoke.mjs`; alternatively set `PLAYWRIGHT_MODULE` to a local Playwright module path. It does not call a real provider or inspect private files.

Native checks use `cargo check --offline` in `app/src-tauri`, followed by the personal bundle build. Passing source, mock-service and browser checks does not verify a provider account, a public TLS deployment, a running droplet or external message delivery.
