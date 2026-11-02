# Simple model setup — October 13, 2026

## Implemented interaction

Settings → Models & connections now has one main model screen instead of separate overlapping default and saved-connection forms:

1. Select a saved provider connection.
2. Choose a model (or enter an exact model ID).
3. Apply explicitly to make it the default for unpinned chats.

Add provider opens a short inline setup form: provider type, key when needed, Load models, model, Save connection. Presets fill the endpoint; custom endpoints expose the URL. Timeout, temperature, output-token limit, enable/disable and credential clearing are under Advanced. Supported-connection/privacy details and history are collapsed.

Saving an additional connection does not activate it. Applying it as the default is separate. Editing a connection's model changes future sends for chats pinned to that connection; the UI discloses this. Chats pinned to other connections remain separate. These remain one-model-per-connection records, not a new shared account/multiple-model backend schema.

## Hermes source reuse

Read-only inspection of `/Users/xela/.hermes/hermes-agent` at `63d0b94120027d487c9a5235b9ec64b696af1b26`:

- `apps/desktop/src/app/settings/model-settings.tsx`: provider/model selection, inline API-key activation, explicit Apply, provider-change reset and profile-epoch guards.
- `apps/desktop/src/app/settings/model-select.tsx`: preserve a saved custom model in the picker and keep action values separate from model IDs.
- `apps/desktop/src/app/settings/providers-settings.tsx`: separate configured providers and setup flows.
- Repository `LICENSE`: MIT, copyright Nous Research.

The three small model-value helpers in `modelOptions.mjs` are adapted from Hermes. The interface follows its interaction pattern using Arkive React/CSS and encrypted service APIs; the entire Hermes runtime, auth store, component framework or configuration system is not copied. The full notice is in `docs/licenses/HERMES-MIT.txt` and `app/public/licenses/HERMES-MIT.txt`, included in the built UI.

## Discovery and safeguards

The existing owner-only `/v1/settings/provider/check` accepts a transient draft so a user can discover a model before saving its ID. Load models is explicit authorization for a bounded GET to the displayed endpoint; it sends no Brain content or completion request and does not save the draft. Changing provider clears typed keys, model choice and catalog. The model list is capped at 500 entries, with a manual-ID fallback. A listed model is not necessarily chat-capable, authenticated for execution, or verified to support optional generation settings.

New drafts never inherit the active provider's key. Retaining a saved key requires an explicit connection ID, and the existing endpoint-change guard requires replacement or clearing before reusing another endpoint. Revision checks reject stale results. Existing HTTPS/local-host, private-network, response-size, timeout, redaction, locked-Brain, owner/member and origin guards remain. Credentials are never stored in browser storage or Brain objects. Requests still require room permission checks and explicit send approval.

Presets were checked against primary provider documentation:

- [OpenAI model-list API](https://developers.openai.com/api/reference/resources/models/methods/list)
- [OpenRouter Chat Completions API](https://openrouter.ai/docs/api_reference/overview)
- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)
- [LM Studio OpenAI compatibility](https://lmstudio.ai/docs/developer/openai-compat)

The adapter remains plain Chat Completions. ChatGPT/Codex subscription sign-in, native Anthropic authentication, reasoning/service-tier controls, automatic fallback and actual Hermes execution are not implemented by this UI change. These are stated in the interface rather than represented by nonfunctional controls. No provider's credentials or private Hermes configuration were inspected.

## Verification and delivery

- 292 unit/service/model tests passed, including five additional discovery/picker tests. The final expanded HTTP test verifies draft discovery is blocked for members, foreign origins and locked Brains, and preserves the saved registry and Brain snapshot.
- All 72 browser checks passed against the final production frontend with disposable synthetic Brains and mock endpoints. Includes desktop/390px/320px, before-save discovery, provider reset, key separation, saved generation parameters, default activation, cancellation, chat pins and existing workflows. No unexpected browser/network errors.
- TypeScript, frontend and macOS arm64 desktop build passed. All 19 bundled service modules match source. The built UI contains the Hermes MIT notice.
- Desktop main-picker and add-provider screenshots were inspected. Shared Arkive theme tokens remain; no new palette was introduced.
- React review: no new dependencies, bounded lists, explicit labels, collapsed advanced controls, disabled mutation controls while pending, abortable initial load, epoch-guarded discovery, no browser-persisted keys and no automatic outbound catalog requests.
- GitNexus could not resolve the recent settings symbols or route. Its available process map and direct source/caller inspection were used alongside regressions; no complete fresh graph claim is made.
- The user approved a restart after saving drafts. Arkive was gracefully quit and the rebuilt bundle reopened; a new process was verified. The private Brain was not unlocked or modified by this work. Live provider execution remains unverified.
- This increment is local and not committed, pushed, merged or deployed.
