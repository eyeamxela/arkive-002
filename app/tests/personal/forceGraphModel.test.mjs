import test from 'node:test';
import assert from 'node:assert/strict';
import { createForceGraph, fitForceCamera, forceTopologyKey, graphNodeRadius, normalizeForceSettings, packForcePositions, reheatForceGraph, stepForceGraph, zoomForceCamera } from '../../src/personal/forceGraphModel.mjs';

function model(size, linked = true) {
  return { nodes: Array.from({ length: size }, (_, index) => ({ id: `note-${String(index).padStart(5, '0')}`, title: `Note ${index}`, group: `group-${index % 5}`, degree: linked ? 2 : 0 })),
    edges: linked ? Array.from({ length: size }, (_, index) => ({ source: `note-${String(index).padStart(5, '0')}`, target: `note-${String((index + 1) % size).padStart(5, '0')}` })) : [] };
}

test('force model retains all 10,000 notes and 20,000 supplied actual edges', () => {
  const input = model(10000);
  input.edges.push(...input.edges.map(edge => ({ ...edge })));
  const state = createForceGraph(input);
  assert.equal(state.nodes.length, 10000); assert.equal(state.edges.length, 20000);
  assert.equal(packForcePositions(state).length, 20000);
  assert.equal(createForceGraph(model(10000, false)).edges.length, 0);
});

test('initial positions are deterministic and existing nodes preserve position across updates', () => {
  const input = model(20);
  const a = createForceGraph(input); const b = createForceGraph(input);
  assert.deepEqual(packForcePositions(a), packForcePositions(b));
  stepForceGraph(a); a.nodes[2].x = 345; a.nodes[2].y = -123;
  const next = createForceGraph(model(21), a);
  assert.equal(next.nodes[2].x, 345); assert.equal(next.nodes[2].y, -123);
  assert.notEqual(next.nodes[20].x, undefined);
});

test('topology signature ignores metadata and order but changes for real links and node membership', () => {
  const input = model(8);
  const key = forceTopologyKey(input);
  assert.equal(forceTopologyKey({ nodes: [...input.nodes].reverse().map(node => ({ ...node, title: 'Updated title' })), edges: [...input.edges].reverse() }), key);
  assert.notEqual(forceTopologyKey(model(9)), key);
  assert.notEqual(forceTopologyKey({ ...input, edges: input.edges.slice(1) }), key);
});

test('physics moves notes, stays finite, cools to a full stop and can resume', () => {
  const state = createForceGraph(model(45));
  const before = packForcePositions(state);
  for (let tick = 0; tick < 300; tick++) stepForceGraph(state);
  assert.equal(state.settled, true); assert.ok(state.ticks < 300);
  assert.notDeepEqual(packForcePositions(state), before);
  assert.ok(state.nodes.every(node => [node.x, node.y, node.vx, node.vy].every(Number.isFinite)));
  const stopped = packForcePositions(state); const ticks = state.ticks;
  assert.equal(stepForceGraph(state), false); assert.equal(state.ticks, ticks);
  assert.deepEqual(packForcePositions(state), stopped);
  reheatForceGraph(state); assert.equal(state.settled, false); stepForceGraph(state); assert.equal(state.ticks, ticks + 1);
});

test('Barnes-Hut traversal is substantially below all-pairs work at 2,000 and 10,000 notes', () => {
  for (const count of [2000, 10000]) {
    const state = createForceGraph(model(count));
    stepForceGraph(state);
    assert.ok(state.visits < count * count / 5, `${count} notes used ${state.visits} quadtree cell visits`);
    assert.ok(state.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  }
});

test('link distance and attraction affect real connected notes while zero forces leave positions alone', () => {
  const input = model(2);
  const shorter = createForceGraph(input); const longer = createForceGraph(input);
  for (const state of [shorter, longer]) { state.nodes[0].x = -40; state.nodes[0].y = 0; state.nodes[1].x = 40; state.nodes[1].y = 0; }
  stepForceGraph(shorter, { centerForce: 0, repelForce: 0, linkForce: 1, linkDistance: 20 });
  stepForceGraph(longer, { centerForce: 0, repelForce: 0, linkForce: 1, linkDistance: 150 });
  assert.ok(shorter.nodes[1].x - shorter.nodes[0].x < 80);
  assert.ok(longer.nodes[1].x - longer.nodes[0].x > 80);
  const still = createForceGraph(input); const before = packForcePositions(still);
  stepForceGraph(still, { centerForce: 0, repelForce: 0, linkForce: 0 }); assert.deepEqual(packForcePositions(still), before);
});

test('pinned dragging holds an exact point then releases into physics', () => {
  const state = createForceGraph(model(10));
  state.nodes[0].fx = 151; state.nodes[0].fy = -88;
  for (let tick = 0; tick < 10; tick++) stepForceGraph(state);
  assert.equal(state.nodes[0].x, 151); assert.equal(state.nodes[0].y, -88);
  state.nodes[0].fx = undefined; state.nodes[0].fy = undefined;
  stepForceGraph(state); assert.notEqual(state.nodes[0].x, 151);
});

test('invalid links are excluded and coincident notes remain finite', () => {
  const input = model(5); input.edges.push({ source: 'missing', target: input.nodes[0].id });
  const state = createForceGraph(input); assert.equal(state.edges.length, 5);
  state.nodes.forEach(node => { node.x = 0; node.y = 0; });
  for (let tick = 0; tick < 3; tick++) stepForceGraph(state);
  assert.ok(state.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
});

test('camera fit contains all note positions and cursor-centered zoom preserves world point', () => {
  const points = new Float32Array([-300, -200, 300, 200]);
  const view = fitForceCamera(points, 800, 600);
  for (let index = 0; index < points.length; index += 2) {
    const x = points[index] * view.scale + view.x; const y = points[index + 1] * view.scale + view.y;
    assert.ok(x >= 40 && x <= 760); assert.ok(y >= 40 && y <= 560);
  }
  const cursor = { x: 219, y: 177 };
  const next = zoomForceCamera(view, 1.6, cursor.x, cursor.y);
  assert.ok(Math.abs((cursor.x - view.x) / view.scale - (cursor.x - next.x) / next.scale) < .000001);
  assert.ok(Math.abs((cursor.y - view.y) / view.scale - (cursor.y - next.y) / next.scale) < .000001);
  assert.equal(zoomForceCamera(view, 100000, 0, 0).scale, 8);
  assert.equal(zoomForceCamera(view, .000001, 0, 0).scale, .03);
  assert.deepEqual(fitForceCamera([], 800, 600), { x: 400, y: 300, scale: 1 });
});

test('display settings are bounded and node radii grow with real connection degree', () => {
  const settings = normalizeForceSettings({ centerForce: Infinity, repelForce: -3, linkForce: 100, linkDistance: NaN, nodeSize: 0 });
  assert.equal(settings.centerForce, .12); assert.equal(settings.repelForce, 0); assert.equal(settings.linkForce, 2); assert.equal(settings.linkDistance, 70); assert.equal(settings.nodeSize, .25);
  assert.ok(graphNodeRadius(12) > graphNodeRadius(1)); assert.ok(graphNodeRadius(10000) <= 10);
});
