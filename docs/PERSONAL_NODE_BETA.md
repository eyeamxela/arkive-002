# Arkive Personal Node Beta

Arkive Personal adds an encrypted, portable Brain to the existing project without replacing the Clerk and Convex workspace or its canvas. Use this separate local mode to test source import, Graph and Files views, multiple source-scoped chats, reviewed memory, backup recovery and manual replication between trusted nodes.

This is a single-owner beta. A room's selected sources are a context filter, not a user permission boundary. Do not invite a team or expose a node publicly as though enterprise access control were complete.

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
3. Open Graph and Files. They display the same objects; graph lines represent explicit source relationships, not inferred knowledge.
4. Create two chats. Choose a different set of sources for each. Merely selecting a source does not send it to a provider.
5. Configure a model adapter if you want real replies. Confirm the per-request disclosure before sending. An unavailable provider stays unavailable; there is no simulated fallback.
6. Propose a memory from a source, then approve it in the Memory inbox. The approved memory becomes another Brain object with links to its sources.
7. Download an encrypted recovery bundle. Restore it into a separate empty node and inspect its contents before trusting it as your only backup.
8. Lock and reopen the Brain. Closing the native app asks the node to cancel active work and release its writer lock.

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

The current adapter sends the current user prompt and selected source revisions. It does **not** resend chat history. Source evidence is untrusted input. The model has no shell, filesystem or tool-execution capability through this adapter, and its replies are recorded as unverified model output. Stored references identify the context supplied, not proof that every generated claim is correct.

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

Replication requires an identical Brain ID established by restore. It transfers **all** source objects and their revision history, including previous content and source-path metadata. It does not transfer room messages, room source selections, pending proposals, local audit claims or filesystem grants. The sync credential can both read and merge this entire source replica; it is not a read-only or per-object grant. Revoke it by changing the server credential and restarting. Previously disclosed data cannot be recalled.

Fast-forward edits update the current head. Divergent edits retain both histories and produce unresolved conflict records. There is no automatic conflict winner or reconciliation editor yet. A failed push can follow a successful pull; inspect the resulting state and retry. Sync is idempotent for record identities, not a distributed atomic transaction, and it is not a scheduled background process.

## Limits and recovery

The beta stores one encrypted JSON repository, limited to 32 MiB of plaintext state. Individual source text is limited to 1 MiB. A folder scan processes at most 1,000 files, 16 MiB of text, 5,000 entries and 12 levels of recursion. Hidden files, common secret names, symlinks, hardlinked files and unsupported formats are skipped. This filtering cannot detect a password pasted into an ordinary note. Import only trusted folders; the importer is not an OS sandbox against a hostile process changing filesystem paths concurrently.

Deleting or renaming an original file does not delete the imported record. Refresh may revise an existing path; disappearance remains available for review. PDF, image, audio, automatic watching, OCR and semantic embedding retrieval are not implemented in this mode.

A crash or forced kill can leave `.brain.lock`. If that happens, first verify that no process is using this exact Brain directory and make a backup of the encrypted file. Only then move the stale lock aside and reopen. Never clear a lock while its writer is still alive. No automated force-unlock command is included.

At schema or size limits, mutations fail rather than silently dropping history. Keep multiple dated encrypted exports and test restores. This beta has no automatic remote backup, key rotation, secure erasure, audit pruning or retention engine.

## Module boundaries and next work

| Module | Current responsibility |
| --- | --- |
| `personal-node/brain.mjs` | Validated object/revision graph, encrypted persistence, room selections, reviewed memory and replica merge |
| `personal-node/folders.mjs` | Explicit read-only source-folder grants and bounded text import |
| `personal-node/execution.mjs` | Selected-context compilation and one real HTTP completion adapter |
| `personal-node/server.mjs` | Owner/peer authentication, lifecycle, API, encrypted export and manual sync |
| `personal-node/static.mjs` | Allowlisted public UI assets only; never a generic file server |
| `app/src/personal` | Separate local-first UI with Graph, Files, Memory inbox and multiple chats |
| `app/src-tauri/src/personal.rs` | Restricted native startup bridge, picker and bundled-process lifetime |

Keep the Brain independent of model and harness adapters. Next implementation gates are a conflict-resolution workflow, source-version-aware memory invalidation, scoped device pairing and credential rotation, then a real harness contract with cancellation and approval semantics. Telegram can then be a channel adapter with explicit user/chat allowlists, source grants and an outbound disclosure policy. It is not connected by this change.

Multi-user retrieval authorization, agent teams, unattended tools, droplet creation, P2P discovery, signed cartridges and multi-Brain reconciliation remain separate platform work. The existing cloud authorization implementation is preserved; its team guarantees do not automatically apply to this single-owner local service.

## Verification commands

From `app`:

```sh
npm test
npm run test:personal
npm run typecheck
npx --no-install tsc --noEmit -p convex/tsconfig.json
npm run build:personal
npm run build
```

The browser smoke test uses a synthetic Brain and mock loopback model endpoint. With Playwright installed, run `node tests/personal/smoke.mjs`; alternatively set `PLAYWRIGHT_MODULE` to a local Playwright module path. It does not call a real provider or inspect private files.

Native checks use `cargo check --offline` in `app/src-tauri`, followed by the personal bundle build. Passing source, mock-service and browser checks does not verify a provider account, a public TLS deployment, a running droplet or external message delivery.
