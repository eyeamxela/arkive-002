# Arkive settings and Buzz comparison

Arkive now has an owner-only Settings section that brings model connections, agent capability boundaries, memory permissions, node recovery and device preferences into one place. It borrows Buzz’s separation of settings by responsibility, without replacing Arkive’s encrypted Brain or permission-before-retrieval architecture.

The comparison below uses the supplied Buzz v0.5.28 screenshot and public source at commit `1d9f2c81a5583f12be1239a088e2f0b379292dc3`, reviewed on 13 October 2026. The installed Buzz app displayed a loading screen during inspection; current source is not proof that every field is present in that installed version. No Buzz setting or credential was changed, and no Buzz code was copied into Arkive.

## The important architectural distinction

Buzz centers human and agent collaboration on a self-hostable Nostr relay, with signed events and shared rooms. Arkive centers the owner’s sources, memory, revisions and permission-filtered context. A collaboration relay and a memory graph solve different problems; a signature establishes authorship/integrity, not factual truth, and should not automatically promote material into Canon. [Buzz architecture overview](https://github.com/block/buzz/tree/1d9f2c81a5583f12be1239a088e2f0b379292dc3).

Arkive keeps four choices separate:

```text
Room membership and source policy
               |
               v
Permission-filtered Context Compiler
               |
               v
Execution adapter / future agent harness
               |
               v
Model endpoint on a local or remote execution node
```

The active beta adapter makes source-grounded text requests. It does not run shell commands or expose filesystem tools. Configuring a model does not grant memory access, approve a pending request or launch an agent.

## Settings mapping

| Buzz area and observed parameters | Arkive location and behavior |
| --- | --- |
| Profile: display name, description, avatar, public key, NIP-05 handle and private-key backup | Workspace & identity shows the Brain and node IDs and explains owner/member credentials. There is no Nostr identity or public profile. Name is set when creating the Brain. |
| Appearance: system/light/dark modes, theme and conversation preferences | Appearance & shortcuts preserves Arkive’s existing palette, offers a compact sidebar and a reduced-motion override. Folder colors remain in Files. No new light theme is claimed. |
| Agents: automatic mentions, sleep prevention, harness catalog and defaults | Agents & harnesses distinguishes saved profiles from running agents. Profiles open real scoped rooms; autonomous harnesses are unavailable. No sleep-prevention or automatic-mention toggle was added. |
| Agent defaults: provider, model, effort and environment settings, with agent-specific overrides | Models & connections saves multiple named OpenAI-compatible connections with one explicit node-wide default. Model ID, endpoint, credential, timeout and optional temperature/output limit are real service settings. Reasoning effort and per-agent model overrides are not implemented. |
| Custom harness: name, ID, command, arguments, environment variables, documentation URL and installation hint; ACP over stdio | Future harness adapters need explicit executable and tool boundaries. The beta does not accept arbitrary commands or pretend to connect Hermes, Claude Code or Codex. |
| Compute: sharing switch, local model/reference, installed/recommended models, VRAM limit and serving state | Nodes, sync & recovery exposes existing node identity and explicit source replication. No GPU sharing, local model downloader or DigitalOcean provisioning is implemented. |
| Local archive: local SQLite copies of selected relay events, channel/event-kind subscriptions, observer frames and turn metrics | Arkive stores encrypted Brain data and has revision/audit history and encrypted recovery exports. Source replication, recovery and credential storage remain distinct. |
| Communities/Admin: community and member administration | Memory & access links to Arkive’s existing members, room policies, source scopes and approvals. No global access grant is added by Settings. |
| Voice: reading agent replies during huddles, local voice selection and preview | Channels & availability labels voice/transcription integration as unavailable. No microphone or speech-service access is requested. |
| Notifications: desktop permission, sound controls and badges | Background reminders and push notifications remain unavailable. Planner recurrence is date-visit driven, not a notification scheduler. |
| Mobile: QR pairing and verification-code confirmation | No phone pairing or Telegram/WhatsApp adapter is connected. Remote node deployment remains a separate setup task. |
| Channel templates, custom emoji, experiments and updates | Task templates remain in Work; they are not channel templates. Custom emoji, experimental execution and automatic updates are not exposed as functioning switches. |

Sources for the field mapping: [settings sections](https://github.com/block/buzz/blob/1d9f2c81a5583f12be1239a088e2f0b379292dc3/desktop/src/features/settings/ui/SettingsPanels.tsx), [profile](https://github.com/block/buzz/blob/1d9f2c81a5583f12be1239a088e2f0b379292dc3/desktop/src/features/settings/ui/ProfileSettingsCard.tsx), [agent settings](https://github.com/block/buzz/blob/1d9f2c81a5583f12be1239a088e2f0b379292dc3/desktop/src/features/settings/ui/AgentsSettingsPanel.tsx), [agent defaults](https://github.com/block/buzz/blob/1d9f2c81a5583f12be1239a088e2f0b379292dc3/desktop/src/features/agents/ui/AgentDefaultsEditor.tsx), [custom harness fields](https://github.com/block/buzz/blob/1d9f2c81a5583f12be1239a088e2f0b379292dc3/desktop/src/features/settings/ui/CustomHarnessForm.tsx), [compute](https://github.com/block/buzz/blob/1d9f2c81a5583f12be1239a088e2f0b379292dc3/desktop/src/features/mesh-compute/ui/MeshComputeSettingsCard.tsx), [local archive](https://github.com/block/buzz/blob/1d9f2c81a5583f12be1239a088e2f0b379292dc3/desktop/src/features/local-archive/ui/LocalArchiveSettingsCard.tsx), [voice](https://github.com/block/buzz/blob/1d9f2c81a5583f12be1239a088e2f0b379292dc3/desktop/src/features/settings/ui/VoiceSettingsCard.tsx), [notifications](https://github.com/block/buzz/blob/1d9f2c81a5583f12be1239a088e2f0b379292dc3/desktop/src/features/settings/ui/NotificationSettingsCard.tsx), [mobile pairing](https://github.com/block/buzz/blob/1d9f2c81a5583f12be1239a088e2f0b379292dc3/desktop/src/features/settings/ui/MobilePairingCard.tsx).

## Connect a model in Arkive

1. Unlock the Brain and open Settings, or press Command/Ctrl + comma.
2. Under Models & connections, enter the provider’s API base URL and exact model ID. The adapter appends `/chat/completions`; do not paste the full completion URL.
3. Enter a key directly into the password field if required. A localhost OpenAI-compatible service may not require one. A native Anthropic API URL or a Claude Code/Codex login is not interchangeable with this protocol.
4. Keep optional temperature and max output tokens blank unless the model supports `temperature` and `max_tokens`. Timeout accepts 1–55 seconds, temperature 0–2 and output limit 1–128,000. These are validation bounds, not provider capability guarantees or a context-window setting.
5. Confirm and save. This saves configuration without contacting the model or modifying room permissions. Saving an override takes precedence over the node’s environment configuration.
6. Optionally consent to Check saved connection. This requests `/models` with the saved key and no Brain context. A successful list does not prove chat works; a failed list does not prove the provider lacks chat support. Returned model IDs can be selected in the model field.
7. In Chat, choose sources and review the normal per-send consent. A live provider call can incur that provider’s charges; no real provider was contacted during implementation verification.

Only one active connection exists in this beta. There is no automatic provider fallback, multiple saved endpoint picker, native Anthropic adapter or agent-harness OAuth flow. Changing endpoint, model or generation settings invalidates queued requests whose provider fingerprint no longer matches. Changing a timeout or rotating a key does not change the pinned context.

## Storage and security

`personal-node/provider-settings.mjs` stores configuration in `provider-settings.enc` beside the encrypted Brain. It uses the existing scrypt/AES-256-GCM envelope functions, a unique nonce/salt, a mode-0600 temporary file and atomic replacement. Read size/type bounds and no-follow checks reject invalid files and symlinks. Settings share the Brain’s unlock passphrase; corruption or an incorrect passphrase fails closed rather than silently falling back to a different connection.

Credentials are never returned by the settings API, saved in browser storage or inserted into Brain snapshots, context, replicas or recovery exports. An encrypted Brain recovery bundle therefore does **not** recover provider credentials: configure them on the new node. The unlocked service necessarily holds the usable key in memory. This is encrypted node storage, not OS Keychain integration or protection against a compromised unlocked device.

The endpoint cannot contain URL credentials, query parameters or fragments. Non-loopback HTTP and private/link-local destinations are rejected. DNS destinations are validated and pinned again by the existing transport on each request, redirects are not followed, and response sizes/timeouts are bounded. If a saved key exists, changing the endpoint requires a replacement key or an explicit clear-key choice.

The owner-only routes are:

- `GET /v1/settings/provider` returns redacted metadata and a revision.
- `POST /v1/settings/provider` requires the matching revision and saves a new encrypted version.
- `POST /v1/settings/provider/check` requires the matching revision and explicit request consent.

Locked nodes, member credentials, peer credentials and disallowed browser origins cannot administer these settings. Saves are serialized with existing node mutations. The connection registry retains the last 100 redacted save/create/activation events in its encrypted sidecar; this is not a full security audit ledger. Existing room approval/run history remains unchanged.

## Connected Agent Beta foundation — October 13, 2026

The first build slice adds a connection registry and a versioned execution boundary without replacing Chat, Canvas, Files, rooms or memory governance.

### Settings workflow

1. Save the initial/default connection using the existing editor. This explicitly transitions from environment configuration to encrypted node settings.
2. Use **Add connection** to save another named endpoint/model. Each connection owns its own key; no key is copied from the default. Saving does not activate it or send a model request.
3. Select a saved connection to inspect/edit it. Selection alone does not change execution.
4. Confirm **Use as node default** to change future sends for unpinned chats on this node. Disabled connections cannot be activated. In Chat or Canvas, **Model connection for [chat]** pins a saved connection to that chat; **Follow node default** removes the pin. Editing a connection record affects all chats using that record. Per-agent overrides remain unimplemented.
5. Open **Runtime & safety** to inspect the effective model, connection, adapter and policy boundaries. Hermes and ACP are explicitly unavailable, not functioning toggles.

### Service contract and migration

- `GET /v1/settings/connections`: redacted registry, active connection ID, global revision and bounded history.
- `POST /v1/settings/connections`: revision-checked `save` or explicitly confirmed `activate`. Maximum 20 connections; names are unique case-insensitively.
- `GET /v1/settings/execution`: version-1 execution descriptor with truthful capability flags and effective route.
- Existing `/v1/settings/provider` remains compatible and edits only the active connection.
- The encrypted sidecar is now format version 2. Version-1 settings load without rewriting the file and migrate on the next explicit save. Failed writes leave the prior file and in-memory state intact.
- Connection identity participates in queued-run approval fingerprints. Switching between otherwise identical connections cannot silently reuse the previous connection's approval. Credential rotation within the same connection preserves the existing behavior.
- `runtime-contract.mjs` rejects unimplemented harness/protocol choices before dispatch. Execution remains plain Chat Completions text with compiled room sources; the next slice below adds opt-in governed history. This is a boundary for future adapters, not a completed plugin runtime.

Only configure ordinary model APIs here. A remote endpoint can have independent behavior; Arkive cannot turn a broad agent gateway into an isolated model using a prompt. Hermes requires separate runtime containment, tool authorization and event handling before integration.

### Next implementation gate

The governed conversation/run-event slice and explicit per-chat connection pins are implemented. The updated build order is in `HERMES_SETTINGS_CAPABILITIES_UPDATE_PROPOSAL_V2.md`: account/model catalogs and compatible generation controls, followed by an isolated harness and a first-class Capabilities workspace. Native provider APIs remain separate adapters. Do not add arbitrary executable commands or auto-launch controls ahead of capability enforcement and correlated approval receipts.

### Per-chat routing API — October 13 update

Owner-only `GET /v1/settings/chat-routing` returns revision, redacted connection choices and per-room resolved provider descriptors. Owner-only `PUT /v1/rooms/:id/execution` accepts `{ connectionId: <saved ID or null>, expectedRevision }`. Selection is local-only and sends no provider request. Dispatch and approval both resolve the room's connection on the server. Missing, disabled and stale selections never authorize a fallback. Encrypted settings v3 persists the pins; v1/v2 load without writes and migrate on explicit mutation. Pins and credentials remain outside Brain sync/recovery exports. Restored/new chats explicitly follow that node's default until pinned; future session-default copying is not implemented yet.

## Governed conversation and live run events — October 13, 2026

**Conversation is not memory promotion.** Rooms already retain encrypted transcripts. A new per-request **Include eligible conversation history** control can now send up to 8 completed turns by the same requester, bounded to 32,000 serialized characters. It defaults off and resets after a successful send. Toggling it clears the previous send consent. Chat and Canvas use the same room and draft state; neither creates a second conversation store.

Eligibility requires exact room identity, requester identity, authority/scope hash, ordered source revision bindings and provider fingerprint. The scope includes layer rules, active grants and assigned profile/task/manifest. Source changes, new membership grants and connection changes therefore establish a different conversation boundary. There is no automatic cross-room, cross-user or cross-model history transfer. Legacy messages without a completed governed receipt are not eligible. Oversized turns are not truncated mid-message; the recent bounded suffix ends at the first over-budget turn.

`conversation.mjs` pins receipt IDs, a session-boundary digest, a content digest and serialized size on the new run. Approval rechecks those exact receipts rather than substituting the latest messages. Missing, changed or pruned receipts cause a stale-history error before any model call. Completion rechecks again. Owner review exposes the pinned questions and unverified answers; member views expose only the history-turn count. Prior assistant text remains unverified context, never Canon. The room and receipts persist in the encrypted Brain and recovery export; peer source replication still excludes them. This is Arkive-managed bounded conversation, not a persistent Hermes runtime session.

The UI also pins the displayed provider configuration key at send time. A changed connection—even with an identical model name—requires reviewing the new configuration. Existing clients that omit this optional field retain the previous API behavior.

**Live status:** `GET /v1/run-events` is an authenticated NDJSON stream of at most the latest 50 visible run summaries. Each snapshot includes only run/room IDs, state, timestamp and compact durable events with stable event IDs. No prompt, answer, source content, key or passphrase is streamed. Reads bypass long-running model calls but not the store's atomic write queue. Authority is rechecked approximately every second, and grant removal replaces the visible set; revocation or lock ends availability. The owner path reads compact receipts without cloning the vault. Member projection uses the existing grant/source filters.

Streams reconnect after a bounded 25-second window and send a keepalive snapshot every 10 ticks. Slow consumers are disconnected and recover from the next durable snapshot. The UI uses one feed per visible workspace, aborts it on navigation/lock/backgrounding, and clears live status on errors. It does not append replayed snapshots or launch runs on reconnect. Intentional browser feed-abort events are excluded from the browser test's network-error count; other failures still fail the test.

This provides `provider.started`, completion/failure and approval-state visibility. It is **not** token streaming, tool progress, resumable execution, a background scheduler or a provider health check. A restarted node keeps the existing interrupted-run recovery rule: no automatic replay of an uncertain paid request. Providers, harnesses and capabilities still require separate real connection verification.

## Verification and remaining work

269 Personal unit/service/model tests pass. Settings and registry tests cover encryption, redaction, restart, v1 migration, stale/concurrent edits, failed-write rollback, endpoint/key safety, separate credentials, explicit activation, parameter bounds, symlink rejection, member/locked/origin gates, model-list checks, connection-bound approval fingerprints and local mock chat execution. React review keeps only versioned display preferences in local storage and cancels settings reads on unmount. No real Brain was unlocked or live provider credential configured for these tests.

Background channels, mobile pairing and compute provisioning remain separate milestones. Local source changes and rebuilt artifacts are not a GitHub push or live deployment.
