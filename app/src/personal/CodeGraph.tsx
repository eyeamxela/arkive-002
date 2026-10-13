import { useEffect, useMemo, useState } from 'react';
import { ObsidianGraphCanvas } from './ObsidianGraphCanvas';
import { CodeGraphImport } from './CodeGraphImport';
import type { CodeImportProps } from './CodeGraphImport';
import { buildCodeTree, codeGroupColor, deriveStaticCallPaths, prepareCodeExplorer } from './codeExplorerModel.mjs';
import type { CodeDirectory, CodeNode } from './codeExplorerModel.mjs';
import type { CodeGraphData } from './codeGraphModel.mjs';
import './CodeGraph.css';

export type { CodeGraphData } from './codeGraphModel.mjs';
export { parseCodeGraph } from './codeGraphModel.mjs';

type Props = {
  graph: CodeGraphData | null; visible?: boolean; activeRoomName?: string; canUseInChat?: boolean;
  contextReason?: string; busy?: boolean; onUseInChat?: () => Promise<boolean>;
  onOpenChat?: () => void; onConnect?: () => void; codeImport?: CodeImportProps;
};
type NodeButtonProps = { node: CodeNode; selectedId: string | null; onSelect: (id: string) => void };
const CODE_SETTINGS = { nodeSize: 1.25, linkWidth: .65, labelThreshold: 1.8 };

function SymbolButton({ node, selectedId, onSelect }: NodeButtonProps) {
  return <button type="button" className="pn-codegraph-symbol" aria-pressed={selectedId === node.id} onClick={() => onSelect(node.id)} title={node.type + ': ' + node.label}>
    <span className="pn-codegraph-kind" aria-hidden="true">{node.type.toLowerCase() === 'file' ? '▱' : 'ƒ'}</span>
    <span>{node.label}</span><small>{node.type}</small>
  </button>;
}

function DirectoryTree({ directory, selectedId, selectedPath, onSelect, depth = 0 }: {
  directory: CodeDirectory; selectedId: string | null; selectedPath?: string; onSelect: (id: string) => void; depth?: number;
}) {
  return <>
    {directory.directories.map(child => <details className="pn-codegraph-directory" key={child.path} open={depth < 1 || !!selectedPath?.startsWith(child.path + '/')}>
      <summary title={child.path}>{child.name}</summary>
      <div><DirectoryTree directory={child} selectedId={selectedId} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} /></div>
    </details>)}
    {directory.files.map(file => <div className="pn-codegraph-file" key={file.path}>
      <button type="button" className="pn-codegraph-file-select" title={file.path} aria-pressed={file.path === selectedPath} onClick={() => onSelect(file.nodes[0].id)}>
        <span>{file.name}</span><small>{file.nodes.length}</small>
      </button>
      {file.path === selectedPath && <div>{file.nodes.map(node => <SymbolButton key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} />)}</div>}
    </div>)}
  </>;
}

export function CodeGraph({ graph, visible = true, activeRoomName, canUseInChat = false, contextReason, busy = false, onUseInChat, onOpenChat, onConnect, codeImport }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [grouping, setGrouping] = useState<'type' | 'community'>('community');
  const [type, setType] = useState('');
  const [community, setCommunity] = useState('');
  const [relationship, setRelationship] = useState('');
  const [local, setLocal] = useState(false);
  const [leftPanel, setLeftPanel] = useState<'explorer' | 'filters'>('explorer');
  const [rightPanel, setRightPanel] = useState<'details' | 'processes' | 'chat'>('details');
  const [chatStatus, setChatStatus] = useState('');
  const [addingContext, setAddingContext] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const snapshotKey = useMemo(() => JSON.stringify(graph), [graph]);
  useEffect(() => { setSelectedId(null); setSearch(''); setType(''); setCommunity(''); setRelationship(''); setLocal(false); setChatStatus(''); }, [snapshotKey]);
  useEffect(() => { setChatStatus(''); }, [activeRoomName]);
  const prepared = useMemo(() => graph ? prepareCodeExplorer(graph, { search, grouping, type, community, relationship, local, selectedId }) : null,
    [graph, search, grouping, type, community, relationship, local, selectedId]);
  const originalNodes = useMemo(() => new Map(graph?.nodes.map(node => [node.id, node]) || []), [graph]);
  const activeId = selectedId && prepared?.model.nodes.some(node => node.id === selectedId) ? selectedId : null;
  const selected = activeId ? originalNodes.get(activeId) : undefined;
  const connections = useMemo(() => graph?.edges.filter(edge => edge.source === activeId || edge.target === activeId) || [], [graph, activeId]);
  const tree = useMemo(() => buildCodeTree(prepared?.nodes || []), [prepared]);
  const groups = useMemo(() => [...new Set(prepared?.model.nodes.map(node => node.group) || [])].sort(), [prepared]);
  const colors = useMemo(() => Object.fromEntries(prepared?.model.nodes.map(node => [node.id, codeGroupColor(node.group)]) || []), [prepared]);
  const types = useMemo(() => [...new Set(graph?.nodes.map(node => node.type) || [])].sort(), [graph]);
  const communities = useMemo(() => [...new Set(graph?.nodes.flatMap(node => node.community ? [node.community] : []) || [])].sort(), [graph]);
  const relationships = useMemo(() => [...new Set(graph?.edges.map(edge => edge.type) || [])].sort(), [graph]);
  const paths = useMemo(() => graph && activeId ? deriveStaticCallPaths(graph, activeId) : null, [graph, activeId]);
  const filtered = !!(search || type || community || relationship || local);

  function clearFilters() { setSearch(''); setType(''); setCommunity(''); setRelationship(''); setLocal(false); }
  function revealSymbol(id: string) { clearFilters(); setSelectedId(id); }
  function inspectSymbol(id: string) { setSelectedId(id); }
  async function addContext() {
    if (!canUseInChat || !onUseInChat || busy || addingContext) return;
    setAddingContext(true); setChatStatus('');
    try { if (await onUseInChat()) setChatStatus('Snapshot selected as room context. Open chat to ask about it.'); }
    catch { setChatStatus('Could not add this snapshot. Check the room permissions and try again.'); }
    finally { setAddingContext(false); }
  }

  if (!graph || !prepared) return <section className="pn-codegraph-empty" aria-label="GitNexus code graph">
    <span aria-hidden="true">⌘</span><h2>A graph of your code.</h2>
    <p>Connect a GitNexus snapshot to explore real files, symbols, calls and imports in Arkive.</p>
    {codeImport ? <CodeGraphImport {...codeImport} /> : onConnect && <button type="button" onClick={onConnect}>Connect code repository</button>}
    <p className="pn-codegraph-boundary">No code index is loaded. Note links and code relationships stay separate; Arkive does not invent a code graph from your notes.</p>
  </section>;

  return <section className="pn-codegraph" aria-label="GitNexus code graph">
    <header className="pn-codegraph-heading">
      <div><span>BRAIN / CODE</span><strong>GitNexus repository explorer</strong>{codeImport && <button type="button" aria-expanded={showImport} onClick={() => setShowImport(value => !value)}>{showImport ? 'Close repository picker' : 'Import / refresh repository'}</button>}</div>
      <div className="pn-codegraph-repository"><strong title={graph.repository}>{graph.repository}</strong><span>GitNexus snapshot · {graph.nodes.length} nodes</span></div>
    </header>
    {showImport && codeImport && <CodeGraphImport {...codeImport} />}
    <div className="pn-codegraph-workspace">
      <aside className="pn-codegraph-left" aria-label="Code explorer and filters">
        <nav className="pn-codegraph-tabs" aria-label="Code navigation"><button type="button" aria-pressed={leftPanel === 'explorer'} onClick={() => setLeftPanel('explorer')}>Explorer</button><button type="button" aria-pressed={leftPanel === 'filters'} onClick={() => setLeftPanel('filters')}>Filters</button></nav>
        <label className="pn-codegraph-search"><span className="pn-sr">Search code symbols and files</span><input type="search" placeholder="Find a symbol or file…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        {leftPanel === 'filters' ? <div className="pn-codegraph-filters">
          <label>Color groups<select aria-label="Group code graph by" value={grouping} onChange={event => setGrouping(event.target.value as 'type' | 'community')}><option value="community">Communities</option><option value="type">Symbol types</option></select></label>
          <label>Symbol type<select value={type} onChange={event => setType(event.target.value)}><option value="">All types</option>{types.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Community<select value={community} onChange={event => setCommunity(event.target.value)}><option value="">All communities</option>{communities.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Relationship<select value={relationship} onChange={event => setRelationship(event.target.value)}><option value="">All relationships</option>{relationships.map(value => <option key={value}>{value}</option>)}</select></label>
          <button type="button" disabled={!activeId} aria-pressed={local} onClick={() => setLocal(value => !value)}>Selected + neighbors</button>
          <button type="button" disabled={!filtered} onClick={clearFilters}>Clear filters</button>
          <p>Filters narrow the visible snapshot, not its permissions. Relationships are directed; Details shows their direction and exported type.</p>
        </div> : <div className="pn-codegraph-tree">
          <div className="pn-codegraph-eyebrow">Repository <span>{tree.fileCount} files</span></div>
          <DirectoryTree directory={tree.root} selectedId={activeId} selectedPath={selected?.filePath} onSelect={inspectSymbol} />
          {tree.unlocated.length > 0 && <details open className="pn-codegraph-directory"><summary>No file path · {tree.unlocated.length}</summary><div>{tree.unlocated.map(node => <SymbolButton key={node.id} node={node} selectedId={activeId} onSelect={inspectSymbol} />)}</div></details>}
          {!prepared.nodes.length && <p>No symbols match. <button type="button" onClick={clearFilters}>Clear filters</button></p>}
        </div>}
        {selected && <div className="pn-codegraph-source"><span className="pn-codegraph-eyebrow">Code reference</span><strong>{selected.label}</strong><code>{selected.filePath || 'No file path in snapshot'}</code><p>Source text and line numbers are not included in this snapshot.</p></div>}
      </aside>
      <main className="pn-codegraph-center" aria-label="Repository graph">
        <div className="pn-codegraph-graphbar"><span>Repository graph</span><span>Force layout</span></div>
        <div className="pn-codegraph-stage"><ObsidianGraphCanvas model={prepared.model} selectedId={activeId} onSelect={inspectSymbol} visible={visible} colors={colors} settings={CODE_SETTINGS} appearance="code" /></div>
        <div className="pn-codegraph-legend" aria-label="Graph color groups">{groups.map(group => <span key={group}><i style={{ background: codeGroupColor(group) }} />{group}</span>)}</div>
        <div className="pn-codegraph-graphmeta"><span>{prepared.model.nodes.length} / {graph.nodes.length} nodes · {prepared.edges.length} relationships</span>{filtered && <button type="button" onClick={clearFilters}>Clear filters</button>}</div>
      </main>
      <aside className="pn-codegraph-right" aria-label="Code inspection">
        <nav className="pn-codegraph-tabs" aria-label="Code inspection panels">{(['details', 'processes', 'chat'] as const).map(panel => <button type="button" key={panel} aria-pressed={rightPanel === panel} onClick={() => setRightPanel(panel)}>{panel[0].toUpperCase() + panel.slice(1)}</button>)}</nav>
        {rightPanel === 'details' ? <div className="pn-codegraph-detail" aria-label="Selected code symbol">
          {selected ? <><div><strong>{selected.label}</strong><button type="button" onClick={() => { setSelectedId(null); setLocal(false); }} aria-label="Close code symbol details">×</button></div>
            <dl><dt>Type</dt><dd>{selected.type}</dd><dt>File</dt><dd>{selected.filePath || 'Not provided'}</dd><dt>Community</dt><dd>{selected.community || 'Not provided'}</dd><dt>Symbol ID</dt><dd>{selected.id}</dd></dl>
            <p className="pn-codegraph-eyebrow">Snapshot relationships</p>
            {connections.length ? <ul>{connections.slice(0, 40).map((edge, index) => {
              const outgoing = edge.source === activeId;
              const otherId = outgoing ? edge.target : edge.source;
              return <li key={JSON.stringify([edge.source, edge.target, edge.type, index])}><span>{outgoing ? '→' : '←'} {edge.type}</span><button type="button" onClick={() => revealSymbol(otherId)}>{originalNodes.get(otherId)?.label || otherId}</button></li>;
            })}</ul> : <p>No exported relationships for this symbol.</p>}
            {connections.length > 40 && <p>Showing 40 of {connections.length} relationships.</p>}
            <p>→ outgoing · ← incoming. Selecting a related symbol clears view filters to reveal it.</p>
          </> : <><span className="pn-codegraph-eyebrow">Inspect the source map</span><h3>Select a file or symbol</h3><p>Explore its exported metadata and real relationships. The graph stays separate from your note links.</p></>}
        </div> : rightPanel === 'processes' ? <div className="pn-codegraph-processes">
          <span className="pn-codegraph-eyebrow">Static call paths</span><h3>{selected ? selected.label : 'Select a starting symbol'}</h3><p>Derived only from directed CALLS edges. These are possible code paths, not execution history or verified runtime order.</p>
          {paths?.paths.map((path, index) => <div className="pn-codegraph-path" key={JSON.stringify([path.ids, index])}><span>PATH {String(index + 1).padStart(2, '0')}</span><ol>{path.ids.map((id, step) => <li key={JSON.stringify([id, step])}><button type="button" onClick={() => revealSymbol(id)}>{originalNodes.get(id)?.label || id}</button></li>)}</ol><small>{path.end === 'cycle' ? 'Cycle detected · traversal stopped' : path.end === 'depth-limit' ? 'Six-call depth limit reached' : 'No further CALLS edges in snapshot'}</small></div>)}
          {selected && !paths?.paths.length && <p>No outgoing CALLS path is exported for this symbol.</p>}
          {paths?.truncated && <p className="pn-codegraph-warning">Path results are capped at 12 paths, 6 calls per path, and 300 traversal visits. This is not an exhaustive analysis.</p>}
          <p>Paths use the full permitted snapshot, independent of display filters.</p>
        </div> : <div className="pn-codegraph-chat">
          <span className="pn-codegraph-eyebrow">Room context</span><h3>Ask about this repository</h3><p>Add the imported graph snapshot to your selected room’s context, then ask in Arkive Chat.</p>
          <dl><dt>Room</dt><dd>{activeRoomName || 'No room selected'}</dd><dt>Context</dt><dd>{graph.repository} · full snapshot</dd></dl>
          <p>Contains exported symbols and relationships—not source file contents. Graph filters and selected symbols do not narrow what is attached.</p>
          {(!canUseInChat || contextReason) && <p className="pn-codegraph-warning">{contextReason || 'Choose a permitted private room before using this snapshot in chat.'}</p>}
          <button type="button" className="pn-codegraph-primary" disabled={!canUseInChat || !onUseInChat || busy || addingContext} onClick={() => void addContext()}>{addingContext ? 'Adding context…' : 'Use snapshot in chat'}</button>
          {onOpenChat && <button type="button" onClick={onOpenChat}>Open chat</button>}
          <p role="status">{chatStatus}</p>
        </div>}
      </aside>
    </div>
    <footer className="pn-codegraph-footer"><span>Arkive viewer · GitNexus snapshot · not a live index</span><span>Source paths are metadata, not file-access grants</span></footer>
    {(graph.truncated || prepared.clipped) && <p className="pn-codegraph-warning pn-codegraph-limit">This snapshot or view is truncated. Up to 500 nodes and 1,500 relationships are available; all prepared nodes are rendered. Missing nodes, calls or paths cannot be inferred.</p>}
  </section>;
}

export default CodeGraph;
