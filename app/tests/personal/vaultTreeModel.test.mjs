import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVaultTree, flattenVaultTree, vaultAncestors, vaultFolderObjectIds, vaultTreeSignature } from '../../src/personal/vaultTreeModel.mjs';

const note = (id, path, extra = {}) => ({ id, title: id, kind: 'note', text: 'Private body is not used by navigation', sourcePath: path, sourceIds: [], ...extra });
const folders = [{ id: 'vault', path: '/vault' }];
const leaf = (model, objectId) => model.nodes.get(model.objectNodes.get(objectId));

test('shows only known connected roots and folders evidenced by imported file paths', () => {
  const model = buildVaultTree([note('a', '/vault/projects/alpha/Plan.md'), note('b', '/vault/Inbox.md')], [...folders, { id: 'empty', path: '/empty' }]);
  assert.equal(model.count, 2);
  assert.deepEqual([...model.nodes.values()].filter(n => n.kind === 'folder').map(n => n.label).sort(), ['alpha', 'empty', 'projects', 'vault']);
  assert.equal(leaf(model, 'a').label, 'Plan.md');
  assert.deepEqual(vaultAncestors(model, leaf(model, 'a').id).map(id => model.nodes.get(id).label), ['vault', 'projects', 'alpha']);
  assert.deepEqual(vaultFolderObjectIds(model, leaf(model, 'a').rootId), ['a', 'b']);
});

test('longest root wins and similarly prefixed sibling paths never share a scope', () => {
  const model = buildVaultTree([note('outer', '/vault/A.md'), note('inner', '/vault/nested/A.md'), note('sibling', '/vault-other/A.md')], [...folders, { id: 'nested', path: '/vault/nested' }]);
  assert.notEqual(leaf(model, 'outer').scope, leaf(model, 'inner').scope);
  assert.equal(model.nodes.get(leaf(model, 'inner').rootId).path, '/vault/nested');
  assert.equal(model.nodes.get(leaf(model, 'sibling').rootId).label, 'Imported files');
  assert.deepEqual(vaultFolderObjectIds(model, leaf(model, 'outer').rootId), ['outer']);
});

test('duplicate vault basenames and duplicate relative file paths remain distinct', () => {
  const roots = [{ id: 'a', path: '/home/a/vault' }, { id: 'b', path: '/home/b/vault' }];
  const model = buildVaultTree([note('a', '/home/a/vault/docs/Same.md'), note('b', '/home/b/vault/docs/Same.md')], roots);
  assert.equal(new Set(model.roots).size, 2);
  assert.deepEqual(model.roots.map(id => model.nodes.get(id).label), ['vault · /home/a', 'vault · /home/b']);
  assert.notEqual(leaf(model, 'a').parentId, leaf(model, 'b').parentId);
});

test('GitHub metadata separates repository and slash-containing ref identities', () => {
  const github = (id, repository, ref, path) => note(id, `github://${repository}/${ref}/${path}`, { sourceMetadata: { kind: 'github', repository, ref, path } });
  const model = buildVaultTree([github('a', 'org/repo', 'feature/notes', 'docs/Same.md'), github('b', 'org/repo', 'main', 'docs/Same.md'), github('c', 'org/other', 'feature/notes', 'docs/Same.md')]);
  assert.equal(model.roots.length, 3);
  assert.equal(new Set(['a', 'b', 'c'].map(id => leaf(model, id).parentId)).size, 3);
  assert.equal(model.nodes.get(leaf(model, 'a').rootId).label, 'org/repo · feature/notes');
  assert.equal(leaf(model, 'a').path, 'docs/Same.md');
});

test('GitHub display URIs without provenance do not invent repository/ref folders', () => {
  const model = buildVaultTree([note('a', 'github://org/repo/feature/notes/A.md')]);
  assert.equal(model.roots.length, 1);
  assert.equal(model.nodes.get(model.roots[0]).label, 'GitHub imports');
  assert.equal([...model.nodes.values()].filter(n => n.kind === 'folder').length, 1);
});

test('native notes are single leaves even when titles contain slashes; code graphs excluded', () => {
  const model = buildVaultTree([note('a', undefined, { title: 'Thought / revision' }), note('b', undefined, { kind: 'memory' }), note('code', '/vault/src', { kind: 'code_graph' })], folders);
  assert.equal(model.count, 2);
  assert.equal(model.objectNodes.has('code'), false);
  assert.equal(leaf(model, 'a').label, 'Thought / revision');
  assert.equal(model.nodes.get(leaf(model, 'a').parentId).label, 'Brain notes');
});

test('root-expanded defaults reveal top-level folders, not every nested file', () => {
  const model = buildVaultTree(Array.from({ length: 10000 }, (_, i) => note(`n${i}`, `/vault/folder${i % 20}/Note${i}.md`)), folders);
  const rows = flattenVaultTree(model, new Set(model.roots));
  assert.equal(model.count, 10000);
  assert.equal(rows.length, 21);
  assert.equal(rows.filter(r => r.node.kind === 'file').length, 0);
  assert.deepEqual(flattenVaultTree(model, new Set()).map(r => r.node.label), ['vault']);
});

test('search matches imported path and title, reveals ancestors, and never searches body', () => {
  const model = buildVaultTree([note('a', '/vault/projects/One.md', { title: 'Quarterly plan' }), note('b', '/vault/other/Two.md')], folders);
  assert.deepEqual(flattenVaultTree(model, new Set(), { query: 'QUARTERLY' }).map(r => r.node.label), ['vault', 'projects', 'One.md']);
  assert.deepEqual(flattenVaultTree(model, new Set(), { query: 'projects' }).filter(r => r.node.kind === 'file').map(r => r.node.objectId), ['a']);
  assert.equal(flattenVaultTree(model, new Set(model.roots), { query: 'Private body' }).length, 0);
});

test('sorting is natural, keeps directories first, and does not mutate the model', () => {
  const model = buildVaultTree([note('z', '/vault/z/Note.md'), note('two', '/vault/Note2.md'), note('ten', '/vault/Note10.md')], folders);
  const before = [...model.nodes.get(model.roots[0]).children];
  assert.deepEqual(flattenVaultTree(model, new Set(model.roots)).map(r => r.node.label), ['vault', 'z', 'Note2.md', 'Note10.md']);
  assert.deepEqual(flattenVaultTree(model, new Set(model.roots), { order: 'desc' }).map(r => r.node.label), ['vault', 'z', 'Note10.md', 'Note2.md']);
  assert.deepEqual(model.nodes.get(model.roots[0]).children, before);
});

test('folder filtering returns only present supplied objects, including nested descendants', () => {
  const model = buildVaultTree([note('a', '/vault/docs/a.md'), note('b', '/vault/docs/sub/b.md'), note('c', '/vault/elsewhere/c.md')], folders);
  const docs = [...model.nodes.values()].find(n => n.kind === 'folder' && n.label === 'docs');
  assert.deepEqual(vaultFolderObjectIds(model, docs.id).sort(), ['a', 'b']);
  assert.deepEqual(vaultFolderObjectIds(model, leaf(model, 'a').id), []);
  assert.deepEqual(vaultFolderObjectIds(model, 'unknown'), []);
});

test('normalizes path separators and dot segments without leaking above-root guesses', () => {
  const model = buildVaultTree([note('a', '/vault/docs/../A.md'), note('b', '/vault/../../outside/B.md'), note('c', 'C:\\vault\\docs\\C.md')], [...folders, { id: 'win', path: 'C:\\vault\\' }]);
  assert.equal(model.nodes.get(leaf(model, 'a').rootId).path, '/vault');
  assert.equal(model.nodes.get(leaf(model, 'b').rootId).label, 'Imported files');
  assert.equal(leaf(model, 'c').path, 'docs/C.md');
  assert.equal(vaultAncestors(model, leaf(model, 'c').id).length, 2);
});

test('duplicate object IDs are coalesced and caller arrays remain untouched', () => {
  const objects = [note('a', '/vault/A.md'), note('a', '/vault/B.md')];
  const before = JSON.stringify({ objects, folders });
  const model = buildVaultTree(objects, folders);
  assert.equal(model.count, 1);
  assert.equal(leaf(model, 'a').label, 'A.md');
  assert.equal(JSON.stringify({ objects, folders }), before);
});

test('identical snapshots, revision/content updates and API ordering keep tree identity stable', () => {
  const objects = [note('a', '/vault/A.md'), note('b', '/vault/docs/B.md')];
  const initial = vaultTreeSignature(objects, folders);
  assert.equal(vaultTreeSignature(structuredClone(objects), structuredClone(folders)), initial);
  assert.equal(vaultTreeSignature(objects.map(object => ({ ...object, text: 'Changed content', revisionId: 'new-revision' })).reverse(), [{ id: 'new-folder-record', path: '/vault/' }]), initial);
  assert.equal(vaultTreeSignature([...objects, note('code', '/vault/code', { kind: 'code_graph' })], folders), initial);
});

test('tree topology fingerprint changes on membership, path, title or GitHub scope changes', () => {
  const objects = [note('a', '/vault/A.md')];
  const initial = vaultTreeSignature(objects, folders);
  for (const update of [{ title: 'New title' }, { sourcePath: '/vault/nested/A.md' }, { id: 'different-object' }]) {
    assert.notEqual(vaultTreeSignature([{ ...objects[0], ...update }], folders), initial);
  }
  assert.notEqual(vaultTreeSignature([], folders), initial);
  assert.notEqual(vaultTreeSignature(objects, [{ id: 'other', path: '/elsewhere' }]), initial);
  const metadata = { kind: 'github', repository: 'org/repo', ref: 'main', path: 'A.md' };
  const github = [{ ...objects[0], sourceMetadata: metadata }];
  assert.notEqual(vaultTreeSignature(github), vaultTreeSignature([{ ...github[0], sourceMetadata: { ...metadata, ref: 'feature/a' } }]));
  assert.equal(vaultTreeSignature(github), vaultTreeSignature([{ ...github[0], sourceMetadata: { ...metadata, commitSha: 'new-commit' } }]));
});
