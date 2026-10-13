# Arkive Files and Code Integration

This integration brings the approved stacked-folder cabinet and three-panel code explorer into the Personal app. Both use the existing authenticated node and Brain records. The standalone design concepts remain references, not a second storage system or a source of sample records in the real app.

The Personal entry point is `app/local.html`, not the legacy Clerk and Convex application. Existing Chat, Canvas, Obsidian, Work, memory approval, source sync, and audit views remain available.

## Animated folder stack

The cabinet follows the approved stacked-sheet concept. Five folders are visible at a time, with stable staggered tabs. Selecting a tab slides it to the front and reveals its content sheet; folder paging and the chooser reach additional categories. Keyboard focus stays on the selected tab. Reduced-motion settings disable the transition, and ordinary refreshes do not replay it.

Smart-folder defaults match the reference: mustard Inbox, paper Creative, olive Projects, ink Personal and sage Business. These categories lead the display order when present; saved color choices take priority. The app only displays categories backed by imported sources, not the concept's example data. The animation changes presentation, not classifications, source paths or permissions.

## File and whole folder chat context

Open chat navigates without attaching anything. Use in a named chat adds the inspected source alongside that room's existing context. Neither action calls a model; source text is the imported Brain copy, not a fresh filesystem read.

Use this folder in chat offers a room chooser and a review of all currently imported sources in the displayed Smart folder, vault folder or collection. Search filters, type filters and display pagination do not narrow the folder action. Vault mode uses the current Include subfolders setting. Confirming adds source IDs atomically through the owner-only `POST /v1/rooms/:id/sources/add` endpoint and preserves existing selections. Duplicate additions are no-ops; stale source revisions, malformed batches and a merged selection above 1,000 fail without partial writes. Successful additions are audited and saved in the encrypted room record.

Folder membership is selected at confirmation, not subscribed to. Later files require another explicit selection; moving a source between virtual folders does not remove it from existing chat context. Selected IDs follow the Brain's current revisions under the existing room/manifest rules. The action does not grant access, alter room policies or promote sources to memory or Canon. The Context Compiler still checks shared-room grants, layers, agent restrictions, manifests and its 160,000-character serialized context bound. This is whole-folder source selection, not unbounded semantic retrieval over a large vault.

## Feature map

| Interface | Authoritative record | Behavior |
| --- | --- | --- |
| Brain → Files | Permitted `Brain.objects`, excluding `code_graph` | Search and inspect actual sources using their existing IDs |
| Vault folders | Authorized local roots and imported `sourcePath` values | Automatic hierarchy, breadcrumbs, direct-file and subtree views; no organization writes |
| Cabinet folder | `Brain.workspace.collections` | Named organization of source IDs; not a disk directory |
| Folder color | Optional collection `color` | Six-digit hex, encrypted with workspace metadata |
| Circular filters | Actual file kinds in the selected folder | Filter and count the same source records |
| File preview | Selected object and revision | Plain text, provenance, source links, and revision identity |
| Use in chat | Existing room `selectedSourceIds` | Add the real source without sending a model request |
| Brain → GitNexus → Vault graph | The same permitted note objects as Obsidian | Browse folders, actual note links, backlinks and source references in three panels |
| Brain → GitNexus → Code indexes | A stored `code_graph` object | Explore a bounded imported repository snapshot; owner only |
| Repository explorer | Snapshot node `filePath` and symbol identity | Select the same symbol shown in the graph and details |
| Processes | Directed `CALLS` relationships | Bounded static call paths, not observed execution traces |
| Code chat panel | The snapshot object ID | Select the whole snapshot in an owner-only room |

## Data flow

```text
Local notes and explicit source imports
                  |
          encrypted Brain objects
                  |
        server permission projection
                  |
          +-------+--------+
          |                |
      Files cabinet    Obsidian graph / Vault explorer
          |
          +-- collection source IDs and color
          |   (organization only)
          |
          +-- selected source ID --> room context
                                     |
                            permissions and consent
                                     |
                              explicit model send

Imported code snapshot --> code_graph Brain object
                                  |
                     repository explorer + force graph
                                  |
                     details + static call paths
                                  |
                     owner-only room source selection
```

## Cabinet behavior

Files now opens in **Smart folders** for the owner. Colored tabs represent actual source categories, not connected vault roots. Each imported source receives one virtual folder: a saved owner refinement wins first; otherwise the first directory relative to the longest authorized local root (or GitHub path) supplies the folder. Loose/root-level notes use conservative title/content keyword rules. Ties and weak matches go to Inbox. Content matching reads at most the first 8,000 characters and uses no external model. This is rule-based grouping, not semantic understanding.

Automatic membership is derived from the current authorized Brain snapshot without creating collections, writing files or making network requests. New imported objects appear automatically; unscanned files are not included. Same-named categories from different roots combine in this virtual view, with original paths retained in each row. All categories remain accessible through the selector and five-sheet pagination; file lists expand in batches of 100. There is no 1,000-file truncation in automatic grouping.

Select files, choose or name a destination, and click **Refine selected** to save a correction. It survives refresh and encrypted recovery, and **Reset to automatic** removes the override. Custom folder colors use a separate Save action. These owner-only changes use `POST /v1/workspace/filing`, compare source revision and prior override/color, and apply atomically. Metadata lives in optional `workspace.filing` arrays; older Brains remain valid without rewriting them. A batch accepts up to 1,000 refinements and folder colors are bounded to 200. Refinements are local workspace state, not peer-replicated state. They do not alter collections, source revisions, grants or Canon status. Member projections omit this metadata and keep their permitted-file view.

**Vault folders** remains the original imported hierarchy. It reconstructs the actual imported directory structure from authorized roots and source paths, assigning nested roots by longest matching path. Multiple vaults and duplicate folder names stay distinct. Root-level notes remain at the root; nested folders have breadcrumbs, direct-file counts and an **Include subfolders** control. Large folder sets are paginated rather than rendered as thousands of stacked tabs. The view describes imported Brain copies, not a live filesystem listing: use the existing source refresh to read newer files. It never copies, moves or renames source files.

**Collections** is a separate organization mode. Switching modes does not create or mutate collections. Members have only their permitted-file view and cannot browse owner roots or path metadata. Source-vault sheet colors are derived from Arkive's palette; saved collection colors remain independently editable.

Saved Arkive folders are the same collections already available in Library. Creating a folder is an explicit owner action; opening Files never creates demo folders or sample content. System views such as All files and Unfiled are derived, not persisted collections. They do not imply that an external file has been moved into an inbox on disk.

The material palette follows the approved reference: mustard, paper, olive, ink, and sage. Each saved collection can have its own custom color. The tab, sheet, and grid derive from the same color; foreground contrast is calculated from the actual fill. Changing appearance must not alter a source, revision, grant, or Canon status.

Collection writes use the existing `POST /v1/workspace/collections` transaction. Input permits `color` only for collections and only as `#RRGGBB`. The field is optional. Older encrypted Brains remain valid without migration or checksum rewriting, and Library updates that omit color preserve it.

Filing adds the existing source ID to the chosen collection. The same source can belong to multiple collections without duplicated content. Removing a source from a collection changes only membership. Unfiled means the source belongs to no saved Arkive collection; it is not a physical source path.

Existing limits are 200 saved collections and 1,000 source references per collection. The visual stack shows five sheets at a time, with page controls and a selector for every folder; file rows expand in batches of 100. Links from Library or Work reveal their actual source even if a different folder or search was previously active. New capture waits for the authoritative refreshed Brain before reconciling selection.

Updates send only changed metadata, and filing reads current collection membership first. This preserves unrelated saved fields but is not a conflict-aware multi-client merge protocol: simultaneous membership edits can still be last-write-wins. Original source revisions are unaffected.

### Reviewed bulk organization

Files now has Name A–Z, Name Z–A, File type, Latest Brain revision and Manual collection order sorting. Latest Brain revision uses the current revision's node timestamp, not the original filesystem modification date; missing dates sort last. Sorting is a session view preference. Manual ordering is available only in saved collections and persists in their existing ordered `sourceIds` array. Clear search and type filters to use the up/down controls. System and vault views cannot be manually reordered.

Owner checkboxes select files independently of the preview. **Select all matches** selects all currently filtered results, including unloaded rows, up to 1,000 files. Changing folder, organization mode, source scope or filters clears selection. Choose a collection and **Review filing**, inspect the rows, then **Apply**. Collection removal uses the same review step and removes references only. Other collection memberships, original paths, note links, permissions and source revisions stay unchanged.

**Suggest filing** considers the selected files, or the first 100 currently sorted/filter-matched files if none are selected. It compares existing collection-name words with source folder names, titles and the first 8,000 characters of note text. Folder matches rank above titles, which rank above body text. These are deterministic local lexical hints, not semantic AI, taxonomy discovery or claims of correctness. Equal matches have no automatic destination; already-filed and full destinations are excluded. Each row explains the match and starts unchecked. The owner can change destinations and must select rows before applying. No collection is created automatically and no data is sent to a model or external service.

Bulk filing, removal and manual ordering use owner-only `POST /v1/workspace/collections/organize`. A request carries the reviewed collection snapshot and source revision bindings. The node checks freshness, unique IDs, membership and limits, then applies the entire batch in one encrypted transaction with per-collection audit events. Stale source revisions or changed collection metadata reject the whole request with 409; no partial filing occurs. No-op batches do not create audit noise. Batches are bounded to 200 collections, 1,000 changed/order references and a 1 MiB request. A destination still has a 1,000-source limit. Manual ordering must preserve every reference, including code IDs hidden from Files.

The existing single-file inspector and Library upsert endpoint retain their prior last-write-wins contract described above; this is not a general cross-device merge protocol. Collections and their order survive encrypted export/restore but remain outside peer replication. Drag-and-drop filing, physical moves, automatic folder creation and semantic model-based organization are not included.

File counts, search results, kind filters, and previews all use the same permission-filtered object set. Code snapshots remain in the separate Code view. Unknown or inaccessible IDs must not be rendered through a secondary client cache. Folder navigation must remain usable beyond the five-sheet visual stack.

## Physical files and reviewed writes

The cabinet does not rename, move, or delete an Obsidian or GitHub file. A source path is provenance, not editable display metadata. A collection action must say that the original source stays unchanged.

Existing source edits continue through Sources & sync: request an exact write preview, review it, then explicitly apply the server-held approval. Existing freshness, path, symlink, and readback checks remain in force. Physical directory creation and file moves require a separate reviewed operation contract and are not implied by this integration.

## Vault explorer behavior

**Brain → GitNexus** opens **Vault graph** by default. It is a GitNexus-style composition over the existing Brain, not a GitNexus code index. The left panel follows the authorized imported vault hierarchy; the center shows the same resolved note graph as Obsidian; the right panel inspects the selected note, outgoing links, backlinks and source-reference provenance. Files, Obsidian and this explorer share the selected BrainObject ID.

The existing graph model supplies scoped Markdown/wiki-link resolution and diagnostics. Visual edges remain undirected for layout, while additive, in-memory relationship metadata preserves the original direction and relationship kind for inspection. Reciprocal note links remain reciprocal; explicit source references are not mislabeled as backlinks. Unresolved or ambiguous targets do not become invented nodes or inferred code calls. No Graphify output is automatically imported or promoted.

The view requires neither a GitNexus installation nor a new import when notes already exist in the Brain. It makes no additional filesystem, registry, GitHub or model requests while browsing. It displays the current imported snapshot; source refresh remains an explicit operation. It adds no persisted content format and never changes source files. Existing note-graph limits and scan notices remain visible rather than applying the smaller code-snapshot cap to a Markdown vault.

Members can use the vault explorer over their existing server-filtered sources. Owner paths and inaccessible source identities are not recovered through another cache. Code indexes and importing remain owner-only. Chat source selection uses the existing owner action and requires a separate explicit send to call a model.

## Code explorer behavior

**Brain → GitNexus → Code indexes** includes a repository picker, not just an empty state. Opening this subview performs read-only discovery; **Import & open graph** explicitly imports the selected index and selects the returned BrainObject ID. The same control is available in Sources & sync. A successful import opens Code indexes, including when Vault graph was previously selected. Loaded graphs expose **Import / refresh repository**, and portable JSON remains a fallback. Discovery does not auto-import or index code.

`GET /v1/gitnexus/repositories` is owner-only and local-node-only. It reads bounded registry metadata without running the potentially mutating `gitnexus list` command. Results expose validated unique names, dates and counts, not repository paths. Invalid or ambiguous entries are omitted. GitNexus subprocesses receive the bundled Node directory in their PATH so the CLI can run when the app is launched from Finder. Executable configuration remains trusted node configuration, never browser input.

The layout follows the approved explorer, central graph, and detail-panel composition. The implementation uses Arkive's own graph renderer and worker. It does not embed a third-party application or copy GitNexus viewer code.

The separate Obsidian-style note view keeps its folder, local-graph and force interactions but uses Arkive charcoal panels, sage nodes and lavender selections. The reference screenshot's cream and amber theme is not used. Note links and code relationships remain separate data models.

The supported snapshot remains `arkive-code-graph` version 1: repository name, nodes, directed edges, and a truncation flag. Nodes include identity, label, type, optional source path, and community. Limits remain 500 nodes, 1,500 relationships, and a 1 MiB JSON import. A snapshot is not a continuously refreshed repository index.

Explorer entries come from exported source paths and real symbols. Selecting a symbol synchronizes the graph and inspector. Search and type or community filters narrow the display without generating new relationships. Incoming and outgoing relations retain their direction even though a force layout displays a spatial graph.

The version 1 format does not contain source text, line numbers, or recorded runtime execution. Details must state when source text is absent. A repository label or filename suffix is insufficient evidence to associate a node with an independently imported source; no guessed source joins are allowed.

The Processes panel derives bounded paths from actual `CALLS` edges. It identifies them as static graph paths, handles cycles, and reports caps. These paths are neither agent progress nor proof of execution. Real agent activity remains in the existing agent-run view.

## Chat and permissions

Both views reuse the existing room context selection route. Selection is not execution and cannot confer access. The next model request still passes through room grants, memory layers, profile scope, manifest validity, and per-request consent.

Code selection refers to the complete stored snapshot, not a detached symbol or source file. The UI explains that scope. Code snapshots are owner-only and cannot be used in a room with active member grants. Server-side context compilation remains the final enforcement point even if the interface is bypassed.

Member sessions receive only the existing server-filtered objects and room scope. They cannot modify collections or colors, inspect the owner's collection names, access code graphs, or learn original filesystem paths through this UI. Lock, disconnect, credential revocation, and node changes continue to clear the readable session.

## Persistence and portability

Collections and colors are stored in the encrypted node state and survive lock, restart, and encrypted recovery export and restore. They are not saved in browser local storage. Existing peer replication deliberately excludes workspace organization, chats, folder grants, and approvals; this integration does not silently expand that sync contract. Copying folder organization between independently active nodes remains a separate sync feature.

The user chooses a destination folder or saves a color before a mutation is sent. Failed saves must remain visible as errors, not appear as durable success. Pending display state is not authoritative stored state.

## Licensing boundary

GitNexus currently publishes its code under the [PolyForm Noncommercial license](https://github.com/abhigyanpatwari/GitNexus/blob/main/LICENSE). The integration adapts the approved Arkive concept using Arkive-owned components, not that viewer's source. No new GitNexus, Sigma, or Graphology dependency is bundled by this change. Commercial permission for embedding the actual GitNexus viewer is a separate decision. Use of an externally installed GitNexus indexer remains subject to that tool's terms.

## Acceptance and verification

- New folders, custom colors, and collection membership round-trip through the authenticated node and encrypted recovery bundles.
- Invalid colors and non-owner mutations are rejected without partial state changes.
- Filing and recoloring preserve source content, source paths, revision history, and access policy.
- Empty Brains show honest empty states, not the concept's sample vault.
- All files remain reachable with search, kind filtering, and larger folder sets.
- File and code context actions update the existing room and make no provider request.
- Explorer, graph selection, and detail panels agree on actual symbol IDs and relationship directions.
- Static call paths are bounded, handle cycles, and do not claim runtime provenance.
- Desktop and narrow layouts retain working navigation, visible controls, keyboard focus, and readable colors.
- Existing Obsidian graph behavior, room governance, source write approvals, and unified workspace tests remain passing.

Browser verification uses isolated synthetic Brains and local mock providers. It must not seed or unlock the user's real Brain, change their vault, or claim that an actual cloud model or native desktop bundle was tested when only the browser build was checked.

## Verified interaction checks — 11 October 2026

The dedicated `app/tests/personal/files-code-browser.mjs` suite passes 15 checks: authentic source rendering, staged/custom color saves, create/file/unfile, source identity preservation, search/type filters, permission-gated context selection, cross-view source links, code explorer/static paths, narrow layouts at 390 and 320 pixels, member projection, lock/unlock, new capture, no automatic execution, and no plaintext source or credential persistence in browser storage. It builds in its own temporary directory and removes its synthetic Brain when finished.

Screenshots are captured from the actual compiled app with clearly labeled synthetic data, under ignored `app/.personal-test/`: `files-integrated-desktop.png`, `files-integrated-mobile.png`, `code-integrated-desktop.png` and `code-integrated-mobile.png`. Sparse code fixtures remain sparse; decorative clusters are not added to imitate the concept.
