import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCodeGraph, exportGitNexus } from '../codegraph.mjs';

const graph = () => ({ format: 'arkive-code-graph', version: 1, repository: 'example-brain', truncated: false,
  nodes: [{ id: 'one', label: 'Alpha', type: 'Function', filePath: 'src/alpha.mjs', community: 'c1' },
    { id: 'two', label: 'Beta | odd "name"', type: 'Function' }],
  edges: [{ source: 'one', target: 'two', type: 'CALLS' }] });
const rows = (values) => ({ stdout: JSON.stringify(values.length ? { markdown: ['| row |', '| --- |',
  ...values.map((value) => `| ${JSON.stringify(value)} |`)].join('\n'), row_count: values.length } : []) });

test('portable code graph validation returns a detached strict data-only graph', () => {
  const input = graph(); const validated = validateCodeGraph(input);
  assert.deepEqual(validated, input); input.nodes[0].label = 'changed';
  assert.equal(validated.nodes[0].label, 'Alpha');
  assert.deepEqual(validateCodeGraph({ ...graph(), nodes: [], edges: [] }).nodes, []);
});

test('graph rejects dangling and duplicate edges/nodes, invalid formats and unknown keys', () => {
  const bad = [
    { ...graph(), format: 'untrusted' }, { ...graph(), version: 2 }, { ...graph(), script: 'alert(1)' },
    { ...graph(), nodes: [...graph().nodes, graph().nodes[0]] },
    { ...graph(), edges: [{ source: 'one', target: 'missing', type: 'CALLS' }] },
    { ...graph(), edges: [graph().edges[0], graph().edges[0]] },
    { ...graph(), edges: [{ ...graph().edges[0], extra: 'unwanted' }] },
    { ...graph(), nodes: [{ ...graph().nodes[0], html: '<b>bad</b>' }], edges: [] },
    { ...graph(), truncated: 'false' }, { ...graph(), repository: '--injection' },
  ];
  for (const input of bad) assert.throws(() => validateCodeGraph(input), { code: 'CODEGRAPH_INVALID' });
});

test('graph enforces byte, node, edge and path bounds', () => {
  assert.throws(() => validateCodeGraph({ ...graph(), nodes: Array.from({ length: 501 }, (_, index) => ({ id: `${index}`, label: 'n', type: 'File' })) }), { code: 'CODEGRAPH_INVALID' });
  assert.throws(() => validateCodeGraph({ ...graph(), edges: Array.from({ length: 1501 }, () => graph().edges[0]) }), { code: 'CODEGRAPH_INVALID' });
  assert.throws(() => validateCodeGraph({ ...graph(), extra: 'x'.repeat(1024 * 1024) }), { code: 'CODEGRAPH_INVALID' });
  for (const filePath of ['/abs.md', '../outside.md', 'dir/../outside.md', 'dir/.secret', 'C:\\file.md', 'dir\nfile.md']) {
    assert.throws(() => validateCodeGraph({ ...graph(), nodes: [{ ...graph().nodes[0], filePath }], edges: [] }), { code: 'CODEGRAPH_INVALID' });
  }
  const circular = graph(); circular.loop = circular;
  assert.throws(() => validateCodeGraph(circular), { code: 'CODEGRAPH_INVALID' });
});

test('GitNexus export uses only fixed executable/queries and safely parses JSON in Markdown', async () => {
  const calls = [];
  const output = await exportGitNexus('example-brain', { run: async (binary, args, options) => {
    calls.push({ binary, args, options });
    assert.equal(binary, '/opt/homebrew/bin/gitnexus');
    assert.deepEqual(args.slice(0, 3), ['cypher', '--repo', 'example-brain']);
    assert.equal(options.shell, false); assert.equal(options.timeout, 15000);
    return calls.length === 1 ? rows(graph().nodes) : rows(graph().edges);
  } });
  assert.deepEqual(output, graph());
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ args }) => args[3].startsWith('MATCH (n)') && !args[3].includes('example-brain')));
});

test('export drops null optional properties and reports bounded truncation', async () => {
  const nodes = Array.from({ length: 501 }, (_, index) => ({ id: `${index}`, label: 'n', type: 'File', filePath: null, community: null }));
  const output = await exportGitNexus('example-brain', { run: async (binary, args) => {
    if (args[3].includes('AS selected')) return rows([]);
    const [, start, limit] = args[3].match(/SKIP (\d+) LIMIT (\d+)/);
    return rows(nodes.slice(Number(start), Number(start) + Number(limit)));
  } });
  assert.equal(output.nodes.length, 500); assert.equal(output.truncated, true);
  assert.deepEqual(output.nodes[0], { id: '0', label: 'n', type: 'File' });
});

test('export fails closed on command failure, unsafe repo, malformed rows, and index races', async () => {
  await assert.rejects(exportGitNexus('example-brain', { run: async () => { throw new Error('sensitive underlying process details'); } }),
    (error) => error.code === 'CODEGRAPH_UNAVAILABLE' && !error.message.includes('sensitive'));
  for (const repository of ['--repo', '../folder', 'x; echo bad', 'x/y', 'x\nfoo', 'x'.repeat(101)]) {
    await assert.rejects(exportGitNexus(repository, { run: async () => assert.fail('must not execute') }), { code: 'CODEGRAPH_REPOSITORY' });
  }
  for (const stdout of ['not json', JSON.stringify({ error: 'index missing' }),
    JSON.stringify({ row_count: 1, markdown: '| row |\n| --- |\n| invalid |' }),
    JSON.stringify({ row_count: 0, markdown: '| row |\n| --- |\n| {} |' })]) {
    await assert.rejects(exportGitNexus('example-brain', { run: async () => ({ stdout }) }), { code: 'CODEGRAPH_EXPORT' });
  }
  let call = 0;
  await assert.rejects(exportGitNexus('example-brain', { run: async () => rows(++call === 1 ? [graph().nodes[0]] : graph().edges) }), { code: 'CODEGRAPH_EXPORT' });
});

test('export cancellation aborts before dispatch and between pages and reaches execFile', async () => {
  const already = new AbortController(); already.abort();
  await assert.rejects(exportGitNexus('example-brain', { signal: already.signal, run: async () => assert.fail('must not execute') }), { code: 'CODEGRAPH_CANCELLED' });
  const during = new AbortController(); let calls = 0;
  await assert.rejects(exportGitNexus('example-brain', { signal: during.signal, run: async (binary, args, options) => {
    calls++; assert.equal(options.signal, during.signal); during.abort();
    return rows(Array.from({ length: 100 }, (_, index) => ({ id: `${index}`, label: 'n', type: 'File' })));
  } }), { code: 'CODEGRAPH_CANCELLED' });
  assert.equal(calls, 1);
});

test('only a trusted absolute environment path can override the GitNexus executable', async (t) => {
  const previous = process.env.ARKIVE_GITNEXUS_PATH;
  t.after(() => { if (previous === undefined) delete process.env.ARKIVE_GITNEXUS_PATH; else process.env.ARKIVE_GITNEXUS_PATH = previous; });
  process.env.ARKIVE_GITNEXUS_PATH = '/usr/local/bin/gitnexus';
  await exportGitNexus('example-brain', { run: async (binary) => { assert.equal(binary, '/usr/local/bin/gitnexus'); return rows([]); }, executable: '/untrusted/ignored' });
  for (const executable of ['gitnexus', './gitnexus', '/usr/../bin/gitnexus', '/usr/bin/gitnexus\n']) {
    process.env.ARKIVE_GITNEXUS_PATH = executable;
    await assert.rejects(exportGitNexus('example-brain', { run: async () => assert.fail('must not execute') }), { code: 'CODEGRAPH_UNAVAILABLE' });
  }
});
