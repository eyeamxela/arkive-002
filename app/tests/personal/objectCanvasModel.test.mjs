import test from 'node:test';
import assert from 'node:assert/strict';
import { objectTimeline } from '../../src/personal/objectCanvasModel.mjs';

test('object timeline uses real revision IDs, newest first and excludes code snapshots', () => {
  const a = { id: 'a', title: 'Earlier', kind: 'note', revisionId: 'r1' };
  const b = { id: 'b', title: 'Latest', kind: 'memory', revisionId: 'r2' };
  const c = { id: 'c', title: 'Code', kind: 'code_graph', revisionId: 'r3' };
  const result = objectTimeline([a, c, b], [{ id: 'r1', createdAt: '2025-01-01T00:00:00Z' }, { id: 'r2', createdAt: '2026-01-01T00:00:00Z' }]);
  assert.deepEqual(result.map(row => row.object.id), ['b', 'a']);
  assert.equal(result[0].updatedAt, '2026-01-01T00:00:00Z');
});

test('missing/malformed dates are explicit, not invented; search includes source path', () => {
  const objects = [{ id: 'a', title: 'Note', kind: 'note', revisionId: 'bad', sourcePath: '/vault/topic.md' }];
  assert.equal(objectTimeline(objects, [null, { id: 'bad', createdAt: 'not-a-date' }], 'topic')[0].updatedAt, null);
  assert.equal(objectTimeline(objects, [], 'absent').length, 0);
});
