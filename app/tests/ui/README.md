# Isolated UI smoke harness

Run from `app`: `node tests/ui/run.mjs` and open `http://127.0.0.1:1421`. Build-check with `node tests/ui/run.mjs --build` (output stays in `/tmp/arkive-isolated-ui-build`).

This separate entry renders the real Shell and components. Only this test config aliases `convex/react` to an in-memory store. Actual public query/mutation handlers execute against generated synthetic rows. No Convex client, auth changes, endpoint deployment, real source files, or cloud requests exist in this harness. CSP blocks external connections. Production `main.tsx` and configuration remain unchanged.

Public handler semantics are exercised, but this is not Convex integration or auth evidence: the DB is a partial in-memory approximation with mutation rollback. Internal scheduled handlers are never invoked; chat arrival is explicitly synthetic. Other scheduled work stays unexecuted.

Fixtures contain three rooms, 20 documents across five tiers, exact manifest hashes, one running and two waiting runs, separate grants, and consent-required memory/task proposals. `window.__arkiveFixture.snapshot()` returns a copy of fixture state for assertions. The banner button or `window.__arkiveFixture.failNextSend()` injects one send failure.

Suggested browser checks:

- Type a draft, change chat/canvas/room and return; draft/TTL/selection must stay with its room.
- Open context once, close it, remount chat; it must not reopen spuriously.
- Load a saved manifest; scope count must use those exact members plus resolver rules.
- Pin a second room from the rail; both compact chats retain independent drafts.
- Inject send failure; draft survives and retry succeeds. Scroll upward before message arrival; position stays unpinned.
- At 390×844 inspect 2×2 tray, visible composer and intentionally opened rooms drawer.
- Select another waiting run in Agents; approve/deny changes only its grant/run.
- Memory proposal requires explicit consent even though fixture `consent` flag is false; acceptance then materializes the record.

Refresh resets the synthetic database. This harness does not alter production storage; local-originals tests, if used, are separately scoped to localhost:1421 browser storage.
