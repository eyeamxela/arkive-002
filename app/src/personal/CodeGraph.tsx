import { useMemo, useState } from 'react';
import { GraphCanvas } from './BrainGraph';
import { graphGroupColor } from './graphModel.mjs';
import type { GraphModel } from './graphModel.mjs';
import type { CodeGraphData } from './codeGraphModel.mjs';
import './CodeGraph.css';

export type { CodeGraphData } from './codeGraphModel.mjs';
export { parseCodeGraph } from './codeGraphModel.mjs';

export function CodeGraph({ graph }: { graph: CodeGraphData | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [grouping, setGrouping] = useState<'type' | 'community'>('community');
  const [local, setLocal] = useState(false);
  const prepared = useMemo(() => {
    if (!graph) return null;
    const query = search.trim().toLowerCase();
    const matching = graph.nodes.filter(node => !query || `${node.label} ${node.filePath || ''} ${node.type}`.toLowerCase().includes(query));
    const nodes = matching.slice(0, 500).map(node => ({
      id: node.id, title: node.label, kind: node.type, sourcePath: node.filePath,
      scope: graph.repository, path: node.filePath || node.id,
      group: grouping === 'community' ? node.community || node.type : node.type,
      allowNames: false, aliases: [], tags: node.community ? [node.community] : [], degree: 0,
    }));
    const byId = new Map(nodes.map(node => [node.id, node]));
    const links = new Map<string, { id: string; source: string; target: string; kinds: string[] }>();
    const sourceEdges = graph.edges.filter(edge => byId.has(edge.source) && byId.has(edge.target));
    for (const edge of sourceEdges.slice(0, 1500)) {
      // A code edge remains directed; opposite calls are distinct relationships.
      const id = JSON.stringify([edge.source, edge.target]);
      const existing = links.get(id);
      if (existing) { if (!existing.kinds.includes(edge.type)) existing.kinds.push(edge.type); continue; }
      links.set(id, { id, source: edge.source, target: edge.target, kinds: [edge.type] });
      byId.get(edge.source)!.degree++;
      byId.get(edge.target)!.degree++;
    }
    const model: GraphModel = { nodes, edges: [...links.values()], diagnostics: [], diagnosticCount: 0,
      totalObjects: graph.nodes.length, omittedObjects: 0, edgeLimitReached: false };
    return { model, matchingCount: matching.length, clipped: matching.length > 500 || sourceEdges.length > 1500 };
  }, [graph, search, grouping]);
  const originalNodes = useMemo(() => new Map(graph?.nodes.map(node => [node.id, node]) || []), [graph]);
  const selected = selectedId ? originalNodes.get(selectedId) : undefined;
  const activeId = selected && prepared?.model.nodes.some(node => node.id === selected.id) ? selected.id : null;
  const connections = useMemo(() => graph?.edges.filter(edge => edge.source === activeId || edge.target === activeId) || [], [graph, activeId]);
  const groups = useMemo(() => [...new Set(prepared?.model.nodes.map(node => node.group) || [])].slice(0, 7), [prepared]);

  if (!graph || !prepared) return <section className="pn-codegraph-empty" aria-label="GitNexus code graph">
    <span aria-hidden="true">⌘</span><h2>A graph of your code.</h2>
    <p>Load a GitNexus graph snapshot to explore real files, symbols, calls and imports. Note links and code relationships stay separate.</p>
    <p className="pn-codegraph-boundary">No code index is loaded. This view does not infer relationships from filenames or note text.</p>
  </section>;

  return <section className="pn-codegraph" aria-label="GitNexus code graph">
    <div className="pn-codegraph-heading"><div><span>GITNEXUS / SNAPSHOT</span><strong title={graph.repository}>{graph.repository}</strong></div><span>{graph.nodes.length} indexed nodes</span></div>
    <div className="pn-codegraph-filters">
      <label><span className="pn-sr">Search code symbols and files</span><input type="search" placeholder="Find a symbol or file…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label><span className="pn-sr">Group code graph by</span><select value={grouping} onChange={event => setGrouping(event.target.value as 'type' | 'community')}>
        <option value="community">Communities</option><option value="type">Symbol types</option>
      </select></label>
      <button type="button" aria-pressed={local} disabled={!activeId} onClick={() => setLocal(value => !value)}>Local</button>
    </div>
    <GraphCanvas model={prepared.model} selectedId={activeId} onSelect={setSelectedId} mode="structure"
      focusDepth={local && activeId ? 1 : 0} label="GitNexus code symbols and relationships" />
    <div className="pn-codegraph-legend">{groups.map(group => <span key={group}><i style={{ background: graphGroupColor(group) }} />{group}</span>)}</div>
    {graph.truncated || prepared.clipped ? <p className="pn-codegraph-boundary">This snapshot or view is truncated. At most 500 matching nodes and 1,500 relationships are prepared; the canvas shows up to 300 nodes.</p> : null}
    <p className="pn-codegraph-boundary">Snapshot of GitNexus output, not a live index. Lines show exported relationships; inspect a node for their types and direction.</p>
    {selected ? <div className="pn-codegraph-detail" aria-label="Selected code symbol">
      <div><strong>{selected.label}</strong><span>{selected.type}</span><button type="button" onClick={() => setSelectedId(null)} aria-label="Close code symbol details">×</button></div>
      {selected.filePath ? <p>{selected.filePath}</p> : null}
      {selected.community ? <p>Community: {selected.community}</p> : null}
      {connections.length ? <ul>{connections.slice(0, 12).map((edge, index) => {
        const outgoing = edge.source === activeId;
        const otherId = outgoing ? edge.target : edge.source;
        const other = originalNodes.get(otherId);
        return <li key={`${edge.source}-${edge.target}-${edge.type}-${index}`}><span>{outgoing ? '→' : '←'} {edge.type}</span><button type="button" onClick={() => setSelectedId(otherId)}>{other?.label || otherId}</button></li>;
      })}</ul> : <p>No relationships match the selected view.</p>}
      {connections.length > 12 ? <p>Showing 12 of {connections.length} relationships.</p> : null}
    </div> : <p className="pn-codegraph-boundary">Select a symbol to inspect its source file and actual relationships.</p>}
  </section>;
}

export default CodeGraph;
