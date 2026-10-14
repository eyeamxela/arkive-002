# Numbered folder ordering

2026-10-13 — local implementation.

Click the number on a Planner or Stacked folder tab to select its position. Positions are contiguous: moving position 4 to position 1 shifts the other folders down, rather than giving two folders the same rank. The control is a labeled, keyboard-accessible native select; the adjacent folder title remains a separate selection button.

## Scope and behavior

- Planner project/section order is shared with the daily template sections in Stacked and carried across dates. It orders the day checklists as well as their folder tabs.
- The Day overview stays available separately and is not ranked as a project.
- Stacked task-status folders have their own order. Reordering To do, In progress, Review and Done does not change task status or execution behavior.
- The active folder continues to come to the front when opened, preserving the folder animation. Its number remains its saved position, not its temporary frontmost layer.
- A folder number is now its position. Task counts remain in section headings and sheet totals.
- Sections absent on the selected date retain their saved preference. New section names fall after ranked sections. Renaming a section creates a new display-order key; its task IDs and provenance remain unchanged.
- Ordering is workspace-wide presentation metadata, not a change to template definitions, historical task contents, dates, journals, file paths or permissions.

## Storage and safety

Optional `workspace.folderOrder` contains independent `sections` and `statuses` string arrays. Old workspaces remain valid without the field. `POST /v1/workspace/folder-order` uses the existing owner-only encrypted transaction path, records an audit event and compares `expectedOrder` before saving. Stale concurrent edits are rejected. The server validates scopes, duplicate keys, key lengths, allowed statuses and a maximum of 500 keys per scope. Members cannot read or edit these preferences.

The number selector and title button are siblings, avoiding nested interactive controls. Sorting projects uses copied arrays and does not mutate React props or stored task collections.

## Verification

- 318 unit/integration tests passed, including deterministic shifting, absent/new folders, legacy workspace validation, independent scopes, stale-write rejection, encrypted lock/unlock recovery and member denial/redaction.
- Production TypeScript/frontend build passed.
- Browser regression covers status ordering in Stacked and cross-view/date ordering for Planner template sections, plus the existing mobile/desktop flows.

Local source/bundle work only; no GitHub push or app restart is implied. The running app must be restarted after saving drafts to load the new bundle.
