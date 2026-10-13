# Folder-style template editor

Implemented 2026-10-13, following the approved original folder prototype.

## UI

- Work → Templates → New template or Edit opens a shaped folder with graph-paper material.
- Mustard is the default. A chosen folder color controls the sheet, tab, input borders, text contrast and preview tint.
- Name and ordered section headings are the main inputs; preset tasks are not required.
- The right-hand Day preview derives immediately from the unsaved draft. It is not a saved planner day and sends no model requests.
- Heading edits, reordering, removal and adding a journal are reflected in the preview.
- More options holds recurrence, start date, folder color and optional preset tasks.
- Narrow layouts stack the preview below the editor; fields retain accessible labels and keyboard controls.

## Data boundaries

This change extracts the editor into `app/src/personal/TemplateFolderEditor.tsx` and retains the existing owner-only, revision-aware template save endpoint. It introduces no data migration, provider calls, external calendar integration or vault writes. Existing dated snapshots remain unchanged. Cancel does not save.

Saved section templates appear in Planner and Stacked; each date has independent tasks and journal content. Board behavior is unchanged.

## Verification

- TypeScript and production frontend build passed.
- Personal Node suite: 309 tests passed with localhost fixture networking enabled.
- Full synthetic browser suite passed, including template name/section live preview, reorder/remove/journal controls, folder color changes, 390px and 320px layout checks, saving, dated history, journal persistence and saved Board blocks.
- Browser console, page errors and network checks were clean.
- Final visual review corrected the More options text to use the folder ink color.
- macOS bundle rebuilt through `npm run bundle:personal`.

Tests use an isolated synthetic Brain and local mock providers. They do not prove live Hermes/provider connectivity. The local desktop bundle includes the existing local connection/settings work; this focused source change does not commit that separate work.
