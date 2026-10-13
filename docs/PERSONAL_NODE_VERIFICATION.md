# Arkive Personal Beta Verification

Latest checkpoint verified on 13 October 2026 on macOS arm64 with Node 22.23.2. This is a local implementation and test result, not a deployed-service or external-provider certification.

## Checkout and application

Worktree: `/Users/xela/Documents/Codex/2026-08-17/referenced-chatgpt-conversation-this-is-an/arkive-personal-node`

Branch: `codex/arkive-personal-node`, based on `03b26a36ecec56376b4d8dee68ea6de3dd0aab53` from `codex/arkive-step2-auth`.

The canonical `/Users/xela/Documents/GITHUB/arkive-002` checkout remains unchanged. Open the new worktree in Cursor to work on this beta. Existing white papers, the original cloud entry point and its canvas components were not changed. No GitHub push or deployment was performed.

Application: `app/src-tauri/target/release/bundle/macos/Arkive Personal.app`. The bundle contains the Node runtime and all personal-node modules. The initial beta's native startup was observed at `tauri://localhost/local.html`, automatically connected to its local node and showing **Start with your world**. The unified workspace workflows were verified in the built browser UI; native startup observation remains the earlier baseline. No real Brain or folder grant was created by the agent.

## Current settings and model connection checkpoint

Settings is an owner-only destination with Models & connections, Agents & harnesses, Memory & access, Nodes/sync/recovery, Workspace/identity, Appearance/shortcuts and Channels/availability. Existing Personal node controls remain reachable. Command/Ctrl + comma opens Settings. The source-backed comparison and complete parameter/storage contract are in `docs/SETTINGS_AND_BUZZ_MAPPING.md`.

One active OpenAI-compatible connection can now be configured through the app. The encrypted node-local sidecar stores endpoint, model, credential, enable state, timeout and optional temperature/max output tokens. Keys are never returned by the API or included in Brain exports, replicas, room context or browser storage. Saves are owner-only, revision-guarded and do not call a model. Changing endpoint requires an explicit replacement/clear choice for an existing key. The optional model-list check sends no Brain content and is labeled separately from completion verification. Model, endpoint and generation changes retain approval fingerprint protection; no shell or agent harness was added.

Verified on 13 October 2026: **264 Personal tests** and **52 full-workflow browser checks** pass. This includes persistence through service restart, encrypted credential storage, malformed/unsafe endpoint rejection, member/locked/origin isolation, metadata-only model checks, real synthetic mock-chat dispatch with generation settings, unchanged source/room permissions, keyboard navigation and 390/320-pixel layouts. Desktop/mobile Settings screenshots were visually inspected. Real credentials, real model providers and the user's Brain were not modified. TypeScript and production frontend build pass. No commit, GitHub push or deployment was performed; Orbit tools were not available in this turn.

macOS arm64 packaging passes. The 90-module frontend uses `local-BXsLTpMH.js` and `local-kHedEXU2.css`; all **15** bundled service modules byte-match source. The old app was closed with no visible unsaved draft, and the rebuilt Arkive Personal app reopened to its encrypted Brain unlock screen. Native Settings with the real Brain remains for the owner to unlock; interaction verification used the synthetic browser fixture.

## Previous task templates and calendar checkpoint

Work now opens in Planner, alongside Calendar, Templates and the existing Stacked, Board and List views. Create a template with named sections such as Personal or a project, choose manual, daily or weekday use, and set its start date. Planner renders those sections using the shared colored folder sheets. The date picker, previous/next-day controls and month calendar support reviewing saved days and planning future dates. Existing undated tasks remain in Unscheduled; scheduling is optional.

Each template occurrence creates independent task snapshots once per template and date. Visiting a date populates eligible recurring templates; this is not a background scheduler. Calendar cells distinguish saved task completion counts from projected template tasks. Completing one day does not complete another. Editing or pausing a template does not rewrite existing occurrences; an unvisited eligible date uses the current template. Explicit manual application is available. Rescheduling a generated task retains its origin so revisiting the original date does not duplicate it.

Optional encrypted workspace fields preserve compatibility with older Brains. Templates and dated tasks survive lock/unlock and encrypted export/restore. Owner-only endpoints are `POST /v1/workspace/templates` and `POST /v1/workspace/planner/day`; members do not receive private workspace data. Template edits require the expected update timestamp, and population is transactional and idempotent under concurrent requests. Completion timestamps are server-owned. Limits are 100 templates, 50 items per template and 20,000 tasks; a capacity failure does not partially apply a template.

Verified on 11 October 2026: **259 Personal unit/service/model tests** and **46 workflow browser checks** pass. New coverage includes strict civil dates, leap days, weekday/start-date rules, concurrent population, separate daily completion, stale edits, pause/manual application, rescheduling, legacy data, member isolation, encrypted recovery and 390/320-pixel layouts. Desktop and mobile planner/calendar screenshots under `app/.personal-test/` were visually inspected. All test mutations used temporary synthetic Brains, not the operator's vault or tasks.

TypeScript, frontend build and macOS arm64 packaging pass. The 88-module frontend uses `local-C3GJaaHQ.js` and `local-DnkYQYjy.css`; all **14** bundled service modules byte-match source. The rebuilt native app was reopened successfully to its encrypted Brain unlock screen; the agent did not unlock it. GitNexus identified high impact in shared workspace validation, so encrypted restore and legacy compatibility were explicitly tested. React review kept recurrence requests keyed and duplicate-safe.

This is a local planner: no external calendar synchronization, background reminders, model execution, source-file writes or new peer replication were added. No commit, GitHub push or deployment was performed. Orbit transport was unavailable, so this checkpoint is not claimed as filed there.

## Previous folder chat context checkpoint

Files offers an owner-only Chat with folder panel for Smart folders, vault folders and collections. The operator chooses a room, reviews current imported membership and confirms an additive selection. Search/type filters and row pagination do not reduce the folder action; vault mode follows Include subfolders. Open chat remains navigation-only, while the inspected file's Use in chat button adds that single source alongside existing context.

The new `POST /v1/rooms/:id/sources/add` route validates source revisions and merges IDs in one encrypted transaction. Concurrent additions preserve both batches. Repeats are no-ops, and stale revisions, malformed input, code snapshots and selections beyond 1,000 fail without partial writes. Existing policies, grants, source objects and revisions remain unchanged; model execution is not part of selection. This selects current folder membership rather than subscribing to future additions. Existing compiler permissions, manifest rules and the 160,000-character serialized context limit still apply.

Verified on 11 October 2026: **253 Personal unit/service/model tests** and **31 browser checks** pass (Files/Code 20, vault cabinet 11). Tests cover additive/concurrent selection, cancel without a request, membership independent of search, owner/member boundaries, stale revision rollback, encrypted restore, capacity rejection, navigation-only Open chat, source immutability and 390/320-pixel layouts. Desktop and mobile folder-context screenshots were visually inspected; all mutations used temporary synthetic fixtures and no external provider.

TypeScript and macOS arm64 packaging pass. The 85-module frontend uses `local-CaAJ9_wU.js` and `local-CnJynLSM.css`; all 12 bundled service modules byte-match source. The rebuilt app was reopened to its encrypted Brain unlock screen, not unlocked by the agent. GitNexus reported low backend impact; newer Files symbols were unindexed and reviewed directly. No commit, GitHub push or deployment was performed. Orbit transport was unavailable.

## Previous animated folder stack checkpoint

Files uses the approved physical-folder presentation: larger staggered tabs, full-width overlapping color rails, and a 380 ms slide that brings the selected sheet forward. Tab elements retain their canonical DOM order and horizontal positions while visual depth changes, preserving keyboard focus. Sheet motion runs only when the Brain, view or folder changes, not on polling, file selection or refresh. Rapid switching cancels the previous sheet animation; reduced-motion preferences suppress motion.

Smart folders use the reference defaults for Inbox (mustard), Creative (paper), Projects (olive), Personal (ink) and Business (sage), in that order when present. Saved colors override these defaults. Other real categories remain reachable through groups of five sheets and the folder chooser; empty sample categories are not seeded. Automatic classification, source revisions, collection membership, permissions and source files are unchanged.

Verified on 11 October 2026: **250 Personal unit/service/model tests** and **30 browser checks** pass (vault cabinet 11, Files/Code 19). Coverage includes tab identity and keyboard focus, front-sheet geometry, paging, refresh stability, reduced motion, persistent refinements/colors, member isolation, and 390/320-pixel layouts. Desktop/mobile screenshots under `app/.personal-test/` were visually inspected. Fixtures use synthetic data only. The initial sandbox denied loopback test servers; rerunning with localhost permission passed.

TypeScript and macOS arm64 packaging pass. The 84-module frontend uses `local-CGGMoTXL.js`, `local-B_PDIGsm.css` and the unchanged graph worker. No backend or API code changed in this checkpoint. No commit, GitHub push or deployment was performed. GitNexus could not resolve the newer untracked Files symbols, so their direct imports and browser behavior were checked instead.

The rebuilt desktop app was reopened to its encrypted Brain unlock screen. The owner must unlock it to inspect the new stack with real data; animation and interaction checks above used isolated browser fixtures. Orbit transport remained unavailable.

## Previous automatic smart folders checkpoint

Files defaults to Smart folders, with colored sheets for root-relative source categories instead of one sheet per connected vault. Loose notes use local keyword rules; unclear matches go to Inbox. Membership is derived automatically from every imported non-code source. Owner refinements and folder colors persist in optional encrypted workspace metadata, take priority on refresh, and can be reset to automatic. Vault folders and Collections remain separate views. No real vault files are moved, renamed, copied or reorganized.

The Personal unit/service/model suite passes **249 tests**, including complete grouping beyond 1,000 sources, longest-root matching, GitHub paths, ambiguous content, member isolation, stale corrections, source immutability and encrypted recovery. The updated vault-cabinet browser fixture passes **10 checks**, including automatic multiple sheets, persisted corrections/colors, reset and 390/320-pixel layouts. Existing Files/Code passes **19 checks**. Desktop and mobile smart-folder screenshots were visually inspected. Test mutations used synthetic fixtures only.

The new `/v1/workspace/filing` endpoint is owner-only, revision-aware and atomic. Automatic grouping requires no write; explicit refinements and color changes create audit records. Source scanning is unchanged: grouping covers imported objects, not all files on disk. GitNexus indexed backend impact is low, while unindexed Files components were checked directly. No commit or push is part of this change.

Final checkpoint: **332 unit/service/model tests pass** (249 Personal, 83 original application), plus **63 browser checks** (vault cabinet 10, Files/Code 19, workflow smoke 34). TypeScript, production build and macOS arm64 desktop packaging pass. The 84-module frontend uses `local-DYyvDB07.js`, `local-Cjm589t-.css` and the unchanged `forceGraphWorker-Cz3pUKGn.js`; all 12 packaged backend modules byte-match source. The rebuilt native app was reopened successfully to its encrypted Brain unlock screen. Smart-folder behavior was verified using synthetic browser fixtures, not by unlocking or changing the user's real Brain. Orbit transport was unavailable; this checkpoint is recorded locally and is not claimed as filed in Orbit.

## Previous collection organization checkpoint

Files includes natural ascending/descending name sorting, file-type sorting, latest Brain-revision sorting and saved manual collection order. Owner-only selection supports reviewed bulk filing/removal. Local lexical suggestions compare collection names with folder/title/text evidence and default to unchecked rows. They do not use an external model, infer Canon, move source files or merge Obsidian folders with collections.

The additive owner-only organization endpoint validates reviewed collection snapshots and source revision bindings, then applies a bounded batch in one encrypted transaction. Stale, over-capacity and malformed requests fail without partial changes; no-ops do not append audit events. Existing collection storage and recovery formats are unchanged. Older single-file/Library upserts retain their existing concurrency contract.

Verification on 11 October 2026: **327 unit/service/model tests pass** (244 Personal, 83 original app). The updated Files/Code browser fixture passes **19 checks**, including sorting, review/cancel, bulk filing/removal, manual order, explicit acceptance of local suggestions, stale-review rejection, filter-selection cleanup, member isolation and 390/320-pixel layouts. The separate vault-cabinet fixture passes **9 checks**. The full workflow smoke fixture passes **34 checks**, including source refresh, capture, chats, canvases, tasks, profiles, encrypted recovery and lock/reopen. All fixture changes use synthetic temporary data; no real vault was reorganized.

The governance browser suite passes another **16 checks**, bringing this turn's browser verification to **78 checks**. This includes room grants, reviewed mock-provider runs, stale-policy rejection and credential revocation. Only local synthetic mock providers were used.

TypeScript, production build and macOS arm64 desktop packaging pass. The frontend now has 82 modules, with assets `local-BEc5Hko_.js`, `local-Ewo9u6K2.css` and the unchanged graph worker `forceGraphWorker-Cz3pUKGn.js`. All 12 bundled backend modules byte-match the checkout. Desktop and mobile review screenshots under ignored `app/.personal-test/` were visually inspected. The rebuilt app was opened to its encrypted Brain lock screen; the owner must unlock it to use the new controls on real data. No commit, push or external deployment was performed.

GitNexus reported low indexed upstream impact for the backend store/server. Its index did not contain the untracked Files components, and FTS was read-only; frontend dependencies were checked directly and covered by the tests above. Orbit heartbeat transport was unavailable, so this checkpoint is recorded locally, not claimed as filed in Orbit.

## Previous shared vault explorer checkpoint

Brain → GitNexus now defaults to **Vault graph**: an Arkive-owned three-panel presentation of the same authorized note objects and resolved relationships as Obsidian. Imported folders appear on the left, the shared force graph in the center, and note preview, outgoing links, backlinks, source references and provenance on the right. Files, Obsidian and this explorer retain the same selected BrainObject ID. The view uses Arkive charcoal, sage and lavender, without requiring a GitNexus index or copying third-party viewer source.

The note resolver now retains directed relationship metadata alongside its existing undirected rendering edges. Reciprocal links and explicit source references remain distinguishable; graph appearance, scoped resolution and existing bounds are unchanged. This metadata is derived in memory, not a storage migration or vault write. Code snapshots stay separate under the owner-only **Code indexes** option. Members can use Vault graph over their existing redacted server projection; they cannot discover/import indexes or edit chat context.

Verification: **320 unit/service/model tests pass** (237 Personal, 83 original app), plus **126 browser checks** (workflow 34, Files/Code 15, graph 14, Obsidian 15, governance 16, code import 12, vault cabinet 9, new vault explorer 11). The new isolated fixture imports 606 synthetic Markdown notes and verifies the same 603 visual relationships as Obsidian, directional reciprocal links, duplicate-name vault separation, unchanged-refresh layout stability, shared selection, permission-limited member access, explicit chat context without a model call, lazy code discovery, lock cleanup, and layouts at 390 and 320 pixels. Source contents and revisions remain unchanged. Four additional model regressions cover direction, provenance, ambiguity and the edge cap.

App TypeScript and production build pass. The final frontend contains 80 modules with assets `local-DlyGbPCc.js`, `local-DLhPVHvY.css` and `forceGraphWorker-Cz3pUKGn.js`. Browser screenshots under ignored `app/.personal-test/` named `vault-graph-desktop.png` and `vault-graph-mobile.png` were visually inspected and contain synthetic data only.

The macOS Personal bundle was rebuilt with these assets, and all 12 packaged service modules byte-match source. The old process was closed and the rebuilt app reopened successfully. After the operator unlocked it locally, native accessibility and screenshot inspection confirmed **Brain → GitNexus → Vault graph**, its three-panel layout, Arkive colors, the connected `vault-real` hierarchy, and 1,000 currently imported notes with 2,168 links. The screen also reports 1,455 link notices; unresolved targets are not invented or silently imported. These counts describe the existing Brain snapshot, not a fresh whole-vault scan. No passphrase or owner token was extracted, and no real source scan, import, context mutation or file write was performed during this verification.

Independent source review checked member redaction, missing/revoked selections, directed relationships, folder-filter refresh and polling stability. React review retained a stable graph cache and bounded relationship lists; the compact inspector supports keyboard focus and Escape dismissal. GitNexus impact checks rated note-model changes low where indexed and session clearing critical because of its lock/disconnect callers; the session edit only resets new display selection. The accumulated working tree also includes previous uncommitted integrations, so its critical aggregate impact is not a separate security finding. No source-file write, GitHub push, model request against a real provider or remote deployment was performed.

## Previous Arkive graph and vault navigation checkpoint

The Obsidian-style view now uses Arkive charcoal, sage and lavender throughout the graph, folder explorer, settings, capture and source-inspection panels. Its navigation and force behavior are preserved. Files opens on the actual imported vault hierarchy, with breadcrumbs, exact-folder/subtree views, duplicate-root disambiguation and bounded subfolder navigation. Custom collections and saved colors remain a separate mode. No source files are moved, copied or automatically categorized.

Brain → GitNexus now offers read-only repository discovery and an explicit **Import & open graph** action. Sources & sync shares that control; successful imports select their returned BrainObject ID, not the previous repository. JSON import remains available when discovery fails. The owner-only, loopback-only registry endpoint returns validated metadata, never filesystem paths. Reads are bounded and reject symlinks, malformed registries and special files without blocking. The CLI child PATH includes the trusted bundled Node directory, fixing Finder launch failures. No repository indexing or automatic imports were added.

Verification: **316 unit/service/model tests pass** (233 Personal, 83 original app), plus **115 browser checks** (workflow 34, Files/Code 15, graph 14, Obsidian 15, governance 16, code import 12, vault cabinet 9). TypeScript, production build and native packaging pass. The import browser test mocks GitNexus discovery/export while using the real backend for validation and encrypted persistence in a temporary Brain. A separate real read-only export under a Finder-like PATH returned 500 nodes and 1,034 relationships from the registered Arkive index, with explicit truncation. No real Brain import or source write was performed by these tests.

The final 78-module frontend uses `local-BnmoC2F6.js`, `local-BhQHzyY2.css` and `forceGraphWorker-Cz3pUKGn.js`. All 12 packaged service modules byte-match the source. The rebuilt macOS app was reopened; after the operator unlocked it, the new native GitNexus picker was observed displaying registered repository metadata. Importing the intended repository remains an explicit user action. No passphrase or owner token was extracted or persisted by verification. Screenshots under ignored `app/.personal-test/` include `obsidian-desktop-default.png`, `vault-cabinet-desktop.png`, `vault-cabinet-mobile.png` and `code-import-*`, using synthetic data.

Pre-change checks were low-impact where indexed. Untracked components and timed-out API checks were reviewed directly in source. The final accumulated working-tree analysis rates the change critical by breadth across shared graph and source-import flows, including prior uncommitted work; this is not a finding of a security vulnerability. Independent review checked cancellation, session isolation, explicit import, permission gates and returned-ID selection. Full workflow and governance regressions passed. No commit, push or deployment was performed.

## Previous Files and Code checkpoint

The approved stacked-folder cabinet and three-panel repository explorer are integrated into the actual Personal application. The [integration map](FILES_CODE_INTEGRATION.md) records data ownership, API operations, permissions, persistence, snapshot bounds and deferred capabilities. Files reuses Library collections and original source IDs; colors are optional encrypted collection metadata. Code uses an Arkive-owned renderer over actual GitNexus snapshots, not copied viewer source or synthetic relationships.

Verified for this checkpoint: **304 passing unit/service/model tests** (221 Personal and 83 original application), plus **77 passing browser checks** (workflow 34, Files/Code 15, graph 14, Obsidian 14). TypeScript and the Personal production build pass. Browser coverage includes owner/member boundaries, source identity and revision preservation, color persistence and contrast, cross-view source links, new capture, static call paths, room context selection without execution, mobile layouts, locking and recovery. The Obsidian fixture retains 2,002 notes and 2,000 real links. The workflow harness adds a bounded DOM wait to an existing asynchronous room-creation assertion; no production canvas logic changed.

The current frontend has 76 modules and assets `local-DutgxthP.js`, `local-BBnbWfaU.css` and the unchanged `forceGraphWorker-Cz3pUKGn.js`. Screenshots under ignored `app/.personal-test/` named `files-integrated-*` and `code-integrated-*` show the compiled application using clearly labeled synthetic data. No user's vault, real model endpoint, GitHub repository or deployment was modified by verification. Tests close their local servers and remove their temporary Brains.

The macOS arm64 `Arkive Personal.app` bundle was rebuilt successfully with this frontend and the updated service. It was not launched against the user's real Brain during this checkpoint. Quit and reopen the rebuilt bundle to use this version; an already-running process continues to use its loaded code. No commit, push or deployment was performed.

Pre-change impact checks covered the shell, code renderer, shared graph canvas and workspace validation. Validation has a broad dependency footprint because it also protects encrypted restore; optional colors were tested against older exports, invalid input, round-trip restore and member denial. Final change analysis rated the tracked diff high by breadth. Independent review found and corrected source-link routing and filtered-cabinet selection issues. New capture additionally waits for the authoritative refreshed Brain instead of discarding its not-yet-published object ID.

## Previous Obsidian graph checkpoint

The Personal Brain's Obsidian view now follows the supplied folder-and-graph reference: a warm folder explorer beside a cream Canvas2D surface, amber links, gray orphan notes and degree-sized nodes. It is an independent implementation, not an embedded Obsidian application. The AGEN-style app navigation and separate GitNexus code renderer remain intact.

The explorer uses only already-imported, permission-filtered objects and registered roots. It supports expandable folders, search, natural sorting, keyboard navigation, virtualized rows and explicit folder graph filtering. No extra folder scan or source write occurs when browsing it. Equivalent Brain snapshots preserve folder expansion, keyboard focus and manual scroll; clearing a graph filter also clears the explorer's filter state.

The graph supports pan, pointer-centered zoom, node dragging, neighbor highlighting, source inspection, global and one-/two-hop local views, orphan and source-reference toggles, literal/path/tag search, color groups, and display/force controls. The former 300-node note-rendering cap is removed. A local module worker uses Barnes–Hut repulsion and actual link springs, cools when settled and pauses when hidden or manually paused. Unchanged snapshots do not restart the layout. Source-only edges are dashed; no inferred relationships are added.

The existing model boundaries remain 10,000 objects and 20,000 relationships, with 32 KiB and 128 extracted links per note. Truncation remains visible. This is not full Obsidian search/plugin parity or automatic two-way vault synchronization. Graph preferences and positions are session-local, and GitNexus retains its separate snapshot/render bounds.

Verification includes **281 passing unit/service/model tests**: 83 original application tests and 198 Personal tests, including 31 new graph, filter and explorer cases. Both frontend builds and App/Convex TypeScript checks passed. There are **94 passing browser checks**: workflow 34, graph 11, governance 16, scan 8, sidebar 11 and Obsidian 14. The new suite uses 2,002 synthetic imported notes and 2,000 real scoped links, checking actual canvas pixels, folders, duplicate filenames, folder-filter clearing, refresh stability, viewport virtualization, pan/zoom/drag, forces, mobile layouts, member boundaries and locking. No real vault or external model provider was used.

The Personal frontend contains 72 modules with `local-D_kODYSg.js`, `local-6xWCiwtx.css` and the local `forceGraphWorker-Cz3pUKGn.js` asset. The macOS app bundle was rebuilt and all 12 packaged service modules byte-match the tested sources. Native startup remains the earlier baseline; these graph interactions were exercised in the production browser build, not against the user's native Brain.

Pre-change checks rated the existing `BrainGraph` and `PersonalApp` symbols low impact. Fresh staged GitNexus analysis classified the complete additive diff as critical by breadth: 495 symbols across 23 files and 34 execution flows. Source review covered the worker lifecycle, tree state, graph filtering and unchanged app service handlers; the workflow, scope, lock and regression suites passed. This automated impact category is not a discovered security defect or a certification. The source review also corrected a StrictMode resize-observer cleanup issue, with viewport-resize coverage in the final browser suite.

Reproduce the new browser suite from `app` with `node tests/personal/obsidian-browser.mjs` and the existing Playwright environment overrides. It builds into a temporary directory and removes its synthetic data. Screenshots under ignored `app/.personal-test/` include `obsidian-desktop-default.png`, `obsidian-desktop-full.png`, `obsidian-mobile-settings.png` and `obsidian-mobile-graph.png`. The default desktop image shows imported test folders and the complete 2,002-note graph, not the user's vault.

## Previous sidebar checkpoint

Arkive's Personal sidebar adopts the navigation layout from `eyeamxela/agen-local-beta-plot-exact` at commit `44275abfb932be02acbeb3f7c0f1a342358f2831`, specifically `ui-modules/CxShell.jsx` and `AdminUi.jsx`. That reference was verified against GitHub and the matching clean local release checkout; the older Downloads copy was not used. The reference repository and original Arkive checkout remain unchanged.

The sidebar is 240 pixels expanded and 80 pixels collapsed, with outline SVG icons, grouped 44-pixel navigation rows, lavender selection, a Brain identity card and compact recovery/session controls. It retains Arkive branding and all 13 owner destinations; members receive only their existing six destinations. Folder connection and refresh controls remain in a collapsible section. AGEN's Stores/Human product switch was not copied because Arkive has no equivalent mode switch.

At widths up to 760 pixels, navigation becomes a modal drawer with a backdrop, keyboard focus containment, Escape dismissal and focus restoration. Background controls are inert while it is open. Only the display preference is persisted under `arkive.personal.sidebar.v1`; tokens, passphrases, source content and drafts are not added to browser storage. No API, storage, permission or retrieval handler changed.

Verification passed: 250 existing unit/service/model tests; 34 workflow, 11 graph, 16 governance, 8 scan and 11 new sidebar browser checks, for **80 passing browser checks**. The focused sidebar suite exercises every destination, counts, real note links, all three Canvas presentations, collapse persistence, keyboard navigation, mobile dismissal and owner/member boundaries. Browser fixtures use temporary synthetic Brains and localhost mock providers only. No real vault or provider was accessed.

App and Convex TypeScript checks and both production frontend builds passed. The final Personal build contains 64 modules, with assets `local-CTHBWtDb.js` and `local-Cqb5-9_t.css`. Independent source review found no actionable sidebar issue. Existing tests now address menu buttons by their accessible text instead of decorative glyphs.

The local macOS Personal app bundle was rebuilt successfully. Its 12 packaged service modules match the tested sources. Browser workflows were verified; this checkpoint did not launch the native app against the user's Brain. No GitHub push or deployment was performed.

Reproduce the focused suite from `app` with `node tests/personal/sidebar-browser.mjs`, using the existing `PLAYWRIGHT_MODULE` and optional `PLAYWRIGHT_EXECUTABLE_PATH` overrides. The script builds into its own temporary directory and cleans up its synthetic data. Screenshots in ignored `app/.personal-test/` are `sidebar-expanded.png`, `sidebar-collapsed.png`, `sidebar-mobile.png` and `sidebar-member.png`. They show synthetic data, not the user's Brain.

## Previous whole vault scan checkpoint

This update follows `9acef2b` on the isolated Personal beta branch. Folder scans no longer stop after 1,000 files, 16 MiB of text, 5,000 entries or 12 directory levels. They traverse supported sources in atomic batches of at most 100 files / 4 MiB. Brain capacity is 128 MiB of serialized plaintext, with the existing 10,000-object, 50,000-revision and 1 MiB-per-file boundaries retained. Recovery, encrypted-file and governance admission limits use the same capacity contract. No real vault was imported or modified.

| Check | Result | Scope |
| --- | --- | --- |
| Original application tests | 83 passed | Existing cloud and canvas behavior |
| Personal node tests | 103 passed | Encrypted persistence, source safety, HTTP service, permissions and 18 new scan/capacity regressions |
| Personal UI model tests | 64 passed | Includes 15 new progress, cancellation, stale response and session cleanup tests |
| Existing browser suites | 61 passed | Workflow smoke 34, graph 11, governance 16 |
| New scan browser suite | 8 passed | 2,005 synthetic notes, cancellation/retry, one-file update, unchanged pass, exclusions, mobile and lock |
| App and Convex TypeScript | Passed | Original cloud and Personal production builds also passed |
| macOS app bundle | Rebuilt | All 12 packaged service modules byte-match the tested source |

There are **250 passing unit/service/model tests and 69 passing browser checks**. The final Personal build has 62 modules and assets `local-C6BbEDxf.js` / `local-Cvv4A8-y.css`. All final browser suites passed without unexpected console, page or network errors. The older smoke harness now waits for the dedicated scan panel and the complete UI action, rather than assuming that the generic spinner disappearing means a folder scan has finished.

The real HTTP scan test imports 2,205 notes in 23 batches, preserves every revision on an unchanged second scan, and adds exactly one revision for one edited source. Cancellation and client disconnect retain only committed batches, with no false completed timestamp. Retry preserves source identities and fills the remaining records. Missing source files remain in history. A separate scanner fixture traverses 6,044 entries, 1,023 supported files, more than 17 MiB and 20 directory levels; it also tests policy skips, invalid UTF-8, links and a replaced directory.

Storage tests cross the previous 32 MiB state, 46 MiB disk-envelope and 48 MiB recovery bounds, then reopen, encrypt, decrypt, restore and replicate the same history without a schema migration. Unchanged batches leave the encrypted file byte-identical. Duplicate source paths fail for review rather than merging identities. Object-capacity and JSON-expanded byte-capacity failures roll back the entire rejected batch, retaining earlier durable state.

Scan status and cancellation remain owner-only and loopback-only. Room members and peer credentials cannot reach them. The UI matches exact scan/folder IDs, retains confirmed counts through status failures, and aborts scan requests when its session is disposed. Lock clears source paths and progress. Read-only integration review found no remaining actionable issue in these paths. A filesystem review added nonblocking opens so replacement with a FIFO cannot hang before the regular-file check; the importer remains no substitute for an OS sandbox against a hostile same-user process.

Reproduce the new UI coverage with `app/tests/personal/scan-browser.mjs` and the same Playwright environment variables as the existing harnesses. Screenshots in ignored `app/.personal-test/` are `scan-progress.png`, `scan-complete.png` and `scan-mobile.png`; they show synthetic sources. The app was rebuilt but not launched against a real user Brain. The canonical checkout and old white papers are unchanged; no GitHub push, external provider request or deployment was performed.

## Previous room governance checkpoint

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

## Connected Agent Beta foundation — October 13, 2026

Verified locally after adding the encrypted named-connection registry and execution-contract boundary:

- `npm run test:personal`: **269/269 passed**, including five new registry/runtime tests and expanded HTTP access-control checks.
- `npm run typecheck` and `npm run build:personal`: passed.
- Full Personal browser smoke: **56 recorded checks passed** using installed Chrome, temporary synthetic Brains and a local mock provider. No console/page/network errors. Connection saves and switches caused no model request and preserved room data. Runtime settings fit 390px and 320px viewports.
- `npm run bundle:personal`: rebuilt the macOS arm64 `Arkive Personal.app`, including `provider-settings.mjs` and `runtime-contract.mjs`.
- `git diff --check`: passed. Existing unrelated working changes were preserved. No commit, push or deployment was performed.

Browser inspection caught and corrected an ambiguous saved-connection selector label. Reviewed screenshot: `app/.personal-test/settings-runtime-desktop.png`; all content is synthetic. The native app was inspected at its locked screen only: the real encrypted Brain was not unlocked or modified. Packaging and mock tests do not establish live provider or Hermes connectivity.

GitNexus impact reported HIGH impact for the existing provider-fingerprint path. The change was regression-tested for both owner execution and queued approval. New settings symbols were missing from the index; a refresh attempt failed on unavailable registry network access, and FTS reported read-only storage. Direct caller review supplemented the incomplete index; no fresh complete graph audit is claimed.

See `SETTINGS_AND_BUZZ_MAPPING.md` for the registry APIs, migration, user flow and next implementation gate.

## Governed conversation and run-event slice — October 13, 2026

- Full Personal suite: **274 tests passed**. Five conversation/event tests exercise bounded eligibility, tampered/missing receipts, opt-in behavior, encrypted restart, exact authority and provider separation, stale displayed provider refusal, pinned member approval, receipt pruning, live running/completed visibility, reconnect, credential revocation, source-grant removal, peer denial and lock.
- Full browser smoke: **58 recorded checks passed**. Added a real follow-up under explicit history consent and a delayed local mock answer so the UI must show `running · provider.started` before completion. The provider received the exact prior user/assistant pair. History opt-in resets after a send and changing it revokes existing send consent. Existing Canvas, governance, planner, settings, encrypted restart and mobile checks passed.
- TypeScript, production frontend and macOS arm64 desktop bundle passed. **18 bundled service modules match source byte-for-byte**. No new dependency or external service was installed. A final compact owner-progress read optimization was covered by rerunning all five conversation/event tests.
- Synthetic screenshots `app/.personal-test/conversation-running.png` and `conversation-completed.png` were captured; the running state was visually inspected. The existing Arkive visual style is retained. Feed aborts from navigation and locking are expected, narrowly excluded from network-failure assertions; all other browser errors remain test failures.
- The code-exploration index marked the execution path HIGH impact (direct sends and approved sends). It still cannot resolve every recent settings symbol and reports read-only FTS errors; direct source/caller review and regression tests supplemented it. No complete fresh index claim is made.
- React review checks one stream per visible workspace, abort cleanup, no browser-persisted secrets/history, guarded state callbacks, responsive labels and renewed consent when history changes. Full vault snapshots are not copied for the owner's per-second progress read.

This remains a local verified build. No live provider was contacted, real Brain unlocked, source file edited, Hermes session launched, Git commit/push made or server deployed. Conversation context is bounded, Arkive-managed and opt-in; it is not an external persistent harness session. Live run events are not token/tool streaming. Interrupted provider requests retain the existing durable failure/no-automatic-replay rule. Source replication still excludes private conversations.

Next gate: an isolated harness adapter with enforced tool scopes, correlated approvals and safe runtime lifecycle. Native provider protocols, token streaming, jobs, artifacts and messaging gateways remain later work.

## Remaining release gates

1. Complete the first user-controlled session with a non-sensitive folder and a recoverable passphrase. Native picker and native download interaction have not been exercised with a real user Brain; browser equivalents have been tested.
2. Configure an actual model endpoint and run an explicitly approved, non-sensitive request. This verifies provider credentials and its response format beyond the mock adapter.
3. Start Docker locally, build and scan the prepared container, then verify persistent-volume restore and TLS before considering a personal-server deployment.
4. Choose and approve a server host, domain, cost limit and backup plan. Test access from a physical phone after deployment; a mobile browser viewport alone does not prove this.
5. Add scoped device pairing, credential rotation, conflict resolution, memory invalidation and real harness/channel adapters before team or unattended use.

This release does not claim enterprise multi-user permissions, arbitrary agent tool execution, automatic synchronization, a signed immutable ledger, P2P storage, Hermes integration, Telegram delivery or a created DigitalOcean droplet.

## Per-chat model routing A1 — October 13, 2026

Completed locally after the public Hermes GitHub cross-check recorded in `HERMES_SETTINGS_CAPABILITIES_UPDATE_PROPOSAL_V2.md` (revision 3):

- **277/277 unit/service/model tests passed.** New coverage verifies independent chat model dispatch, encrypted pin persistence across restart, explicit default following, disabled pins without fallback, stale settings revisions, invalid/missing room IDs, member denial, route-changed approval refusal, successful approval against a pinned model, history isolation, owner-only per-room status metadata, v1/v2 migration without unlock-time writes, and persistence-failure rollback.
- **62 browser checks passed** against Chrome, synthetic temporary Brains and mock model services. Chat pins remain distinct across room switching and Settings navigation; selection sends nothing; switching clears history consent; explicit unpin restores default following. Desktop, 390px and 320px layouts have no page-level horizontal overflow. Existing file, graph, Work, planner, Canvas, conversation, restart and mobile checks pass. No console/page errors or unexpected network failures.
- Browser verification exposed a transient empty adapter label while route metadata loaded and an ambiguous implicit room-selector label. Both corrected. Only expected cancelled GET routing refreshes and run-event streams on navigation/lock are excluded from request-failure reporting; HTTP errors and other failed requests still fail the suite.
- TypeScript checking, production frontend build and macOS arm64 `npm run bundle:personal` passed. All **18 bundled service modules match source byte-for-byte**. `git diff --check` passed.
- Screenshot evidence: `app/.personal-test/chat-pinned-connection-desktop.png`, `chat-pinned-connection-390.png`, `chat-pinned-connection-320.png`. Desktop and mobile captures were visually inspected; the existing Arkive palette/layout remain unchanged apart from the connection control.
- Global Agents activity and room activity both use room-resolved provider metadata; owner status exposes redacted per-room descriptors, not credentials. Member status does not expose that owner map. Server approval still independently checks the stored route fingerprint.

Pins are encrypted node-local settings, excluded from Brain sync/recovery exports. New/unpinned chats explicitly follow the node default; disabled pins fail closed. Named records still contain one model each; account/model separation, native protocols, reasoning controls, concurrent execution and real harnesses remain subsequent gates. The real Brain, vaults, provider credentials and installed Hermes configuration were not used or modified. The rebuilt native app is on disk; an already-running process is not automatically relaunched. No commit, push or deployment performed.

## Model catalog and Hermes metadata connection — October 13, 2026

- **284 unit/service/model tests passed.** New tests cover isolated gateway keys, encrypted 0600 persistence, restart/lock, stale revisions, owner/member/peer boundaries, private-network blocking, explicit metadata consent, catalog bounds, malformed/failed/partial responses, secret redaction, symlink refusal, concurrent saves, failed persistence, clear-during-probe, explicit removal and export exclusion. Named-model discovery verifies the nondefault connection's own endpoint/key without activation or chat execution. After the final request-deadline refinement, all 12 gateway/provider tests passed again.
- **67 browser checks passed** against the final built UI. New coverage: nondefault model discovery and generation edits; gateway save without outbound requests; explicit three-GET metadata inspection; searchable skills/toolsets; no polling or Brain mutations; 390px and 320px layouts. Existing chat/canvas, per-room routing, encrypted restart, governance, graph, files and planner checks remain passing. Browser console and unexpected network-error checks are clean.
- TypeScript, production frontend and macOS arm64 desktop bundle passed. **19 bundled service modules match source byte-for-byte**, including `harness-settings.mjs`. No new dependency was installed. The built app is `app/src-tauri/target/release/bundle/macos/Arkive Personal.app`; the existing running private app was not terminated or relaunched.
- Synthetic screenshots: `app/.personal-test/settings-capabilities-desktop.png`, `settings-capabilities-390.png`, `settings-capabilities-320.png`. Desktop catalog was visually inspected; app charcoal/sage styling is preserved. The screenshot was offered in the Codex file panel, not a claim that the private native app was tested.
- React review: bounded catalog rendering, expandable text rendered as text rather than HTML, labeled forms, secret inputs held only in component memory, abortable local registry loads, explicit outbound consent, per-connection discovery reset on revision/selection, no new fetch dependency. Capability text is treated as untrusted metadata, not instructions or authorization.
- GitNexus indexed dispatch/server callers reported LOW impact; newer settings symbols remain absent from the stale index and refresh failed due registry DNS. Direct source inspection and regression tests supplement this limitation; no fresh complete graph claim is made. Existing Node/Tauri stack was retained per the agent/backend skill's existing-stack guidance.

The real Hermes API contract was inspected in installed source, but **no real Hermes gateway or provider account was contacted**, no user's key/configuration was read or changed, and no private Brain/vault was unlocked. Gateway observations are not execution verification. Real Hermes/other harness execution, MCP/plugins, reasoning controls, parallel runs, voice, browser automation, artifacts, durable agent jobs, messaging channels and paid server provisioning remain unimplemented in this increment. Setup and next containment gate are documented in `HERMES_GATEWAY_CONNECTION.md` and revision 4 of `HERMES_SETTINGS_CAPABILITIES_UPDATE_PROPOSAL_V2.md`. No commit, push or deployment performed at that checkpoint.

## Shared app palette and feature-branch checkpoint — October 13, 2026

- Settings, Capabilities, Planner, Calendar and file-panel chrome now share the app's charcoal surfaces, off-white text, orange actions and violet selections. Removed leftover green surface overrides; user-selected folder colors and semantic status/graph colors remain independent.
- **287 unit/service/model tests passed**, including three new theme regression tests. **69 browser checks passed**, including computed-style assertions for Settings and Work/Calendar, encrypted restart, chat routing, metadata-only connection checks and mobile layouts. Browser errors and unexpected network failures remained absent.
- TypeScript, production frontend and macOS arm64 desktop bundle passed. Updated synthetic Settings/Capabilities and Planner/Calendar screenshots were visually inspected. The existing private native app was not restarted or unlocked.
- Pre-commit graph analysis reports critical scope for the accumulated feature checkpoint because it includes execution, governance, storage and graph work, not merely CSS. Recent settings symbols are incompletely indexed; direct inspection and full regressions supplement the graph. This checkpoint is intended for `codex/arkive-personal-node`, not a merge into `main` or a deployment.
- Verification used disposable synthetic Brains and mock providers/gateways only. It does not establish live provider or harness execution, cloud deployment, or private-vault acceptance.
