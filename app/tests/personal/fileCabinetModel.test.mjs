import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_FILES, UNFILED_FILES, CABINET_PALETTE, buildCabinetVault, cabinetFolders, cabinetFiles, cabinetGroups, cabinetPage, cabinetReadableObjects, cabinetVaultBreadcrumbs, cabinetVaultChildren, cabinetVaultContainingFolder, cabinetVaultFolder, collectionPatch, colorContrast, defaultFolderColor, folderMaterial, reconcileCabinetSelection, validFolderColor } from '../../src/personal/fileCabinetModel.mjs';
const objects = [
  { id: 'n', title: 'Zebra note', kind: 'note', text: 'Private text', sourceIds: [] },
  { id: 'd', title: 'Business guide', kind: 'file', sourcePath: '/vault/business/guide.md', text: 'Original', sourceIds: [] },
  { id: 'm', title: 'Approved insight', kind: 'memory', text: 'Approved', sourceIds: ['d'] },
  { id: 'code', title: 'Repository', kind: 'code_graph', text: '{}', sourceIds: [] },
];
const collection = { id: 'collection_one', name: 'Business', description: 'Original description', sourceIds: ['d', 'code', 'missing', 'd'], color: '#F4BC59', createdAt: 'now', updatedAt: 'now' };
test('starts with only system views and does not create sample collections or source copies', () => {
  assert.deepEqual(cabinetFolders(objects).map(folder => [folder.id, folder.sourceIds]), [[ALL_FILES, ['n', 'd', 'm']], [UNFILED_FILES, ['n', 'd', 'm']]]);
  assert.equal(cabinetFolders([]).length, 2);
});
test('collections resolve only real accessible non-code IDs; unfiled excludes filed source', () => {
  const folders = cabinetFolders(objects, [collection]);
  assert.deepEqual(folders[2].sourceIds, ['d']);
  assert.equal(folders[2].color, '#f4bc59');
  assert.deepEqual(folders[1].sourceIds, ['n', 'm']);
  assert.equal(cabinetFiles(objects, folders[2])[0], objects[1]);
});
test('member projection never exposes owner collection names, colors, membership, or Unfiled inference', () => {
  const folders = cabinetFolders([objects[1]], [collection], true);
  assert.equal(folders.length, 1); assert.equal(folders[0].name, 'Permitted files');
  assert.deepEqual(folders[0].sourceIds, ['d']);
  assert.equal(JSON.stringify(folders).includes('Business'), false);
});
test('search and groups use source fields; metadata text is not accidentally a hidden search surface', () => {
  const all = cabinetFolders(objects)[0];
  assert.deepEqual(cabinetFiles(objects, all).map(object => object.id), ['m', 'd', 'n']);
  assert.deepEqual(cabinetFiles(objects, all, 'business').map(object => object.id), ['d']);
  assert.deepEqual(cabinetFiles(objects, all, 'guide.md').map(object => object.id), ['d']);
  assert.deepEqual(cabinetFiles(objects, all, 'Private text'), []);
  assert.deepEqual(cabinetFiles(objects, all, '', 'notes').map(object => object.id), ['n']);
  assert.deepEqual(cabinetGroups(cabinetFiles(objects, all)).map(group => group.count), [1, 1, 1]);
});
test('all folders remain reachable with bounded five-sheet stack and active sheet on top', () => {
  const folders = cabinetFolders(objects, Array.from({ length: 23 }, (_, i) => ({ ...collection, id: `c${i}` })));
  const visited = new Set(); let id = folders[0].id;
  while (id) { const page = cabinetPage(folders, id); assert.ok(page.folders.length <= 5); assert.equal(page.folders.at(-1).id, id); page.folders.forEach(folder => visited.add(folder.id)); id = page.nextId; }
  assert.equal(visited.size, folders.length);
  assert.equal(cabinetPage(folders, folders.at(-1).id).end, folders.length);
  assert.equal(cabinetPage(folders, 'removed').start, 0);
  assert.ok(cabinetPage(folders, ALL_FILES, Infinity).folders.length <= 5);
});
test('filing is idempotent and does not resend name/description/color; unrelated and code source IDs retained', () => {
  const snapshot = JSON.stringify(collection);
  const patch = collectionPatch(collection, { addId: 'n' });
  assert.deepEqual(patch, { id: collection.id, sourceIds: ['d', 'code', 'missing', 'n'] });
  assert.deepEqual(collectionPatch(patch, { addId: 'n' }), patch);
  assert.equal(JSON.stringify(collection), snapshot);
  assert.deepEqual(collectionPatch(patch, { removeId: 'd' }).sourceIds, ['code', 'missing', 'n']);
});
test('color-only save preserves all membership; invalid colors and oversized folders fail closed', () => {
  assert.deepEqual(collectionPatch(collection, { color: '#A3B7A8' }), { id: collection.id, color: '#a3b7a8' });
  assert.throws(() => collectionPatch(collection, { color: 'red' }), /six-digit/);
  assert.throws(() => collectionPatch({ ...collection, sourceIds: Array.from({ length: 1000 }, (_, i) => `id${i}`) }, { addId: 'extra' }), /1,000/);
});
test('material colors are theme-independent and provide AA foreground and muted text for every sampled RGB', () => {
  for (const value of [null, '', '#abc', 'red', '#gggggg']) assert.equal(validFolderColor(value), false);
  for (const { color } of CABINET_PALETTE) assert.equal(folderMaterial(color)['--fc-fill'], color);
  for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) {
    const fill = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    const style = folderMaterial(fill);
    assert.ok(colorContrast(fill, style['--fc-ink']) >= 4.5, fill);
    assert.ok(colorContrast(fill, style['--fc-muted']) >= 4.5, fill);
  }
  assert.equal(defaultFolderColor('stable-id'), defaultFolderColor('stable-id'));
});
test('external source selection reveals its original ID outside a folder or search without stale hidden selection', () => {
  const all = cabinetFiles(objects, cabinetFolders(objects)[0]);
  assert.deepEqual(reconcileCabinetSelection('n', 'd', all, [objects[1]]), { selectedId: 'n', resetView: true, limit: 100 });
  assert.deepEqual(reconcileCabinetSelection('n', 'n', all, [objects[1]]), { selectedId: null, resetView: false, limit: 100 });
  assert.deepEqual(reconcileCabinetSelection('missing', null, all, all), { selectedId: null, resetView: false, limit: 100 });
  assert.deepEqual(reconcileCabinetSelection('code', null, all, all), { selectedId: null, resetView: false, limit: 100 });
});
test('an externally selected accessible source beyond the first page is visibly rendered', () => {
  const many = Array.from({ length: 501 }, (_, i) => ({ ...objects[0], id: `n${i}` }));
  assert.deepEqual(reconcileCabinetSelection('n500', null, many, [], 100), { selectedId: 'n500', resetView: true, limit: 600 });
  assert.deepEqual(reconcileCabinetSelection('n250', null, many, many, 100), { selectedId: 'n250', resetView: false, limit: 300 });
});

const vaultSources = [
  { ...objects[1], id: 'root-note', sourcePath: '/brain/vault/intro.md' },
  { ...objects[1], id: 'research-note', sourcePath: '/brain/vault/research/alpha.md' },
  { ...objects[1], id: 'nested-note', sourcePath: '/brain/vault/research/literature/beta.md' },
  { ...objects[1], id: 'other-vault-note', sourcePath: '/clients/vault/intro.md' },
  { ...objects[1], id: 'nested-vault-note', sourcePath: '/brain/vault/research/subvault/local.md' },
  { ...objects[1], id: 'lookalike-root', sourcePath: '/brain/vault-copy/private.md' },
  { ...objects[0], id: 'loose-brain-note', title: 'research/imaginary-topic.md' },
  { ...objects[3], sourcePath: '/brain/vault/code.json' },
];
const vaultGrants = [{ id: 'a', path: '/brain/vault' }, { id: 'b', path: '/clients/vault' }, { id: 'c', path: '/brain/vault/research/subvault' }];
const rootAt = (model, path) => model.rootIds.find(id => model.tree.nodes.get(id).path === path);
test('vault mode derives actual imported hierarchy, longest authorized root and distinct same-name vaults', () => {
  const snapshot = JSON.stringify([vaultSources, vaultGrants]);
  const model = buildCabinetVault(vaultSources, vaultGrants);
  assert.equal(model.rootIds.length, 3); assert.equal(model.fileCount, 5);
  const main = cabinetVaultFolder(model, rootAt(model, '/brain/vault'));
  const other = cabinetVaultFolder(model, rootAt(model, '/clients/vault'));
  const nested = cabinetVaultFolder(model, rootAt(model, '/brain/vault/research/subvault'));
  assert.notEqual(main.name, other.name);
  assert.deepEqual(new Set(main.sourceIds), new Set(['root-note', 'research-note', 'nested-note']));
  assert.deepEqual(other.sourceIds, ['other-vault-note']);
  assert.deepEqual(nested.sourceIds, ['nested-vault-note']);
  assert.equal(main.directCount, 1); assert.equal(main.totalCount, 3);
  assert.equal(JSON.stringify([vaultSources, vaultGrants]), snapshot);
});
test('exact folder and subtree both preserve root files and use real nested counts and breadcrumb paths', () => {
  const model = buildCabinetVault(vaultSources, vaultGrants); const root = rootAt(model, '/brain/vault');
  assert.deepEqual(cabinetVaultFolder(model, root, false).sourceIds, ['root-note']);
  const children = cabinetVaultChildren(model, root);
  assert.deepEqual(children.map(child => [child.name, child.count, child.directCount]), [['research', 2, 1]]);
  const research = children[0]; const literature = cabinetVaultChildren(model, research.id)[0];
  assert.deepEqual(cabinetVaultFolder(model, research.id, false).sourceIds, ['research-note']);
  assert.deepEqual(new Set(cabinetVaultFolder(model, research.id, true).sourceIds), new Set(['research-note', 'nested-note']));
  assert.deepEqual(cabinetVaultBreadcrumbs(model, literature.id).map(part => part.path), ['/brain/vault', 'research', 'research/literature']);
  assert.equal(cabinetVaultContainingFolder(model, 'nested-note'), literature.id);
  assert.equal(cabinetVaultContainingFolder(model, 'root-note'), root);
});
test('unconnected paths, local captures, code snapshots and titles never invent vault organization', () => {
  const model = buildCabinetVault(vaultSources, vaultGrants);
  for (const id of ['lookalike-root', 'loose-brain-note', 'code']) assert.equal(cabinetVaultContainingFolder(model, id), null);
  const unscopedId = model.tree.nodes.get(model.tree.objectNodes.get('lookalike-root')).parentId;
  assert.equal(cabinetVaultFolder(model, unscopedId), null);
  assert.deepEqual(cabinetVaultChildren(model, unscopedId), []);
  assert.deepEqual(cabinetVaultBreadcrumbs(model, unscopedId), []);
  assert.equal(buildCabinetVault(vaultSources, []).rootIds.length, 0);
});
test('known empty vaults appear, undiscovered subfolders do not; duplicate grants coalesce', () => {
  const model = buildCabinetVault([], [{ id: 'a', path: '/empty/vault' }, { id: 'b', path: '/empty/./vault/' }]);
  assert.equal(model.rootIds.length, 1); assert.equal(model.folderCount, 1); assert.equal(model.fileCount, 0);
  assert.deepEqual(cabinetVaultChildren(model, model.rootIds[0]), []);
  assert.deepEqual(cabinetVaultFolder(model, model.rootIds[0]).sourceIds, []);
});
test('member mode exposes neither vault roots nor private metadata in browsing and search', () => {
  const model = buildCabinetVault(vaultSources, vaultGrants, true);
  assert.equal(model.tree.nodes.size, 0); assert.deepEqual(model.rootIds, []); assert.equal(model.fileCount, 0);
  const readable = cabinetReadableObjects(vaultSources, true);
  assert.equal(readable.some(object => Object.hasOwn(object, 'sourcePath') || Object.hasOwn(object, 'sourceMetadata')), false);
  assert.equal(readable[0].id, 'root-note'); assert.equal(readable[0].text, vaultSources[0].text);
  assert.equal(cabinetFiles(readable, cabinetFolders(readable, [collection], true)[0], '/brain').length, 0);
  assert.equal(cabinetReadableObjects(vaultSources), vaultSources);
});
test('large imported folder hierarchies use one root sheet, not a tab for every directory', () => {
  const many = Array.from({ length: 1200 }, (_, index) => ({ ...objects[1], id: `s${index}`, sourcePath: `/vault/folder-${index}/note.md` }));
  const model = buildCabinetVault(many, [{ id: 'a', path: '/vault' }]);
  assert.equal(model.rootIds.length, 1); assert.equal(model.folderCount, 1201); assert.equal(model.fileCount, 1200);
  assert.equal(cabinetVaultChildren(model, model.rootIds[0]).length, 1200);
  assert.equal(cabinetVaultFolder(model, model.rootIds[0], false).sourceIds.length, 0);
  assert.equal(cabinetVaultFolder(model, model.rootIds[0]).sourceIds.length, 1200);
});
test('same-name source roots use shortest distinguishing labels while retaining full path provenance', () => {
  const paths = ['/customers/a/notes/vault', '/archive/a/notes/vault', '/personal/vault', '/vault'];
  const model = buildCabinetVault([], paths.map((path, index) => ({ id: String(index), path })));
  const labels = paths.map(path => cabinetVaultFolder(model, rootAt(model, path)));
  assert.deepEqual(labels.map(folder => folder.name), ['vault · customers/a/notes', 'vault · archive/a/notes', 'vault · personal', 'vault · /']);
  assert.deepEqual(labels.map(folder => folder.rootPath), paths);
  assert.equal(cabinetVaultBreadcrumbs(model, labels[2].vaultId)[0].name, 'vault · personal');
});
