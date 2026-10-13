import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { BrainObject, Folder } from './api';
import { buildGraphModel } from './graphModel.mjs';
import type { GraphEdge, GraphModel, GraphNode } from './graphModel.mjs';
import { filterObsidianGraph, graphInputKey } from './obsidianViewModel.mjs';
import { ObsidianGraphCanvas } from './ObsidianGraphCanvas';
import { VaultExplorer } from './VaultExplorer';
import './ObsidianWorkspace.css';
import './VaultGraphExplorer.css';

type Props = {
  objects: BrainObject[];
  folders: Folder[];
  query: string;
  onSearchChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  visible: boolean;
  busy: boolean;
  activeRoomName?: string;
  canUseInChat: boolean;
  contextReason?: string;
  onUseInChat: (id: string) => void;
  onOpenChat: () => void;
};
type RelatedNote = { object: BrainObject; kinds: string[] };
const NOTE_PREVIEW_LIMIT = 16000;
const RELATIONSHIP_PAGE = 40;
const KIND_LABELS: Record<string, string> = { wikilink: 'Wiki link', markdown: 'Markdown link', embed: 'Embed', source: 'Source reference' };

function ExplorerIcon({ kind }: { kind: 'folders' | 'details' | 'close' }) {
  const paths = {
    folders: 'M3 4h7l2 3h9v13H3z M7 8v10',
    details: 'M3 4h18v16H3z M14 4v16 M17 8h1 M17 12h1 M17 16h1',
    close: 'M6 6l12 12 M18 6 6 18',
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

/** Directed metadata comes from the shared note resolver, never edge draw order. */
function relatedNotes(relationships: GraphEdge[], selectedId: string, objects: Map<string, BrainObject>, direction: 'outgoing' | 'incoming', sources: boolean): RelatedNote[] {
  const result = new Map<string, RelatedNote>();
  for (const relationship of relationships) {
    if ((direction === 'outgoing' ? relationship.source : relationship.target) !== selectedId) continue;
    const id = direction === 'outgoing' ? relationship.target : relationship.source;
    const object = objects.get(id);
    const kinds = relationship.kinds.filter(kind => sources ? kind === 'source' : kind !== 'source');
    if (!object || !kinds.length) continue;
    const existing = result.get(id);
    if (existing) existing.kinds = [...new Set([...existing.kinds, ...kinds])];
    else result.set(id, { object, kinds });
  }
  return [...result.values()].sort((a, b) => a.object.title.localeCompare(b.object.title, undefined, { numeric: true }) || a.object.id.localeCompare(b.object.id));
}

function RelationshipList({ title, items, empty, onSelect }: { title: string; items: RelatedNote[]; empty: string; onSelect: (id: string) => void }) {
  const [limit, setLimit] = useState(RELATIONSHIP_PAGE);
  return <section className="pn-vaultgraph-relations" aria-label={title}>
    <h3>{title}<span>{items.length.toLocaleString()}</span></h3>
    {items.length ? <><ul>{items.slice(0, limit).map(item => <li key={item.object.id}><button type="button" onClick={() => onSelect(item.object.id)}><span>{item.object.title}</span><small>{item.kinds.map(kind => KIND_LABELS[kind] || kind).join(' · ')}</small></button></li>)}</ul>{items.length > limit && <button type="button" className="pn-vaultgraph-more" onClick={() => setLimit(current => current + RELATIONSHIP_PAGE)}>Show more {title.toLowerCase()}</button>}</> : <p>{empty}</p>}
  </section>;
}

/** A second presentation of the authorized note Brain, not a GitNexus code index. */
export function VaultGraphExplorer({ objects, folders, query, onSearchChange, selectedId, onSelect, visible, busy, activeRoomName, canUseInChat, contextReason, onUseInChat, onOpenChat }: Props) {
  const [foldersOpen, setFoldersOpen] = useState(() => !window.matchMedia('(max-width: 760px)').matches);
  const [inspectorOpen, setInspectorOpen] = useState(() => Boolean(selectedId) || !window.matchMedia('(max-width: 1100px)').matches);
  const [depth, setDepth] = useState(0);
  const [showSources, setShowSources] = useState(true);
  const [showOrphans, setShowOrphans] = useState(true);
  const [folderFilter, setFolderFilter] = useState<{ ids: string[]; label: string } | null>(null);
  const [filterResetKey, setFilterResetKey] = useState(0);
  const foldersId = useId();
  const inspectorId = useId();
  const foldersButton = useRef<HTMLButtonElement>(null);
  const inspectorButton = useRef<HTMLButtonElement>(null);
  const inspectorPanel = useRef<HTMLElement>(null);
  const previousSelection = useRef(selectedId);
  const modelCache = useRef<{ key: string; model: GraphModel } | null>(null);
  // A code snapshot is never represented as a vault note, even if a caller passes one.
  const notes = useMemo(() => objects.filter(object => object.kind !== 'code_graph'), [objects]);
  const key = graphInputKey(notes, folders);
  if (modelCache.current?.key !== key) modelCache.current = { key, model: buildGraphModel(notes, { folders }) };
  const model = modelCache.current.model;
  const objectMap = useMemo(() => new Map(notes.map(object => [object.id, object])), [notes]);
  const nodeMap = useMemo(() => new Map(model.nodes.map(node => [node.id, node])), [model]);
  const selected = selectedId ? objectMap.get(selectedId) : undefined;
  const selectedNode = selectedId ? nodeMap.get(selectedId) : undefined;
  const filtered = useMemo(() => filterObsidianGraph(model, { query, selectedId: selected?.id || null, depth, showOrphans, folderIds: folderFilter?.ids || null, showSources }), [model, query, selected?.id, depth, showOrphans, folderFilter, showSources]);
  const selectedVisible = selected ? filtered.nodes.some(node => node.id === selected.id) : false;
  const relations = useMemo(() => {
    const relationships = model.relationships || [];
    const id = selected?.id || '';
    return {
      outgoing: relatedNotes(relationships, id, objectMap, 'outgoing', false),
      incoming: relatedNotes(relationships, id, objectMap, 'incoming', false),
      sources: relatedNotes(relationships, id, objectMap, 'outgoing', true),
      derived: relatedNotes(relationships, id, objectMap, 'incoming', true),
    };
  }, [model, selected?.id, objectMap]);
  const selectedNotices = useMemo(() => model.diagnostics.filter(item => item.sourceId === selected?.id && item.kind !== 'source'), [model, selected?.id]);
  const filtersActive = Boolean(query.trim() || folderFilter || depth || !showOrphans || !showSources);

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 760px)');
    const compact = window.matchMedia('(max-width: 1100px)');
    const changeFolders = () => setFoldersOpen(!narrow.matches);
    const changeInspector = () => setInspectorOpen(!compact.matches);
    narrow.addEventListener('change', changeFolders);
    compact.addEventListener('change', changeInspector);
    return () => { narrow.removeEventListener('change', changeFolders); compact.removeEventListener('change', changeInspector); };
  }, []);
  useEffect(() => {
    if (previousSelection.current === selectedId) return;
    previousSelection.current = selectedId;
    if (selectedId && objectMap.has(selectedId)) setInspectorOpen(true);
  }, [selectedId, objectMap]);
  useEffect(() => {
    if (inspectorOpen && window.matchMedia('(max-width: 1100px)').matches) inspectorPanel.current?.focus({ preventScroll: true });
  }, [inspectorOpen, selected?.id]);

  function select(id: string) {
    if (!objectMap.has(id)) return;
    onSelect(id);
    setInspectorOpen(true);
    if (window.matchMedia('(max-width: 760px)').matches) setFoldersOpen(false);
  }
  function clearFilters() {
    onSearchChange(''); setDepth(0); setShowSources(true); setShowOrphans(true);
    setFolderFilter(null); setFilterResetKey(current => current + 1);
  }
  function closeInspector() { setInspectorOpen(false); inspectorButton.current?.focus(); }
  function closeFolders() { setFoldersOpen(false); foldersButton.current?.focus(); }
  const provenance = (object: BrainObject, node: GraphNode | undefined) => object.sourceMetadata?.kind === 'github'
    ? `${object.sourceMetadata.repository} · ${object.sourceMetadata.ref}`
    : node?.scope.startsWith('folder:') ? 'Connected local vault'
      : object.sourcePath ? 'Imported local source' : 'Saved in this Brain';

  return <section className={`pn-vaultgraph${foldersOpen ? ' pn-vaultgraph-folders-open' : ''}${inspectorOpen ? ' pn-vaultgraph-inspector-open' : ''}`} aria-label="Vault graph explorer">
    <header className="pn-vaultgraph-heading">
      <button type="button" ref={foldersButton} className="pn-vaultgraph-icon" aria-label="Toggle vault graph folders" aria-expanded={foldersOpen} aria-controls={foldersId} onClick={() => { setFoldersOpen(current => !current); if (window.matchMedia('(max-width: 760px)').matches) setInspectorOpen(false); }}><ExplorerIcon kind="folders" /></button>
      <div><h2>Vault graph</h2><p>GitNexus-style explorer · your notes, not a code index</p></div>
      <span className="pn-vaultgraph-same-brain">Same Brain · two views</span>
      <button type="button" ref={inspectorButton} className="pn-vaultgraph-icon" aria-label="Toggle note inspector" aria-expanded={inspectorOpen} aria-controls={inspectorId} onClick={() => { setInspectorOpen(current => !current); if (window.matchMedia('(max-width: 760px)').matches) setFoldersOpen(false); }}><ExplorerIcon kind="details" /></button>
    </header>
    <div className="pn-vaultgraph-body">
      <aside id={foldersId} className="pn-vaultgraph-folders" hidden={!foldersOpen} aria-label="Vault graph folders" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeFolders(); } }}>
        <div className="pn-vaultgraph-drawer-heading"><span>Explorer</span><button type="button" className="pn-vaultgraph-icon" aria-label="Close vault graph folders" onClick={closeFolders}><ExplorerIcon kind="close" /></button></div>
        <VaultExplorer objects={notes} folders={folders} selectedId={selected?.id || null} onSelect={select} filterResetKey={filterResetKey} onFolderFilter={(ids, label) => setFolderFilter(ids ? { ids, label: label || 'Folder' } : null)} />
      </aside>
      <section className="pn-vaultgraph-center" aria-label="Vault relationships">
        <div className="pn-vaultgraph-controls">
          <label className="pn-vaultgraph-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search vault graph" placeholder="Search notes, path: or #tag…" value={query} onChange={event => onSearchChange(event.target.value)} /></label>
          <div className="pn-vaultgraph-scope" role="group" aria-label="Vault graph scope"><button type="button" aria-pressed={depth === 0} onClick={() => setDepth(0)}>Global</button><button type="button" disabled={!selectedNode} aria-pressed={depth === 1} onClick={() => setDepth(1)}>Local · 1</button><button type="button" disabled={!selectedNode} aria-pressed={depth === 2} onClick={() => setDepth(2)}>Local · 2</button></div>
          <details className="pn-vaultgraph-filter-menu"><summary>Filters</summary><div><label><input type="checkbox" checked={showOrphans} onChange={event => setShowOrphans(event.target.checked)} />Show unlinked notes</label><label><input type="checkbox" checked={showSources} onChange={event => setShowSources(event.target.checked)} />Show source references</label><p>Search accepts literal words, quoted phrases, path: and tag: terms. Use - to exclude a term.</p></div></details>
        </div>
        {filtersActive && <div className="pn-vaultgraph-filter-status"><span>{folderFilter?.label || (depth ? `${depth}-hop neighborhood` : 'Filtered graph')} · {filtered.nodes.length.toLocaleString()} notes</span><button type="button" onClick={clearFilters}>Clear vault graph filters</button></div>}
        <div className="pn-vaultgraph-stage"><ObsidianGraphCanvas model={filtered} selectedId={selected?.id || null} onSelect={select} visible={visible} /></div>
        <div className="pn-vaultgraph-legend"><span><i />Note links</span><span><i className="is-source" />Source references</span><span>Drag to explore · scroll to zoom</span></div>
      </section>
      <aside id={inspectorId} ref={inspectorPanel} tabIndex={-1} className="pn-vaultgraph-inspector" hidden={!inspectorOpen} aria-label="Note inspector" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeInspector(); } }}>
        <header><strong>Note inspector</strong><button type="button" className="pn-vaultgraph-icon" aria-label="Close note inspector" onClick={closeInspector}><ExplorerIcon kind="close" /></button></header>
        <div className="pn-vaultgraph-inspector-content">
          {selected ? <>
            <div className="pn-vaultgraph-note-heading"><span>{selected.kind} · source snapshot</span><h2>{selected.title}</h2><code>{selectedNode?.path || selected.title}</code></div>
            {!selectedVisible && <div className="pn-vaultgraph-notice" role="status">{selectedNode ? <>This note is outside the current graph filters.<button type="button" onClick={clearFilters}>Reveal in graph</button></> : 'This note is outside the 10,000-object graph limit. Its source is still available here.'}</div>}
            <section className="pn-vaultgraph-chat" aria-label="Selected note chat context"><span className="pn-vaultgraph-eyebrow">Chat context</span><p>{activeRoomName ? <>Active room · <strong>{activeRoomName}</strong></> : 'Choose a chat room to use this note as context.'}</p><button type="button" className="pn-vaultgraph-primary" disabled={busy || !canUseInChat || !activeRoomName} onClick={() => onUseInChat(selected.id)}>Add note to chat</button><button type="button" disabled={!activeRoomName} onClick={onOpenChat}>Open active chat</button><p>{contextReason || 'Adds this source to the active room. Nothing is sent to a model until you send a message.'}</p></section>
            <details className="pn-vaultgraph-preview" open><summary>Note preview</summary><pre>{selected.text.slice(0, NOTE_PREVIEW_LIMIT) || 'This source has no text preview.'}</pre>{selected.text.length > NOTE_PREVIEW_LIMIT && <p>Preview limited to the first {NOTE_PREVIEW_LIMIT.toLocaleString()} characters. The saved source is unchanged.</p>}</details>
            <RelationshipList key={`${selected.id}:outgoing`} title="Outgoing note links" items={relations.outgoing} empty="No resolved outgoing note links." onSelect={select} />
            <RelationshipList key={`${selected.id}:incoming`} title="Backlinks" items={relations.incoming} empty="No resolved backlinks in this Brain snapshot." onSelect={select} />
            <RelationshipList key={`${selected.id}:sources`} title="Source references" items={relations.sources} empty="No readable source references." onSelect={select} />
            {relations.derived.length > 0 && <RelationshipList key={`${selected.id}:derived`} title="Referenced by sources" items={relations.derived} empty="No sources reference this note." onSelect={select} />}
            <section className="pn-vaultgraph-provenance" aria-label="Note provenance"><h3>Provenance</h3><dl><dt>Origin</dt><dd>{provenance(selected, selectedNode)}</dd><dt>Record</dt><dd>{selected.id}</dd>{selected.revisionId && <><dt>Revision</dt><dd>{selected.revisionId}</dd></>}{selected.sourceMetadata?.commitSha && <><dt>Commit</dt><dd>{selected.sourceMetadata.commitSha}</dd></>}{selectedNode?.aliases.length ? <><dt>Aliases</dt><dd>{selectedNode.aliases.join(', ')}</dd></> : null}{selectedNode?.tags.length ? <><dt>Tags</dt><dd>{selectedNode.tags.map(tag => `#${tag}`).join(' ')}</dd></> : null}</dl><p>Imported content remains source material. Viewing or using it does not promote it to Canon or change its access.</p></section>
            {selectedNotices.length > 0 && <details className="pn-vaultgraph-notices"><summary>{selectedNotices.length} link notices for this note</summary><ul>{selectedNotices.slice(0, 20).map((notice, index) => <li key={index}><span>{notice.target}</span><small>{notice.status}</small></li>)}</ul>{selectedNotices.length > 20 && <p>Showing the first 20 notices.</p>}</details>}
            <p className="pn-vaultgraph-boundary">Relationships use readable, imported sources only. Unresolved links do not create notes. Link scans are bounded to 32 KiB and 128 links per source.</p>
          </> : <div className="pn-vaultgraph-select-note"><span aria-hidden="true">⌘</span><h2>Follow a connection.</h2><p>Select a note in the folders or graph to inspect its contents, links and provenance.</p><p>This uses the same Brain as the Obsidian view. Your original files stay where they are.</p></div>}
        </div>
      </aside>
    </div>
    <footer className="pn-vaultgraph-footer"><span>{filtered.nodes.length.toLocaleString()} notes · {filtered.edges.length.toLocaleString()} links</span><span>Permission-filtered Brain · no extra index</span>{model.diagnosticCount > 0 && <span>{model.diagnosticCount.toLocaleString()} link notices · select a note to inspect</span>}{model.omittedObjects > 0 || model.edgeLimitReached ? <span role="status">Graph limit reached: up to 10,000 objects and 20,000 relationships.</span> : null}</footer>
  </section>;
}
