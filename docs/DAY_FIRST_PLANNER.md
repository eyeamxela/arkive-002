# Day-first Planner

Implemented locally on 2026-10-13. This changes the Planner presentation, not the identity of existing tasks or source files.

## Interaction map

- Work opens Planner with a selected date. Previous day, next day, Today and the date picker support past and future dates.
- **Day** is the default folder. All dated tasks appear once, grouped under their saved section headings, directly on the colored graph-paper sheet. There are no dark task cards inside this daily sheet.
- The first three ordered sections occupy the left column; subsequent sections occupy the right, matching the supplied daily-page reference. Small screens use a single column.
- Project/section folder tabs filter this same day. The dropdown exposes every section; a selected section beyond the first four is brought into the visible tabs. These are task-section filters, not moves of vault files.
- Inline Add a to-do saves a task to the selected date and section. Checkboxes save immediately; the edit action opens the existing task editor for status, schedule and other metadata.
- Daily Journal sits below the checklists. Save day persists the journal and folder color for that date. Unsaved journal/color changes warn before date or workspace navigation.
- Calendar retains the monthly grid, now with saved completion/scheduling totals. Selecting a date shows its day below. Planned recurring tasks remain distinguished from saved history.
- Stacked retains the separate template-folder view. Existing per-template journals remain intact, are readable from Planner, and can still be edited in Stacked.
- Unscheduled tasks remain in the collapsed area below the day and are not silently assigned a date.

## Templates and history

Templates require a name and section headings, not preset tasks. Empty optional task rows are ignored. Applying a template creates a date-specific structure; tasks can be entered later or on a future date.

Day grouping combines section-based and legacy tasks without copying them. Equal section titles are displayed as one group, while stored section IDs and task provenance remain unchanged. Template edits do not rewrite previously created days. Recurrence still populates eligible dates on demand, not through a new background job.

## Persistence

`workspace.plannerDays[]` accepts optional `journal` and `color` fields alongside its existing entries and board blocks. Journal/color patches without `entryId` target the day; patches with `entryId` retain the original per-template behavior. Writes remain revision-checked, validated and encrypted by the existing node storage. A stale save fails without replacing the draft.

The new `dayPlannerGroups` helper is a pure projection. No migration, original vault write, external calendar connection or model call is introduced.

## Verification and delivery boundary

- Personal Node automated suite: 315 tests passed, including mixed legacy/current grouping, section-only templates, independent dates, journal patches and stale revisions.
- TypeScript and production frontend build passed. The existing large-chunk warning is non-fatal.
- Synthetic browser checks cover default Day selection, transparent checklist rows, project selection, dated task completion, journal persistence, discard protection, historical snapshots and Calendar behavior.
- The full browser suite passed with clean console/page/network checks, including mobile layout and selected project tabs beyond the first four.
- The macOS app bundle rebuilt successfully with `npm run bundle:personal`; the running app was not restarted.
- Tests use isolated synthetic fixtures; they do not change the real Brain.

Source and the local native bundle are separate from the running process and GitHub. Restart remains subject to confirmation because the user had an unsaved template draft open. This request does not authorize a Git push or remote deployment.
