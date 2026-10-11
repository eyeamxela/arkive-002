import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodeGraph } from '../../src/personal/codeGraphModel.mjs';

function graph() {
  return { format: 'arkive-code-graph', version: 1, repository: 'project', truncated: false,
    nodes: [{ id: 'file', label: 'app.ts', type: 'File', filePath: 'src/app.ts' },
      { id: 'function', label: 'start', type: 'Function', filePath: 'src/app.ts', community: 'runtime' }],
    edges: [{ source: 'file', target: 'function', type: 'CONTAINS' }] };
}
const parse = value => parseCodeGraph(JSON.stringify(value));

test('accepts a bounded, typed GitNexus snapshot with exact endpoints', () => {
  const value = graph();
  assert.deepEqual(parse(value), value);
});

test('rejects malformed JSON and non-record snapshots without throwing', () => {
  for (const value of [null, [], true, 'snapshot', 1]) assert.equal(parse(value), null);
  assert.equal(parseCodeGraph('{'), null);
  assert.equal(parseCodeGraph(undefined), null);
  assert.equal(parseCodeGraph(' '.repeat(1024 * 1024 + 1)), null);
});

test('requires the snapshot discriminator, version, provenance label and truncation flag', () => {
  for (const [field, invalid] of [['format', 'other'], ['version', '1'], ['version', 2],
    ['repository', {}], ['repository', ' '], ['truncated', 'false'], ['nodes', {}], ['edges', null]]) {
    assert.equal(parse({ ...graph(), [field]: invalid }), null, field);
  }
  const value = graph(); delete value.truncated;
  assert.equal(parse(value), null);
});

test('rejects unsafe node field shapes, unknown keys and duplicate IDs', () => {
  for (const [field, invalid] of [['id', 1], ['label', {}], ['type', null], ['filePath', []],
    ['community', 1], ['label', ''], ['id', 'x'.repeat(1025)]]) {
    const value = graph(); value.nodes[0] = { ...value.nodes[0], [field]: invalid };
    assert.equal(parse(value), null, field);
  }
  const duplicate = graph(); duplicate.nodes.push(duplicate.nodes[0]);
  assert.equal(parse(duplicate), null);
  const unknown = graph(); unknown.nodes[0].html = '<script />';
  assert.equal(parse(unknown), null);
  assert.equal(parse({ ...graph(), extra: true }), null);
});

test('rejects dangling relationships and incorrectly typed edge fields', () => {
  for (const [field, invalid] of [['source', 'missing'], ['target', 'missing'], ['source', {}],
    ['target', 4], ['type', {}], ['type', '']]) {
    const value = graph(); value.edges[0] = { ...value.edges[0], [field]: invalid };
    assert.equal(parse(value), null, field);
  }
});

test('hard limits accept 500 nodes / 1500 edges and reject larger snapshots', () => {
  const value = graph();
  value.nodes = Array.from({ length: 500 }, (_, index) => ({ id: `n${index}`, label: `N${index}`, type: 'Function' }));
  value.edges = Array.from({ length: 1500 }, (_, index) => ({ source: `n${index % 500}`, target: `n${(index + 1 + Math.floor(index / 500)) % 500}`, type: 'CALLS' }));
  assert.ok(parse(value));
  assert.equal(parse({ ...value, nodes: [...value.nodes, { id: 'overflow', label: 'N', type: 'Function' }] }), null);
  assert.equal(parse({ ...value, edges: [...value.edges, value.edges[0]] }), null);
});

test('self calls and multiple real relationship types are retained without inference', () => {
  const value = graph();
  value.edges.push({ source: 'function', target: 'function', type: 'CALLS' });
  value.edges.push({ source: 'file', target: 'function', type: 'EXPORTS' });
  assert.deepEqual(parse(value).edges, value.edges);
});

test('client parser matches backend field limits, control-character restrictions and relative source paths', () => {
  const valid = graph(); valid.nodes[0].id = 'x'.repeat(1024); valid.edges[0].source = valid.nodes[0].id;
  assert.ok(parse(valid));
  for (const [field, invalid] of [['type', 't'.repeat(65)], ['community', 'c'.repeat(257)],
    ['filePath', '../escape.ts'], ['filePath', '/absolute.ts'], ['filePath', '.hidden/file.ts'],
    ['filePath', 'file%20name.ts'], ['label', 'line\nbreak']]) {
    const value = graph(); value.nodes[0] = { ...value.nodes[0], [field]: invalid };
    assert.equal(parse(value), null, `${field}: ${invalid}`);
  }
  for (const repository of ['owner/repository', '..', 'a..b', 'a'.repeat(101)]) assert.equal(parse({ ...graph(), repository }), null);
  const duplicate = graph(); duplicate.edges.push(duplicate.edges[0]);
  assert.equal(parse(duplicate), null);
});

test('size bound counts UTF-8 bytes, not UTF-16 character length', () => {
  const value = graph();
  value.nodes = Array.from({ length: 500 }, (_, index) => ({ id: `n${index}`, label: '界'.repeat(512), type: 'Function', community: '界'.repeat(256) }));
  value.edges = [];
  const encoded = JSON.stringify(value);
  assert.ok(encoded.length < 1024 * 1024);
  assert.ok(Buffer.byteLength(encoded) > 1024 * 1024);
  assert.equal(parseCodeGraph(encoded), null);
});
