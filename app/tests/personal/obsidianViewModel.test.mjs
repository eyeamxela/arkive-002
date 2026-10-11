import test from 'node:test';
import assert from 'node:assert/strict';
import { graphInputKey, matchesGraphSearch, filterObsidianGraph, graphSearchColors } from '../../src/personal/obsidianViewModel.mjs';
const nodes = ['Alpha', 'Beta', 'Gamma', 'Orphan'].map((title, index) => ({ id: String(index), title, kind: 'note', path: index === 0 ? 'projects/Alpha.md' : `${title}.md`, aliases: index === 0 ? ['First note'] : [], tags: index === 0 ? ['work/launch'] : [], degree: index === 3 ? 0 : 1 }));
const model = { nodes, edges: [{ id: 'a', source: '0', target: '1', kinds: ['wikilink'] }, { id: 'b', source: '1', target: '2', kinds: ['source'] }], diagnostics: [], diagnosticCount: 0 };
test('literal, alias, quoted, path and tag filters match only actual fields', () => {
  assert.ok(matchesGraphSearch(nodes[0], 'path:projects tag:work'));
  assert.ok(matchesGraphSearch(nodes[0], '"First note" -Beta'));
  assert.ok(matchesGraphSearch(nodes[0], '#work/launch'));
  assert.ok(!matchesGraphSearch(nodes[0], 'path:research'));
  assert.ok(!matchesGraphSearch(nodes[1], 'path:projects'));
});
test('all 2005 notes survive display preparation without the legacy 300-node cap', () => {
  const full = { ...model, nodes: Array.from({ length: 2005 }, (_, index) => ({ ...nodes[3], id: String(index) })), edges: [] };
  assert.equal(filterObsidianGraph(full).nodes.length, 2005);
});
test('local depth follows real links and filters edges with nodes', () => {
  assert.deepEqual(filterObsidianGraph(model, { selectedId: '0', depth: 1 }).nodes.map(node => node.id), ['0', '1']);
  assert.deepEqual(filterObsidianGraph(model, { selectedId: '0', depth: 2 }).nodes.map(node => node.id), ['0', '1', '2']);
  assert.equal(filterObsidianGraph(model, { query: 'Alpha' }).edges.length, 0);
});
test('orphan and source-reference filters operate before local traversal', () => {
  assert.equal(filterObsidianGraph(model, { showOrphans: false }).nodes.length, 3);
  const notesOnly = filterObsidianGraph(model, { showOrphans: false, showSources: false, selectedId: '0', depth: 2 });
  assert.deepEqual(notesOnly.nodes.map(node => node.id), ['0', '1']);
  assert.equal(notesOnly.edges.length, 1);
});
test('folder filtering cannot introduce nodes or links absent from the permitted graph', () => {
  const original = JSON.stringify(model);
  const filtered = filterObsidianGraph(model, { folderIds: ['0', 'forbidden'] });
  assert.deepEqual(filtered.nodes.map(node => node.id), ['0']);
  assert.equal(filtered.edges.length, 0);
  assert.equal(filtered.nodes[0].degree, 0);
  assert.equal(JSON.stringify(model), original);
});
test('color groups use first matching literal query and cannot inject CSS', () => {
  const colors = graphSearchColors(nodes, [{ query: '', color: '#ff0000' }, { query: 'Alpha', color: 'url(secret)' }, { query: 'path:projects', color: '#eeaa00' }, { query: 'Alpha', color: '#000000' }]);
  assert.deepEqual(Object.entries(colors), [['0', '#eeaa00']]);
});
test('equivalent snapshots reuse keys; revision, permission scope and root changes invalidate', () => {
  const objects = [{ id: 'one', title: 'Alpha', text: 'private', revisionId: 'v1', sourceIds: [], sourcePath: '/vault/Alpha.md' }];
  const folders = [{ id: 'vault', path: '/vault' }];
  const key = graphInputKey(objects, folders);
  assert.equal(key, graphInputKey(structuredClone(objects), structuredClone(folders)));
  assert.notEqual(key, graphInputKey([{ ...objects[0], revisionId: 'v2' }], folders));
  assert.notEqual(key, graphInputKey([], folders));
  assert.notEqual(key, graphInputKey(objects, [{ id: 'other', path: '/other' }]));
  assert.ok(!key.includes('private'));
});
