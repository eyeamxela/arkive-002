# Arkive OpenAI reliability fixes

Date: November 1, 2026 (America/Los_Angeles)

## Scope and release state

This implementation follows [the OpenAI and chosen-memory audit](OPENAI_MEMORY_AUDIT_2026-11-01.md). It fixes the seven identified reliability and observability gaps in the local worktree. The original audit is retained as historical evidence, not rewritten as if these fixes existed during its live tests.

- Repository: `arkive-personal-node`, branch `codex/arkive-personal-node`.
- Git HEAD remains `590aa81673bfa5f6ab7c689297a0d67e638d5f2c`.
- The installed `/Applications/Arkive Personal.app` was not replaced or restarted.
- No commit, push, deployment, live provider request or private Brain read was performed for this patch.
- All tests used disposable synthetic Brains, synthetic notes and local mock providers/gateways. The real API key was not read or copied.
- Pre-existing uncommitted Hermes, channels and settings work remains intact. The aggregate worktree diff is larger than this patch.

## Implemented behavior

### 1. Honest response outcomes

The direct text-chat adapter checks the provider's finish reason and response shape. A normal `stop` outcome is complete; output-limit, refusal, filtering, unsupported tool requests and missing/unknown completion signals are distinguished. Non-complete answers are visibly marked and excluded from eligible conversation history. No tool request from this text-only adapter is executed.

Incomplete output is retained for inspection rather than silently discarded or presented as a finished answer. Chat, live activity and the agent activity history show the outcome. Malformed, empty and oversized responses fail safely.

### 2. Safe, actionable provider errors

Allowlisted diagnostics distinguish authentication, permissions, quota, rate limits, model availability, parameters, context size, timeout, connectivity, cancellation and invalid responses. The UI and failed-run record receive a stable code and static guidance, never raw provider error text, request bodies, credentials or internal exception messages.

Local authorization and stale-revision errors retain their own status and are not incorrectly relabelled as provider failures. Model discovery uses the same safe diagnostics and explicitly states that it sends no Brain content.

### 3. Model-aware generation controls

Official OpenAI requests use `max_completion_tokens`; custom compatible endpoints keep their existing `max_tokens` contract. Optional temperature is omitted for known reasoning families and unverified official models. Unsupported models are rejected by the node, not just hidden in the UI.

The UI explains when a setting is incompatible and requires the user to clear it explicitly instead of silently rewriting stored preferences. Output budget labels explain that reasoning can consume the same budget. Model capabilities are a conservative local compatibility map, not an assertion that an account has access to every listed model.

### 4. Compatible model selection

Known incompatible embedding, image, transcription, realtime and other non-supported model families are not offered as ordinary text-chat choices. Manually entering a known incompatible ID blocks saving. Unknown/custom models remain usable with an explicit unverified warning; account discovery is not treated as proof of chat compatibility.

### 5. Selected-memory budget before dispatch

Chat and room governance display the server-computed serialized size of the permitted evidence. Above 160,000 serialized characters, sending and consent are disabled. The compiler independently rejects oversized context even if a client bypasses the UI. Removing a source clears the size block but does not restore old send consent.

This is a source-size limit, not a token estimator or a guarantee that the whole request fits a model's context window. Prompt and optional history also consume tokens. There is no silent truncation, semantic retrieval, source expansion or automatic source removal. Counts do not include hidden sources outside the requester's permitted scope.

### 6. Provider receipts

Validated optional receipt fields record outcome, finish reason, returned model, response ID and reported input/output/total/reasoning tokens. Owner views show the full receipt; shared-member snapshots and live events expose only outcome and optional finish reason. The backend enforces this projection, independently of UI hiding.

Receipt fields are bounded and validated; inconsistent usage is discarded. These are provider-reported metadata, not billing evidence or cryptographic proof. A complete response remains unverified output and is never promoted to Canon automatically.

Existing Brains and historical runs without receipts remain readable. Missing historical usage or finish reasons cannot be reconstructed retroactively. Incomplete history exclusion applies to new runs with known outcomes; legacy runs retain their prior semantics.

### 7. Distinct connection names

New connections receive unique suggested names, and the name is directly editable in the add-provider flow. Multiple OpenAI connections can retain separate credentials, models and generation settings without automatically activating or sending through any of them.

## Verification

| Check | Result |
| --- | --- |
| TypeScript and production personal-UI build | Passed; existing large-chunk warning remains |
| Unit, service and model tests | 347 passed; zero failures |
| Shared-room browser suite | 16 checks passed |
| Main synthetic browser suite | 107 checks passed; console and network checks clean |
| Whitespace/error-marker check | Passed |
| Installed native app and real OpenAI retest | Not run for this patch |

Coverage includes exact budget boundaries, escaped/unicode evidence, permission-filtered counting, incomplete-history exclusion, encrypted reload, legacy receipts, owner/member receipt projection, live-event redaction, invalid provider payloads, model parameters, safe error categories, unsupported-model controls and independent connection names. Shared-room browser checks include approvals, changed grants, revocation and mobile layouts. The main browser suite also exercised existing planner, templates, folder sorting/colors, navigation, chat/canvas, settings and mock Hermes workflows. Final synthetic screenshots of the incomplete receipt and oversized-memory block were visually inspected. A separate read-only UI review found no additional actionable correctness or disclosure issue.

GitNexus was refreshed with embeddings disabled and without rewriting repository instructions: 8,206 nodes, 12,862 edges, 294 clusters and 300 flows. Direct symbol impact checks informed review. Shared run-status styling has wider impact and was covered through chat/canvas/activity regressions. The aggregate change report also includes inherited uncommitted features and is not a measure of this patch alone. Keyword-search indexing still reports read-only FTS warnings; direct source inspection and executable tests supplement graph results.

Temporary test logs and screenshots are development evidence, not durable tracking storage. This report records the durable verification outcome; the full implementation remains in the local repository.

## Boundaries and next release gate

This patch does not establish production readiness of every model, harness, plugin, channel or always-on server. It does not change the user-owned memory architecture or grant new folder access. Existing per-request consent, room permissions, source revisions and output-review boundaries remain in place.

Rebuilding/replacing and reopening the installed Mac app requires a separate approved step. A small explicitly authorized live test can then verify the new receipt/error presentation with a synthetic selected note. Pushing the accumulated worktree is also a separate release decision and should include a scoped review of its pre-existing changes.

## External protocol references

- [OpenAI Chat Completions request and response reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [OpenAI latest-model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI API changelog](https://developers.openai.com/api/docs/changelog)

## Approved Mac installation follow-up

After the local verification above, the user explicitly approved rebuilding and reopening the installed app. This section supersedes only the earlier pending-installation release state; the earlier verification and privacy boundaries remain unchanged.

- `npm run bundle:personal` passed, including TypeScript, Vite and the Rust release build.
- The production UI uses the same tested assets: `local-9Npr-q-6.js` and `local-BErfdih7.css`.
- All 27 bundled service modules matched the current source byte-for-byte, with identical filename sets. The bundled Node runtime is v22.23.2, macOS arm64; the native executable is arm64.
- Saved a complete recovery copy of the prior application and compared its contents with the original before installation: `/Users/xela/Documents/Codex/2026-08-17/referenced-chatgpt-conversation-this-is-an/outputs/app-backups/20261101-204755/Arkive Personal.app`.
- The generated local bundle needed a complete ad-hoc signature. Applied local ad-hoc signing and verified it with deep/strict validation. This is still a local development build, not a Developer ID-notarized public release.
- Quit the old app normally, confirmed its app and child-node processes had stopped, and copied the new bundle to `/Applications/Arkive Personal.app`.
- The installed bundle compared exactly with the new build; deep/strict signature verification passed after installation.
- Reopened the installed app. Native UI inspection confirmed `tauri://localhost/local.html`, **ENCRYPTED BRAIN · LOCKED**, **Welcome back**, and the passphrase/unlock controls. No unlock was attempted.
- No private Brain contents or API credentials were read or edited. No live provider request was sent. The backup is an application-code recovery copy, not a Brain-data backup.
- No commit, GitHub push or deployment. Git HEAD remains `590aa81673bfa5f6ab7c689297a0d67e638d5f2c`.

Installed native executable SHA-256: `7c63d79aaa57211085f09d4f1fe17846f321d036996fbc2cf5438dd9217ec4ef`.
