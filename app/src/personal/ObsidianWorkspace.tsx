import { useEffect, useMemo, useRef, useState } from 'react';
import type { BrainObject, Folder } from './api';
import { buildGraphModel } from './graphModel.mjs';
import type { GraphModel } from './graphModel.mjs';
import { filterObsidianGraph, graphInputKey, graphSearchColors } from './obsidianViewModel.mjs';
import { VaultExplorer } from './VaultExplorer';
import { ObsidianGraphCanvas, FORCE_GRAPH_DEFAULTS } from './ObsidianGraphCanvas';
import type { GraphForceSettings } from './ObsidianGraphCanvas';
import './ObsidianWorkspace.css';

type Props = {
  objects: BrainObject[]; folders: Folder[]; selectedId: string | null;
  onSelect: (id: string) => void; query: string; onSearchChange?: (query: string) => void; visible?: boolean;
};
const GROUP_COLORS = ['#c3b2e9', '#9caa8c', '#88a9bd', '#c495a7', '#b9b58c'];
const SLIDERS: { key: keyof GraphForceSettings; label: string; min: number; max: number; step: number }[] = [
  { key: 'nodeSize', label: 'Node size', min: .4, max: 3, step: .1 },
  { key: 'linkWidth', label: 'Link thickness', min: .2, max: 3, step: .1 },
  { key: 'labelThreshold', label: 'Text fade threshold', min: .2, max: 3, step: .1 },
  { key: 'centerForce', label: 'Center force', min: 0, max: 1, step: .02 },
  { key: 'repelForce', label: 'Repel force', min: .1, max: 4, step: .1 },
  { key: 'linkForce', label: 'Link force', min: .01, max: 1, step: .01 },
  { key: 'linkDistance', label: 'Link distance', min: 20, max: 240, step: 5 },
];

function GraphIcon({ kind }: { kind: 'folders' | 'settings' | 'close' }) {
  const paths = { folders: 'M3 4h7l2 3h9v13H3z M7 8v10', settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2', close: 'M6 6l12 12 M18 6 6 18' };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

/** A vault explorer and a force graph over the same authorized source snapshot. */
export function ObsidianWorkspace({ objects, folders, selectedId, onSelect, query, onSearchChange, visible = true }: Props) {
  const [localQuery, setLocalQuery] = useState('');
  const [depth, setDepth] = useState(0);
  const [orphans, setOrphans] = useState(true);
  const [showSources, setShowSources] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(() => !window.matchMedia('(max-width: 860px)').matches);
  const [folderFilter, setFolderFilter] = useState<{ ids: string[]; label: string } | null>(null);
  const [filterResetKey, setFilterResetKey] = useState(0);
  const [settings, setSettings] = useState<GraphForceSettings>({ ...FORCE_GRAPH_DEFAULTS });
  const [groups, setGroups] = useState<{ id: number; query: string; color: string }[]>([]);
  const nextGroupId = useRef(1);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const settingsPanel = useRef<HTMLElement>(null);
  const modelCache = useRef<{ key: string; value: GraphModel } | null>(null);
  const key = graphInputKey(objects, folders);
  if (modelCache.current?.key !== key) modelCache.current = { key, value: buildGraphModel(objects, { folders }) };
  const model = modelCache.current.value;
  const term = onSearchChange ? query : query || localQuery;
  const filtered = useMemo(() => filterObsidianGraph(model, { query: term, depth, selectedId,
    showOrphans: orphans, folderIds: folderFilter?.ids ?? null, showSources }), [model, term, depth, selectedId, orphans, folderFilter, showSources]);
  const colors = useMemo(() => graphSearchColors(filtered.nodes, groups), [filtered.nodes, groups]);
  const sources = useMemo(() => new Map(model.nodes.map(node => [node.id, node])), [model]);

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 860px)');
    const resize = () => setExplorerOpen(!narrow.matches);
    narrow.addEventListener('change', resize);
    return () => narrow.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!settingsOpen) return;
    settingsPanel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setSettingsOpen(false); settingsButton.current?.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [settingsOpen]);

  function select(id: string) {
    onSelect(id);
    if (window.matchMedia('(max-width: 860px)').matches) setExplorerOpen(false);
  }
  function changeSearch(value: string) { if (onSearchChange) onSearchChange(value); else setLocalQuery(value); }
  function clearFilters() { setFolderFilter(null); setFilterResetKey(value => value + 1); changeSearch(''); setDepth(0); }
  function resetSettings() {
    setSettings({ ...FORCE_GRAPH_DEFAULTS }); setOrphans(true); setShowSources(true);
    setGroups([]); clearFilters();
  }
  function addGroup() {
    const id = nextGroupId.current++;
    setGroups(previous => [...previous, { id, query: '', color: GROUP_COLORS[previous.length % GROUP_COLORS.length] }]);
  }

  return <section className={`pn-obsidian-workspace${explorerOpen ? ' pn-obsidian-explorer-open' : ''}`} aria-label="Obsidian-style note graph">
    <header className="pn-obsidian-bar"><button type="button" className="pn-obsidian-icon-button" aria-label="Toggle graph folders" title="Show or hide folders" aria-expanded={explorerOpen} aria-controls="pn-obsidian-folders" onClick={() => setExplorerOpen(value => !value)}><GraphIcon kind="folders" /></button><div className="pn-obsidian-scope" aria-label="Graph scope">
      <button type="button" aria-pressed={depth === 0} onClick={() => setDepth(0)}>Global</button>
      <button type="button" disabled={!selectedId} aria-pressed={depth === 1} onClick={() => setDepth(1)}>Local · 1</button>
      <button type="button" disabled={!selectedId} aria-pressed={depth === 2} onClick={() => setDepth(2)}>Local · 2</button>
    </div><span className="pn-obsidian-view-title">{depth ? 'Local graph' : 'Graph view'}</span><button type="button" ref={settingsButton} className="pn-obsidian-icon-button" aria-label="Graph settings" title="Graph settings" aria-expanded={settingsOpen} aria-controls="pn-obsidian-settings" onClick={() => setSettingsOpen(value => !value)}><GraphIcon kind="settings" /></button></header>
    <div className="pn-obsidian-body">
      <aside className="pn-obsidian-explorer" id="pn-obsidian-folders" hidden={!explorerOpen} aria-label="Graph folders"><VaultExplorer objects={objects} folders={folders} selectedId={selectedId} onSelect={select} filterResetKey={filterResetKey} onFolderFilter={(ids, label) => setFolderFilter(ids ? { ids, label: label || 'Folder' } : null)} /></aside>
      <div className="pn-obsidian-graph-area">
        {Boolean(term || folderFilter || depth) && <div className="pn-obsidian-filter-status"><span>{folderFilter?.label || (depth ? `${depth}-hop neighborhood` : 'Search results')} · {filtered.nodes.length} notes</span><button type="button" onClick={clearFilters}>Clear filters</button></div>}
        <ObsidianGraphCanvas model={filtered} selectedId={selectedId} onSelect={select} settings={settings} colors={colors} visible={visible} />
        {settingsOpen && <section className="pn-obsidian-settings" ref={settingsPanel} id="pn-obsidian-settings" tabIndex={-1} aria-label="Graph settings panel"><header><h2>Graph settings</h2><button type="button" aria-label="Close graph settings" className="pn-obsidian-icon-button" onClick={() => { setSettingsOpen(false); settingsButton.current?.focus(); }}><GraphIcon kind="close" /></button></header><button className="pn-obsidian-reset" type="button" onClick={resetSettings}>Restore default settings</button>
          <details open><summary>Filters</summary><label>Search files<input type="search" aria-label="Search Brain objects" placeholder="Title, path:projects, #tag…" value={term} onChange={event => changeSearch(event.target.value)} /></label><p>Literal words, quoted phrases, path: and tag: filters. Prefix a term with - to exclude it.</p><label className="pn-obsidian-check"><input type="checkbox" checked={orphans} onChange={event => setOrphans(event.target.checked)} />Orphans</label><label className="pn-obsidian-check"><input type="checkbox" checked={showSources} onChange={event => setShowSources(event.target.checked)} />Source reference links</label><p>Imported files only. Missing or ambiguous links appear in link notices, not as invented files.</p></details>
          <details open><summary>Groups</summary><p>First matching group sets a note's color.</p>{groups.map((group, index) => <div className="pn-obsidian-color-group" key={group.id}><input type="search" aria-label={`Group search ${index + 1}`} placeholder="path:projects" value={group.query} onChange={event => setGroups(previous => previous.map(item => item.id === group.id ? { ...item, query: event.target.value } : item))} /><input type="color" aria-label={`Group color ${index + 1}`} value={group.color} onChange={event => setGroups(previous => previous.map(item => item.id === group.id ? { ...item, color: event.target.value } : item))} /><button type="button" aria-label={`Remove group ${index + 1}`} onClick={() => setGroups(previous => previous.filter(item => item.id !== group.id))}>×</button></div>)}<button type="button" disabled={groups.length >= 12} onClick={addGroup}>＋ New group</button></details>
          {['Display', 'Forces'].map((section, index) => <details open key={section}><summary>{section}</summary>{SLIDERS.slice(index === 0 ? 0 : 3, index === 0 ? 3 : undefined).map(slider => <label className="pn-obsidian-slider" key={slider.key}><span>{slider.label}<output>{settings[slider.key]}</output></span><input type="range" aria-label={slider.label} min={slider.min} max={slider.max} step={slider.step} value={settings[slider.key]} onChange={event => setSettings(previous => ({ ...previous, [slider.key]: Number(event.target.value) }))} /></label>)}</details>)}
        </section>}
      </div>
    </div>
    <footer className="pn-obsidian-status"><span>{filtered.nodes.length.toLocaleString()} notes · {filtered.edges.length.toLocaleString()} links</span><span>Note links · dashed source references</span>{model.diagnosticCount > 0 && <details className="pn-notegraph-diagnostics"><summary>{model.diagnosticCount} link notices</summary><p>Unresolved and ambiguous targets never create an edge. Link resolution stays within the registered vault or repository/ref. Link scans are bounded to 32 KiB and 128 links per note.</p><ul>{model.diagnostics.slice(0, 30).map((item, index) => <li key={`${item.sourceId}-${index}`}><button type="button" onClick={() => select(item.sourceId)}>{sources.get(item.sourceId)?.title || 'Source'}</button><span>→ {item.target} · {item.status}</span></li>)}</ul>{model.diagnosticCount > 30 && <p>Showing the first 30 notices.</p>}</details>}{model.omittedObjects || model.edgeLimitReached ? <span role="status">Graph limit reached: up to 10,000 objects and 20,000 relationships.</span> : null}</footer>
  </section>;
}
