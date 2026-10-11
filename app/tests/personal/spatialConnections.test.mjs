import test from 'node:test';
import assert from 'node:assert/strict';
import { spatialConnections, MAX_SPATIAL_CONNECTIONS } from '../../src/personal/spatialConnections.mjs';
const cards = [{ id: 'source', x: -400, y: 10, width: 300, height: 200 }, { id: 'room', x: 100, y: 10, width: 500, height: 200 }];
const edge = { source: 'source', target: 'room', label: 'Selected context', status: 'neutral' };
test('connectors attach to card edges in world coordinates, including negative positions', () => {
  const [connection] = spatialConnections(cards, [edge]);
  assert.equal(connection.path, 'M -100 110 C 0 110, 0 110, 100 110');
  assert.equal(connection.x, 0); assert.equal(connection.y, 110);
});
test('dragged and resized card coordinates update connections without changing input data', () => {
  const next = [{ ...cards[0], y: 800, height: 300 }, cards[1]];
  const [connection] = spatialConnections(next, [edge]);
  assert.notEqual(connection.path, spatialConnections(cards, [edge])[0].path);
  assert.equal(cards[0].y, 10); assert.equal(edge.status, 'neutral');
});
test('only existing distinct endpoints produce edges; repeated edge identities are ignored', () => {
  assert.equal(spatialConnections(cards, [{ ...edge, target: 'missing' }, { ...edge, target: 'source' }]).length, 0);
  assert.equal(spatialConnections(cards, [{ ...edge, id: 'one' }, { ...edge, id: 'one' }]).length, 1);
});
test('bounded geometry rejects nonfinite coordinates and normalizes unknown status', () => {
  const links = Array.from({ length: 1000 }, (_, index) => ({ ...edge, id: String(index), status: 'imagined' }));
  const result = spatialConnections([{ ...cards[0], x: Infinity, height: NaN }, cards[1]], links);
  assert.equal(result.length, MAX_SPATIAL_CONNECTIONS);
  assert.equal(result[0].status, 'neutral');
  assert.ok(!result.some(item => /NaN|Infinity/.test(item.path)));
});
