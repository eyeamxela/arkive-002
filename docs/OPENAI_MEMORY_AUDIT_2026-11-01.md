# Arkive OpenAI and chosen-memory audit
Date: November 1, 2026 (America/Los_Angeles)

## Verdict

The direct OpenAI connection works in the installed Mac app. Two live tests passed: one selected synthetic source was used and cited; when it was deselected and history remained off, the same chat could no longer supply the facts. No private vault documents were selected for these requests.

This is a verified pilot path, not a claim that every function, model, provider, or failure mode is production-ready. The audit found concrete reliability and observability gaps.

## Scope and evidence

- App: /Applications/Arkive Personal.app.
- Worktree: arkive-personal-node, branch codex/arkive-personal-node, HEAD 590aa81673bfa5f6ab7c689297a0d67e638d5f2c.
- Existing uncommitted Hermes/settings changes were preserved. No application source was changed, committed, pushed, rebuilt into the installed bundle, or restarted during this audit.
- User entered and saved their API key in Arkive. The assistant did not read, copy, or print it.
- Connection shown in the UI: OpenAI at https://api.openai.com/v1; configured model gpt-6.1-sol; direct openai-compatible adapter, not Hermes.
- The current receipt records the configured model, not the provider-returned model snapshot.
- GitNexus index refreshed with embeddings off and AGENTS.md updates skipped: 319 files, approximately 8,000 nodes, 12,547 edges, 300 flows. Unique index name preserved as arkive-personal-node.
- GitNexus symbol traces covered ChatWorkspace/controlsFor/requestConsentScope, executeChat/executePrepared, and governance.compile/beginRun. Keyword search continued reporting read-only FTS warnings, so symbol graph results were combined with direct source inspection and execution tests. The graph is an audit aid, not a correctness proof.

## Verification results

| Check | Result |
| --- | --- |
| TypeScript/Vite personal build | Passed; existing large-chunk warning remains |
| Personal unit tests | 322 passed, zero failures |
| Synthetic browser suite | 99 checks passed |
| Live OpenAI with one selected note | Passed |
| Live OpenAI with no sources and history off | Passed |

An initial sandboxed unit run failed on localhost socket permissions. Re-running with the required local-socket permission passed all 322 tests. That initial environmental failure is not counted as an app defect.

Logs from this run: /tmp/arkive-openai-audit-build.log, /tmp/arkive-openai-audit-unit-approved.log, /tmp/arkive-openai-audit-browser.log. These temporary logs are not durable tracking storage.

## Live test details

Created a separate room named **OpenAI memory audit**, leaving the original room's selected vault sources unchanged. Two clearly labelled source notes remain in the Brain for reproducibility; neither was promoted to approved memory or Canon.

1. **OpenAI audit — selected sample**
   - Source: obj_9efce898-e2da-4688-846d-19fb1d71e1d3
   - Revision: rev_b5c12d1e-3940-45a4-947a-7a0057f608dc
   - Synthetic fact: fictional Lantern launch marker ORCHID-742, review day Tuesday.
2. **OpenAI audit — excluded sample**
   - Source: obj_a0ab15d5-30ba-42d4-aec1-3b97e1c116e2
   - Synthetic fact: fictional Harbor private marker QUARTZ-913.
   - Kept unselected throughout both live requests.

### Request 1: selected-source grounding

Run: run_77940380-3925-4636-97b5-4b9df2a2d67f, 7:56:11–7:56:15 PM.

The UI showed one selected/effective source, no history, and explicit per-request consent. The answer returned:

> Lantern: launch marker ORCHID-742; review day Tuesday. [obj_9efce898-e2da-4688-846d-19fb1d71e1d3]
>
> Harbor: not provided

Receipt inspected in the native app: completed, exactly one source revision, zero prior turns, provider started/completed events.

### Request 2: source deselection and history isolation

Run: run_07ca1320-7e6d-4538-b98b-cb38ead250a5, 7:56:44–7:56:47 PM.

Deselected the note in the same room. Kept conversation history off. Sent a new explicitly approved request asking for the same facts without supplying their values.

> Lantern launch marker and review day: not provided.
>
> Harbor private marker: not provided.

Receipt inspected: completed, zero source revisions, zero prior turns. The earlier visible answer was not silently reused as model history. Final room state is zero selected sources with history and send consent unchecked.

These observations support the intended boundary for these tests. They are not an exhaustive proof against all leakage or prompt-injection scenarios.

## What the code and tests establish

- Selected, permitted source IDs and revisions determine the evidence payload.
- Exclude/ask layers, room-member access intersections, agent limits, source dependencies, manifests and stale revisions restrict dispatch.
- Changed prompt, provider, model, source revision, permission scope or history choice invalidates browser consent.
- Server expectedContextKey and expectedProviderKey checks reject stale browser state.
- History is opt-in, bounded and tied to room, requester, authority, source revisions and connection.
- Model discovery is metadata-only; saving settings does not send a chat.
- Output is not automatically approved memory.
- Current context behavior is full-text inclusion of selected permitted sources, not semantic retrieval over the entire vault.

## Findings to address

### P2: incomplete answers can be marked complete

personal-node/execution.mjs:149 reads content without handling finish_reason. A synthetic response with partial text and finish_reason=length was persisted as completed. Add explicit incomplete/refusal/filter/tool outcomes and prevent incomplete answers silently entering normal eligible history.

### P2: errors are too generic to troubleshoot

personal-node/execution.mjs:71 and personal-node/server.mjs:454 collapse provider failures into generic REQUEST_FAILED/configuration advice; personal-node/brain.mjs:499 records a generic failed receipt. A synthetic authentication failure reproduced this behavior. Preserve allowlisted categories for authentication, quota/rate limits, unsupported model/parameters, timeout and connectivity. Never expose raw provider bodies or secrets.

### P2: generation controls are not model-aware

personal-node/execution.mjs:147 sends optional maxTokens as max_tokens for every model and forwards temperature whenever set. OpenAI documents max_tokens as deprecated and incompatible with o-series, with max_completion_tokens as its replacement. Add provider/model capability mapping and regression tests. The successful live tests do not validate every advanced generation setting.

Official reference: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create

### P2: all discovered model IDs are selectable

app/src/personal/ModelSettings.tsx:65 accepts the account model list, while execution always uses Chat Completions. Non-chat model IDs can be saved as if ready for chat. Add compatibility filtering or explicit compatibility/untested labels and validation. The live gpt-6.1-sol path worked.

Official model endpoint reference: https://developers.openai.com/api/docs/models/gpt-6.1-sol

### P2 usability: large memory selections fail only at send

personal-node/governance.mjs:183–184 serializes full selected source text and rejects over 160,000 serialized characters. This fails closed, but the composer lacks a size estimate/preflight and can look ready beforehand. Add visible context budget and an explicit source-reduction workflow; do not silently drop or widen sources.

### Audit-accounting gap

Provider usage, response ID, returned model and finish reason are discarded. A synthetic response with 301 tokens and a different returned model demonstrated that only the configured model remained. Add backward-compatible, validated receipt fields so users can inspect what actually ran and whether it was complete.

### P3: duplicate connection naming

Repeated OpenAI connections get the same default display name, but the registry requires unique names; rename is hidden under Advanced. Auto-suggest unique names or expose naming during creation.

## Recommended next patch

1. Safe provider error categories and explicit incomplete-response handling.
2. Compatible-model selection and provider-aware generation controls.
3. Usage/response-model/finish-reason receipt fields.
4. Visible context budget and clearer connection naming.
5. Regression tests for each gap, then a small live retest.

No fixes in this list were implemented or pushed in this audit. Other real harnesses, channels, voice, browser automation, scheduled jobs, multi-user production security and always-on deployment were not live-validated here.
