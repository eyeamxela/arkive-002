/** File navigation over records already delivered by the permission-filtered Brain API.
 * Never reads a filesystem, fetches a repository, or guesses undiscovered files.
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const key = (...parts) => JSON.stringify(parts);
const basename = path => path.slice(path.lastIndexOf('/') + 1);
const dirname = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) || '/' : '';

function normalizePath(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) return null;
  const source = value.replace(/\\/g, '/');
  const rooted = source.startsWith('/');
  const parts = [];
  for (const part of source.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return `${rooted ? '/' : ''}${parts.join('/')}` || null;
}

function location(object, roots) {
  const metadata = object.sourceMetadata;
  if (metadata?.kind === 'github' && metadata.repository && metadata.ref && metadata.path) {
    const path = normalizePath(metadata.path.replace(/^\/+/, ''));
    if (path) return {
      scope: key('github', metadata.repository.toLowerCase(), metadata.ref),
      rootLabel: `${metadata.repository} · ${metadata.ref}`, rootPath: `GitHub: ${metadata.repository} @ ${metadata.ref}`,
      path, title: object.title,
    };
  }
  if (object.sourcePath?.startsWith('github://') || metadata?.kind === 'github') {
    return { scope: key('github-unscoped'), rootLabel: 'GitHub imports', rootPath: 'GitHub imports without complete path provenance', path: '', title: object.title || object.id };
  }
  if (object.sourcePath) {
    const path = normalizePath(object.sourcePath);
    const root = path && roots.find(candidate => candidate.path === '/' ? path.startsWith('/') : path.startsWith(`${candidate.path}/`));
    if (root) return { scope: root.scope, rootLabel: root.label, rootPath: root.path, path: path.slice(root.path === '/' ? 1 : root.path.length + 1), title: object.title };
    // An imported record without a connected root is still readable, but its
    // absolute parent folders are not evidence of an entire connected vault.
    return { scope: key('unscoped-imports'), rootLabel: 'Imported files', rootPath: 'Imported files without a connected folder', path: '', title: path ? basename(path) : object.title || object.id };
  }
  return { scope: key('brain-notes'), rootLabel: 'Brain notes', rootPath: 'Notes and memory stored in this Brain', path: '', title: object.title || object.id };
}

/** Navigation depends on identity/path/title, not content or revision updates.
 * Canonical ordering means periodic API snapshots do not invalidate UI state.
 */
export function vaultTreeSignature(objects, folders = []) {
  const records = new Map();
  for (const object of objects) {
    if (!object?.id || object.kind === 'code_graph' || records.has(object.id)) continue;
    const metadata = object.sourceMetadata;
    records.set(object.id, [object.id, object.title, object.kind, object.sourcePath,
      metadata ? [metadata.kind, metadata.repository, metadata.ref, metadata.path] : null]);
  }
  const roots = [...new Set(folders.map(folder => normalizePath(folder?.path)).filter(Boolean))].sort();
  return JSON.stringify([roots, [...records.values()].sort((a, b) => a[0].localeCompare(b[0]))]);
}

export function buildVaultTree(objects, folders = []) {
  const nodes = new Map();
  const roots = [];
  const objectNodes = new Map();
  const registered = new Map();
  for (const folder of folders) {
    const path = normalizePath(folder?.path);
    if (path && !registered.has(path)) registered.set(path, { path, label: basename(path) || path, scope: key('folder', path) });
  }
  const rootCandidates = [...registered.values()].sort((a, b) => b.path.length - a.path.length);
  const duplicateLabels = new Map();
  for (const root of rootCandidates) duplicateLabels.set(root.label, (duplicateLabels.get(root.label) || 0) + 1);
  for (const root of rootCandidates) {
    if (duplicateLabels.get(root.label) > 1) root.label = `${root.label} · ${dirname(root.path)}`;
  }

  const ensureRoot = source => {
    const id = key('root', source.scope);
    if (!nodes.has(id)) {
      nodes.set(id, { id, kind: 'folder', label: source.rootLabel, path: source.rootPath, parentId: null, rootId: id, children: [], childrenDesc: [], count: 0, scope: source.scope });
      roots.push(id);
    }
    return id;
  };
  // Connected roots are known metadata; empty and unscanned descendants are not.
  for (const root of rootCandidates) ensureRoot({ scope: root.scope, rootLabel: root.label, rootPath: root.path });
  for (const object of objects) {
    if (!object || !object.id || object.kind === 'code_graph' || objectNodes.has(object.id)) continue;
    const source = location(object, rootCandidates);
    const rootId = ensureRoot(source);
    let parentId = rootId;
    const segments = source.path ? source.path.split('/').filter(Boolean) : [];
    const directory = [];
    for (const segment of segments.slice(0, -1)) {
      directory.push(segment);
      const id = key('directory', source.scope, directory.join('/'));
      if (!nodes.has(id)) {
        nodes.set(id, { id, kind: 'folder', label: segment, path: directory.join('/'), parentId, rootId, children: [], childrenDesc: [], count: 0, scope: source.scope });
        nodes.get(parentId).children.push(id);
      }
      parentId = id;
    }
    const id = key('file', object.id);
    const label = segments.at(-1) || source.title || object.id;
    nodes.set(id, { id, kind: 'file', objectId: object.id, label, path: source.path || object.sourcePath || label, parentId, rootId, children: [], childrenDesc: [], count: 1, scope: source.scope,
      searchText: `${label}\n${object.title || ''}\n${object.sourcePath || ''}\n${source.path}\n${source.rootLabel}`.toLocaleLowerCase() });
    nodes.get(parentId).children.push(id);
    objectNodes.set(object.id, id);
    for (let current = parentId; current; current = nodes.get(current).parentId) nodes.get(current).count += 1;
  }
  const compare = direction => (left, right) => {
    const a = nodes.get(left), b = nodes.get(right);
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return direction * (collator.compare(a.label, b.label) || a.id.localeCompare(b.id));
  };
  for (const node of nodes.values()) {
    node.children.sort(compare(1));
    node.childrenDesc = [...node.children].sort(compare(-1));
  }
  roots.sort(compare(1));
  return { nodes, roots, rootsDesc: [...roots].sort(compare(-1)), objectNodes, count: objectNodes.size };
}

export function vaultAncestors(model, id) {
  const ancestors = [];
  for (let parent = model.nodes.get(id)?.parentId; parent; parent = model.nodes.get(parent)?.parentId) ancestors.push(parent);
  return ancestors.reverse();
}

/** Flatten only expanded branches. Search temporarily reveals matching ancestors. */
export function flattenVaultTree(model, expanded, { query = '', order = 'asc' } = {}) {
  const search = query.trim().toLocaleLowerCase();
  let matches = null;
  if (search) {
    matches = new Set();
    for (const node of model.nodes.values()) {
      if (node.kind !== 'file' || !node.searchText.includes(search)) continue;
      matches.add(node.id);
      for (let parent = node.parentId; parent && !matches.has(parent); parent = model.nodes.get(parent).parentId) matches.add(parent);
    }
  }
  const rows = [];
  const pushChildren = (ids, level) => {
    const visible = matches ? ids.filter(id => matches.has(id)) : ids;
    for (let index = visible.length - 1; index >= 0; index--) stack.push({ id: visible[index], level, position: index + 1, setSize: visible.length });
  };
  const stack = [];
  pushChildren(order === 'desc' ? model.rootsDesc : model.roots, 1);
  while (stack.length) {
    const row = stack.pop();
    const node = model.nodes.get(row.id);
    const isExpanded = node.kind === 'folder' && (Boolean(search) || expanded.has(node.id));
    rows.push({ ...row, node, expanded: isExpanded });
    if (isExpanded) pushChildren(order === 'desc' ? node.childrenDesc : node.children, row.level + 1);
  }
  return rows;
}

export function vaultFolderObjectIds(model, id) {
  const root = model.nodes.get(id);
  if (!root || root.kind !== 'folder') return [];
  const ids = [];
  const stack = [id];
  while (stack.length) {
    const node = model.nodes.get(stack.pop());
    if (node.kind === 'file') ids.push(node.objectId);
    else for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return ids;
}
