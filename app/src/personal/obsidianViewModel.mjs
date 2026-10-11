/** Display-only transforms over an already permission-filtered graph. */
export function graphInputKey(objects, folders = []) {
  return JSON.stringify([folders.map(({ id, path }) => [id, path]), objects.map(object => [
    object.id, object.revisionId || object.text, object.title, object.kind,
    object.sourcePath, object.sourceMetadata, object.sourceIds,
  ])]);
}

/** Literal title/path/alias matching plus simple path: and tag: terms, not executable queries. */
export function matchesGraphSearch(node, query) {
  const tokens = String(query || '').match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  return tokens.every(raw => {
    const negated = raw.startsWith('-');
    const token = (negated ? raw.slice(1) : raw).replace(/"/g, '').toLowerCase();
    let found;
    if (token.startsWith('path:')) found = `${node.path || ''} ${node.sourcePath || ''}`.toLowerCase().includes(token.slice(5));
    else if (token.startsWith('tag:') || token.startsWith('#')) {
      const tag = token.replace(/^(?:tag:|#)#?/, '');
      found = node.tags.some(value => value.toLowerCase() === tag || value.toLowerCase().startsWith(tag + '/'));
    } else found = `${node.title} ${node.kind} ${node.path || ''} ${node.aliases.join(' ')} ${node.tags.join(' ')}`.toLowerCase().includes(token);
    return negated ? !found : found;
  });
}

export function filterObsidianGraph(model, { query = '', selectedId = null, depth = 0, showOrphans = true, folderIds = null, showSources = true } = {}) {
  const edges = showSources ? model.edges : model.edges.filter(edge => edge.kinds.some(kind => kind !== 'source'));
  const adjacency = new Map(model.nodes.map(node => [node.id, new Set()]));
  for (const edge of edges) { adjacency.get(edge.source)?.add(edge.target); adjacency.get(edge.target)?.add(edge.source); }
  let neighbors = null;
  if (selectedId && depth > 0) {
    neighbors = new Set([selectedId]); let frontier = [selectedId];
    for (let distance = 0; distance < Math.min(5, depth); distance++) {
      const next = [];
      for (const id of frontier) for (const neighbor of adjacency.get(id) || []) {
        if (!neighbors.has(neighbor)) { neighbors.add(neighbor); next.push(neighbor); }
      }
      frontier = next;
    }
  }
  const folder = folderIds ? new Set(folderIds) : null;
  const nodes = model.nodes.filter(node => (!neighbors || neighbors.has(node.id)) && (!folder || folder.has(node.id)) &&
    (showOrphans || adjacency.get(node.id)?.size) && matchesGraphSearch(node, query));
  const visible = new Set(nodes.map(node => node.id));
  const filteredEdges = edges.filter(edge => visible.has(edge.source) && visible.has(edge.target));
  const degree = new Map(nodes.map(node => [node.id, 0]));
  for (const edge of filteredEdges) { degree.set(edge.source, degree.get(edge.source) + 1); degree.set(edge.target, degree.get(edge.target) + 1); }
  return { ...model, nodes: nodes.map(node => ({ ...node, degree: degree.get(node.id) })), edges: filteredEdges };
}

export function graphSearchColors(nodes, groups) {
  const colors = Object.create(null);
  for (const node of nodes) {
    const match = groups.find(group => group.query.trim() && /^#[0-9a-f]{6}$/i.test(group.color) && matchesGraphSearch(node, group.query));
    if (match) colors[node.id] = match.color;
  }
  return colors;
}
