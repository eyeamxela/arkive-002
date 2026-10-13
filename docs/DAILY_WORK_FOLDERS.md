# Daily Work folders and Board

This update keeps Arkive's dark application chrome, purple view selection, shaped folder tabs, configurable folder colors and graph-paper surfaces. It extends the existing encrypted Personal Node workspace, not the original vault files.

## Daily templates

Create a named template with ordered task-section headings and an optional journal heading. Templates no longer require prewritten tasks. The editor starts with Morning Flow, Afternoon Flow, Evening Flow, LIFE, FRTL, XELAB, MYST and Daily Journal; all headings are editable and removable. Existing task-based templates remain compatible.

Apply manually or enable daily/weekday recurrence. Opening an eligible date creates its structure once. Recurrence is on-demand, not a background scheduler. Each date stores a snapshot of the template name, section IDs/titles and color plus an independent journal. Editing a template never rewrites existing dates.

Planner displays sections together inside the original folder sheet. Stacked exposes the same sections as folder tabs. Tasks entered beneath a heading save immediately as normal workspace tasks; completion is shared with Board and List. Journal and color changes use **Save day**. Calendar navigates past/future dates and shows task completion and preset-task forecasts. Empty section templates do not inflate task counts.

## Board

The dated Board has four shared task lanes: To-do, In progress, Review, Done. Drag a task between lanes or use its status selector. The default scope is the selected date plus unscheduled tasks; an explicit switch includes every date.

Below the lanes, a pannable/zoomable thinking space supports note, link, comment, column, existing-task reference and drawing blocks. Drag block headers to position them, or use keyboard-accessible move controls. The editor can assign a block to a column. Draw with the pointer. **Save board** persists the arrangement for that date; reopening it recovers the saved blocks. Task blocks reference existing tasks, not independent copies.

## Data and safety

- Optional `taskTemplates[].sections` and `color` preserve legacy bundle compatibility.
- Optional `workspace.plannerDays[]` stores dated entry snapshots and Board blocks.
- Tasks may carry `plannerSectionId`; their existing status, source links and timestamps remain authoritative.
- Existing owner-only `/v1/workspace/templates` and `/v1/workspace/planner/day` routes are used. Daily edits require the previously read `updatedAt` value; stale updates fail without overwriting the saved day.
- The serialized encrypted transaction persists zero-task snapshots and records content-edit audit events.
- Members cannot mutate or retrieve the owner's planner content. No model calls, source-file writes, calendar-provider sync, agent execution or permission grants occur.
- Links allow HTTP(S) only. Board payloads are limited to 200 blocks / 200 KB per day, drawings to 500 points, coordinates to ±100,000. At most 50 sections/template and 5,000 saved dates are supported.
- Unsaved journal/Board changes are visibly marked, warn on reload and common navigation actions, and remain in the editor after a stale-save rejection. Save before switching dates or templates.

## Verification

Verified on 2026-10-13 against an isolated copy of the staged Git snapshot: **292/292 tests passed**, TypeScript/production build passed, and the full Personal browser smoke suite passed with clean console/network checks. The working checkout, including separate uncommitted Hermes work, also passed 309/309 tests. Vite still reports its non-blocking 500 KB chunk-size warning. This source update does not restart, repackage or deploy the installed desktop app.

Backend tests cover legacy templates, empty-section idempotency, immutable dated snapshots, stale-write rejection, safe links, block bounds, column references, encrypted lock/unlock persistence and member isolation. Browser checks cover inline task entry, journal save/reopen, Stacked folders, note/link/drawing save/reopen, desktop/mobile overflow and the existing workspace recovery flow. The shared-theme checks require application chrome to use Arkive tokens while folder materials remain configurable.

This is a local-first planner and canvas. Image/file blocks, tables, connector lines, collaborative comments, external calendar synchronization and background reminders are not included. Column grouping currently uses the block editor rather than drop-target detection.
