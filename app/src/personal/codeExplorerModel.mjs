const compare = (a, b) => a.localeCompare(b);
const callEdge = edge => edge.type.toUpperCase() === 'CALLS';
const PALETTE = ['#b398d1', '#69b7ac', '#d6ac57', '#88a9d0', '#cf93a6', '#a7b98c', '#d29676'];

/** Deterministic colors represent exported communities/types, never inferred semantics. */
export function codeGroupColor(group) {
  let hash = 0;
  for (const character of group) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
  return PALETTE[(hash >>> 0) % PALETTE.length];
}

/** File paths are display-only metadata. No filesystem reads or filename matching. */
export function buildCodeTree(nodes) {
  const root = { name: '', path: '', directories: [], files: [] };
  const directories = new Map([['', root]]);
  const files = new Map();
  const unlocated = [];
  for (const node of nodes) {
    if (!node.filePath) { unlocated.push(node); continue; }
    const parts = node.filePath.split('/');
    const name = parts.pop();
    let parent = root;
    let path = '';
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      let directory = directories.get(path);
      if (!directory) {
        directory = { name: part, path, directories: [], files: [] };
        directories.set(path, directory); parent.directories.push(directory);
      }
      parent = directory;
    }
    let file = files.get(node.filePath);
    if (!file) {
      file = { name, path: node.filePath, nodes: [] };
      files.set(node.filePath, file); parent.files.push(file);
    }
    file.nodes.push(node);
  }
  for (const directory of directories.values()) {
    directory.directories.sort((a, b) => compare(a.name, b.name));
    directory.files.sort((a, b) => compare(a.name, b.name));
  }
  for (const file of files.values()) file.nodes.sort((a, b) => Number(b.type.toLowerCase() === 'file') - Number(a.type.toLowerCase() === 'file') || compare(a.label, b.label) || compare(a.id, b.id));
  return { root, unlocated: unlocated.sort((a, b) => compare(a.label, b.label) || compare(a.id, b.id)), fileCount: files.size };
}

export function prepareCodeExplorer(graph, options = {}) {
  const query = (options.search || '').trim().toLowerCase();
  const matching = graph.nodes.filter(node => (!query || `${node.label} ${node.filePath || ''} ${node.type} ${node.community || ''}`.toLowerCase().includes(query)) &&
    (!options.type || node.type === options.type) && (!options.community || node.community === options.community));
  let ids = new Set(matching.map(node => node.id));
  let edges = graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target) && (!options.relationship || edge.type === options.relationship));
  if (options.local && options.selectedId && ids.has(options.selectedId)) {
    const neighbors = new Set([options.selectedId]);
    for (const edge of edges) {
      if (edge.source === options.selectedId) neighbors.add(edge.target);
      if (edge.target === options.selectedId) neighbors.add(edge.source);
    }
    ids = neighbors;
    edges = edges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
  }
  const candidates = matching.filter(node => ids.has(node.id));
  // Defensive view limits match the validated v1 snapshot contract. Do not silently cap again in the renderer.
  const nodes = candidates.slice(0, 500).map(node => ({ id: node.id, title: node.label, kind: node.type,
    sourcePath: node.filePath, scope: graph.repository, path: node.filePath || node.id,
    group: options.grouping === 'type' ? node.type : node.community || node.type,
    allowNames: false, aliases: [], tags: node.community ? [node.community] : [], degree: 0 }));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const eligibleEdges = edges.filter(edge => byId.has(edge.source) && byId.has(edge.target));
  const links = new Map();
  const shownEdges = eligibleEdges.slice(0, 1500);
  for (const edge of shownEdges) {
    const id = JSON.stringify([edge.source, edge.target]);
    const existing = links.get(id);
    if (existing) { if (!existing.kinds.includes(edge.type)) existing.kinds.push(edge.type); continue; }
    links.set(id, { id, source: edge.source, target: edge.target, kinds: [edge.type] });
    byId.get(edge.source).degree++; byId.get(edge.target).degree++;
  }
  return {
    model: { nodes, edges: [...links.values()], diagnostics: [], diagnosticCount: 0,
      totalObjects: graph.nodes.length, omittedObjects: Math.max(0, candidates.length - nodes.length), edgeLimitReached: eligibleEdges.length > shownEdges.length },
    nodes: candidates.filter(node => byId.has(node.id)), edges: shownEdges,
    matchingCount: matching.length, filteredCount: graph.nodes.length - candidates.length,
    clipped: candidates.length > 500 || eligibleEdges.length > 1500,
  };
}

/** Bounded directed CALLS paths, not execution traces or an inferred process index. */
export function deriveStaticCallPaths(graph, startId, options = {}) {
  const maxDepth = Math.max(1, Math.min(12, Math.floor(options.maxDepth || 6)));
  const maxPaths = Math.max(1, Math.min(50, Math.floor(options.maxPaths || 12)));
  const maxVisits = Math.max(1, Math.min(2000, Math.floor(options.maxVisits || 300)));
  const ids = new Set(graph.nodes.map(node => node.id));
  if (!ids.has(startId)) return { paths: [], truncated: false, visits: 0 };
  const outgoing = new Map();
  const seenEdges = new Set();
  for (const edge of graph.edges) {
    if (!callEdge(edge) || !ids.has(edge.source) || !ids.has(edge.target)) continue;
    const key = JSON.stringify([edge.source, edge.target]);
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge.target);
  }
  for (const targets of outgoing.values()) targets.sort(compare);
  const paths = [];
  const stack = [{ ids: [startId] }];
  let visits = 0;
  let truncated = false;
  while (stack.length && visits < maxVisits && paths.length < maxPaths) {
    const current = stack.pop().ids;
    visits++;
    const targets = outgoing.get(current[current.length - 1]) || [];
    if (!targets.length) { if (current.length > 1) paths.push({ ids: current, end: 'leaf' }); continue; }
    if (current.length - 1 >= maxDepth) { paths.push({ ids: current, end: 'depth-limit' }); truncated = true; continue; }
    // Push in reverse so bounded output is deterministic, regardless of snapshot edge order.
    for (let index = targets.length - 1; index >= 0; index--) {
      if (stack.length + paths.length >= maxVisits) { truncated = true; break; }
      const target = targets[index];
      const next = [...current, target];
      if (current.includes(target)) {
        if (paths.length < maxPaths) paths.push({ ids: next, end: 'cycle' });
        else truncated = true;
      } else stack.push({ ids: next });
    }
  }
  if (stack.length) truncated = true;
  return { paths, truncated, visits };
}
