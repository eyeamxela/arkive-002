import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodeTree, codeGroupColor, deriveStaticCallPaths, prepareCodeExplorer } from '../../src/personal/codeExplorerModel.mjs';

const fixture = () => ({ format: 'arkive-code-graph', version: 1, repository: 'example', truncated: false,
  nodes: [
    { id: 'file', label: 'context.ts', type: 'File', filePath: 'src/core/context.ts' },
    { id: 'compile', label: 'compileContext', type: 'Function', filePath: 'src/core/context.ts', community: 'Context' },
    { id: 'scope', label: 'checkScope', type: 'Function', filePath: 'src/core/permissions.ts', community: 'Access' },
    { id: 'retrieve', label: 'retrieveSources', type: 'Function', filePath: 'src/core/retrieval.ts', community: 'Retrieval' },
    { id: 'dispatch', label: 'dispatch', type: 'Function', filePath: 'src/agents/dispatch.ts', community: 'Agents' },
    { id: 'unused', label: 'unlocated', type: 'Class' },
  ], edges: [
    { source: 'file', target: 'compile', type: 'CONTAINS' },
    { source: 'compile', target: 'scope', type: 'CALLS' },
    { source: 'scope', target: 'retrieve', type: 'CALLS' },
    { source: 'retrieve', target: 'dispatch', type: 'CALLS' },
    { source: 'dispatch', target: 'compile', type: 'IMPORTS' },
  ] });

test('repository tree derives only exported file paths and retains all actual symbols', () => {
  const graph = fixture(); const before = JSON.stringify(graph);
  const tree = buildCodeTree(graph.nodes);
  assert.equal(tree.fileCount, 4);
  assert.equal(tree.root.directories[0].name, 'src');
  const directories = tree.root.directories[0].directories;
  assert.deepEqual(directories.map(item => item.name), ['agents', 'core']);
  assert.equal(directories[1].files[0].path, 'src/core/context.ts');
  assert.deepEqual(directories[1].files[0].nodes.map(node => node.id), ['file', 'compile']);
  assert.deepEqual(tree.unlocated.map(node => node.id), ['unused']);
  assert.equal(JSON.stringify(graph), before);
});

test('root-level files and pathless symbols stay distinct; labels never create files', () => {
  const graph = fixture(); graph.nodes.push({ id: 'root', label: 'Root', type: 'File', filePath: 'index.ts' });
  graph.nodes.push({ id: 'looks-like-path', label: 'src/core/context.ts', type: 'Function' });
  const tree = buildCodeTree(graph.nodes);
  assert.equal(tree.root.files[0].path, 'index.ts');
  assert.equal(tree.fileCount, 5);
  assert.ok(tree.unlocated.some(node => node.id === 'looks-like-path'));
});

test('view keeps disconnected nodes, direction, multiple edge types and self calls', () => {
  const graph = fixture();
  graph.edges.push({ source: 'scope', target: 'compile', type: 'CALLS' });
  graph.edges.push({ source: 'compile', target: 'scope', type: 'REFERENCES' });
  graph.edges.push({ source: 'compile', target: 'compile', type: 'CALLS' });
  const view = prepareCodeExplorer(graph);
  assert.equal(view.model.nodes.length, 6);
  assert.ok(view.model.nodes.some(node => node.id === 'unused' && node.degree === 0));
  assert.deepEqual(view.model.edges.find(edge => edge.source === 'compile' && edge.target === 'scope').kinds, ['CALLS', 'REFERENCES']);
  assert.ok(view.model.edges.some(edge => edge.source === 'scope' && edge.target === 'compile'));
  assert.ok(view.model.edges.some(edge => edge.source === 'compile' && edge.target === 'compile'));
  assert.equal(view.edges.length, graph.edges.length);
});

test('search, type, community and relationship filters are exact and do not infer edges', () => {
  const graph = fixture();
  assert.deepEqual(prepareCodeExplorer(graph, { search: 'PeRmiSsIoNs' }).nodes.map(node => node.id), ['scope']);
  assert.deepEqual(prepareCodeExplorer(graph, { community: 'Context', type: 'Function' }).nodes.map(node => node.id), ['compile']);
  const view = prepareCodeExplorer(graph, { relationship: 'CALLS', type: 'Function' });
  assert.equal(view.model.nodes.length, 4);
  assert.equal(view.edges.length, 3);
  assert.ok(view.edges.every(edge => edge.type === 'CALLS'));
  assert.equal(prepareCodeExplorer(graph, { search: 'nonexistent' }).nodes.length, 0);
  assert.equal(prepareCodeExplorer(graph, { type: 'Method' }).edges.length, 0);
});

test('selected-neighbor filter honors other filters and keeps a selected isolated node', () => {
  const graph = fixture();
  assert.deepEqual(prepareCodeExplorer(graph, { selectedId: 'scope', local: true }).nodes.map(node => node.id), ['compile', 'scope', 'retrieve']);
  assert.deepEqual(prepareCodeExplorer(graph, { selectedId: 'unused', local: true }).nodes.map(node => node.id), ['unused']);
  assert.equal(prepareCodeExplorer(graph, { search: 'dispatch', selectedId: 'scope', local: true }).nodes[0].id, 'dispatch');
});

test('all 500 permitted nodes reach the canvas model, with honest defensive clipping', () => {
  const graph = fixture();
  graph.nodes = Array.from({ length: 501 }, (_, index) => ({ id: 'n' + index, label: 'node' + index, type: 'Function' }));
  graph.edges = Array.from({ length: 1501 }, (_, index) => ({ source: 'n' + (index % 499), target: 'n' + ((index + 1) % 499), type: 'edge' + index }));
  const view = prepareCodeExplorer(graph);
  assert.equal(view.model.nodes.length, 500);
  assert.equal(view.edges.length, 1500);
  assert.equal(view.clipped, true);
  assert.equal(view.model.omittedObjects, 1);
  assert.equal(view.model.edgeLimitReached, true);
});

test('static paths follow CALLS only, never IMPORTS or invented process order', () => {
  const graph = fixture();
  const result = deriveStaticCallPaths(graph, 'compile');
  assert.deepEqual(result.paths, [{ ids: ['compile', 'scope', 'retrieve', 'dispatch'], end: 'leaf' }]);
  assert.equal(result.truncated, false);
  assert.deepEqual(deriveStaticCallPaths(graph, 'file').paths, []);
  assert.deepEqual(deriveStaticCallPaths(graph, 'unused').paths, []);
  assert.deepEqual(deriveStaticCallPaths(graph, 'unknown').paths, []);
});

test('cycles and self calls stop explicitly instead of hanging or fabricating leaves', () => {
  const graph = fixture();
  graph.edges.push({ source: 'dispatch', target: 'compile', type: 'CALLS' });
  assert.deepEqual(deriveStaticCallPaths(graph, 'compile').paths, [{ ids: ['compile', 'scope', 'retrieve', 'dispatch', 'compile'], end: 'cycle' }]);
  graph.edges = [{ source: 'compile', target: 'compile', type: 'CALLS' }];
  assert.deepEqual(deriveStaticCallPaths(graph, 'compile').paths, [{ ids: ['compile', 'compile'], end: 'cycle' }]);
});

test('branching paths are stable across input order and bounded by count, depth and work', () => {
  const graph = fixture();
  graph.nodes = Array.from({ length: 50 }, (_, index) => ({ id: 'n' + String(index).padStart(2, '0'), label: 'N' + index, type: 'Function' }));
  graph.edges = graph.nodes.slice(1).map(node => ({ source: 'n00', target: node.id, type: 'CALLS' }));
  const result = deriveStaticCallPaths(graph, 'n00');
  assert.equal(result.paths.length, 12); assert.equal(result.truncated, true);
  assert.deepEqual(deriveStaticCallPaths({ ...graph, edges: [...graph.edges].reverse() }, 'n00'), result);
  const bounded = deriveStaticCallPaths(graph, 'n00', { maxVisits: 2 });
  assert.ok(bounded.visits <= 2); assert.equal(bounded.truncated, true);
  graph.edges = graph.nodes.slice(1).map((node, index) => ({ source: graph.nodes[index].id, target: node.id, type: 'CALLS' }));
  const deep = deriveStaticCallPaths(graph, 'n00');
  assert.equal(deep.paths[0].ids.length, 7); assert.equal(deep.paths[0].end, 'depth-limit'); assert.equal(deep.truncated, true);
});

test('group colors and grouping modes are stable and do not alter graph semantics', () => {
  const graph = fixture();
  assert.match(codeGroupColor('Context'), /^#[0-9a-f]{6}$/);
  assert.equal(codeGroupColor('Context'), codeGroupColor('Context'));
  assert.equal(prepareCodeExplorer(graph).model.nodes.find(node => node.id === 'compile').group, 'Context');
  assert.equal(prepareCodeExplorer(graph, { grouping: 'type' }).model.nodes.find(node => node.id === 'compile').group, 'Function');
  assert.deepEqual(prepareCodeExplorer(graph).model.edges, prepareCodeExplorer(graph, { grouping: 'type' }).model.edges);
});
