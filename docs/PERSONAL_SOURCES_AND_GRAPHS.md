# Arkive source connections and graph views

Arkive Personal can read an Obsidian vault or a GitHub Markdown repository into its encrypted Brain, then write an individual source file only after the owner requests and approves the exact change. Note relationships appear in both the Obsidian-style graph and the GitNexus-style vault explorer. Actual indexed code remains a separate subview. The existing multi-chat canvas remains intact.

This is a single-owner local beta. Manual read refresh and approval-gated writeback are implemented; continuous watching, two-way deletion propagation, automatic Git pushes from a local folder, and agent tool-driven writes are not.

## Connect an Obsidian vault

1. Open Arkive Personal and unlock or create your Brain.
2. Use **Connect folder** to choose the specific vault root, not your home folder. In browser mode, enter a path on the connected node.
3. Open **Brain → Obsidian**. Wiki-links, embedded note links, heading/block references, aliases and relative Markdown links connect imported notes. Code fences, inline code and external links do not create note edges.
4. Edit a note in Obsidian, then use **Read updates** in **Sources & sync**, or the sidebar refresh button. The same source path keeps its object identity and gains a revision when contents change.

The adapter reads Markdown and text; it does not use an Obsidian account, install a plugin or modify `.obsidian`. Hidden files, sensitive names, symlinks and hardlinks are excluded. Use a copy of a small vault for your first test. Exclusion rules cannot recognize every secret inside ordinary prose.

The graph uses the longest connected folder root as its link scope, so matching filenames in different vaults do not merge. Ambiguous and unresolved links remain diagnostics rather than guessed edges. Frontmatter aliases and tags support simple forms, not the full YAML specification. Attachments and images are not imported as note objects.

The Obsidian-style view uses Arkive's charcoal panels, sage graph and lavender selections beside an expandable folder explorer built from imported file paths. Search and sort files, expand folders, or select a file or graph node to inspect the same Brain object. Folder selection alone does not hide the rest of the graph; **Filter graph to folder** applies that restriction explicitly. The explorer does not read additional filesystem paths, and dragging a node never moves its source file.

Drag the background to pan, drag nodes to reposition them, scroll to zoom at the pointer, and hover to highlight neighbors. Keyboard controls are arrow keys to pan, Shift for larger steps, plus/minus to zoom and zero to fit. **Find a note** provides keyboard access to every displayed note. Global and one- or two-hop local views use actual links. Graph settings control orphan visibility, explicit source-reference links, literal search, `path:` and `tag:` filters, query-based color groups, node size, link thickness, label threshold, and four layout forces. Source-only relationships are dashed.

Canvas rendering replaces the note view's former 300-node display cap. It handles the graph model's existing limit of 10,000 objects and 20,000 relationships; each note's link scan remains bounded to 32 KiB and 128 links, with truncation notices. A local background worker computes forces and sleeps when the graph is hidden or paused. An unchanged Brain refresh preserves positions, zoom, folder expansion and scroll. Settings and layout are session-local. Actual GitNexus code snapshots retain their own bounds. This is an independent Arkive implementation of the core graph interactions, not an embedded Obsidian app, plugin runtime, full search engine or automatic two-way sync.

For a three-panel view of the same vault, choose **Brain → GitNexus → Vault graph**. The explorer places imported folders on the left, the note graph in the center, and the selected note's content and relationships on the right. Note selection carries across Obsidian, Files and this explorer. Outgoing links and backlinks preserve direction; source references remain separately labeled. Folder and search filters do not change permissions or move files. Both note views use Arkive's dark palette.

A Markdown-heavy vault such as `xela_brain001` does not need to become a code index for this view. Its already-connected local vault supplies the same Brain objects; opening the explorer does not clone, scan, import or push the GitHub repository. Members see only notes supplied by the server's existing access projection, without owner filesystem paths. Only the owner can change chat context, and selecting a note is not a model request.

Renaming or deleting a source does not remove its old Brain object. A rename is currently a new source identity. Old versions remain in history until a future retention/reconciliation feature handles them explicitly.

## Connect a GitHub Brain

In **Sources & sync**, register `owner/repository`, an explicit branch/tag/commit, and an optional repository-relative subfolder. Registration stores only the connection configuration. Click **Read updates** to import a pinned commit snapshot.

Public repositories may be readable anonymously. Private repositories need a fine-grained token limited to that repository with Contents read permission. Enter it in **GitHub token** for the current operation. The field clears after each read, preview or write; credentials are not saved in the Brain, backups, plans or browser storage.

The connector contacts only `https://api.github.com`. It resolves a commit and complete recursive tree, reads regular Markdown/text blobs, and checks blob hashes and UTF-8. Truncated trees fail instead of being treated as complete snapshots. A read is bounded to 1,000 files, 16 MiB of text and 1 MiB per file; unsupported or excluded entries are counted as skipped. The source batch is persisted atomically. Commit/blob identities travel with each imported revision.

GitHub is an external storage provider, not an encrypted peer: files committed there are plaintext to anyone with repository access. A private repository is not end-to-end encryption. An unlocked Arkive server also sees any token used for that request; connect only to a node you trust.

## Request and approve a write

1. In **Sources & sync → Request a source change**, select a connected destination.
2. Load an existing Brain copy or enter a relative Markdown/text path and the requested contents. For local files, parent folders must already exist. For GitHub, the path is repository-relative and must remain under the connected subfolder.
3. Select **Preview exact changes**. Arkive reads the current source, displays its destination and full before/after text, and saves a server-held plan for ten minutes. Preview does not change the source.
4. Review both versions and check the approval box. GitHub writes need a newly entered repository-scoped Contents write token.
5. Select **Apply approved change**. The plan is consumed once, old bytes are preserved in encrypted Brain history, and the source is checked again before replacement. A changed source rejects the preview; prepare a fresh one.

Local writes use a temporary file and atomic replacement/create, preserving existing file permissions. Path containment, symlink, hardlink, inode and parent-directory checks limit accidental or redirected writes. These checks are not an OS sandbox against a malicious process running as the same user.

GitHub writes create a commit directly on the displayed existing branch, using the expected blob SHA and checking the committed blob afterward. They do **not** open a pull request. Choose a dedicated review branch and retain branch protection where needed. Tags and commit IDs are read sources, not write destinations. Arkive never force-pushes or deletes a file through this interface.

If a network error leaves a GitHub write unconfirmed, inspect or refresh the source before trying again: the commit may already exist. If the write succeeds but the Brain cache cannot update, the response says so explicitly. Refresh the source rather than repeating the write. Cancellation and locking remove pending plans. Lock is serialized behind already-started owner operations; it does not undo or instantly cancel an approved write already in progress.

Chat responses and memory approval cannot call these write routes through the current model adapter. The owner API credential is full authority on this single-owner node; the visual approval checkbox is not a separate multi-user signature system. Source history and write events are local audit evidence, not cryptographic proof of authorship.

## Import a GitNexus graph

Index the intended code repository with GitNexus outside Arkive. Open **Brain → GitNexus → Code indexes**, choose an **Indexed repository**, and select **Import & open graph**. This owner-only subview is separate from the default Vault graph. Arkive discovers registered indexes without importing them automatically. A successful import selects and opens the returned snapshot, including when another repository or the vault graph was previously displayed. Sources & sync has the same importer; loaded graphs have an **Import / refresh repository** button. Use **Refresh repositories** after creating a new index.

Discovery reads bounded registry metadata from the node's trusted GitNexus home and returns names, dates and counts only. Both discovery and local CLI import require the owner on a loopback-bound node. Missing registry files produce an empty list; unreadable or malformed registries produce actionable errors. Neither operation runs repository code or indexes a repository. The native launcher path is handled by adding the bundled Node directory to the CLI child environment, so Finder does not need a shell-configured Node PATH.

The adapter executes fixed read-only queries against a registered local index. It does not index repositories, accept arbitrary Cypher, execute repository code or upload source code. On this Mac the default CLI path is `/opt/homebrew/bin/gitnexus`; another installation can set the node's trusted `ARKIVE_GITNEXUS_PATH` to an absolute executable path. Local CLI import is disabled on remotely bound nodes. An unavailable index produces an error, not a fabricated graph.

Exports contain at most 500 file/symbol nodes and 1,500 relationships, with explicit truncation. Node selection is a bounded index sample, not a complete repository map. The native Arkive explorer renders all 500 permitted snapshot nodes, with a repository tree, search, type/community/relationship filters, pan/zoom and local focus. Selected nodes show actual file paths and directed relationships. Processes derives bounded static `CALLS` paths, not runtime execution. Chat selects the complete snapshot into an owner-only room without sending to a model. Source text and line numbers are not part of this format. A snapshot must be re-imported after re-indexing to reflect changes.

For the Files cabinet, saved folder colors, exact data mapping and licensing boundaries, see [Files and Code integration](FILES_CODE_INTEGRATION.md). **Vault folders** follows connected Obsidian/local paths automatically; **Collections** reuses Library's optional custom organization. Neither moves original files. The Obsidian-style graph uses Arkive's dark colors, not Obsidian's reference theme.

A portable JSON import is also available. Its format is:

```json
{
  "format": "arkive-code-graph",
  "version": 1,
  "repository": "example-repository",
  "nodes": [
    { "id": "file:src/main.ts", "label": "main.ts", "type": "File", "filePath": "src/main.ts" },
    { "id": "fn:start", "label": "start", "type": "Function", "filePath": "src/main.ts", "community": "startup" }
  ],
  "edges": [{ "source": "file:src/main.ts", "target": "fn:start", "type": "DEFINES" }],
  "truncated": false
}
```

Snapshots are limited to 1 MiB. Duplicate nodes/relationships, dangling edges, extra fields and malformed shapes are rejected. Importing JSON does not establish that it came from GitNexus or verify its claims; provenance signatures are future work. The UI validates restored snapshots again before rendering.

## Storage compatibility and authority

These features add optional connection records and GitHub source metadata to the encrypted version-one store. Existing older Brains remain readable. Older binaries do not understand the new optional fields: upgrade both paired nodes before replication, and retain an encrypted backup before upgrading. Do not downgrade a Brain after saving new records with this build.

Replica exports omit connection grants and local folders. Recovery clears those grants as well. Imported source content, its origin metadata, code graph snapshots and immutable history can replicate; authority to read new sources or write originals does not. Reconnect sources deliberately on each node. Tokens and pending write approvals never replicate.

## Product boundaries

- Obsidian-compatible means ordinary Markdown and common link semantics, not complete plugin or vault-setting compatibility.
- GitHub Markdown read/write and GitNexus code inspection are distinct adapters. A local Git-backed vault write does not automatically commit or push that checkout.
- Read refresh is manual. There is no unattended polling, conflict editor, deletion synchronization, OAuth flow or persistent credential vault yet.
- Source comparison, multi-Brain reconciliation, design-to-code automation and independent agent approval teams remain later platform work.
- No user's real vault or GitHub repository is connected by installing this build. Select the target yourself; do not paste credentials into chat.

## Reference contracts

The note model follows common [Obsidian internal links](https://help.obsidian.md/links) and [graph view interactions](https://obsidian.md/help/plugins/graph). GitHub source and write adapters use the documented [Git trees](https://docs.github.com/en/rest/git/trees) and [repository contents](https://docs.github.com/en/rest/repos/contents) APIs. Those interfaces define the source semantics; Arkive's safety limits and approval flow are additional application controls.
