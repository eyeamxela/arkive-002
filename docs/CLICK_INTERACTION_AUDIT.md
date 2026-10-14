# Arkive click interaction audit — 2026-10-13

## Findings and fixes

1. **Work navigation depended on a desktop-unavailable confirmation.** DayPlanner, DailyEntryPanel and WorkBoardCanvas used synchronous `window.confirm` to permit leaving dirty journals or boards. The bundled Wry 0.55.1 WKWebView UI delegate has no JavaScript confirmation handler, and Arkive registers no dialog plugin. This can deny navigation without a visible prompt. Replaced these calls with a real in-app modal containing **Keep editing** and **Discard and continue**.
2. **The guard intercepted unrelated controls.** Matching every click anywhere inside `.pn-sidebar` or `.fc-modes` also caught sidebar collapse/close and the already-selected view. It now intercepts actual navigation buttons only. Folder switching within the same day retains the draft and does not prompt.
3. **Keyboard/date selection had inconsistent draft protection.** Global keyboard shortcuts bypassed click guards. Stacked's native date/template selectors were guarded on mouse click rather than their change action. Keyboard navigation now uses the same confirmation; date and template changes confirm at the action boundary. Cancel keeps both selection and draft.

The modal is keyboard accessible, focuses Keep editing, supports Escape, uses the browser top layer to prevent underlying clicks, and restores focus. It requires no OS dialog plugin or new permissions. Navigation callbacks run only after explicit discard approval.

## Verification

- TypeScript and Personal frontend build.
- 322 unit/service/model tests passed.
- 99 browser checks passed; no browser console errors, failed requests or unexpected error responses. The native bundle build also passed (existing nonfatal JavaScript chunk-size warning remains).
- Expanded browser suite uses isolated encrypted temporary Brains and local mock providers; no real vault edits or real model requests.
- Two passes through all 14 main sidebar destinations; all nine settings sections; three passes through all six Work views.
- Physical mouse hit-tests on every displayed Planner/Stacked folder title at 1512px, 390px and 320px. Tests check the actual element under the pointer, then confirm the selected folder changed.
- Journal cancel, Escape and explicit discard; current-view clicks; sidebar collapse/expand; keyboard shortcut guard.
- Stacked date and template selector cancel/continue; mobile Board drawer close/cancel/continue and inert-background cleanup.
- The new regression tests replace native `window.confirm` with a throwing function, ensuring no tested navigation path depends on native JavaScript dialogs.
- Snapshot comparison confirms cancellation/discard checks do not write journals or boards.
- Existing tests exercise chat/canvas views, sources, graphs, task/template saves, folder ordering, appearance, provider/harness/channel settings, recovery, room scoping and member views against fixtures.
- Theme assertions now wait for the existing 150ms color transition instead of sampling an intermediate frame after a rapid click. This is a test correction, not a palette change.

## Scope and delivery boundaries

The running macOS app was inspected and was **locked**. No passphrase was accessed, no real Brain was unlocked, and no app restart was performed. The local macOS bundle was rebuilt, but this is not an end-to-end test of the unlocked native session. Native OS dialogs, external browser destinations, live credentials/providers, paid calls, real channel changes and destructive real-data operations are not exhaustively certified by these tests. Intentionally disabled controls still require their documented prerequisites.

No storage schema, server permissions, provider integrations, theme layout or folder animation changed. Existing unrelated Hermes/settings work was preserved. GitNexus lookup/impact was attempted, but its read-only FTS failure and missing newer symbols meant impact scope was verified from the frontend imports/callers, not treated as a complete graph result. The React checklist guided stable callbacks and event-listener cleanup.

At the audit's conclusion these fixes were local and uncommitted/unpushed. The user subsequently authorized a restart and push. Rebuilding alone does not update an already-running process; delivery must be verified separately against the remote branch and running app.

## Reproduce

From `app/`, run `npm run build:personal`, `npm run test:personal`, then `node tests/personal/smoke.mjs` with the installed Playwright module/browser paths if not on the default module path. The click audit is included by the smoke runner. Generated screenshots and test summaries are under ignored `app/.personal-test/`, including `click-audit-unsaved-dialog.png`.
