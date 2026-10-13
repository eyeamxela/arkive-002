import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { constants } from 'node:fs';
import { validateCodeGraph, exportGitNexus, listGitNexusRepositories } from '../codegraph.mjs';

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
  for (const stdout of ['not json',
    JSON.stringify({ row_count: 1, markdown: '| row |\n| --- |\n| invalid |' }),
    JSON.stringify({ row_count: 0, markdown: '| row |\n| --- |\n| {} |' })]) {
    await assert.rejects(exportGitNexus('example-brain', { run: async () => ({ stdout }) }), { code: 'CODEGRAPH_EXPORT' });
  }
  let call = 0;
  await assert.rejects(exportGitNexus('example-brain', { run: async () => rows(++call === 1 ? [graph().nodes[0]] : graph().edges) }), { code: 'CODEGRAPH_EXPORT' });
});

test('export gives actionable sanitized runtime/index errors and supplies its trusted node PATH', async (t) => {
  const previous = process.env.PATH;
  t.after(() => { if (previous === undefined) delete process.env.PATH; else process.env.PATH = previous; });
  process.env.PATH = '/usr/bin:/bin';
  await exportGitNexus('example-brain', { run: async (binary, args, options) => {
    assert.equal(options.env.PATH, `${path.dirname(process.execPath)}${path.delimiter}/usr/bin:/bin`);
    assert.equal(process.env.PATH, '/usr/bin:/bin');
    assert.equal(options.shell, false);
    return rows([]);
  } });
  for (const [underlying, expected] of [
    [{ code: 'ENOENT' }, 'CODEGRAPH_EXECUTABLE'], [{ code: 'EACCES' }, 'CODEGRAPH_EXECUTABLE'],
    [{ killed: true }, 'CODEGRAPH_TIMEOUT'], [{ code: 'ETIMEDOUT' }, 'CODEGRAPH_TIMEOUT'],
    [{ code: 127 }, 'CODEGRAPH_RUNTIME'],
  ]) await assert.rejects(exportGitNexus('example-brain', { run: async () => {
    throw Object.assign(new Error('private source path and secret'), underlying, { stderr: 'private source path and secret' });
  } }), error => error.code === expected && !error.message.includes('private source'));
  await assert.rejects(exportGitNexus('example-brain', { run: async () => ({ stdout: JSON.stringify({ error: 'private path in underlying index failure' }) }) }),
    error => error.code === 'CODEGRAPH_INDEX_UNAVAILABLE' && !error.message.includes('private path'));
});

async function registryFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkive-gitnexus-registry-'));
  const previous = process.env.GITNEXUS_HOME;
  process.env.GITNEXUS_HOME = root;
  t.after(async () => { if (previous === undefined) delete process.env.GITNEXUS_HOME; else process.env.GITNEXUS_HOME = previous; await fs.rm(root, { recursive: true, force: true }); });
  return { root, registry: path.join(root, 'registry.json') };
}

test('registry discovery is bounded read-only metadata and omits private paths and ambiguous names', async (t) => {
  const { registry } = await registryFixture(t);
  assert.deepEqual(await listGitNexusRepositories(), { repositories: [], skipped: 0 });
  const raw = JSON.stringify([
    { name: 'zeta', path: '/private/source/location', storagePath: '/private/index/location', indexedAt: '2026-10-11T17:00:00.000Z', stats: { nodes: 4, edges: 3, files: 2 }, token: 'private-credential' },
    { name: 'Alpha', stats: { nodes: -1, edges: '2', files: 0 }, indexedAt: 'invalid date' },
    { name: 'duplicate', path: '/a' }, { name: 'Duplicate', path: '/b' },
    { name: '../outside' }, { name: '--option' }, null,
  ]);
  await fs.writeFile(registry, raw);
  const before = await fs.stat(registry);
  assert.deepEqual(await listGitNexusRepositories(), { repositories: [
    { name: 'Alpha', files: 0 }, { name: 'zeta', indexedAt: '2026-10-11T17:00:00.000Z', nodes: 4, edges: 3, files: 2 },
  ], skipped: 5 });
  assert.equal(await fs.readFile(registry, 'utf8'), raw);
  assert.equal((await fs.stat(registry)).mtimeMs, before.mtimeMs);
});

test('registry discovery distinguishes bad, oversized and unsafe configuration from an empty registry', async (t) => {
  const { root, registry } = await registryFixture(t);
  for (const raw of ['', '{broken private detail', '{}', 'null', ' '.repeat(1024 * 1024 + 1),
    JSON.stringify(Array.from({ length: 1001 }, (_, index) => ({ name: `repo-${index}` })))]) {
    await fs.writeFile(registry, raw);
    await assert.rejects(listGitNexusRepositories(), error => error.code === 'CODEGRAPH_REGISTRY' && error.status === 503 && !error.message.includes(root));
  }
  await fs.writeFile(registry, '[]');
  assert.deepEqual(await listGitNexusRepositories(), { repositories: [], skipped: 0 });
  await fs.unlink(registry); await fs.symlink(path.join(root, 'missing.json'), registry);
  await assert.rejects(listGitNexusRepositories(), { code: 'CODEGRAPH_REGISTRY' });
  process.env.GITNEXUS_HOME = './relative-untrusted';
  await assert.rejects(listGitNexusRepositories(), { code: 'CODEGRAPH_REGISTRY' });
});

test('registry discovery rejects a FIFO without waiting for a writer', { skip: process.platform === 'win32' || !constants.O_NONBLOCK, timeout: 5000 }, async (t) => {
  const { root, registry } = await registryFixture(t);
  const run = promisify(execFile);
  try { await run('/usr/bin/mkfifo', [registry], { timeout: 1000 }); }
  catch (error) { if (error.code === 'ENOENT') { t.skip('The system mkfifo executable is unavailable'); return; } throw error; }
  const moduleUrl = new URL('../codegraph.mjs', import.meta.url).href;
  // Run the potentially blocking open in a disposable process: a regression is
  // killed by execFile timeout instead of leaving the test runner's I/O hung.
  const script = `import { listGitNexusRepositories } from ${JSON.stringify(moduleUrl)};
    try { await listGitNexusRepositories(); process.exitCode = 1; }
    catch (error) { if (error.code !== 'CODEGRAPH_REGISTRY') throw error; console.log(error.code); }`;
  const result = await run(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, GITNEXUS_HOME: root }, timeout: 1500 });
  assert.equal(result.stdout.trim(), 'CODEGRAPH_REGISTRY');
  assert.equal((await fs.lstat(registry)).isFIFO(), true, 'Discovery leaves the registry untouched');
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
