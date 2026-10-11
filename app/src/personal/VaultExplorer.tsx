import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { BrainObject } from './api';
import { buildVaultTree, flattenVaultTree, vaultAncestors, vaultFolderObjectIds, vaultTreeSignature } from './vaultTreeModel.mjs';
import type { VaultTree, VaultTreeRow } from './vaultTreeModel.mjs';
import './VaultExplorer.css';

type Props = {
  objects: BrainObject[];
  folders: { id: string; path: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFolderFilter?: (ids: string[] | null, label?: string) => void;
  /** Increment when a parent-owned Clear filters action resets graph filtering. */
  filterResetKey?: string | number;
};
const ROW_HEIGHT = 29;
const OVERSCAN = 8;

export function VaultExplorer({ objects, folders, selectedId, onSelect, onFolderFilter, filterResetKey = 0 }: Props) {
  const signature = useMemo(() => vaultTreeSignature(objects, folders), [objects, folders]);
  const modelCache = useRef<{ signature: string; model: VaultTree } | null>(null);
  if (modelCache.current?.signature !== signature) modelCache.current = { signature, model: buildVaultTree(objects, folders) };
  const model = modelCache.current.model;
  const [expanded, setExpanded] = useState(() => new Set(model.roots));
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [activeId, setActiveId] = useState<string | null>(model.roots[0] || null);
  const [filteredFolder, setFilteredFolder] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 400 });
  const tree = useRef<HTMLDivElement>(null);
  const rowPrefix = useId();
  const previousRoots = useRef(new Set(model.roots));
  const previousSelection = useRef('');
  const previousSelected = useRef<string | null>(null);
  const previousReset = useRef(filterResetKey);
  const resetRequested = previousReset.current !== filterResetKey;
  const lastScrollRequest = useRef('');
  const filterCallback = useRef(onFolderFilter);
  const lastFilter = useRef('');
  filterCallback.current = onFolderFilter;
  const rows = useMemo(() => flattenVaultTree(model, expanded, { query, order }), [model, expanded, query, order]);
  const rowIndex = useMemo(() => new Map(rows.map((row, index) => [row.id, index])), [rows]);
  const effectiveActive = activeId && rowIndex.has(activeId) ? activeId : rows[0]?.id || null;
  const activeNode = effectiveActive ? model.nodes.get(effectiveActive) : undefined;
  const activeFolder = activeNode?.kind === 'folder' ? activeNode : activeNode?.parentId ? model.nodes.get(activeNode.parentId) : undefined;
  const activeRoot = activeNode ? model.nodes.get(activeNode.rootId) : model.nodes.get(model.roots[0]);
  const idFor = (id: string) => `${rowPrefix}-${encodeURIComponent(id)}`;

  useEffect(() => {
    const added = model.roots.filter(id => !previousRoots.current.has(id));
    previousRoots.current = new Set(model.roots);
    setExpanded(current => new Set([...current].filter(id => model.nodes.has(id)).concat(added)));
  }, [model]);

  useEffect(() => {
    const nodeId = selectedId ? model.objectNodes.get(selectedId) : undefined;
    const ancestors = nodeId ? vaultAncestors(model, nodeId) : [];
    const selection = JSON.stringify([selectedId, nodeId, ancestors]);
    if (previousSelection.current === selection) return;
    previousSelection.current = selection;
    const changed = previousSelected.current !== selectedId;
    previousSelected.current = selectedId;
    if (!nodeId) return;
    if (changed) setQuery('');
    setExpanded(current => new Set([...current, ...ancestors]));
    setActiveId(nodeId);
  }, [model, selectedId]);

  useEffect(() => {
    const element = tree.current;
    if (!element) return;
    const resize = () => setViewport(current => ({ ...current, height: element.clientHeight }));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = tree.current;
    if (!element) return;
    const index = effectiveActive ? rowIndex.get(effectiveActive) : undefined;
    if (index === undefined) return;
    const request = JSON.stringify([effectiveActive, query, order]);
    if (lastScrollRequest.current === request) return;
    lastScrollRequest.current = request;
    const top = index * ROW_HEIGHT;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + ROW_HEIGHT > element.scrollTop + element.clientHeight) element.scrollTop = Math.max(0, top + ROW_HEIGHT - element.clientHeight);
    setViewport(current => current.top === element.scrollTop ? current : { ...current, top: element.scrollTop });
  }, [effectiveActive, rowIndex, query, order]);

  useEffect(() => {
    if (previousReset.current === filterResetKey) return;
    previousReset.current = filterResetKey;
    lastFilter.current = '';
    setFilteredFolder(null);
  }, [filterResetKey]);

  useEffect(() => {
    // Capture resetRequested during render so another effect cannot reapply a
    // stale child filter in the same commit as the parent's Clear filters.
    if (resetRequested || !filteredFolder) return;
    const folder = model.nodes.get(filteredFolder);
    if (!folder) { setFilteredFolder(null); lastFilter.current = ''; filterCallback.current?.(null); return; }
    const ids = vaultFolderObjectIds(model, filteredFolder);
    const signature = JSON.stringify([filteredFolder, ids]);
    if (signature !== lastFilter.current) { lastFilter.current = signature; filterCallback.current?.(ids, folder.label); }
  }, [model, filteredFolder, resetRequested]);

  function toggle(row: VaultTreeRow) {
    if (row.node.kind !== 'folder' || query.trim()) return;
    setExpanded(current => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; });
  }
  function activate(row: VaultTreeRow) {
    setActiveId(row.id);
    tree.current?.focus({ preventScroll: true });
    if (row.node.kind === 'folder') toggle(row);
    else if (row.node.objectId) onSelect(row.node.objectId);
  }
  function keydown(event: KeyboardEvent<HTMLDivElement>) {
    if (!rows.length) return;
    const index = effectiveActive ? rowIndex.get(effectiveActive) ?? 0 : 0;
    const row = rows[index];
    let next = index;
    switch (event.key) {
      case 'ArrowDown': next = Math.min(rows.length - 1, index + 1); break;
      case 'ArrowUp': next = Math.max(0, index - 1); break;
      case 'Home': next = 0; break;
      case 'End': next = rows.length - 1; break;
      case 'ArrowRight':
        if (row.node.kind === 'folder' && !row.expanded) toggle(row);
        else if (row.node.kind === 'folder' && rows[index + 1]?.level > row.level) next = index + 1;
        break;
      case 'ArrowLeft':
        if (row.node.kind === 'folder' && row.expanded && !query.trim()) toggle(row);
        else if (row.node.parentId) next = rowIndex.get(row.node.parentId) ?? index;
        break;
      case 'Enter': case ' ': activate(row); break;
      default: return;
    }
    event.preventDefault();
    if (next !== index) setActiveId(rows[next].id);
  }
  const first = Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((viewport.top + Math.max(ROW_HEIGHT, viewport.height)) / ROW_HEIGHT) + OVERSCAN);
  const visibleRows = rows.slice(first, end);
  const activeIndex = effectiveActive ? rowIndex.get(effectiveActive) : undefined;
  // Keep aria-activedescendant mounted when the user wheel-scrolls elsewhere.
  const pinnedRow = activeIndex !== undefined && (activeIndex < first || activeIndex >= end) ? rows[activeIndex] : null;
  const renderRow = (row: VaultTreeRow, index: number) => <div key={row.id} id={idFor(row.id)} role="treeitem" aria-label={row.node.label} aria-level={row.level} aria-posinset={row.position} aria-setsize={row.setSize} aria-expanded={row.node.kind === 'folder' ? row.expanded : undefined} aria-selected={row.node.kind === 'file' ? row.node.objectId === selectedId : undefined} data-path={row.node.path} data-root-id={row.node.rootId} data-object-id={row.node.objectId} className={`pn-vault-row${row.id === effectiveActive ? ' is-active' : ''}${row.node.objectId === selectedId ? ' is-selected' : ''}`} style={{ top: index * ROW_HEIGHT, paddingLeft: 11 + (row.level - 1) * 15 }} title={row.node.path} onClick={() => activate(row)}>
    <span className={`pn-vault-chevron${row.expanded ? ' is-open' : ''}`} aria-hidden="true">{row.node.kind === 'folder' ? '›' : ''}</span><span className="pn-vault-row-label">{row.node.label}</span>{row.node.kind === 'folder' && <span className="pn-vault-row-count" aria-hidden="true">{row.node.count.toLocaleString()}</span>}
  </div>;

  return <section className="pn-vault-explorer" aria-label="Vault explorer">
    <header className="pn-vault-header"><strong>Files</strong><div><button type="button" aria-label={order === 'asc' ? 'Sort files descending' : 'Sort files ascending'} title={order === 'asc' ? 'Sort Z to A' : 'Sort A to Z'} onClick={() => setOrder(current => current === 'asc' ? 'desc' : 'asc')}>{order === 'asc' ? 'A↓' : 'Z↓'}</button><button type="button" aria-label="Collapse all folders" title="Collapse all folders" onClick={() => { setQuery(''); setExpanded(new Set()); setActiveId(model.roots[0] || null); }}>⇈</button></div></header>
    <label className="pn-vault-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search vault files" placeholder="Search files…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    {onFolderFilter && <div className="pn-vault-filter-tools"><button type="button" aria-label="Filter graph to selected folder" disabled={!activeFolder} title={activeFolder ? `Show graph files from ${activeFolder.label}` : 'Select a folder first'} onClick={() => activeFolder && setFilteredFolder(activeFolder.id)}>Filter graph to folder</button>{filteredFolder && <button type="button" aria-label="Clear folder graph filter" title="Show all graph files" onClick={() => { setFilteredFolder(null); lastFilter.current = ''; onFolderFilter(null); }}>×</button>}</div>}
    <div ref={tree} className="pn-vault-tree" role="tree" aria-label="Vault files" tabIndex={0} aria-activedescendant={effectiveActive ? idFor(effectiveActive) : undefined} onKeyDown={keydown} onScroll={event => { const top = event.currentTarget.scrollTop; setViewport(current => ({ ...current, top })); }}>
      <div role="none" className="pn-vault-tree-space" style={{ height: rows.length * ROW_HEIGHT }}>{visibleRows.map((row, offset) => renderRow(row, first + offset))}{pinnedRow && activeIndex !== undefined && renderRow(pinnedRow, activeIndex)}</div>
      {!rows.length && <p className="pn-vault-empty">{query.trim() ? 'No matching files.' : 'Connect a vault or save a note to see your files here.'}</p>}
    </div>
    <footer className="pn-vault-footer"><span title={activeRoot?.path}>{activeRoot?.label || 'Your Brain'}</span><small>{activeRoot ? activeRoot.count.toLocaleString() : model.count.toLocaleString()} files</small></footer>
    <span className="pn-sr" aria-live="polite">{query.trim() ? `${rows.filter(row => row.node.kind === 'file').length} matching files.` : `${model.count} files available.`}{filteredFolder ? ` Graph filtered to ${model.nodes.get(filteredFolder)?.label || 'folder'}.` : ''}</span>
  </section>;
}
