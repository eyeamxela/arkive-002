# Arkive Personal Beta Verification

Verified on 10 October 2026 on macOS arm64 with Node 22.23.2. This is a local implementation and test result, not a deployed-service or external-provider certification.

## Checkout and application

Worktree: `/Users/xela/Documents/Codex/2026-08-17/referenced-chatgpt-conversation-this-is-an/arkive-personal-node`

Branch: `codex/arkive-personal-node`, based on `03b26a36ecec56376b4d8dee68ea6de3dd0aab53` from `codex/arkive-step2-auth`.

The canonical `/Users/xela/Documents/GITHUB/arkive-002` checkout remains unchanged. Open the new worktree in Cursor to work on this beta. Existing white papers, the original cloud entry point and its canvas components were not changed. No GitHub push or deployment was performed.

Application: `app/src-tauri/target/release/bundle/macos/Arkive Personal.app`. The bundle contains the Node runtime and all personal-node modules. The initial beta's native startup was observed at `tauri://localhost/local.html`, automatically connected to its local node and showing **Start with your world**. The unified workspace workflows were verified in the built browser UI; native startup observation remains the earlier baseline. No real Brain or folder grant was created by the agent.

## Current room-governance checkpoint

This update restores memory-layer rules, scoped room membership and real request activity in the cleaner Personal interface. It follows `cb36a29` on the isolated beta branch. The original checkout is still clean at `03b26a3`; no push, merge, live-provider request or remote deployment is part of this checkpoint.

| Check | Current result | Evidence boundary |
| --- | --- | --- |
| Original application tests | 83 passed | Existing cloud and canvas behavior retained |
| Personal node tests | 85 passed | 67 existing plus 18 new governance/security tests; synthetic encrypted Brains and loopback services |
| Personal UI model tests | 49 passed | Existing graph/session models plus real-record activity and connector geometry |
| Existing workflow browser smoke | 34 passed | Production Personal UI, local API, mock completion and synthetic source writes |
| Graph browser suite | 11 passed | Desktop/mobile graph interaction and visible detail bounds |
| New governance browser suite | 16 passed | Separate owner, participant and reader contexts; real node enforcement |
| App and Convex TypeScript | Passed | No type errors |
| Original cloud and Personal production builds | Passed | No claim that Clerk, Convex or a real model account is connected |
| macOS Personal bundle | Rebuilt | Local development distribution; native startup remains the earlier observation |

There are **217 passing unit/service/model tests** and **61 passing browser checks**. The final Personal frontend has 60 modules and production assets `local-BOklwQaL.js` / `local-D1QwzKbo.css`. The new sharing tests made exactly two localhost mock calls: one owner-history fixture and one explicitly approved member request. Member submission, source/layer edits, pinning, canvas navigation, rejection, pruning and credential revocation did not call a model.

The final macOS bundle completed successfully; all eleven bundled personal-node modules were byte-compared with the tested sources and matched. Fresh GitNexus indexing and staged change detection classified this integration as critical change impact across 30 files, 632 indexed symbols and 97 flows. That measures the breadth of persistence, authentication and UI changes, not an unresolved vulnerability. The beta remains isolated from the original checkout.

The browser suite created memory layers, assigned an agent profile and task, issued separate one-time credentials, granted exact source IDs and pinned context through the UI. It verified private pre-membership history isolation, reader restrictions, awaiting-approval state, exact approved inputs, a redacted member result inspector, connected Infinite canvas cards and mobile access. Removing a finished member receipt required explicit owner confirmation and removed its associated messages while retaining audit evidence. Credential revocation cleared the member's readable content and draft within 3,853 ms in the measured run. No unexpected console, page or network errors occurred, and credentials/passphrases/private drafts were absent from browser storage. Temporary synthetic fixture directories were removed.

Independent source review found and corrected participant storage exhaustion and incomplete uploads blocking owner revocation. Member quotas, explicit terminal-request pruning, bounded pre-queue uploads and dispatch-time reauthentication now have regressions. Completion approval reserves space in both the member ledger and the whole Brain before provider dispatch. Stale room/layer editor tests prove that an older open form cannot restore access restricted in another window. Revoked manifests clear and disable owner disclosure consent and Send. Meaningfully changed permissions conflict with dirty edits; unchanged polling preserves them.

The 18 governance tests additionally cover transitive source evidence, raw code-graph exclusion, late joins and remove/regrant isolation, source and credential revocation, expired/stale manifests, displayed-context fingerprints, provider configuration and profile mismatch, in-flight peer changes, sanitized durable failures, interrupted-run recovery, encrypted reopen, credential-free portable recovery and authority-free replication. This is a bounded beta review and test suite, not an enterprise or production-security certification.

Final screenshots are in ignored `app/.personal-test/`: `governance-owner-context.png`, `governance-agents-network.png`, `governance-canvas.png`, `governance-member-activity.png`, `governance-mobile.png`, `governance-mobile-context.png`, `governance-stale-grant.png`, `governance-stale-layer.png` and `governance-revoked.png`. They contain synthetic data. The new reproducible harness is `app/tests/personal/governance-browser.mjs`; use the same Playwright environment variables as the existing browser harnesses.

Usage and trust boundaries: [Room governance beta guide](ROOM_GOVERNANCE_BETA.md). Local member credentials are bearer secrets, not verified identities or organization SSO. The app does not claim autonomous teams, connected Hermes, a provisioned droplet, physical-phone remote access or a signed immutable audit ledger.

## Previous unified-workspace checkpoint

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Existing application tests | 83 passed | Existing cloud handlers, local vault, canvas models, auth and UI fixtures |
| Store, service and source adapter tests | 67 passed | Synthetic encrypted repositories, temporary vaults, loopback APIs, strict workspace metadata and mocked transports |
| Personal UI model tests | 41 passed | Note/code graphs, consent scopes, transcript pagination, active-room limits and actual revision timelines |
| Browser smoke | 34 checks passed | Built unified UI through real local API and encrypted storage; synthetic model responses and source writes |
| Focused graph browser checks | 11 passed | Pointer and keyboard selection, pan/zoom/drag, local scope, search, code inspection, visible detail bounds and mobile layout |
| App and Convex TypeScript | Passed | `tsc --noEmit` and Convex project check |
| Existing cloud production build | Passed | Vite build; not a verified Clerk or Convex account connection |
| Personal production build | Passed | 54 transformed modules; no remote assets needed |
| Rust check | Passed | `cargo check --offline` |
| macOS application bundle | Passed | `npm run bundle:personal`; local development distribution |
| Native startup | Baseline observed | Real window and local bridge reached empty-Brain setup before the source-and-graph update |
| Live local GitNexus export | Passed | Registered beta repository yielded 500 nodes and 1,088 relationships, explicitly truncated |
| Real Obsidian vault or GitHub repository write | Not performed | User source targets and credentials remain unselected; no real source writes |
| Docker engine | Not running | Container and TLS examples are prepared but not runtime-tested |
| Live model, Hermes, Telegram, droplet | Not connected | No real credentials, provider requests, messages or cloud resources used |

The browser checks covered note creation, explicit folder import and refresh, preservation of original files, selected-source-only context, per-request disclosure consent, manual memory proposal and approval, Graph/Files views, independent second chat, encrypted download, lock and service restart recovery. There were no console errors, failed requests or page-level horizontal overflow in the tested 1512px desktop and 390px mobile layouts. Tokens and passphrases were absent from browser storage.

The browser evidence is saved locally in ignored `app/.personal-test/desktop.png`, `mobile.png`, `obsidian-graph.png`, `gitnexus-graph.png`, and `source-write-preview.png`. Reproduce it from `app` after `npm run build:personal`. The smoke script accepts `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE_PATH` for an existing Playwright installation and browser; it does not install dependencies or call a live provider.

The source-and-graph browser checks additionally verified a real scoped wiki-link, keyboard node inspection, a preview that leaves its source untouched, explicit write confirmation, original-byte history, source readback, and separate code-symbol inspection. A test locator initially expected a region role on a labelled detail div; correcting the locator allowed the full run to pass without browser/runtime errors.

## Previous unified workspace verification

The updated run covers 191 unit/service tests in total (83 original and 108 Personal), 34 full browser checks and 11 focused graph checks. The full browser run used production assets `local-ifDXjsVU.js` and `local-Dh8hvBqV.css`.

The unified macOS bundle completed successfully with those same production assets. Resource inspection confirmed that the new workspace service module is bundled alongside the Brain and server. This build was not opened against a real user Brain during this update.

The 34 checks include standalone text import, one shared transcript/context across Chat and three canvas layouts, draft retention with consent revocation on navigation, more than 10,000 pixels of canvas pan, zoom, pointer dragging, and Fit controls that do not overlap Send. Creating a thirteenth/fourteenth room or selecting a hidden room keeps the active conversation visible within the 12-room canvas limit.

Task creation/status, source-bound agent profiles, context presets, Library collections and actual audit events were verified through the UI and persisted through node restart and browser reload. Opening a profile or applying a preset never called the model. Freeform positions survived view changes; Timeline used real revision dates. Locking removed readable data and drafts. No owner credentials, passphrases or private drafts were stored in browser storage.

The final 390×844 mobile check verified a bounded app/document, a one-column drawer with all thirteen destinations reachable, source selection and an unobstructed Send control. There were no page errors, console errors, failed requests or HTTP errors. All temporary synthetic Brains and source files were removed after the run.

Screenshots in ignored `app/.personal-test/`: `unified-chat.png`, `unified-infinite.png`, `unified-radial.png`, `unified-multi-room.png`, `unified-brain.png`, `unified-work.png`, `unified-mobile.png` and `unified-mobile-nav.png`. They show synthetic test content, not a populated user Brain.

Review corrected mobile inherited CSS, canvas-toolbar overlap, consent surviving a hidden-view round trip, and active rooms falling outside the rendering cap. Strict workspace tests also reject prototype-key categories, duplicate identities, invalid timestamps, unknown references and credential-shaped fields. Export/restore retains workspace records; peer sync excludes them and cannot overwrite local choices.

The final staged GitNexus check classified the integration as critical change impact across 27 files, 391 indexed symbols and 69 flows. This reflects the breadth of the new UI and persistence path, not a specific unresolved vulnerability. The integration remains isolated in the beta worktree; the original checkout is still clean at `03b26a3`.

## Security and recovery checks

Owner and peer credentials have separate authority. Tests reject missing credentials, unauthorized browser origins, peer access to owner routes and locked-Brain reads. Wrong passphrases and altered ciphertext fail closed. Recovery into an existing Brain is refused and restored folder grants are cleared.

Replication tests cover identical-Brain pairing, foreign-Brain rejection before sending local data, fast-forward histories, preserved divergent heads and simultaneous reciprocal sync. Local-only rooms, proposals, audit claims and folder grants do not appear in the replica payload.

Outbound requests reject private and metadata network addresses, plaintext remote URLs, credentials embedded in URLs and redirects. Context tests confirm that unselected sources and prior chat history are not sent. Missing adapters and invalid model responses cannot invent successful chat results.

Desktop EOF shutdown was tested during a stalled mock provider request. The process cancelled the request, exited successfully, released the writer lock and left no phantom messages. Normal exit now closes the private pipe instead of immediately killing the child. Forced termination and machine crashes still require stale-lock recovery as described in the setup guide.

Independent review caught and corrected malformed-URL crashes, backup-envelope size mismatch, missing inter-module contracts and abrupt native shutdown. The importer rejects hardlinks and checks path and inode stability after reading. These checks are not a complete filesystem sandbox against malicious same-user races.

Source integration review caught two further issues and added regression tests. Stale write approvals now preserve the newest cached Brain head, while separately retaining preview bytes as immutable history. A GitHub timeout after sending a write is reported as unconfirmed, with an instruction to inspect the source before retrying. Approval plans are single-use, bounded and cleared on lock. Tests cover exact confirmation, tampered client payloads, cancellation, replay, source scope, peer denial, token-free decrypted exports, and restored grants being cleared. Generic note edits cannot overwrite an imported source while retaining misleading commit provenance; a separate note or reviewed source write is required.

GitNexus impact analysis reported low indexed risk for the existing native startup symbol. After indexing and staging all new modules, its complete diff classified the addition as critical impact: 27 files, 620 symbols and 58 affected execution flows. This broad change is isolated on the beta branch, not merged into the original checkout. The classification is a change-impact signal, not a finding that a particular vulnerability exists; the new modules were separately reviewed and tested. The final outbound URL correction has one indexed direct caller and low impact.

For the source-and-graph update, fresh indexing and staged change detection again classified the diff as critical impact across storage, source adapters and graph UI. The revision payload and validator were treated as critical paths; backup, restore, provenance and replica tests passed. This remains a local beta checkpoint, not a merge or push to the canonical branch.

## Remaining release gates

1. Complete the first user-controlled session with a non-sensitive folder and a recoverable passphrase. Native picker and native download interaction have not been exercised with a real user Brain; browser equivalents have been tested.
2. Configure an actual model endpoint and run an explicitly approved, non-sensitive request. This verifies provider credentials and its response format beyond the mock adapter.
3. Start Docker locally, build and scan the prepared container, then verify persistent-volume restore and TLS before considering a personal-server deployment.
4. Choose and approve a server host, domain, cost limit and backup plan. Test access from a physical phone after deployment; a mobile browser viewport alone does not prove this.
5. Add scoped device pairing, credential rotation, conflict resolution, memory invalidation and real harness/channel adapters before team or unattended use.

This release does not claim enterprise multi-user permissions, arbitrary agent tool execution, automatic synchronization, a signed immutable ledger, P2P storage, Hermes integration, Telegram delivery or a created DigitalOcean droplet.
