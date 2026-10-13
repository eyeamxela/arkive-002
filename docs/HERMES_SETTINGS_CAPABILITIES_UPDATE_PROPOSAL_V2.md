# Arkive × Hermes — settings, capabilities and chat update proposal

13 October 2026 · Revision 4 · Per-chat routing plus model discovery and Hermes catalog connection implemented locally

> **Current checkpoint:** explicit per-chat model pins, per-connection model discovery/generation controls and an encrypted Hermes gateway metadata connection are implemented. Capabilities now shows real gateway-reported skills/toolsets after explicit inspection. Hermes execution, capability grants, reasoning controls and parallel execution are NOT enabled. This is not full Phase A/B or Hermes feature parity. See section 13 for this increment.

## Recommendation

Build Arkive as a multi-model, multi-harness workspace with a first-class Capabilities library and independently configured chat sessions. Keep the existing Brain, permission model, file cabinet, graph, planner and canvas. Hermes is both a functional reference and one runtime adapter—not the entire architecture.

The previous recommendation was too narrow in sequencing. A connection registry and an isolated Hermes adapter are necessary but do not deliver the experience requested. The next release must connect **Settings → available capabilities → chat selection → actual execution → outputs and audit**. Adding more explanatory settings cards does not meet that bar.

The immediate implementation priority should be per-chat execution configuration and a capability-aware session model, followed by real adapters and capability controls. Voice, browser, artifacts, jobs and channels have explicit milestones below. Multiple harnesses must be first-class in the contract now; support for each harness is implemented and tested individually.

## 1. Evidence and limits

This review uses the two supplied screenshots, the installed Hermes build stamp, matching local Hermes source, current Arkive source, and Hermes's programmatic integration documentation. It does not rely on the previous audit alone.

- Hermes installed stamp: commit `63d0b94120027d487c9a5235b9ec64b696af1b26`, built `2026-10-13T07:39:16.463Z`, stamp reports `dirty: false`.
- Local Hermes checkout HEAD matches that commit: `/Users/xela/.hermes/hermes-agent`.
- Arkive reviewed checkout: `/Users/xela/Documents/Codex/2026-08-17/referenced-chatgpt-conversation-this-is-an/arkive-personal-node`, including existing uncommitted changes.
- Native Hermes inspection timed out. Therefore this is a screenshot-and-source audit, **not a completed click-through or live integration certification**. Visible controls and source-supported behavior are distinguished from successful execution.
- No private configuration, tokens, account databases, Brain contents or conversations were opened. No provider request, tool action, gateway restart, installation or external message was performed.
- GitNexus exploration was attempted under its exploration skill. Search failed against a read-only full-text index; the listed Arkive index was stale. A bounded refresh attempt did not finish and was interrupted. Conclusions below use direct source inspection, not a claimed fresh graph.
- Orbit tools were not exposed in this session. This proposal is saved in the repository, not filed in Orbit.

Existing white papers and the previous audit are preserved. This document supersedes the previous **proposed build order**, not historical implementation evidence. The audit baseline had a saved connection registry with only one active node-wide execution default. The section-12 implementation adds explicit per-chat pins; unpinned chats still follow the node default.

### What the screenshots establish

**Photo 1:** Model settings with Main, Fallback, Auxiliary and Mixture of Agents subpages; provider/model selectors; reasoning and speed controls; a main-model context-window override; and navigation for Chat, Appearance, Workspace, Safety, Browser, Passwords & Logins, Memory & Context, Voice, Advanced, Notifications, Billing, Providers, Gateways, Keyboard Shortcuts, Tools & Keys, Sessions, Plugins and About. The page explicitly differentiates defaults for new sessions from the active chat's model picker.

**Photo 2:** A searchable/sortable skills library with enable switches, usage counts, categories, a Learned badge, metadata and Markdown detail, Edit/Archive actions and a Skills Hub. The inspected source expands this into four separate capability areas: Skills, Tools, Connectors and Plugins. An enabled skill row alone does not prove its dependencies or external account are working.

## 2. Correct the terminology before building more

| Object | Meaning in Arkive | Must not be confused with |
|---|---|---|
| Provider connection | A named authenticated API/account route | A model or an agent runtime |
| Model | A selectable model served through a provider route | A harness such as Hermes or Claude Code |
| Harness | Software managing the agent loop, sessions and tool interaction | A model family or a skill with that product's name |
| Runtime connection / gateway | The endpoint/process through which a harness is reached | Telegram, a model API gateway, or Brain replication |
| Execution node | The machine/container running work | Where the complete Brain must be stored |
| Agent profile | Versioned instructions, defaults and permitted capabilities | A human identity or an access grant |
| Skill | Instructions/resources that teach a workflow | Permission to run shell commands or use an account |
| Tool | An executable operation with an input/output schema | A skill description |
| Connector | An integration and account binding exposing tools/resources | Blanket access to every resource on that account |
| Plugin | An installable executable extension, possibly with UI and runtime parts | A safe-to-import Markdown skill |
| Channel | A communication surface such as Telegram | A runtime connection or proof of user identity |

Hermes already supports many model providers. The meaningful Arkive extension is **harness independence and governed memory**, not a claim that Hermes is single-model. The inspected `codex` and `claude-code` skills teach delegation through a terminal to those CLIs. They do not establish an interchangeable top-level harness selector in Hermes. Likewise, Hermes exposing itself through ACP is not proof that it hosts arbitrary ACP agents.

## 3. Feature-by-feature audit and Arkive mapping

“Source-backed” below means the matching Hermes build contains the UI/integration path; it does not mean the user's credentials, device permissions or service dependencies have passed a live check.

| Area | Hermes behavior observed in screenshots/source | Current Arkive | Proposed update |
|---|---|---|---|
| Provider accounts | Account sign-in, API keys, custom endpoints, local models | Named encrypted endpoint/model records; keys redacted | Separate connection/account registry from models; explicit auth methods and health |
| API protocols | Custom endpoint modes include Chat Completions, Responses and Anthropic Messages | Chat Completions only | Adapter-specific protocols; validated model capabilities, not a universal endpoint field |
| Chat model picker | Session-specific provider/model choices; busy-turn changes can be deferred; rollback/confirmation handling | Picker selects adapter IDs, not all saved connections/models | Searchable per-chat provider/model picker; immutable route for each running request |
| Main model | Profile default seeds new sessions | One node-wide active connection | Workspace/agent defaults copied into new sessions; existing sessions do not silently change |
| Fallback models | Ordered provider/model chain; preserves routing metadata | None | Opt-in permitted fallback routes, bounded retries, visible actual provider and attempt history |
| Auxiliary models | Separate task assignments for vision, compression, extraction, titles and other tasks | None | Role-specific model routes; every helper call passes egress and permission checks |
| Mixture of Agents | Named presets, reference models and aggregator, enable/default controls | Saved profiles, not an MoA runtime | Explicit multi-model run mode with audience/cost limits; distinct from autonomous agent teams |
| Harnesses | Hermes runtime; external-agent delegation skills; Hermes ACP exposure | `arkive-text` implemented; Hermes/ACP unavailable | Registry + compatibility handshake + real Hermes adapter + one independent harness adapter |
| Chat lifecycle | Persistent sessions, streaming events, interrupt/steer, branch/compress, approval requests | Encrypted room history, opt-in bounded eligible turns, compact run status | Durable session binding, streamed content/tools, stop, queued next message, reconnect and branch |
| Parallel chats | Session/tile-specific state and owning gateway/profile | Multiple visual rooms, shared UI busy state and serialized execution path | Per-session run control, bounded cross-room concurrency, short storage transactions |
| Skills | Search/category/usage, origin, enable, local/learned editing and archive, hub | No executable skill catalog | Versioned skill library; explicit room/profile selection; review learned revisions |
| Tools | Toolsets, concrete operations, provider/dependency status, configuration and usage | No general execution tool bridge | Tool catalog with read/write/execute/network effects and server-enforced scopes |
| Connectors/MCP | Account aliases, auth states, local/hosted connectors, stdio/HTTP server editor, probes/logs | Source import/sync adapters, not a general tool connector manager | Account-scoped connectors plus MCP discovery, credential references and tool grants |
| Plugins | Agent/profile and desktop halves; packages can contain both | No executable plugin system | Trusted package catalog, pinned versions, declared permissions, separate UI/runtime install targets |
| Browser | Browser tool provider configuration; real-profile consent; private URL controls | No agent browser | Dedicated browser sessions, backend selection, domain/action grants and explicit login handoff |
| Passwords & logins | Profile/connection-owned vault interface; local, Bitwarden and 1Password source types | Encrypted provider keys only | Secret broker separate from Brain; just-in-time domain-bound credential use; no password corpus |
| Voice | Conversation, STT, TTS; local/cloud provider fields; streaming, voices/languages and recording limit | Unavailable | Dictation, read-aloud and live voice as three explicit capabilities with devices, consent and retention |
| Gateways | Local, remote, SSH and Cloud; connection/profile routing; HTTP/WebSocket tests | Personal Node connection and source replication, not harness gateway registry | Named runtime endpoints, lifecycle, authentication, health and remote ownership |
| Hermes Cloud | Portal sign-in, org/instance discovery and saved Cloud gateways | None | Optional Hermes-hosted node connector; do not make it Arkive's storage authority |
| Artifacts | Files/images/links with origin-chat navigation; gallery indexes recent sessions | Sources/notes/file preview, but no run-output ingestion contract | Durable output records linked to BrainObjects and runs; safe previews and reviewed filing |
| Scheduled jobs | Real scheduled runs, prompt/script distinction, delivery and model overrides | Planner recurrence materializes tasks on date visits | Separate Job objects, timer/worker, history, timezone, missed-run and delivery policies |
| Messaging | Platform enable/config/test, sender allowlists, pairing, restart-required state | No Telegram/WhatsApp adapter | External identity mapped to Arkive member + room; incoming and outgoing permission checks |
| Workspace | Working directory, project scan roots/exclusions, shell/file controls | Connected source folders and reviewed writeback | Separate read-only Brain mounts from writable execution workspace and output staging |
| Safety | Approval mode/timeouts, secret redaction, command allowlist, checkpoints | Source governance, member approval, reviewed writes | Add per-tool action grants; mandatory room boundaries cannot be switched off |
| Memory/context | Persistent memory/provider selection and compression controls | Brain/source/Canon separation; bounded permission-matched history | Keep Arkive authoritative; controlled recall bridge and provenance-aware compression |
| Advanced | Turn/retry limits, terminal backends, child concurrency/timeouts, output limits | Basic request timeout/output parameters | Validated per-adapter advanced options; bounded children, output and spending |
| Notifications | Dedicated settings surface | No background notification service | Approval/run/job notifications, OS consent, quiet hours and sensitive-content redaction |
| Sessions | Archive/restore/delete and default project directory controls | Rooms and encrypted receipts; no equivalent session manager | Search/archive/export sessions; retention controls; preserve audit dependencies |
| Appearance/shortcuts | Dedicated settings and shortcut surfaces | Arkive palette, compact sidebar/reduced motion, basic shortcuts | Preserve visual system, add compact controls and accessible picker shortcuts |
| Billing/usage | Hosted-service billing surface | No provider billing integration | Usage by run/model/node; estimates marked as estimates; provider billing remains separate |
| About/updates | Build/version and update management surfaces | Manual bundled rebuild | Adapter/runtime compatibility versions, diagnostics, reviewed updates and rollback |

## 4. The chat experience we should actually build

Keep the existing chat/canvas layout. Add a compact execution strip beside the composer; secondary options can collapse into a popover on narrow tiles.

```text
Room: Business / Research                         Context: 12 sources

[Agent profile v] [Harness v] [Node v] [Provider / Model v]
[Reasoning v]     [Skills: 3] [Tools: 2] [Browser] [Microphone]

Message…                                      [Attach] [Send]

Inspector: Context | Activity | Outputs | Approvals
```

Example only: one canvas tile could use Hermes on the local node and another an independently supported coding harness in a scoped workspace. The model menu must contain only compatible, authorized choices for each route. Unsupported combinations show why they cannot run.

### Selection and switching rules

1. A new chat starts with permitted workspace/agent defaults. Settings offers an explicit “Use for new chats” action; saving a connection does not change active sessions.
2. Each chat stores its own effective configuration. Canvas and full-chat surfaces share that record. Changing Chat A never changes Chat B.
3. Provider/model changes apply at a turn boundary. A running turn retains its original route and settings; the UI distinguishes “running with” from “next message uses.”
4. Switching harness or node creates a new runtime-session binding. It does not transfer a live process. Offer a reviewed, permission-filtered context handoff into the new session.
5. Show what will cross to another provider/node: selected sources, permitted prior turns, attachments and any summary. Changing route invalidates stale send/approval consent.
6. Keep the full user-visible transcript, but separately compute what may be sent. Today history requires an exact provider fingerprint; cross-model continuity requires a new explicit handoff policy, not removal of the current checks.
7. Stop must reach the owning session, not whichever tile is active. “Cancellation requested” is different from confirmed stopped. A timeout or disconnection must not automatically replay a paid or side-effecting action.
8. Attachments, vision and reasoning/speed controls appear only when supported. An edited context-window value cannot create a larger real model context window.
9. Approved members may select only policy-allowed routes/capabilities. They cannot reveal keys, install executables or grant themselves more memory.
10. Disabled, configured, authenticated, reachable, compatible, authorized and running are distinct states. Show the blocking reason and repair action.

### Parallel operation requires backend work

Arkive currently passes one `providerSettings.config()` into sends and approvals. Its service serializes mutations and execution, while its UI shares a busy state. Multiple tiles alone therefore do not establish independent concurrent agent operation.

Proposed replacement: resolve an immutable run snapshot inside a short transaction, release the storage queue during execution, and track one active run lease per session. Use a separate bounded node-wide concurrency limit. Recheck authorization at dispatch, tool execution and output delivery; policy revocation/lock must cancel or quarantine affected work without waiting behind a slow model call. Keep atomic storage writes and test the races before enabling parallel runs.

## 5. Capabilities: implement the second screenshot as a real workspace

Create **Capabilities** in Arkive's navigation—not a paragraph inside Settings.

```text
Configuring: [Workspace] [Agent profile] [Harness / Node]
Skills | Tools | Connections | Plugins

Search / category / status / most-used      Selected capability
-----------------------------------        -------------------
Enabled · Research brief      12 uses       Source + version + trust
Blocked · Browser automation               Description / instructions
Review · Learned workflow                  Requirements and allowed actions
                                           Configure / test / disable
```

Use Arkive's charcoal, sage, paper and mustard colors. Reuse the file cabinet's list/detail and status styling without making every configuration page a stacked folder. Keep one configuration source per capability: Voice and the TTS tool detail edit the same scoped record; Browser settings and the Browser tool detail do likewise.

### Skills

- Name, description, category/tags, source, author if known, version/hash, installation target, requirements and usage.
- Readable Markdown preview, explicit enable/disable, profile defaults and per-chat selection.
- Import/install review; detect executable scripts and dependencies rather than treating every package as text-only.
- Learned skills become proposed revisions with source runs, diff and approve/reject. They are not silently trusted or activated.
- Edit local skills; fork managed packages when appropriate; archive recoverably. Updating an enabled package cannot silently change an in-flight run's pinned instructions.
- Installing/enabling a skill never grants its requested tools, secrets or accounts. Files containing instructions remain source material until separately selected as a reviewed instruction package.

### Tools

- Stable operation IDs, schema, version, runtime owner and effect classes: read, write, execute, network, send, delete.
- Detail shows exactly which concrete tools a toolset enables, with resource restrictions, dependency checks and account bindings.
- The enforceable states include available, missing dependency, needs authentication, denied by policy, awaiting approval, and ready.
- Mutation approval binds the arguments/diff, destination, actor, room, run, tool version and expiry. Changed arguments require a new approval. A general “allow tools” switch is not approval for every write.

### Connections and MCP

- Multiple named accounts for the same integration; separate personal/business identities.
- Account status: pending sign-in, authenticated, expired, revoked, failed; reconnect must not silently select another account.
- Local stdio and remote HTTP transports; reviewed executable/arguments, secret references, URL, headers and environment allowlist.
- Discover tools, compare schema changes, test health, view redacted logs, enable individual operations and scope resources.
- Local MCP launch is code execution. Installing a connector or testing an executable requires a distinct confirmation and containment.
- Configuration changes show “next session” or “restart required” unless actual hot reload is supported by the selected runtime.

### Plugins

- Distinguish runtime extensions from desktop UI extensions and packages containing both.
- Show origin, pinned version/hash, manifest, requested permissions, supported hosts and dependencies before installation.
- Default to curated/explicitly reviewed plugins; runtime plugins run in scoped workers. Do not evaluate arbitrary downloaded plugin code inside the privileged desktop UI.
- Enable/disable, update diff, rollback and uninstall have their own lifecycle. A remote runtime plugin does not automatically install a desktop plugin on the local machine.

## 6. Settings structure and parameters

Every operational page should show **Applies to: workspace / profile / session / node** and **Effective on: now / next turn / new session / restart**. High-risk changes use review-and-apply, not silent autosave.

| Settings group | Fields and actions |
|---|---|
| Models | Default model; permitted fallbacks; auxiliary roles; MoA presets; reasoning and speed/tier where supported; context/output budget; timeout/retry limits |
| Providers | Named accounts and keys; auth method; protocol; endpoint; model discovery/manual ID; connection test and optional separately consented test completion |
| Harnesses | Adapter/version, supported protocols/models, install or connect status, session lifecycle, approved launch configuration, containment and compatibility diagnostics |
| Nodes & gateways | Local/remote/SSH/hosted routes, owning node/profile, authentication references, transport, health, start/stop where supported, reconnect and update state |
| Agents | Reviewed instructions, default model/harness/node, capabilities, source policy, children/concurrency/time/cost limits |
| Memory & context | Selected Brain/namespaces, retrieval policies, permitted conversation handoff, context budget and compaction; proposals versus Canon |
| Capabilities | Links to the same Skills/Tools/Connections/Plugins records; no duplicate independent switches |
| Browser & logins | Dedicated browser profile, selected backend, allowed domains, private-network policy, downloads, account handoff and session retention |
| Voice | Input/output devices, STT provider/model/language/streaming, TTS provider/model/voice/speed, push-to-talk/live mode, echo/auto-read, recording duration/retention |
| Workspace & files | Approved working roots, read-only source mounts, writable staging roots, environment allowlist, terminal backend and output limits |
| Safety & approvals | Actor/room capability policy, action approvals, expiry, redaction, checkpoints, revocation, budgets and audit |
| Channels & notifications | External account/sender pairing, room binding, allowed destinations, delivery status, notification preferences and privacy |
| Sessions & storage | Archive/export/retention, runtime-session ownership, scoped cache cleanup, encrypted recovery; clarify what credentials are excluded |
| Appearance & shortcuts | Existing palette and folder colors, motion, density, accessibility, composer shortcuts |
| Usage & diagnostics | Token/cost provenance, per-model/tool/node usage, version compatibility, redacted logs and manual/live test distinction |

Hermes parameters inspected include `model_context_length`, `agent.reasoning_effort`, `agent.service_tier`, `fallback_providers`, `auxiliary.*`, `moa.*`, `terminal.cwd`, `terminal.env_passthrough`, `code_execution.mode`, `file_read_max_chars`, `approvals.*`, `security.*`, `checkpoints.*`, `browser.use_real_profile`, `browser.allow_private_urls`, `memory.*`, `context.engine`, `compression.*`, `voice.*`, `stt.*`, `tts.*`, `agent.max_turns`, `agent.api_max_retries`, `delegation.*` and `tool_output.*`.

These are evidence of Hermes's configuration breadth, **not fields to send unchanged to every harness**. Arkive needs a normalized schema and adapter-specific translation. Unsupported values must fail visibly. Treat model capability catalogs as versioned hints supplemented by server validation; never infer compatibility solely from a display name.

## 7. Voice, browser, cloud and automation: specific designs

### Voice is three features

1. **Dictation:** microphone → chosen STT route → editable transcript in composer. Recording does not automatically submit a chat or promote memory.
2. **Read aloud:** chosen reply → TTS route → selected output device. Explain any additional provider disclosure.
3. **Live voice:** a realtime session with interruption and transcript, bounded tools and a visible stop/mute state. A realtime voice model cannot bypass the ordinary tool-approval bridge.

Expose local/cloud processing, language, available voices, streaming availability, maximum duration and retention. Request OS microphone permission only on use. Browser-held long-lived credentials are not acceptable; direct realtime transport requires supported short-lived credentials. Device/audio tests are independent from provider health tests.

### Browser is a capability with a separate identity boundary

Start with a dedicated Arkive-owned browser profile and manual sign-in. Hermes's inspected real-profile switch consents to a copy of the user's browser cookies/logins; this is materially different from opening a blank browser. Do not silently copy personal browser profiles into Arkive.

Add explicit backend selection and compatibility, domain/account binding, allowed downloads and preview, read versus submit actions, and limited retention of screenshots/page data. Private-network access is an explicit node/resource grant, not a global weakening of the current model-endpoint protections. Credentials remain behind a secret broker, never become Brain documents or model-visible text. Password-manager integration is a later optional adapter, not a required new password store; payment-card storage is outside this beta.

### Gateways and Hermes Cloud

Hermes source supports local, remote, SSH and Cloud connections, with Cloud organization/instance discovery. Arkive should model these as runtime locations. Connecting a hosted instance neither replicates the complete Brain nor proves DigitalOcean provisioning is implemented.

Start by connecting an explicitly selected existing node. Keep provisioning a new paid server as a separate reviewed action. Test authentication, runtime version, transport/event stream and capabilities; a successful HTTP ping alone is insufficient. Use scoped retrieval/export to supply a remote run. Do not ship the Brain passphrase or all node credentials with it.

### Artifacts, scheduled jobs and messaging

Artifacts need durable storage and provenance, not only extraction from recent chat transcripts. Register output bytes/hash/MIME/owner/run/source revisions/node/review state. Reuse Files for previews and filing; “File in folder,” “Use in chat,” “Create task” and “Propose memory” remain distinct actions. Sandbox active content and validate remote paths against the producing node's output roots.

Agent jobs are not planner templates. Add job owner/room, timezone/schedule, pinned or latest-authorized source policy, execution configuration, budgets, no-overlap policy, missed-run handling and delivery destination. One scheduling authority and occurrence ID per job; retries must not duplicate external actions. A sleeping desktop cannot promise execution. An always-on node requires a separate unattended credential/decryption policy.

Channels bind external identities to Arkive members and rooms. Gateway credentials, sender approval and permission to send to a recipient/group are separate checks. Start with one channel and show received, queued, executing, approval-needed and delivered states. Never connect Telegram directly to a broad Hermes profile around Arkive's policy checks.

## 8. Implementation architecture

```text
Chat / Canvas / Voice / Channel / Scheduled job
                        |
                        v
         Resolve actor + room + session configuration
                        |
                        v
      Policy check → Context Compiler → Execution snapshot
                        |
                        v
                 Execution Router
            /             |                \
      Direct model      Hermes          Other harness
       adapter          adapter        (independent)
            \             |                /
             +------ scoped node worker --+
                        |
         Tool broker / approvals / secret broker
                        |
              Events + outputs + usage
                        |
          Arkive receipts / Files / memory proposals
```

The diagram is the **proposed design**, not the current implementation. Native tools that remain inside a harness must still be interceptable and contained; if they cannot be governed, that route cannot receive those grants. A system prompt saying “do not use tools” is not containment. Hermes's API-server documentation explicitly says added instructions leave its core tools, skills and memory in place.

### Proposed records

| Record | Minimum responsibilities |
|---|---|
| ProviderConnection | Stable ID, account label, endpoint/protocol, credential reference, owning node, auth/health revision |
| ModelDescriptor | Provider route, model ID, supported parameters/modalities/context limits, verification provenance |
| HarnessAdapter | Adapter ID/version, transport, supported lifecycle/actions, model compatibility and containment requirements |
| RuntimeConnection | Node/endpoint/transport, harness/profile ownership, credential reference, capabilities and health |
| AgentProfile | Versioned reviewed instructions, default routes and capability policy |
| CapabilityPackage/Grant | Kind, source/hash/version, dependencies, permitted resources/actions and audience |
| SessionExecutionConfig | Room/session, harness/node/provider/model selections, generation settings, skill/tool versions and history policy |
| RunSnapshot | Exact actor/policy/source/context/route/config hashes, approved handoff and bounded execution budget |
| ToolApproval | Run/tool/arguments/resource/version/expiry binding and decision; stale/replayed approvals rejected |
| Artifact | Storage reference/hash/MIME, producing run/node, source lineage, access and review state |
| Job/ChannelBinding | Ownership, trigger or sender/destination mapping, execution policy and durable history |

Configuration resolution: workspace default → agent default → explicit session selection → immutable run snapshot. This is **preference precedence**, not permission precedence. Actual permissions are the intersection of workspace, actor, room, agent, node and action grants; no lower layer can widen a higher layer's restrictions.

Fallbacks, auxiliary calls, MoA reference models and child agents all use that same authority path. Cross-provider summaries and hidden helper calls are disclosures too. Store credentials separately and expose references/status only. An agent's secret access must be an explicit named grant, not inherited access to the desktop process environment.

### Migration from the current build

- Preserve existing encrypted provider records and their stable identities. Add account/model separation without automatically deduplicating keys or merging similarly named connections.
- Seed each existing room's execution selection from the current effective route during an explicit versioned migration. Keep legacy receipts immutable and readable.
- Preserve queued approval route fingerprints; if a request cannot be mapped exactly, invalidate it for review instead of redirecting it.
- Add session-bound model catalogs and redacted configuration APIs; stop passing the mutable node default into every dispatch.
- Replace global UI busy state for chat with per-room/per-run state; retain application-wide exclusivity only where necessary, such as lock/restore.
- Treat history handoff as a separate feature with dependency filtering and consent. Do not simply remove `providerFingerprint` from history eligibility.
- Use a negotiated adapter contract. Registration alone is not proof of support; adapters that cannot enforce required boundaries remain unavailable for that action.

## 9. Revised delivery sequence

These are capability gates, not time estimates. Each must produce usable UI and verified behavior before being called complete.

### A — Per-chat routing and independent model controls

Separate provider accounts/models, persist per-chat route, build composer pickers, defaults for new chats, compatible reasoning/output controls, explicit history handoff and per-session concurrency. Preserve the direct-model adapter. Native provider protocols can be added incrementally, but missing modes must remain clearly unsupported.

**Acceptance:** two rooms retain different model connections across restart; changing one does not change the other; a pending approval cannot execute against a changed route; no source/context leak during provider switching; simultaneous mock runs are isolated; two user-consented real provider tests pass before claiming live support.

### B — Harness management and first-class Capabilities

Build the registry, health/compatibility screens and Skills/Tools/Connections/Plugins workspace. Implement the contained Hermes adapter and a reviewed skill selection path. Add MCP discovery and one scoped read-only tool, then the mutation approval bridge. Add a second genuinely independent harness adapter before calling the product multi-harness; a placeholder or Codex delegation skill does not count.

**Acceptance:** switching harness changes the actual execution route; the session remains correctly bound on reconnect; tools outside the grant fail even if requested by a skill; source access is brokered; exact write approval is required; unsupported combinations explain the blocker. Live harness compatibility tests are separate from mocks.

### C — Complete interactive agent workflows

Token/tool streaming, stop/queue/steer where supported, artifacts, browser sessions, dictation and read-aloud. Add live voice only once interruption, credential transport and tool authorization are verified. Implement permitted fallback and auxiliary routes; advanced MoA/delegation follows with explicit budgets and downstream data checks.

**Acceptance:** choose folder + model + harness + skill; dictate and review a request; observe tool activity; approve a scoped action; preview/file the output; revisit its exact provenance. Switching canvas tiles does not lose events or send a second request.

### D — Background and remote operation

Named remote/SSH/optional Hermes Cloud node connections, durable jobs, notifications and the first messaging channel. DigitalOcean provisioning is a separate optional milestone after connecting an existing remote node works.

**Acceptance:** an authorized job runs on the selected always-on node while desktop is closed; duplicate delivery is suppressed; revoking membership blocks subsequent retrieval/actions/delivery; the channel sender is never implicitly the owner; no entire-Brain replication is assumed.

### E — Extension ecosystem and advanced teams

Curated plugin installation/updates/rollback, wider harness/provider matrix, full MoA/agent-team controls, additional channels and portable capability bundles. Audit each third-party package and protocol independently rather than promising “any harness, any model” without limitations.

## 10. Release checks and remaining decisions

Required regression cases include cross-room cache isolation; configuration changes during a turn; concurrent provider/harness switches; stale or replayed approvals; lock/revocation during streaming; source removal before a tool call; malicious skill instructions; MCP schema changes; wrong-account routing; fallback to an unapproved provider; auxiliary compression leaking excluded text; browser login isolation; remote output traversal; active HTML previews; duplicate scheduled occurrences; offline/reconnect with uncertain action completion; and plugin update rollback.

Tests must distinguish unit/mock, local runtime, real authenticated provider, native microphone/browser and remote-server results. Saving a key, listing models, or reading a capability manifest proves only that individual step—not the full workflow.

Decisions still requiring approval before implementation:

1. **Approved to start:** adopt the broader per-chat routing + Capabilities scope, cross-check the open-source repository and begin building. This is not authorization to deploy, connect accounts, install plugins or run tools against private data.
2. Pick the second independent harness for acceptance testing. Candidate: Codex or Claude Code, depending on available supported integration and containment. Do not assume its subscription credentials are reusable by another product.
3. Approve explicit history-transfer UX on provider/harness changes; default remains no silent transfer.
4. Choose whether voice beta starts local or cloud STT. Design supports both; account/device availability still needs verification.
5. Decide whether hosted Hermes Cloud is needed in the first remote release or whether a user-owned server connection is sufficient. Neither requires changing Arkive's Brain ownership model.

Suggested defaults: local execution, dedicated browser profile, reviewed skill revisions, no automatic cross-provider fallback, no autonomous source writes, no unreviewed plugin installation, and no background memory promotion. These restrict authority, not the availability of the requested settings architecture.

## 11. Source index

All Hermes paths below are relative to `/Users/xela/.hermes/hermes-agent`; all Arkive paths are relative to the reviewed `arkive-personal-node` directory. These are source pointers, not instructions to run the example commands inside those files.

### Hermes source inspected

- `apps/desktop/src/app/settings/config-subpages.ts`: navigation-to-parameter mapping.
- `apps/desktop/src/app/settings/constants.ts`: curated configuration fields, voice/provider/backend options.
- `apps/desktop/src/app/settings/index.tsx`: account/key/local-provider, gateway, vault, sessions, billing and plugin navigation.
- `apps/desktop/src/app/settings/providers-settings.tsx` and `custom-endpoints-settings.tsx`: distinct auth/configuration paths and protocol choices.
- `apps/desktop/src/app/settings/model-settings.tsx` and `fallback-models-field.tsx`: main/auxiliary/MoA assignments and ordered fallback rows.
- `apps/desktop/src/app/session/hooks/use-model-controls.ts`: per-session and per-tile model changes, next-turn deferral, confirmation and rollback.
- `apps/desktop/src/app/capabilities/index.tsx` and `scope-selector.tsx`: four capability tabs and exact connection/profile ownership.
- `apps/desktop/src/app/capabilities/skills/skills-tab.tsx`, `skills-data.ts`, `skill-detail.tsx`, `skill-provenance.ts`: toggles, usage, archive/edit and source distinctions.
- `apps/desktop/src/app/capabilities/toolsets/toolsets-data.ts` and `apps/desktop/src/app/settings/toolset-config-panel.tsx`: concrete toolset counts and provider readiness/configuration.
- `apps/desktop/src/app/capabilities/connectors/add-server-draft.ts`, `accounts-section.tsx`, `mcp/mcp-editor.tsx`: transport/auth fields, multiple account states, editor/logs.
- `apps/desktop/src/app/capabilities/plugins/plugin-packages.ts` and `plugins-tab.tsx`: scoped agent/desktop package halves and lifecycle controls.
- `apps/desktop/src/app/settings/browser-real-profile-panel.tsx`: browser-profile-copy consent and shared settings ownership.
- `apps/desktop/src/app/settings/voice-provider-fields.tsx`: shared scoped voice configuration; provider-specific controls.
- `apps/desktop/src/app/settings/vault-settings.tsx`: source/owner-scoped password-vault interface.
- `apps/desktop/src/app/settings/connections-registry.tsx` and `gateway-settings.tsx`: local/remote/SSH/Cloud connection records, auth and discovery UI.
- `apps/desktop/src/app/settings/sessions-settings.tsx`: archive/restore/delete and default directory.
- `apps/desktop/src/app/artifacts/index.tsx`, `apps/desktop/src/app/cron/cron-job-model.ts`, `apps/desktop/src/app/messaging/index.tsx`: output indexing, jobs and pairing/configuration state.
- `skills/autonomous-ai-agents/codex/SKILL.md` and `claude-code/SKILL.md`: external CLI delegation, not proof of harness interchangeability.
- `cli-config.yaml.example`: auxiliary tasks and configuration semantics; no private user config was inspected.
- [Pinned integration guide](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/website/docs/developer-guide/programmatic-integration.md): ACP, native RPC and HTTP protocols, session overrides and events.
- [Pinned multi-connection guide](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/website/docs/user-guide/multi-connection-desktop.md): inspected locally; web fetch unavailable in this run.
- [Pinned API-server guide](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/website/docs/user-guide/features/api-server.md): inspected locally; full runtime tool/memory behavior behind a compatible endpoint.

### Arkive source inspected

- `personal-node/provider-settings.mjs`: named connection registry, encrypted credentials, active default and revision handling.
- `personal-node/runtime-contract.mjs`: current adapter availability and truthful capability flags.
- `personal-node/execution.mjs`: adapter catalog, request validation, route fingerprint and dispatch.
- `personal-node/conversation.mjs`: exact-route history eligibility and pinned receipts.
- `personal-node/server.mjs`: current default-route dispatch and serialized execution boundary.
- `app/src/personal/ChatWorkspace.tsx`: existing adapter picker, shared busy control, consent and history.
- `app/src/personal/SettingsWorkspace.tsx`: current settings scope and unavailable integrations.
- `app/src/personal/PersonalApp.tsx`: application-level state and shared controls.
- `docs/HERMES_ARKIVE_CAPABILITY_AUDIT.md`, `SETTINGS_AND_BUZZ_MAPPING.md`, `PERSONAL_NODE_VERIFICATION.md`: historical baseline only; current code takes precedence over stale prose.

## 12. Public GitHub cross-check and first implementation

### Versioned evidence

The installed Hermes reference remains `63d0b94120027d487c9a5235b9ec64b696af1b26`. A read-only `git ls-remote` against the public repository on 13 October returned HEAD `ae3f9f9cb149a828ae61625bb9c84b7bae837a0f`. The installed checkout was not pulled or modified. Raw files at this newer pinned commit were fetched from GitHub, independently of private Hermes configuration:

- [Integration protocols](https://github.com/NousResearch/hermes-agent/blob/ae3f9f9cb149a828ae61625bb9c84b7bae837a0f/website/docs/developer-guide/programmatic-integration.md): full document retrieved; ACP, native RPC and HTTP/SSE expose different surfaces of the same runtime. Model catalogs use `model.options` or authenticated `/api/model/options`; `/v1/models` is not the complete provider catalog.
- [Chat model controls](https://github.com/NousResearch/hermes-agent/blob/ae3f9f9cb149a828ae61625bb9c84b7bae837a0f/apps/desktop/src/app/session/hooks/use-model-controls.ts): targeted inspection confirms session/profile/connection-specific cache keys, secondary-tile isolation, deferred changes and failure rollback. Primary-session persistence can depend on configuration; do not blindly copy its default-writing behavior into Arkive.
- [Capability shell](https://github.com/NousResearch/hermes-agent/blob/ae3f9f9cb149a828ae61625bb9c84b7bae837a0f/apps/desktop/src/app/capabilities/index.tsx): targeted inspection confirms distinct Skills, Tools, Connectors and Plugins panels, scoped to the correct profile/connection. A remote profile name must never accidentally select the active local gateway.
- [Settings-to-parameter map](https://github.com/NousResearch/hermes-agent/blob/ae3f9f9cb149a828ae61625bb9c84b7bae837a0f/apps/desktop/src/app/settings/config-subpages.ts): main model/context/reasoning/service tier; fallback providers; auxiliary routes; MoA; separate browser-profile/network, context/compression, live voice, STT and TTS families.
- [Repository license](https://github.com/NousResearch/hermes-agent/blob/ae3f9f9cb149a828ae61625bb9c84b7bae837a0f/LICENSE): MIT, copyright Nous Research. Preserve the license and copyright if vendoring substantial source. Review dependency/asset licenses separately. No Hermes source was copied into this routing slice.

These checks supplement the broader installed-source audit, not a claim that every upstream file or runtime was re-audited. GitNexus reported LOW for indexed chat/dispatch callers, but newer settings symbols were absent and refresh failed with registry DNS resolution. Direct source inspection and tests provide the implementation evidence.

### What to reuse, adapt and keep

| Hermes evidence | Arkive treatment | Build gate |
|---|---|---|
| Session-specific model control and rollback | Independently implement route selection in Arkive's composer; retain Arkive consent and source scopes | A1 now; A2 catalog and generation controls next |
| RPC session lifecycle, events, approvals and capability negotiation | Implement a transport adapter around a contained Hermes runtime, not a fork of its full desktop shell | B |
| Skills/Tools/Connectors/Plugins library separation | Adopt the separation and profile/connection ownership model, with Arkive's design and explicit grants | B |
| Learned skills and source provenance | Import reviewed instructions as versioned skills; never silently promote them to factual Canon or authority | B/C |
| Token/tool events and reconnect/open requests | Normalize into Arkive run events; preserve runtime request IDs, terminal states and exact approval targets | B/C |
| Browser/voice/artifacts/remote and jobs | Separate adapters with platform permissions, safe previews and principal-bound routing | C/D |
| Electron-specific UI/SDK and account vault | Do not assume compatibility with Tauri or reuse personal credentials; keep Arkive's shell and node-local secret storage | Separate portability review |

The native gateway's approval and browser messages are bidirectional requests, not merely transcript events. A proper adapter must respond to the exact request on the owning session and clear cancelled requests. Reconnect is not proof that an uncertain action never ran; reconcile before retrying writes. Prefer a dedicated contained runtime with brokered sources and explicitly enabled tools, not the user's unrestricted existing Hermes session.

### A1 — implemented now

- Composer model-connection selector shared by Chat and Canvas. Each option names its saved connection and model. Existing adapter selection remains separate; Hermes still visibly unavailable.
- A saved connection may be pinned to one chat without changing another chat or the node default. Selecting **Follow node default** explicitly removes that pin.
- Node-local encrypted provider sidecar schema v3 stores pins and bounded change history. Old v1/v2 settings load without rewriting; the next explicit settings/pin mutation migrates them atomically. Failed persistence leaves prior state intact.
- Owner-only `GET /v1/settings/chat-routing` returns minimal redacted connection choices and server-resolved per-room adapter fingerprints. Owner-only `PUT /v1/rooms/:id/execution` verifies room existence, enabled connection and expected settings revision.
- Sending and approving resolve the selected room's connection on the server. A queued request cannot execute after a route change; disabled pins block rather than fall back. Connection selection makes no model request and grants no source/tool access.
- UI reload/error states block sending when a route cannot be verified. Changing a pin clears history/send consent. Switching models does not automatically transfer earlier turns; existing exact-route eligibility remains enforced.
- Settings now disclose that default activation changes **unpinned** chats only. Editing the connection record itself affects every chat pinned to that record on its next request; approval fingerprints guard incompatible changes.

**Deliberate scope limit:** pins belong to this node's encrypted settings, not the synced Brain. They are not included in Brain recovery export or replica sync. New/restored chats remain explicitly unpinned until chosen; no silent migration writes or automatic credential transfer. A1 does not yet separate multiple models under one account, copy defaults into new chats, provide reasoning/speed controls, enable concurrent runs, implement history handoff, or connect another harness. The original global busy/serialized execution boundary remains. A1 is a safe first part of A, not completion of A.

### Next bounded build slices

1. **A2 — model/account catalogs and generation controls:** split saved account/auth route from model choices; expose supported capabilities per protocol; per-chat reasoning, output/context budget and service-tier controls only when supported. Retain plain Chat Completions; add native protocols independently. Do not treat arbitrary model IDs as verified capability declarations.
2. **B1 — harness connection + Capabilities vertical slice:** negotiate a dedicated Hermes gateway, persist session/connection ownership, discover skills/tools read-only, render real availability and dependency failures, choose a reviewed skill per chat. Gate execution behind containment and source/tool enforcement. No unrestricted shell/browser grant just to make a demo work.
3. **B2/C1 — approvals, events and artifacts:** wire real requests, streamed content/tools, stop/reconnect and safe output previews end-to-end before widening tool authority. Add an independent second harness before claiming multi-harness execution.
4. Continue C/D/E with voice, fallback/auxiliary routes, remote nodes, durable jobs, channels and trusted plugins. Their settings are functional milestones, not placeholder checkboxes.

## Delivery status

Plan updated and A1 implemented in local source. Verification results are recorded in `PERSONAL_NODE_VERIFICATION.md`. No real provider, Hermes gateway, private Brain, credentials or source vault was used for execution testing. No Git commit/push or deployment was requested or performed. The broader runtime architecture remains under development; this is not a security certification.

## 13. A2/B1 connection-and-discovery increment

### Built locally

- Saved model connections can each request their own `/models` catalog using their own saved key, without changing the active default. A catalog choice opens a reviewable edit; it does not silently replace a model. Timeout, optional temperature and optional output-token limit are editable for every named connection.
- Settings → Agents & harnesses supports up to 10 named Hermes API-server origins, independent dedicated bearer keys, explicit save/edit/disable/remove and a bounded configuration history. Enabled gateways require a key even on localhost. Changes make no automatic network call.
- Explicit gateway inspection performs only `GET /v1/capabilities`, `/v1/skills` and `/v1/toolsets`. API identity is checked before inventory requests. Never follows advertised endpoints or redirects. HTTPS for public remote gateways; HTTP only for recognized loopback. Network destinations are validated and DNS is pinned by the existing transport. Each real request has a 10-second deadline, including DNS, and a 1 MiB response cap.
- Settings → Capabilities reads the same saved observation: searchable skill descriptions/categories; reported toolset enabled/configured states and concrete tool names; API support flags. No enable/install/run switches. Reported supported is NOT verified executable or authorized.
- Catalogs are bounded to 500 skills, 200 toolsets, 100 tools per toolset and bounded strings. Malformed or omitted entries are disclosed. Whole encrypted settings plaintext is limited to 1 MiB. A failed inspection replaces the prior successful observation; partial catalogs remain individually marked unavailable. Editing, locking and reopening require fresh inspection.
- Owner-only routes: `GET/POST /v1/settings/harnesses`, `POST /v1/settings/harnesses/probe`. All require an unlocked Brain and existing origin/credential checks. Sync peers and room members cannot inspect or edit gateway settings.
- `harness-settings.enc` uses the Brain passphrase for encrypted, atomic node-local storage; keys are redacted from responses, never put in browser storage, and excluded from Brain snapshots, replica sync and recovery exports. Removal deletes the active saved connection, not historical backups or the remote installation.

### Still deliberately incomplete

The registry is an actual read-only HTTP adapter, **not a real Hermes execution adapter**. It cannot send prompts to Hermes, launch a process, enable a skill, install a plugin, connect MCP tools, inspect account secrets or grant folder access. No installed Hermes files were changed. No user's gateway was contacted for this verification; tests use synthetic HTTP fixtures matching the inspected API contract.

Model settings still store one model per named connection, not separate account/model entities. Temperature/max_tokens require provider support; catalog membership does not establish that support. Native provider protocols, subscriptions, reasoning/service-tier controls, model fallback, auxiliary routes and parallel runs remain pending.

### Next implementation gate

1. Define a dedicated contained runtime with no inherited personal memory, shell, credentials, filesystem mounts or channel identities. A prompt claiming restrictions is not enforcement.
2. Introduce a capability permission broker: principal + room + source revisions + connection + skill version + exact tools and action scope. Select capabilities per chat; validate again server-side at dispatch and approval.
3. Implement one real Hermes session lifecycle: create/submit, correlated run events and approvals, stop, restart/reconnect reconciliation and an exact run receipt. Never auto-replay uncertain writes.
4. Add safe artifact storage/preview and a second independent harness; only then claim multi-harness execution. Add adapter-supported reasoning controls and bounded parallelism separately.
5. Build durable jobs, voice/browser adapters, messaging channels and always-on server operation on this boundary. Do not provision a paid server or enable a gateway into an unrestricted home profile as a shortcut.

See `HERMES_GATEWAY_CONNECTION.md` for the owner setup and troubleshooting path. This changes connection management and inspection, not the existing Brain/graph/canvas/planner data model or source permissions.
