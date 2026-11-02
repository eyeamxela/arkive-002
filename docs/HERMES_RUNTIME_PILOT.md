# Hermes-first runtime pilot

Status: local implementation, not deployed or connected to a live Hermes instance.

## Ownership boundary

Arkive owns the interface, imported sources, graph, room context compilation, source revisions,
memory proposals, approvals presented in Arkive, and encrypted run receipts. Hermes owns its
execution loop, provider authentication, installed skills, runtime plugins and tools.

This is a versioned adapter, not a fork of Hermes and not a direct integration with its SQLite
database. The existing plain-model adapter remains available. Replacing the runtime must not
require replacing the Brain.

The first transport is Hermes's authenticated HTTP `/v1/runs` API with SSE events. This fits
the existing encrypted gateway registry and supports both local and remote servers. Native
TUI JSON-RPC/ACP are not implemented. No Hermes source files or installed configuration were
modified. Protocol was checked against installed source revision
`63d0b94120027d487c9a5235b9ec64b696af1b26` in `gateway/platforms/api_server_runs.py` and
`gateway/platforms/api_server.py`.

## Implemented flow

1. Settings → Agents & harnesses: add a dedicated Hermes API origin and bearer key.
2. Optionally inspect capabilities, installed skills and toolsets. These are metadata GETs;
   neither saving nor inspecting dispatches a task or grants execution.
3. Enter the explicit model ID configured on that Hermes server. The `hermes-agent` virtual
   default alias is rejected for execution. Multiple saved gateways remain independent.
4. Enable owner-chat execution, acknowledge the runtime boundary, then save. Credentials
   and execution preference are encrypted in the existing node-local sidecar, not Brain sync.
5. In a private chat, select `Hermes · <gateway name>` in the agent provider picker, select
   Brain context, and give per-send consent. The plain-model connection picker only controls
   the separate Arkive text adapter. Hermes model configuration lives on its gateway entry.
6. Arkive preflights authenticated run, stream, approval and stop support. It compiles the
   same permission-filtered, revision-pinned context used by its other adapter.
7. Submit once with the Arkive run ID as the idempotency key. Use a fresh remote session per
   request; never reuse arbitrary Hermes chat sessions or `previous_response_id`. Optional
   history comes from Arkive's exact-scope, same-connection history selection.
8. Stream text and tool names into chat. Show exact pending approval requests. Only `once`
   and `deny` are exposed; never `session`, `always` or approve-all. Controls bypass the
   active request's mutation queue, avoiding approval deadlock, but remain owner-authenticated.
9. Record approval intent before dispatch and confirmation after the gateway confirms exactly
   one request. Keep bounded lifecycle events and an audit trail; do not persist raw tool
   arguments, credentials, streamed reasoning or partial replies in the receipt.
10. Publish only a valid completed response through Arkive's normal unverified-output path.
    Failed, partial, cancelled, mismatched or interrupted runs never become completed chat
    answers and never become Canon. Stream loss does not trigger an automatic rerun.

## Actual security guarantees and limits

- **This adapter is not a sandbox.** A separate Hermes profile is not OS isolation. The
  operator must restrict the runtime's filesystem, network, tools, credentials, memory and
  retention. Do not connect an unrestricted everyday profile to sensitive Brain sources.
- Arkive filters the data it sends. It cannot stop Hermes from accessing data already
  available inside its runtime. The setup and per-send UI explicitly disclose this.
- Execution is owner-only and blocked in rooms with member grants. Member and sync-peer
  credentials cannot use runtime controls or inspect owner runtime progress. Multi-tenant
  runtime isolation is a separate, unfinished prerequisite for shared-room agent execution.
- Hermes may retain submitted context. Locking Arkive clears the local session; it does not
  erase remote Hermes memory/history. Deletion/retention must be configured on Hermes.
- Not every Hermes tool requests approval. Arkive only bridges approval events actually
  emitted by the gateway. Once/deny is not a universal tool permission broker.
- Model IDs are requests to the runtime, not an independent provider lock. Disable fallback
  routing server-side if exact-model disclosure matters. A reported different served model
  blocks publication, but cannot undo data already sent by Hermes to that model.
- HTTP is allowed only on loopback; remote origins require HTTPS. Transport rejects
  credentials in URLs, private destinations, redirects and oversized responses, and pins DNS
  resolution while preserving TLS validation. Neither discovery nor execution follows
  endpoint URLs supplied inside gateway metadata.
- Bounds: 10 minutes per run; 8 MiB event stream; 256 KiB frame; 20,000 frames; 128,000 reply
  characters; 250 tool/approval activity events; 16 simultaneous pending approvals.
- Stop, timeout, stream failure and process shutdown attempt a remote stop. **Stop is not a
  rollback or a guarantee of termination.** If dispatch acceptance was lost, the remote run
  ID may be unknown; inspect the dedicated gateway before retrying. No automatic write replay.
- Settings and permission mutations wait behind an active run. Use its Stop button first.
  Node shutdown aborts the stream; a later restart fails unfinished receipts rather than
  resuming execution automatically.

## Installation / connection prerequisites

Arkive does not install Hermes, pull container images, start a server, change a live profile,
read existing private credentials, or provision a droplet. Before enabling the connection:

- Create a dedicated isolated runtime with only intended capabilities and data mounts.
- Configure provider authentication and the desired model there, including fallback policy.
- Enable the authenticated API server with a dedicated bearer key. Expose only loopback or
  an authenticated HTTPS endpoint, not a public unprotected port.
- Verify retention and tool approval behavior using synthetic data first.
- Enter its real API origin/key in Arkive, not a web-chat URL. Check capabilities, opt in,
  then send a non-sensitive test from a private room.

## Next increments (not shipped)

1. Managed isolated runtime lifecycle with verifiable mounts, egress and tool policy.
2. Hermes provider/model catalog picker and capability-aware reasoning controls.
3. Skills/plugin installation, updates and toggles through supported runtime management
   APIs, with provenance, review, version pinning and rollback. Runtime plugins are distinct
   from desktop UI plugins; no assumption that all plugins can be embedded in Arkive.
4. Structured artifacts, checkpoints, controlled background runs, channels and scheduling.
5. Room-bound runtime policy and isolation before enabling member/shared-room execution.
6. Additional adapters through the same Brain/context/run-receipt boundary.

## Verification

Synthetic localhost fixtures exercise the real HTTP and SSE transport, encrypted Brain
storage, stale consent, one-time approval, concurrent controls, cancellation, disconnected
streams, capability rejection and malformed/oversized streams. Browser tests exercise the
settings acknowledgement, chat selection, streamed activity and approval UI. These tests
do not prove compatibility with every Hermes version, a live provider or a real tool action.

Official protocol references:
- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md
- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md

No production deployment, live provider delivery, managed sandbox or live acceptance test
is claimed by this document.
