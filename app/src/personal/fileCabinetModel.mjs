import { buildVaultTree, vaultAncestors, vaultFolderObjectIds } from './vaultTreeModel.mjs';

/** Pure presentation helpers. Collections contain original source IDs, never file copies. */
export const CABINET_PALETTE = Object.freeze([
  { name: 'Mustard', color: '#f4bc59' },
  { name: 'Paper', color: '#f2f3ee' },
  { name: 'Olive', color: '#999d7e' },
  { name: 'Ink', color: '#080d09' },
  { name: 'Sage', color: '#a3b7a8' },
]);
export const CABINET_GROUPS = Object.freeze([
  { id: 'notes', name: 'Notes' },
  { id: 'documents', name: 'Documents' },
  { id: 'memory', name: 'Memory' },
]);
export const ALL_FILES = 'system:all';
export const UNFILED_FILES = 'system:unfiled';
export function validFolderColor(value) { return typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value); }
function rgb(hex) { return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)); }
function luminance(hex) {
  return rgb(hex).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}
export function colorContrast(a, b) { const l = [luminance(a), luminance(b)].sort((a, b) => b - a); return (l[0] + .05) / (l[1] + .05); }
function mix(foreground, background, weight) {
  const back = rgb(background);
  return '#' + rgb(foreground).map((value, index) => Math.round(value * weight + back[index] * (1 - weight)).toString(16).padStart(2, '0')).join('');
}
export function folderMaterial(value) {
  const fill = validFolderColor(value) ? value.toLowerCase() : CABINET_PALETTE[0].color;
  let ink = colorContrast(fill, '#080d09') >= colorContrast(fill, '#f8faf5') ? '#080d09' : '#f8faf5';
  if (colorContrast(fill, ink) < 4.5) ink = colorContrast(fill, '#000000') >= colorContrast(fill, '#ffffff') ? '#000000' : '#ffffff';
  let muted = mix(ink, fill, .8);
  if (colorContrast(fill, muted) < 4.5) muted = ink;
  return { '--fc-fill': fill, '--fc-ink': ink, '--fc-muted': muted, '--fc-line': mix(ink, fill, .3), '--fc-grid': mix(ink, fill, .065) };
}
export function defaultFolderColor(id) {
  let hash = 0;
  for (const char of String(id)) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return CABINET_PALETTE[hash % CABINET_PALETTE.length].color;
}
export function sourceGroup(object) { return object.kind === 'note' ? 'notes' : object.kind === 'memory' ? 'memory' : 'documents'; }
export function cabinetFolders(objects, collections = [], member = false) {
  const sources = objects.filter(object => object.kind !== 'code_graph');
  const byId = new Map(sources.map(object => [object.id, object]));
  const sourceIds = [...byId.keys()];
  const all = { id: ALL_FILES, name: member ? 'Permitted files' : 'All files', color: '#a3b7a8', sourceIds, system: true, collectionId: null };
  // Member payloads must never reveal even the names/counts/colors of owner collections.
  if (member) return [all];
  const filed = new Set();
  const folders = collections.map(collection => {
    const ids = [...new Set(collection.sourceIds)].filter(id => byId.has(id));
    ids.forEach(id => filed.add(id));
    return { id: `collection:${collection.id}`, collectionId: collection.id, name: collection.name,
      color: validFolderColor(collection.color) ? collection.color.toLowerCase() : defaultFolderColor(collection.id), sourceIds: ids, system: false };
  });
  return [all, { id: UNFILED_FILES, name: 'Unfiled', color: '#f4bc59', sourceIds: sourceIds.filter(id => !filed.has(id)), system: true, collectionId: null }, ...folders];
}
export function cabinetFiles(objects, folder, query = '', group = '') {
  const ids = new Set(folder.sourceIds);
  const needle = query.trim().toLocaleLowerCase();
  const unique = new Map();
  for (const object of objects) {
    if (object.kind === 'code_graph' || !ids.has(object.id) || (group && sourceGroup(object) !== group)) continue;
    if (needle && !`${object.title} ${object.kind} ${object.sourcePath || ''}`.toLocaleLowerCase().includes(needle)) continue;
    unique.set(object.id, object);
  }
  return [...unique.values()].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}
export function cabinetGroups(objects) {
  const counts = { notes: 0, documents: 0, memory: 0 };
  for (const object of objects) if (object.kind !== 'code_graph') counts[sourceGroup(object)] += 1;
  return CABINET_GROUPS.map(group => ({ ...group, count: counts[group.id] }));
}
export function cabinetPage(folders, selectedId, size = 5) {
  const pageSize = Number.isFinite(size) ? Math.min(5, Math.max(1, Math.floor(size))) : 5;
  const index = Math.max(0, folders.findIndex(folder => folder.id === selectedId));
  const start = Math.floor(index / pageSize) * pageSize;
  const window = folders.slice(start, start + pageSize);
  return { folders: window.filter(folder => folder.id !== selectedId).concat(window.filter(folder => folder.id === selectedId)), start, end: Math.min(start + pageSize, folders.length),
    previousId: start ? folders[Math.max(0, start - pageSize)].id : null,
    nextId: start + pageSize < folders.length ? folders[start + pageSize].id : null };
}
/** New external source links reveal their source; local filtering never resurrects stale selection. */
export function reconcileCabinetSelection(selectedId, previousId, allFiles, visible, limit = 100) {
  if (!selectedId) return { selectedId: null, resetView: false, limit };
  const allIndex = allFiles.findIndex(object => object.id === selectedId);
  if (allIndex < 0) return { selectedId: null, resetView: false, limit };
  const visibleIndex = visible.findIndex(object => object.id === selectedId);
  if (visibleIndex < 0) {
    if (selectedId === previousId) return { selectedId: null, resetView: false, limit };
    return { selectedId, resetView: true, limit: Math.max(100, Math.ceil((allIndex + 1) / 100) * 100) };
  }
  return { selectedId, resetView: false, limit: Math.max(limit, Math.ceil((visibleIndex + 1) / 100) * 100) };
}
/** Send only changed fields. The node preserves other metadata atomically on upsert. */
export function collectionPatch(collection, changes = {}) {
  const patch = { id: collection.id };
  if (changes.addId || changes.removeId) {
    const sourceIds = [...new Set(collection.sourceIds)].filter(id => id !== changes.removeId);
    if (changes.addId && !sourceIds.includes(changes.addId)) sourceIds.push(changes.addId);
    if (sourceIds.length > 1000) throw new Error('This folder is full. Arkive folders support up to 1,000 sources.');
    patch.sourceIds = sourceIds;
  }
  if (changes.color !== undefined) {
    if (!validFolderColor(changes.color)) throw new Error('Choose a six-digit hex color, such as #A3B7A8.');
    patch.color = changes.color.toLowerCase();
  }
  return patch;
}

/** Only authorized local roots become vaults. Never infer a connected vault from an arbitrary path. */
export function buildCabinetVault(objects, folders = [], member = false) {
  const tree = member ? buildVaultTree([], []) : buildVaultTree(objects, folders);
  const rootIds = tree.roots.filter(id => JSON.parse(tree.nodes.get(id).scope)[0] === 'folder');
  const allowedRoots = new Set(rootIds);
  const roots = rootIds.map(id => { const path = tree.nodes.get(id).path; const parts = path.split('/').filter(Boolean); return { id, name: parts.at(-1) || '/', parents: parts.slice(0, -1) }; });
  const rootNames = new Map(roots.map(root => {
    const siblings = roots.filter(other => other.name === root.name && other.id !== root.id);
    if (!siblings.length) return [root.id, root.name];
    let depth = 1;
    while (depth < root.parents.length && siblings.some(other => other.parents.slice(-depth).join('/') === root.parents.slice(-depth).join('/'))) depth += 1;
    return [root.id, `${root.name} · ${root.parents.slice(-depth).join('/') || '/'}`];
  }));
  let folderCount = 0;
  for (const node of tree.nodes.values()) if (node.kind === 'folder' && allowedRoots.has(node.rootId)) folderCount += 1;
  return { tree, rootIds, rootNames, allowedRoots, folderCount, fileCount: rootIds.reduce((sum, id) => sum + tree.nodes.get(id).count, 0) };
}
export function cabinetVaultFolder(model, id, subtree = true) {
  const node = model.tree.nodes.get(id);
  if (!node || node.kind !== 'folder' || !model.allowedRoots.has(node.rootId)) return null;
  const sourceIds = subtree ? vaultFolderObjectIds(model.tree, id) : node.children.map(childId => model.tree.nodes.get(childId)).filter(child => child.kind === 'file').map(child => child.objectId);
  const directCount = node.children.reduce((count, childId) => count + Number(model.tree.nodes.get(childId).kind === 'file'), 0);
  const root = model.tree.nodes.get(node.rootId);
  return { id: `vault:${id}`, vaultId: id, rootId: node.rootId, parentId: node.parentId, name: model.rootNames.get(id) || node.label, path: node.path,
    rootPath: root.path, rootName: model.rootNames.get(node.rootId), color: defaultFolderColor(node.rootId), sourceIds, directCount, totalCount: node.count,
    system: true, collectionId: null };
}
export function cabinetVaultChildren(model, id) {
  const parent = model.tree.nodes.get(id);
  if (!parent || !model.allowedRoots.has(parent.rootId)) return [];
  return parent.children.map(childId => model.tree.nodes.get(childId)).filter(node => node.kind === 'folder').map(node => ({
    id: node.id, name: node.label, path: node.path, count: node.count,
    directCount: node.children.reduce((count, childId) => count + Number(model.tree.nodes.get(childId).kind === 'file'), 0),
  }));
}
export function cabinetVaultBreadcrumbs(model, id) {
  const node = model.tree.nodes.get(id);
  if (!node || !model.allowedRoots.has(node.rootId)) return [];
  return [...vaultAncestors(model.tree, id), id].map(nodeId => model.tree.nodes.get(nodeId)).filter(item => item.kind === 'folder').map(item => ({ id: item.id, name: model.rootNames.get(item.id) || item.label, path: item.path }));
}
export function cabinetVaultContainingFolder(model, sourceId) {
  const node = model.tree.nodes.get(model.tree.objectNodes.get(sourceId));
  return node?.kind === 'file' && model.allowedRoots.has(node.rootId) ? node.parentId : null;
}
/** Defense in depth: even a mis-shaped member payload must not expose owner path metadata. */
export function cabinetReadableObjects(objects, member = false) {
  return member ? objects.map(({ sourcePath, sourceMetadata, ...object }) => object) : objects;
}
