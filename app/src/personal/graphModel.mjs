/** Note relationships only. This model never invents semantic or code edges. */
export const GRAPH_NODE_LIMIT = 300;
const OBJECT_LIMIT = 10000;
const TEXT_LIMIT = 32768;
const LINK_LIMIT = 128;
const EDGE_LIMIT = 20000;
const DIAGNOSTIC_LIMIT = 1000;

function normalizePath(value) {
  const parts = [];
  const rooted = value.startsWith('/');
  for (const part of value.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return `${rooted ? '/' : ''}${parts.join('/')}`;
}

const withoutExtension = value => value.replace(/\.(md|markdown|txt)$/i, '');
const dirname = value => value.includes('/') ? value.slice(0, value.lastIndexOf('/')) : '';
const basename = value => value.slice(value.lastIndexOf('/') + 1);
const cleanScalar = value => value.trim().replace(/^(['"])(.*)\1$/, '$2').trim();

/** Deliberately bounded basic YAML support, not an executable YAML parser. */
function frontmatter(text) {
  const start = text.replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(start.slice(0, 8192));
  const result = { aliases: [], tags: [], body: start };
  if (!match) return result;
  result.body = start.slice(match[0].length);
  let field = null;
  for (const line of match[1].split(/\r?\n/)) {
    const header = /^(aliases?|tags?):\s*(.*)$/.exec(line);
    if (header) {
      field = header[1].startsWith('alias') ? 'aliases' : 'tags';
      const value = header[2].trim();
      const values = value.startsWith('[') && value.endsWith(']')
        ? value.slice(1, -1).split(',') : value ? [value] : [];
      for (const item of values) {
        const cleaned = cleanScalar(item);
        if (cleaned && result[field].length < 32) result[field].push(cleaned);
      }
    } else if (field && /^\s+-\s+/.test(line)) {
      const cleaned = cleanScalar(line.replace(/^\s+-\s+/, ''));
      if (cleaned && result[field].length < 32) result[field].push(cleaned);
    } else if (line.trim() && !/^\s*#/.test(line)) field = null;
  }
  result.tags = result.tags.map(tag => tag.replace(/^#/, ''));
  return result;
}

function proseOnly(text) {
  let fence = null;
  const prose = [];
  for (const line of text.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length &&
        !line.slice(marker[0].length).trim()) fence = null;
      prose.push('');
    } else prose.push(fence ? '' : line);
  }
  return prose.join('\n').replace(/<!--[\s\S]*?-->/g, '').replace(/(`+)[\s\S]*?\1/g, '');
}

function isEscaped(text, position) {
  let count = 0;
  for (let index = position - 1; index >= 0 && text[index] === '\\'; index--) count++;
  return count % 2 === 1;
}

/** Supports note wikilinks/embeds and inline Markdown destinations. */
export function extractNoteLinks(text) {
  const metadata = frontmatter(String(text || '').slice(0, TEXT_LIMIT));
  const prose = proseOnly(metadata.body);
  const links = [];
  const wiki = /!?\[\[([^\]\n]{1,1024})\]\]/g;
  let match;
  while ((match = wiki.exec(prose)) && links.length < LINK_LIMIT) {
    const embedded = match[0].startsWith('!');
    const opening = match.index + (embedded ? 1 : 0);
    if (isEscaped(prose, opening) || isEscaped(prose, wiki.lastIndex - 2)) continue;
    const target = match[1].split('|')[0].trim();
    if (target) links.push({ target, kind: embedded && !isEscaped(prose, match.index) ? 'embed' : 'wikilink' });
  }
  const markdown = /!?\[[^\]\n]*\]\(/g;
  while ((match = markdown.exec(prose)) && links.length < LINK_LIMIT) {
    const opening = match.index + (match[0].startsWith('!') ? 1 : 0);
    if (isEscaped(prose, opening) || isEscaped(prose, markdown.lastIndex - 2)) continue;
    let cursor = markdown.lastIndex;
    while (/\s/.test(prose[cursor] || '') && cursor < prose.length) cursor++;
    let destination = '';
    if (prose[cursor] === '<') {
      const end = prose.indexOf('>', cursor + 1);
      if (end < 0 || end - cursor > 1024) continue;
      destination = prose.slice(cursor + 1, end);
      cursor = end + 1;
    } else {
      let depth = 0;
      for (let count = 0; cursor < prose.length && count < 1024; cursor++, count++) {
        const character = prose[cursor];
        if (character === '\\' && cursor + 1 < prose.length) {
          destination += prose[++cursor];
        } else if ((character === ')' && depth === 0) || /\s/.test(character)) break;
        else {
          if (character === '(') depth++;
          if (character === ')') depth--;
          destination += character;
        }
      }
    }
    // A destination alone is not a complete Markdown link.
    if (!/^\s*(?:["'][^\n]*?["']\s*)?\)/.test(prose.slice(cursor, cursor + 1024))) continue;
    if (destination && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(destination)) {
      let decoded = destination;
      try { decoded = decodeURIComponent(destination); } catch { /* Report the literal broken target. */ }
      if (/\.(?:md|markdown)(?:[?#]|$)/i.test(decoded)) links.push({ target: decoded, kind: 'markdown' });
    }
  }
  return { links, aliases: metadata.aliases, tags: metadata.tags,
    truncated: String(text || '').length > TEXT_LIMIT || links.length >= LINK_LIMIT };
}

function sourceLocation(object, roots) {
  const metadata = object.sourceMetadata;
  if (metadata?.kind === 'github' && metadata.repository && metadata.ref && metadata.path) {
    const path = normalizePath(metadata.path.replace(/^\/+/, '')) || metadata.path;
    return { scope: `github:${metadata.repository.toLowerCase()}@${metadata.ref}`, path,
      group: `${metadata.repository} / ${dirname(path) || 'root'}`, allowNames: true };
  }
  if (object.sourcePath && !object.sourcePath.startsWith('github://')) {
    const absolute = normalizePath(object.sourcePath) || object.sourcePath;
    const root = roots.find(candidate => absolute === candidate.path || absolute.startsWith(`${candidate.path}/`));
    if (root) {
      const path = absolute.slice(root.path.length).replace(/^\//, '');
      return { scope: `folder:${root.path}`, path,
        group: `${basename(root.path)} / ${dirname(path) || 'root'}`, allowNames: true };
    }
    // No registered root means no evidence that another directory is this vault.
    return { scope: `unregistered:${dirname(absolute)}`, path: basename(absolute),
      group: basename(dirname(absolute)) || object.kind, allowNames: false };
  }
  if (object.sourcePath?.startsWith('github://')) {
    // A ref can contain '/': do not guess its boundary from this display URI.
    return { scope: `unknown-github:${object.id}`, path: object.sourcePath,
      group: 'GitHub · missing provenance', allowNames: false };
  }
  return { scope: 'native-notes', path: object.title, group: object.kind || 'note', allowNames: true };
}

function addIndex(index, key, id) {
  const previous = index.get(key);
  if (previous) previous.add(id);
  else index.set(key, new Set([id]));
}

function resolveLink(node, link, pathIndex, nameIndex) {
  let target = link.target.split('|')[0].split('#')[0].split('?')[0].trim();
  if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) return { ignored: true };
  try { target = decodeURIComponent(target); } catch { /* Keep the source's literal text. */ }
  const candidates = new Set();
  const lookup = (index, key) => {
    for (const id of index.get(`${node.scope}\0${withoutExtension(key)}`) || []) candidates.add(id);
  };
  const explicitRelative = /^(?:\.\.?\/)/.test(target);
  if (link.kind === 'markdown' || explicitRelative) {
    const relative = target.startsWith('/') ? normalizePath(target.slice(1))
      : normalizePath(`${dirname(node.path) ? `${dirname(node.path)}/` : ''}${target}`);
    if (relative !== null) lookup(pathIndex, relative);
  } else if (target.includes('/')) {
    const rooted = normalizePath(target.replace(/^\//, ''));
    if (rooted !== null) lookup(pathIndex, rooted);
    if (!target.startsWith('/')) {
      const relative = normalizePath(`${dirname(node.path) ? `${dirname(node.path)}/` : ''}${target}`);
      if (relative !== null) lookup(pathIndex, relative);
    }
  } else if (node.allowNames) lookup(nameIndex, target);
  else lookup(pathIndex, target);
  const ids = [...candidates];
  return ids.length === 1 ? { id: ids[0] }
    : { status: ids.length ? 'ambiguous' : 'unresolved', candidateIds: ids };
}

export function buildGraphModel(objects, { folders = [] } = {}) {
  const roots = folders.map(folder => ({ path: normalizePath(folder.path) }))
    .filter(folder => folder.path).sort((a, b) => b.path.length - a.path.length);
  const included = objects.slice(0, OBJECT_LIMIT);
  const nodes = [];
  const byId = new Map();
  const pathIndex = new Map();
  const nameIndex = new Map();
  for (const object of included) {
    if (byId.has(object.id)) continue;
    const location = sourceLocation(object, roots);
    const parsed = extractNoteLinks(object.text);
    const node = { id: object.id, title: object.title, kind: object.kind,
      sourcePath: object.sourcePath, ...location, aliases: parsed.aliases, tags: parsed.tags, degree: 0 };
    nodes.push(node);
    byId.set(node.id, { node, parsed, object });
    addIndex(pathIndex, `${node.scope}\0${withoutExtension(node.path)}`, node.id);
    if (node.allowNames) {
      for (const name of [basename(node.path), object.title, ...parsed.aliases]) {
        addIndex(nameIndex, `${node.scope}\0${withoutExtension(name)}`, node.id);
      }
    }
  }
  const edgeIndex = new Map();
  const diagnostics = [];
  let diagnosticCount = 0;
  let edgeLimitReached = false;
  const diagnose = diagnostic => {
    diagnosticCount++;
    if (diagnostics.length < DIAGNOSTIC_LIMIT) diagnostics.push(diagnostic);
  };
  const addEdge = (source, target, kind) => {
    if (source === target) return;
    const key = JSON.stringify([source, target].sort());
    const existing = edgeIndex.get(key);
    if (existing) {
      if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
      return;
    }
    if (edgeIndex.size >= EDGE_LIMIT) { edgeLimitReached = true; return; }
    edgeIndex.set(key, { id: key, source, target, kinds: [kind] });
    byId.get(source).node.degree++;
    byId.get(target).node.degree++;
  };
  for (const { node, parsed, object } of byId.values()) {
    for (const id of (object.sourceIds || []).slice(0, LINK_LIMIT)) {
      if (byId.has(id)) addEdge(node.id, id, 'source');
      else diagnose({ sourceId: node.id, target: id, kind: 'source', status: 'unresolved', candidateIds: [] });
    }
    for (const link of parsed.links) {
      const resolution = resolveLink(node, link, pathIndex, nameIndex);
      if (resolution.ignored) continue;
      if (resolution.id) addEdge(node.id, resolution.id, link.kind);
      else diagnose({ sourceId: node.id, target: link.target, kind: link.kind,
        status: resolution.status, candidateIds: resolution.candidateIds });
    }
    if (parsed.truncated || (object.sourceIds?.length || 0) > LINK_LIMIT) {
      diagnose({ sourceId: node.id, target: 'Link scan limit reached', kind: 'scan', status: 'truncated', candidateIds: [] });
    }
  }
  return { nodes, edges: [...edgeIndex.values()], diagnostics, diagnosticCount,
    totalObjects: objects.length, omittedObjects: Math.max(0, objects.length - included.length), edgeLimitReached };
}

export function graphNeighbors(edges, selectedId, depth = 1) {
  if (!selectedId) return new Set();
  const adjacency = new Map();
  for (const edge of edges) {
    addIndex(adjacency, edge.source, edge.target);
    addIndex(adjacency, edge.target, edge.source);
  }
  const visited = new Set([selectedId]);
  let frontier = [selectedId];
  for (let distance = 0; distance < Math.min(2, Math.max(0, depth)); distance++) {
    const next = [];
    for (const id of frontier) for (const neighbor of adjacency.get(id) || []) {
      if (!visited.has(neighbor)) { visited.add(neighbor); next.push(neighbor); }
    }
    frontier = next;
  }
  return visited;
}

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

export const graphGroupColor = group => ['#b2a4e8', '#85b9b2', '#cbb28a', '#8ba8cf', '#c38fa8', '#a8ba85'][hash(group) % 6];

/** Deterministic, bounded force layout; never runs an unbounded animation loop. */
export function layoutGraph(model, { mode = 'obsidian', maxNodes = GRAPH_NODE_LIMIT,
  selectedId = null, focusDepth = 0, showOrphans = true, width = 1000, height = 720 } = {}) {
  const limit = Math.min(GRAPH_NODE_LIMIT, Math.max(1, Math.floor(maxNodes) || GRAPH_NODE_LIMIT));
  width = Number.isFinite(width) ? Math.max(240, width) : 1000;
  height = Number.isFinite(height) ? Math.max(180, height) : 720;
  const focus = focusDepth && selectedId ? graphNeighbors(model.edges, selectedId, focusDepth) : null;
  let candidates = model.nodes.filter(node => (!focus || focus.has(node.id)) && (showOrphans || node.degree > 0));
  // Keep the inspected note and its real neighbors on screen when the cap applies.
  if (selectedId && candidates.length > limit) {
    const neighbors = graphNeighbors(model.edges, selectedId);
    candidates = [...candidates].sort((a, b) =>
      Number(b.id === selectedId) - Number(a.id === selectedId) || Number(neighbors.has(b.id)) - Number(neighbors.has(a.id)));
  }
  const nodes = candidates.slice(0, limit).map(node => ({ ...node, x: 0, y: 0,
    radius: Math.min(12, 4.5 + Math.sqrt(node.degree) * 1.35), color: graphGroupColor(node.group) }));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = model.edges.filter(edge => byId.has(edge.source) && byId.has(edge.target));
  const groups = [...new Set(nodes.map(node => node.group))].sort();
  const anchors = new Map();
  const columns = Math.max(1, Math.ceil(Math.sqrt(groups.length * width / height)));
  const rows = Math.max(1, Math.ceil(groups.length / columns));
  groups.forEach((group, index) => anchors.set(group, {
    x: width * ((index % columns) + .5) / columns,
    y: height * (Math.floor(index / columns) + .5) / rows,
  }));
  const spread = Math.min(width, height) * .37;
  nodes.forEach((node, index) => {
    const angle = index * 2.399963229728653 + (hash(node.id) % 100) / 180;
    const radius = spread * Math.sqrt((index + .5) / Math.max(1, nodes.length));
    const anchor = mode === 'structure' ? anchors.get(node.group) : { x: width / 2, y: height / 2 };
    const scale = mode === 'structure' ? 1 / Math.max(columns, rows) : 1;
    node.x = anchor.x + Math.cos(angle) * radius * scale;
    node.y = anchor.y + Math.sin(angle) * radius * scale;
  });
  // 70 * 300^2 / 2 is a fixed upper bound; input size cannot increase it.
  const force = nodes.map(() => ({ x: 0, y: 0 }));
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const idealLength = Math.max(36, Math.min(105, Math.sqrt(width * height / Math.max(1, nodes.length)) * .9));
  for (let iteration = 0; iteration < 70 && nodes.length > 1; iteration++) {
    const cooling = 1 - iteration / 80;
    force.forEach(point => { point.x = 0; point.y = 0; });
    for (let first = 0; first < nodes.length; first++) for (let second = first + 1; second < nodes.length; second++) {
      const a = nodes[first]; const b = nodes[second];
      const dx = a.x - b.x || .01; const dy = a.y - b.y || .01;
      const square = Math.max(64, dx * dx + dy * dy);
      const strength = Math.min(5, 900 / square);
      const x = dx * strength / Math.sqrt(square); const y = dy * strength / Math.sqrt(square);
      force[first].x += x; force[first].y += y;
      force[second].x -= x; force[second].y -= y;
    }
    for (const edge of edges) {
      const first = nodeIndex.get(edge.source); const second = nodeIndex.get(edge.target);
      const a = nodes[first]; const b = nodes[second];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const strength = (distance - idealLength) * .017;
      const x = dx / distance * strength; const y = dy / distance * strength;
      force[first].x += x; force[first].y += y;
      force[second].x -= x; force[second].y -= y;
    }
    nodes.forEach((node, index) => {
      const anchor = mode === 'structure' ? anchors.get(node.group) : { x: width / 2, y: height / 2 };
      node.x = Math.max(30, Math.min(width - 30, node.x + Math.max(-12, Math.min(12,
        force[index].x + (anchor.x - node.x) * (mode === 'structure' ? .025 : .005))) * cooling));
      node.y = Math.max(30, Math.min(height - 30, node.y + Math.max(-12, Math.min(12,
        force[index].y + (anchor.y - node.y) * (mode === 'structure' ? .025 : .005))) * cooling));
    });
  }
  nodes.forEach(node => { node.x = Math.round(node.x * 100) / 100; node.y = Math.round(node.y * 100) / 100; });
  return { nodes, edges, groups: groups.map(name => ({ name, color: graphGroupColor(name), ...anchors.get(name) })),
    width, height, omittedNodes: Math.max(0, candidates.length - nodes.length), filteredNodes: model.nodes.length - candidates.length };
}
