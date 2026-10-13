# Hermes and Arkive capability audit

13 October 2026. Product and implementation assessment for Arkive Personal Node.

## Recommendation

Keep Arkive's interface, rooms, canvas, file organization and permissioned Brain. Add Hermes as the first fully functional execution adapter behind Arkive's Execution Router. Do not replace the Brain with Hermes memory or replace Arkive's interface with the Hermes desktop application.

The missing layer is not another settings screen. It is the connection between an authorized room and a durable agent session that can stream progress, request permission, use tools, create outputs and continue on a server. Settings should configure that layer; they cannot substitute for it.

Hermes is the functional reference for chat and execution. Arkive remains the authority for which information, users and actions are allowed. Keep model, harness, execution node and communication channel separate so Hermes is the first adapter, not a permanent dependency of every product feature.

## Evidence and limits

The installed Hermes application reports build commit `63d0b94120027d487c9a5235b9ec64b696af1b26`, built at `2026-10-13T07:39:16.463Z`. The local Hermes source checkout has the same HEAD. The installed bundle reports version `0.0.0`, so the commit is the useful version identifier.

Hermes was listed as running. Native inspection repeatedly failed with attachment timeouts and a stale `com.nousresearch.hermes.setup` identifier, even though the installed bundle and running inventory identify `com.nousresearch.hermes`. Consequently, this is an installed-build source and architecture audit, **not a completed interactive walkthrough or verification of the user's connected accounts**. No live chat was sent, job executed, secret read, gateway restarted or configuration changed. Visual interaction, live connection health and configured-provider behavior remain unverified.

Arkive findings refer to the current `arkive-personal-node` worktree, including its uncommitted Settings implementation, rather than the older Clerk/Convex application. GitNexus symbol context and direct source inspection confirmed the execution path; its full-text search was unavailable because its database was read-only. No app code was changed for this audit.

## Capability comparison

| Area | Hermes in the matching source build | Arkive now | Required Arkive work |
|---|---|---|---|
| Chat | Persistent sessions, streaming text, tool activity, prompt queues, stop/steer, attachments, context usage and preview panes | Saved rooms and transcripts, explicit source selection, pinned requests and final text responses | Runtime session binding, event stream, multi-turn policy, queue, stop and approval cards |
| Parallel work | Tabs, panes, multiple windows and live subagent activity | Multiple room views and infinite/radial canvas; saved agent profiles | Bind each tile to its own runtime session and durable run, not a global connection |
| Models | Provider accounts/keys, custom API modes, per-session selection, defaults, fallback and auxiliary model settings | One OpenAI-compatible endpoint/model; encrypted key; optional generation parameters; model-list check | Multiple profiles, protocol and model capability discovery, explicit fallback and egress controls |
| Capabilities | Skills, Tools, Connectors and Plugins; MCP configuration, health and logs | No executable capability registry or tool bridge | Versioned catalog, trust review, scopes, dependency health, approval enforcement |
| Messaging | Channel configuration, enablement, tests, sender allowlists and pairing; Telegram onboarding | Channels labelled unavailable | Channel identity to Arkive member/room mapping; separate send permission and delivery history |
| Artifacts | Searchable images/files/links derived from recent session output; origin-chat links and remote-file handling | Brain sources, notes, files and previews, but no runtime-generated artifact pipeline | Explicit output registration with run provenance, scoped storage, safe previews and filing |
| Scheduled jobs | Create/edit/pause/resume/trigger, run history, delivery targets and model pinning | Planner templates materialize tasks when a date is opened | Durable scheduler, execution ownership, timezone and missed-run rules, unattended policy |
| Gateways | Named local, remote, SSH and Cloud connections; profile routing and HTTP/WebSocket checks | Personal Node connection and explicit source replication | Runtime connection registry, secret references, capability handshake and reconnect logic |
| Memory | Runtime memory, skills and context/compression settings, learned-memory graph | User-owned Brain, source revisions, memory proposals, Canon separation, room/member scopes | Controlled retrieval adapter; prevent independent runtime memory from bypassing Arkive |
| Agent profiles | Profiles configure runtime behavior and own sessions/capabilities | Profiles save provider/source choices; descriptions are organizational metadata | Separate reviewed instructions from factual sources; bind execution policy and runtime identity |
| Git and files | Terminal/file browser, worktrees and review/commit/PR surfaces | Source imports and reviewed writeback; separate note/code graphs | Staged execution workspace, reviewed diffs and explicit external-write approvals |
| Voice | Dictation, voice conversation and speech controls | Not implemented | Recording consent, transcription route, retention and tool access policy |
| Operations | Runtime lifecycle, connection health, versions and diagnostics | Local packaged node, status/audit and manual rebuild | Service supervision, diagnostics, worker recovery and compatibility checks |

Hermes evidence: [desktop guide](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/website/docs/user-guide/desktop.md), [gateway guide](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/website/docs/user-guide/multi-connection-desktop.md), and the exact source paths in the appendix. Arkive evidence: execution, governance, ChatWorkspace, SettingsWorkspace, WorkspacePanels and planner modules listed below. Source presence does not prove any particular integration is configured on this computer.

## How Hermes chat actually works

Hermes Desktop is an Electron/React client of the same agent runtime used by its other surfaces. The desktop starts or connects to `hermes serve` and communicates with the `tui_gateway` JSON-RPC/WebSocket interface. It does not run a terminal UI inside a chat-shaped wrapper. Local backend pooling is scoped by connection and profile.

The interaction has three separate parts:

1. **Session control:** create, resume, inspect history, submit a prompt, interrupt, steer, branch or compress a conversation.
2. **Event delivery:** text deltas, completed messages, tool starts/completions, lifecycle changes and errors update the visible chat.
3. **Human decisions:** the backend can ask the client for approvals and clarifications. These are requests that must be answered or explicitly rejected, not decorative event messages.

The programmatic guide requires WebSocket hosts that support server requests to advertise `client.capabilities` with `server_requests: true`. Unsupported methods must fail explicitly. Reconnects can recover in-flight text and open requests; answering a withdrawn or expired prompt must not authorize later work. See [programmatic integration](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/website/docs/developer-guide/programmatic-integration.md).

For Arkive, preserve the multiple-chat canvas and folder context picker. Add an effective configuration strip to each room: **Brain scope · Agent · Runtime · Node · Model**. The right inspector should offer **Context, Activity, Outputs and Approvals**. Tool progress belongs in compact expandable rows; generated files should open beside the conversation. A canvas tile and the full chat must render the same session state.

Arkive currently stores conversation messages but sends only the current prompt and compiled source evidence to the model. Prior assistant text is deliberately omitted because it might contain a source that was subsequently excluded. Real multi-turn behavior therefore needs a policy-aware history design, not simply “send every old message.” On scope changes, create a fresh runtime session or reconstruct a history whose dependencies are still authorized. Existing disclosure cannot be undone after a provider receives it.

## Messaging and gateway management

A **runtime connection** tells Arkive where the agent executes. A **messaging channel** tells it where a person communicates. A **replica connection** determines where approved Brain data is copied. These are three different permissions and should never be represented by one switch.

Hermes's desktop connection registry supports local runtimes, remote URLs, SSH and Cloud-discovered instances. It distinguishes connection identity from profile identity and stamps sessions with their owning route. Its desktop uses `hermes serve`; external messaging uses a separate gateway process. An SSH connection can start a dashboard through its tunnel, but that is not the same as provisioning a DigitalOcean server.

Arkive should expose a clear two-part page under **Settings → Runtime connections**: registered runtimes and connection diagnostics. Each entry needs a name, adapter, endpoint/transport, authentication reference, target profile, version, capability report and last health result. A healthy HTTP response alone is not sufficient: verify the event transport and session permissions too. A test that sends a model request must disclose that it can incur cost.

Under **Settings → Messaging**, configure channel credentials separately from allowed senders. Pair an external account to an Arkive member and permitted room. Receiving a Telegram message must not make the sender the owner; group membership must not automatically grant Brain access. Delivery also needs an explicit destination and audience check. Show saved, enabled, connected and restart-required as distinct states.

For the first beta, choose one channel after local chat is safe. Keep the channel service behind Arkive's authorization path; direct Telegram-to-Hermes execution that bypasses Arkive would invalidate the room policy design.

## Capabilities and execution boundaries

Hermes's Capabilities page separates instruction packages, executable tools, external connectors and plugins. Its scope selector targets a specific connection/profile pair. Arkive needs the same clarity, with stronger links to room permissions:

- **Skills:** instructions and supporting resources, with source, version and review status. Installing a skill does not grant its requested tools.
- **Tools:** executable operations with read/write/execute/network effects, schemas and exact permission requirements.
- **Connectors and MCP:** server identity, transport, secret references, discovered tools, health and permitted accounts/resources.
- **Plugins:** packages that may add code and UI; treat installation as a separate trust decision.

Effective access should be the intersection of workspace policy, room scope, user grants, agent policy, node containment and per-run approval. Child agents may narrow this set but never widen it. A task marked complete or an agent profile selected is not permission to send messages, run shell commands or write files.

**Critical integration warning:** Hermes documents that its OpenAI-compatible endpoint retains its toolset, memory and core system instructions when a frontend adds instructions. Arkive's current prompt saying that the assistant has no tools is not an enforcement boundary on such an endpoint. Do not connect the user's broadly configured Hermes profile through Arkive's existing plain-model field and call it safe. Use a dedicated, restricted runtime environment and validate the actual tools, memory providers, filesystem mounts, environment variables and outbound connections. See [API server behavior](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/website/docs/user-guide/features/api-server.md).

Profiles separate configuration and session ownership; they should not be treated as sufficient OS-level containment for mutually untrusted business users. No global YOLO toggle should bypass Arkive's mandatory policies. Even sandboxed execution needs network, credential and mounted-directory boundaries.

## Artifacts and Brain filing

Hermes collects images, files and links from session output and provides a route back to the producing conversation. Its inspected gallery scans recent sessions, so it should not be mistaken for a complete durable document-management system.

Arkive can make this capability part of its file organization without duplicating it. Introduce an output record referencing the existing BrainObject system, with originating run/session, parent source revisions, MIME type, content hash, producing node, storage reference, creation time, audience and review state. Keep the bytes in scoped storage; keep permission and provenance metadata in Arkive.

Use an **Outputs** view with Arkive's stacked-folder treatment, search, filters and preview rail. Actions should include Open chat, File in folder, Attach to room, Create task and Propose memory. Filing is organizational; promoting to Canon remains a separate review. Editing or overwriting an output creates a new revision rather than changing historical evidence.

Remote paths must resolve on the originating node, never accidentally against the desktop's filesystem. HTML, SVG and executable outputs require isolated previews; plain links must not automatically become trusted code or browser automation targets. The runtime must not be allowed to register arbitrary private host paths as downloadable artifacts.

## Scheduled jobs and the planner

Keep **to-dos**, **recurring task templates**, and **agent jobs** as separate objects. The calendar may display them together, but checking a to-do is not approving an agent action, and opening a planner date must not execute a job.

Hermes has real cron execution, run history and configured delivery targets. Its inspected desktop editor exposes name, prompt, schedule, delivery and optional provider/model pins; the runtime supports additional controls, including skills and script-only jobs. Do not assume every runtime option is editable in that screen.

Arkive jobs need an owning user/room, runtime/node/profile binding, schedule and timezone, source-selection policy, tool policy, model policy, limits, delivery target and audit trail. Decide whether a job uses pinned source revisions or recompiles the latest authorized sources at each occurrence. Recheck grants at dispatch and delivery. Revocation must stop future disclosure, even if the job was approved weeks earlier.

Use one scheduling authority per job. If Hermes supplies the timer, it must dispatch through an Arkive-controlled authorization boundary; if Arkive supplies the timer, it submits an authorized run to Hermes. Never activate both schedulers for the same job. Add occurrence IDs, leases, idempotency, no-overlap defaults, missed-run handling and bounded retries. External side effects need their own idempotency records; a model timeout does not prove an email or write failed.

When the desktop sleeps, local jobs cannot reliably run. An always-on droplet worker can run them, but unattended decryption and credential custody require an explicit design. Do not silently copy the complete Brain or store its passphrase on the worker. Prefer scoped data access and narrowly granted job capabilities. See [Hermes scheduled tasks](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/website/docs/user-guide/features/cron.md).

## Settings structure for Arkive

Keep Arkive's charcoal, sage, paper and mustard palette, restrained typography, folder colors and canvas. Use a stable settings sidebar and a visible **Applies to** control showing the actual Brain, agent or node being edited. Operational objects belong in main navigation; Settings configures them.

| Settings section | Parameters to expose | Scope and defaults |
|---|---|---|
| Models and providers | Provider, credential reference, endpoint, API mode, model, supported reasoning/output controls, timeout, optional fallbacks and auxiliary models | Node-stored secrets; explicit profile defaults; session overrides cannot expand egress permission |
| Runtime connections | Adapter, connection kind, URL or local runtime, target profile, authentication, version/capabilities, health and reconnect | Named node/connection; never imply copying the Brain |
| Agent configuration | Reviewed instructions, model policy, harness, node, tool allowlist, source policy, turn/time/cost/concurrency limits | Agent version plus per-run snapshot; children inherit restricted grants |
| Capabilities | Skills, Tools, Connectors/MCP and Plugins; provenance, versions, trust, account bindings and diagnostics | Explicit agent and runtime scope; disabled until requirements are met |
| Memory and context | Brain/namespace, room folders and sources, memory layers, retrieval budget, history/compression policy, proposal policy | Arkive governs; compression and auxiliary models obey the same data policy |
| Safety and approvals | Filesystem boundaries, write preview, shell/network policy, action classes, approver, expiration and unattended behavior | Deny by default for unapproved actions; no silent timeout approval |
| Messaging | Platform, bot/account credential, sender allowlist/pairing, member-room mapping, attachment rules, delivery destination | Separate ingress and egress; unknown senders cannot execute |
| Jobs | Scheduler ownership, timezone, retry/overlap defaults, missed runs, node availability, notification policy | Per-job effective settings remain visible and auditable |
| Files and outputs | Source roots, staging root, artifact retention, preview policy, filing rules, remote downloads | Preserve original vault layout; source-write approval remains separate |
| Nodes and recovery | Brain replica policy, backup/export, retention, device revocation, worker health | Distinct from runtime authentication and provider credentials |
| Voice and notifications | Microphone consent, STT/TTS route, recording retention, per-event alerts and quiet hours | Initially unavailable until working adapters exist |
| Appearance and diagnostics | Density, motion, shortcuts, pane preferences, adapter/runtime versions, redacted logs | Device-local appearance; no secret or private prompt leakage in diagnostics |

Hermes's concrete settings schema groups include `model`, `model_context_length`, `agent.reasoning_effort`, `fallback_providers`, `auxiliary.*`, `terminal.cwd`, `approvals.*`, `memory.*`, `context.*`, `compression.*`, `stt.*`, `tts.*`, `agent.max_turns` and `agent.api_max_retries`. These are adapter-specific inputs, not a schema Arkive should copy verbatim. Reasoning values, API protocols and token limits must follow the chosen model's capabilities. Source: [settings subpages](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/apps/desktop/src/app/settings/config-subpages.ts).

Saving configuration should return a revision and redacted effective values. Show differences before permission expansion. Distinguish **saved**, **authenticated**, **reachable**, **capability verified**, and **execution verified**. Never label a connection working solely because its model list loads.

## Integration architecture

```text
Arkive desktop / canvas / phone / messaging ingress
                         |
                         v
             Identity and room authorization
                         |
                         v
          Context Compiler + approved source revisions
                         |
                         v
           Run policy + durable execution receipt
                         |
                         v
                  Execution Router
                 /                \
      Plain model adapter      Hermes runtime adapter
                                      |
                               Restricted worker
                               local or server
                                      |
                    events / approval requests / outputs
                                      |
                         Arkive audit and artifact store
                                      |
                        review -> optional Brain promotion
```

Suggested adapter interface: discover capabilities, create/bind session, start run, subscribe/reconcile events, stop, answer an approval, inspect status and retrieve an authorized output. Each call carries Arkive room/run identity and the exact runtime connection/profile/session. Keep credentials server-side. Do not route an event using whichever room happens to be selected in the UI.

There are two viable Hermes transports. Desktop JSON-RPC offers close parity with its own UI, including clarification, session control and detailed events. Its API-server Runs API offers HTTP/SSE, idempotent creation, status, stop and approval endpoints. The latter is a strong candidate for the first bounded integration; use a contract spike to verify required event and scoping behavior on the pinned build before choosing it. Do not mix dashboard `/api/cron/jobs` and API-server `/api/jobs` as if they were one interchangeable API.

The inspected Runs API documents a 24-hour post-update idempotency retention window; Arkive still needs its own durable run and side-effect ledger. Runtime transport retention is not a substitute for business audit history.

## Recommended build order

### First deliver a real governed chat

1. Define versioned runtime, session, event, output and approval contracts. Add a dedicated restricted Hermes test profile/environment, never the user's broad personal agent by default.
2. Prove a source-limited run, streaming, stop, reconnect and approval handling against that runtime. No file writes or external messaging initially.
3. Bind each Arkive room/canvas tile to its session. Add policy-aware history and an activity inspector. Clearly display requested versus actually used model and node.

Acceptance: two simultaneous rooms never mix text, source context or approval cards; a reconnect does not resubmit a prompt; a revoked source cannot reappear through old runtime memory; Stop remains “stopping” until the worker confirms termination.

### Then add reviewed outputs and capabilities

4. Register generated outputs and show them in Files/Outputs with run provenance and safe previews.
5. Add reviewed skills and a small tool/MCP allowlist. Route write actions through exact approval and staged changes before enabling general execution.

Acceptance: a malicious source cannot grant tools; generated HTML cannot access app credentials; an output from another room is denied; an expired or replayed approval cannot authorize a new action.

### Then add background work and channels

6. Add durable jobs, run history and calendar visibility with one scheduler owner.
7. Add one external messaging channel, explicit identity pairing and reviewed delivery.
8. Move the worker to an optional personal server and verify execution while the desktop is closed. Provisioning and unattended key custody are separate approved work.

Acceptance: timezone/DST cases, restarts and duplicate delivery do not double-run an occurrence; unpaired senders fail closed; changed membership prevents later disclosure; job logs and outputs remain visible when the desktop reconnects.

### Expand only after the adapter contract holds

Add additional harness adapters, native provider protocols, voice, Git review, richer delegation and optional runtime-management surfaces. A harness can delegate to another harness only through the same scoped job contract; agnosticism means interchangeable contracts, not unrestricted nesting.

## Principal risks and unresolved choices

- **Independent Hermes memory:** previously learned text, skills, working-directory instruction files and runtime tools may add information outside the Context Compiler. Disable or isolate these paths and test them; a prompt is insufficient.
- **Remote exposure:** a runtime endpoint can control a machine. Do not expose it directly to arbitrary web clients; keep connection credentials behind the node, with authenticated transport and minimal network reachability.
- **Provider fallback:** falling back may disclose business data to a different provider. Treat permitted destinations as policy, not merely availability preferences.
- **Approval semantics:** approve-once must bind exact action, arguments, source/policy version and expiration. Do not confuse output review, memory promotion, model egress and shell execution.
- **History and revocation:** removing access prevents future use but cannot retract prior provider disclosure. Define retention and fresh-session behavior explicitly.
- **Unattended runs:** decide who can approve, what is allowed without a person and which node can decrypt which sources. A locked desktop must not imply a worker has plaintext access.
- **Runtime skew:** pin and capability-test the supported Hermes build. Menu names and protocols change; an adapter must fail closed when required features are absent.
- **Existing configuration:** current Hermes accounts, enabled tools, jobs and gateways were not inspected. Inventory them read-only before proposing migration; do not overwrite them.

## Source appendix

### Hermes matching installed build

Local root: `/Users/xela/.hermes/hermes-agent`, commit `63d0b94120027d487c9a5235b9ec64b696af1b26`.

- `website/docs/user-guide/desktop.md`: chat, settings, artifacts, lifecycle and gateway behavior.
- `website/docs/user-guide/multi-connection-desktop.md`: named connections, routing and transport health.
- `website/docs/developer-guide/programmatic-integration.md`: protocol choices, server requests and reconnect semantics.
- `website/docs/user-guide/features/api-server.md`: Runs API, idempotency, approval, profile routing and retained runtime capabilities.
- `website/docs/user-guide/features/cron.md`: schedule, model and delivery semantics.
- `website/docs/user-guide/security.md`: approvals and containment limitations.
- `apps/desktop/src/app/artifacts/index.tsx`: recent-session discovery, filters and remote origin handling.
- `apps/desktop/src/app/capabilities/index.tsx` and `scope-selector.tsx`: capability tabs and connection/profile scope.
- `apps/desktop/src/app/messaging/index.tsx`, `allowlist-field.tsx` and `apps/desktop/src/api/messaging.ts`: channel state, pairing and platform fields.
- `apps/desktop/src/app/cron/cron-job-model.ts` and `apps/desktop/src/api/cron.ts`: editor fields, delivery and ownership.
- `apps/desktop/src/app/settings/config-subpages.ts`: concrete configuration parameter groups.
- `apps/desktop/src/app/session/hooks/use-prompt-actions/`: prompt submission, interruption and history changes.

### Arkive current worktree

Root: `/Users/xela/Documents/Codex/2026-08-17/referenced-chatgpt-conversation-this-is-an/arkive-personal-node`.

- `personal-node/execution.mjs:92`: providers; Hermes currently unconfigured.
- `personal-node/execution.mjs:110`: authorized text request and prepared execution; source-only current-turn context.
- `personal-node/governance.mjs:172`: context compilation and permission checks.
- `personal-node/server.mjs:164`: Settings API; later routes cover rooms, approvals, sources, planner and replicas.
- `personal-node/provider-settings.mjs`: encrypted provider configuration and redacted checks.
- `personal-node/planner.mjs`: template occurrences and date-based planner behavior.
- `app/src/personal/ChatWorkspace.tsx`: rooms, context controls and chat/canvas rendering.
- `app/src/personal/WorkspacePanels.tsx:181`: saved profiles rather than autonomous workers.
- `app/src/personal/SettingsWorkspace.tsx`: current connection fields and explicitly unavailable integrations.
- `docs/SETTINGS_AND_BUZZ_MAPPING.md`: previous Settings build scope, not proof of Hermes integration.

No application changes, commit, GitHub push or deployment accompanied this audit. The previous white papers remain unchanged. A visual walkthrough is still needed once the native inspection connection works or screenshots/recording are supplied.
