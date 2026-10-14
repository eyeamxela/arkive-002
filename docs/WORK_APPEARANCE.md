# Work appearance and folder-label spacing

## Entry point and behavior

Work → Appearance previews a palette across Planner, Templates, Stacked, Board and List. The Files cabinet and the global app shell keep their existing appearance. No theme is applied until the user chooses one. Save appearance stores the selection; Cancel discards preview changes; Reset to original previews the original design and must be saved to persist.

Sand, Clay, Sage and Dusk are editable neutral palettes. Seven standard folder-color slots, button color, box/input color, corner radius, grid/dots/diamonds/ruled/plain paper, pattern scale/intensity, gradient tint and solid/sweep/glow options are supported. Arbitrary custom folder colors outside the standard palette remain unchanged. The existing folder picker displays its rendered color. Changing an individual folder still uses its existing Save day/template flow.

Folder numbers remain editable position selectors, not task counts. They are siblings of the title buttons (no nested interactive controls). A fixed number column and gap reserve their footprint on desktop and mobile. The selected folder still lifts to the front; changing its position continues to use the separate saved-order endpoint.

## Data and safety

`workspace.appearance` is an optional `{ settings, updatedAt }` record in the existing encrypted Brain. Older Brains without the field remain valid. Null settings are a reset tombstone, retaining the revision to prevent stale overwrites.

`POST /v1/workspace/appearance` is an owner-only, authenticated endpoint with a 16 KiB body cap and compare-and-set `expectedUpdatedAt`. Input validation permits only bounded numeric options, known enums, and six-digit hex colors; no URLs, CSS or executable content. Saves are atomic and audited as `workspace.appearance.updated`. Member snapshots omit this owner configuration.

Tasks, dates, template definitions, journals, folder ordering, source files, permissions and model connections are not rewritten. These are presentation settings, not changes to data access or agent behavior. No model/network provider calls are needed.

## Rendering and accessibility

Pure material helpers produce scoped CSS variables. Shared Work context carries the saved settings or temporary preview; individual components derive their material without mutating source records. Button/card text chooses a contrasting light or dark ink. Paper gradients and pattern intensity are bounded and reduced when needed to retain 4.5:1 primary/secondary text contrast. Shapes are CSS textures with no external images or dependencies. Existing reduced-motion behavior remains intact; gradients do not animate.

## Verification

Unit/service tests cover old-workspace compatibility, strict validation, revision conflicts including resets, preset independence, custom colors, extreme-color contrast, encrypted reload, member denial and preservation of task/day records. Browser checks cover desktop/mobile tab geometry, preview/cancel/save/reset, responsive controls and shared appearance across views. Screenshots use synthetic records only.

GitNexus identified the shared workspace validator as high impact (save/restore validation); newer UI symbols are absent from its index. Direct caller tracing and the complete regression suite supplement that incomplete graph. React review kept derived values in render, context scoped to Work, immutable draft updates and explicit accessible labels. No new package was added.

### Verified local build — 2026-10-13

- Personal suite: 322 tests passed; the four appearance tests were rerun after strengthening the encrypted-file assertion and passed again.
- Built-UI browser suite: 92 checks passed, including the displayed color swatch, palette persistence, reset, mobile geometry, existing chat/settings/Brain workflows, and clean console/network checks.
- TypeScript, Vite and macOS arm64 app packaging succeeded. All 24 bundled service modules match the local source byte-for-byte. The existing nonfatal 500 kB frontend chunk warning remains.
- Synthetic screenshots: `app/.personal-test/workspace-appearance-editor.png` and `app/.personal-test/workspace-sand-planner.png` (ignored test artifacts), visually inspected.
- At the initial handoff, no private Brain was opened or changed, and no commit, push, deployment or app restart had been performed. Restart permission was requested separately.

### Requested push verification — 2026-10-13

The push is scoped to day-first planning, section-only templates, folder ordering, label spacing and appearance controls with their required service changes. Older unrelated Hermes/model/channel edits remain local. An isolated export of this exact staged source passed TypeScript/Vite build, all 305 included unit/service/model tests, and 81 browser checks. These counts differ from the full working-directory run above because the unrelated unpublished integrations are excluded. No app restart or manual deployment is part of this push.
