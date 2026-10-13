import test from 'node:test';
import assert from 'node:assert/strict';
import { sortCabinetFiles, fileType, suggestFiling, filingOperations, reorderCollection } from '../../src/personal/organizationModel.mjs';
const sources = [
  { id: 'b', revisionId: 'r2', title: 'Note 10.md', kind: 'note', text: 'Business strategy', sourcePath: '/vault/research/ten.md' },
  { id: 'a', revisionId: 'r1', title: 'Note 2.pdf', kind: 'file', text: 'Unrelated', sourcePath: '/vault/other/two.pdf' },
  { id: 'c', title: 'Other', kind: 'memory', text: 'Research findings' },
];
const research = { id: 'research', name: 'Research', sourceIds: [], updatedAt: 'now' };
test('sorts naturally in both directions, by file extension, revision time and saved order without mutation', () => {
  const original = structuredClone(sources);
  const ids = (sort, revisions, order) => sortCabinetFiles(sources, sort, revisions, order).map(item => item.id);
  assert.deepEqual(ids('name-asc'), ['a','b','c']); assert.deepEqual(ids('name-desc'), ['c','b','a']);
  assert.deepEqual(ids('type'), ['b','c','a']);
  assert.deepEqual(ids('recent', [{ id: 'r1', createdAt: '2026-01-01' }, { id: 'r2', createdAt: '2026-02-01' }]), ['b','a','c']);
  assert.deepEqual(ids('manual', [], ['c','a','b']), ['c','a','b']); assert.deepEqual(sources, original);
  assert.equal(fileType({ ...sources[0], sourceMetadata: { path: 'a.TSX' } }), 'tsx');
});
test('local suggestions explain folder/title/text matches and avoid ties, existing membership and full collections', () => {
  const results = suggestFiling(sources, [research, { id: 'business', name: 'Business', sourceIds: [] }]);
  assert.equal(results[0].collection.id, 'research'); assert.match(results[0].reason, /Folder name/);
  assert.equal(results[1].collection, null); assert.match(results[2].reason, /Note text/);
  assert.equal(suggestFiling(sources, [research, { ...research, id: 'duplicate' }])[0].collection, null);
  assert.equal(suggestFiling(sources, [{ ...research, sourceIds: ['b'] }])[0].collection, null);
  assert.equal(suggestFiling(sources, [{ ...research, sourceIds: Array.from({ length: 1000 }, (_, i) => String(i)) }])[0].collection, null);
  assert.equal(suggestFiling(Array.from({ length: 150 }, () => sources[0]), [research]).length, 100);
});
test('filing includes only explicitly accepted rows, snapshots destination and pins source revision', () => {
  const rows = sources.map(object => ({ object, collectionId: 'research', accepted: object.id === 'b' }));
  const operations = filingOperations(rows, [research]);
  assert.equal(operations.length, 1); assert.deepEqual(operations[0].add, [{ sourceId: 'b', revisionId: 'r2' }]);
  research.sourceIds.push('unchanged'); assert.deepEqual(operations[0].expected.sourceIds, []); research.sourceIds.pop();
  assert.deepEqual(filingOperations(rows, [{ ...research, sourceIds: ['b'] }]), []);
  assert.deepEqual(filingOperations(rows, [research], true)[0].removeIds, ['b']);
});
test('manual ordering preserves unrelated and hidden references and handles boundaries', () => {
  const collection = { ...research, sourceIds: ['a','code','b'] };
  assert.deepEqual(reorderCollection(collection, 'b', -1).order, ['a','b','code']);
  assert.deepEqual(collection.sourceIds, ['a','code','b']);
  assert.equal(reorderCollection(collection, 'a', -1), null); assert.equal(reorderCollection(collection, 'b', 1), null);
});
