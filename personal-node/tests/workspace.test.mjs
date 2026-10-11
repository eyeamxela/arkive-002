import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createNodeServer, decryptExport, encryptExport } from '../server.mjs';
import { emptyWorkspace, validateWorkspace, upsertWorkspace } from '../workspace.mjs';

const PASSWORD = 'synthetic workspace passphrase only';
const OWNER = 'synthetic-workspace-owner-0000000000000001';
const PEER = 'synthetic-workspace-peer-00000000000000001';
const post = (body) => ({ method: 'POST', body });

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'arkive-workspace-')));
  const stops = [];
  t.after(async () => { for (const stop of stops.reverse()) await stop(); await fs.rm(root, { recursive: true, force: true }); });
  const node = async (name) => {
    const instance = await createNodeServer({ directory: path.join(root, name), host: '127.0.0.1', port: 0,
      token: OWNER, syncToken: PEER, provider: {} });
    const address = await instance.start(); stops.push(() => instance.close());
    const request = (route, { method = 'GET', body, token = OWNER, headers = {} } = {}) => new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${address.port}${route}`, { method, signal: AbortSignal.timeout(15000),
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers } }, (res) => {
        const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('error', reject);
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch (error) { reject(error); } });
      });
      req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
    });
    const ok = async (route, options, expected = 200) => {
      const result = await request(route, options); assert.equal(result.status, expected, `${route}: ${JSON.stringify(result.body)}`); return result.body;
    };
    return { request, ok, directory: instance.directory,
      create: () => ok('/v1/unlock', post({ passphrase: PASSWORD, create: true, name: 'Synthetic Workspace', template: 'personal' })),
      save: (category, input) => ok(`/v1/workspace/${category}`, post(input)) };
  };
  return { root, node };
}

async function createWorkspace(a) {
  const source = await a.ok('/v1/objects', post({ title: 'Synthetic evidence', text: 'Original private evidence' }), 201);
  const agent = await a.save('agents', { name: 'Research profile', description: 'Saved context defaults; no tool execution', providerId: 'openai-compatible', sourceIds: [source.id] });
  const task = await a.save('tasks', { title: 'Review private evidence', description: 'Owner review required', status: 'review', sourceIds: [source.id], agentId: agent.id });
  const manifest = await a.save('manifests', { name: 'Research manifest', description: 'Selected evidence bundle', sourceIds: [source.id] });
  const collection = await a.save('collections', { name: 'Reference library', description: 'Saved grouping', sourceIds: [source.id] });
  return { source, agent, task, manifest, collection };
}

test('workspace saves authenticated metadata, IDs, server timestamps, scope, and audit events', async (t) => {
  const { node } = await fixture(t); const a = await node('workspace'); await a.create();
  assert.deepEqual((await a.ok('/v1/brain')).workspace, emptyWorkspace());
  const records = await createWorkspace(a);
  const state = await a.ok('/v1/brain');
  for (const [category, record] of [['agents', records.agent], ['tasks', records.task], ['manifests', records.manifest], ['collections', records.collection]]) {
    assert.equal(state.workspace[category].length, 1);
    assert.deepEqual(state.workspace[category][0], record);
    assert.equal(record.createdAt, record.updatedAt);
    assert.equal(new Date(record.createdAt).toISOString(), record.createdAt);
    assert.ok(state.audit.some((event) => event.type === `workspace.${category}.created` && event.targetId === record.id));
  }
  assert.equal(state.objects.length, 1);
  assert.equal(state.rooms.length, 0);
  const changed = await a.save('tasks', { id: records.task.id, title: 'Reviewed task', status: 'done' });
  assert.equal(changed.id, records.task.id); assert.equal(changed.createdAt, records.task.createdAt);
  assert.ok(changed.updatedAt >= changed.createdAt); assert.equal(changed.description, records.task.description);
  assert.deepEqual(changed.sourceIds, [records.source.id]); assert.equal(changed.agentId, records.agent.id);
  const unassigned = await a.save('tasks', { id: changed.id, agentId: '' });
  assert.equal(Object.hasOwn(unassigned, 'agentId'), false);
  assert.ok((await a.ok('/v1/brain')).audit.some((event) => event.type === 'workspace.tasks.updated'));
  const defaults = await a.save('agents', { name: 'Context profile' });
  assert.equal(defaults.providerId, 'openai-compatible'); assert.equal(defaults.description, ''); assert.deepEqual(defaults.sourceIds, []);
  assert.equal((await a.save('tasks', { title: 'New task' })).status, 'todo');
});

test('workspace rejects credentials, invalid scopes, forged IDs/timestamps, and unauthorized requests atomically', async (t) => {
  const { node } = await fixture(t); const a = await node('invalid'); await a.create();
  const { source, agent, task } = await createWorkspace(a);
  const before = await a.ok('/v1/brain');
  const attempts = [
    ['tasks', { title: '' }], ['tasks', { title: 'too long'.repeat(30) }],
    ['tasks', { title: 'bad status', status: 'autonomous' }],
    ['tasks', { title: 'missing source', sourceIds: [`obj_${randomUUID()}`] }],
    ['tasks', { title: 'duplicate sources', sourceIds: [source.id, source.id] }],
    ['tasks', { title: 'bad agent', agentId: `agent_${randomUUID()}` }],
    ['tasks', { id: `task_${randomUUID()}`, title: 'forged create' }],
    ['tasks', { id: agent.id, title: 'wrong record type' }],
    ['tasks', { id: task.id, createdAt: '2020-01-01T00:00:00.000Z' }],
    ['tasks', { id: task.id, updatedAt: '2099-01-01T00:00:00.000Z' }],
    ['agents', { name: 'secret credential', apiKey: 'must-not-persist' }],
    ['agents', { name: 'token', token: 'must-not-persist' }],
    ['agents', { name: 'endpoint', providerId: 'https://attacker.invalid' }],
    ['agents', { name: 'tools', tools: ['shell'] }],
    ['agents', { name: 'cron', schedule: '* * * * *' }],
    ['manifests', { name: 'bad text', description: 'x'.repeat(8001) }],
    ['collections', { name: 'bad source', sourceIds: ['not-an-object-id'] }],
    ['collections', JSON.parse('{"name":"prototype","__proto__":{"polluted":true}}')],
  ];
  for (const [category, input] of attempts) {
    const result = await a.request(`/v1/workspace/${category}`, post(input));
    assert.ok([400, 404].includes(result.status), JSON.stringify(result));
  }
  for (const token of [null, PEER, 'wrong']) assert.equal((await a.request('/v1/workspace/tasks', { ...post({ title: 'Denied' }), token })).status, 401);
  for (const category of ['constructor', '__proto__', 'prototype', 'toString']) {
    assert.equal((await a.request(`/v1/workspace/${category}`, post({}))).status, 404);
  }
  assert.equal((await a.request('/v1/workspace/tasks', { ...post({ title: 'Cross origin' }), headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  assert.equal((await a.request('/v1/workspace/tasks', { method: 'DELETE' })).status, 404);
  assert.deepEqual(await a.ok('/v1/brain'), before);
  await a.ok('/v1/lock', post({}));
  assert.equal((await a.request('/v1/workspace/tasks', post({ title: 'Locked' }))).status, 423);
});

test('workspace is encrypted at rest, survives reopen and encrypted export/restore, but not peer replication', async (t) => {
  const { node } = await fixture(t); const a = await node('original'); await a.create();
  const { task } = await createWorkspace(a);
  const expected = (await a.ok('/v1/brain')).workspace;
  const raw = await fs.readFile(path.join(a.directory, 'brain.enc'), 'utf8');
  for (const marker of ['Research profile', 'Review private evidence', 'Reference library', 'Owner review required']) assert.ok(!raw.includes(marker));
  await a.ok('/v1/lock', post({})); await a.ok('/v1/unlock', post({ passphrase: PASSWORD }));
  assert.deepEqual((await a.ok('/v1/brain')).workspace, expected);
  const encrypted = await a.ok('/v1/export'); const bundle = await decryptExport(encrypted, PASSWORD);
  assert.deepEqual(bundle.state.workspace, expected); assert.ok(!JSON.stringify(encrypted).includes(task.title));
  const b = await node('restored'); await b.ok('/v1/restore', post({ passphrase: PASSWORD, bundle: encrypted }));
  assert.deepEqual((await b.ok('/v1/brain')).workspace, expected);
  const replica = await a.ok('/v1/replica', { token: PEER });
  assert.deepEqual(replica.state.workspace, emptyWorkspace());
  assert.ok(!JSON.stringify(replica).includes('Research profile'));
  await b.save('tasks', { id: task.id, title: 'Other operator local choice' });
  const incoming = await decryptExport(await b.ok('/v1/export'), PASSWORD);
  await a.ok('/v1/replica', { ...post({ bundle: incoming }), token: PEER });
  assert.deepEqual((await a.ok('/v1/brain')).workspace, expected);
});

test('legacy version-one Brain exports remain restorable without workspace metadata', async (t) => {
  const { node } = await fixture(t); const a = await node('legacy'); await a.create();
  const bundle = await a.ok('/v1/export'); const plain = await decryptExport(bundle, PASSWORD);
  assert.equal(Object.hasOwn(plain.state, 'workspace'), false);
  const b = await node('legacy-restored'); await b.ok('/v1/restore', post({ passphrase: PASSWORD, bundle }));
  assert.deepEqual((await b.ok('/v1/brain')).workspace, emptyWorkspace());
  assert.equal((await b.save('tasks', { title: 'First saved workspace task' })).status, 'todo');
});

test('restore rejects malformed workspace metadata before accepting an encrypted bundle', async (t) => {
  const { node } = await fixture(t); const a = await node('valid-bundle'); await a.create(); await createWorkspace(a);
  const valid = await decryptExport(await a.ok('/v1/export'), PASSWORD);
  const changes = [
    (value) => value.workspace.tasks.push(structuredClone(value.workspace.tasks[0])),
    (value) => { value.workspace.agents[0].createdAt = 'not-a-date'; },
    (value) => { value.workspace.tasks[0].updatedAt = '2000-01-01T00:00:00.000Z'; },
    (value) => { value.workspace.tasks[0].agentId = `agent_${randomUUID()}`; },
    (value) => { value.workspace.collections[0].sourceIds = [`obj_${randomUUID()}`]; },
    (value) => { value.workspace.agents[0].token = 'must-not-restore'; },
    (value) => { value.workspace.tasks[0].id = value.workspace.agents[0].id; },
    (value) => { delete value.workspace.manifests; },
  ];
  for (const [index, change] of changes.entries()) {
    const invalid = structuredClone(valid); change(invalid.state);
    const b = await node(`invalid-restore-${index}`);
    const response = await b.request('/v1/restore', post({ passphrase: PASSWORD, bundle: await encryptExport(invalid, PASSWORD) }));
    assert.equal(response.status, 400); assert.match(response.body.error.code, /^WORKSPACE_/);
    assert.equal((await b.ok('/v1/status')).initialized, false);
  }
});

test('workspace validation enforces category/source bounds and rejects invalid timestamps or IDs', () => {
  const create = (prefix, name) => ({ id: `${prefix}_${randomUUID()}`, [name]: 'valid', description: '', sourceIds: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  for (const [category, maximum, prefix, name] of [['tasks', 500, 'task', 'title'], ['agents', 100, 'agent', 'name'], ['manifests', 200, 'manifest', 'name'], ['collections', 200, 'collection', 'name']]) {
    const value = emptyWorkspace();
    value[category] = Array.from({ length: maximum + 1 }, () => ({ ...create(prefix, name), ...(category === 'tasks' ? { status: 'todo' } : category === 'agents' ? { providerId: 'manual' } : {}) }));
    assert.throws(() => validateWorkspace(value, new Set()), { code: 'WORKSPACE_INVALID' });
  }
  const value = emptyWorkspace();
  value.tasks.push({ ...create('task', 'title'), status: 'todo', sourceIds: Array.from({ length: 1001 }, () => `obj_${randomUUID()}`) });
  assert.throws(() => validateWorkspace(value, new Set(value.tasks[0].sourceIds)), { code: 'WORKSPACE_REFERENCE' });
});

test('workspace core rejects prototype-key and non-string categories without prototype or state mutation', () => {
  const state = { objects: [], workspace: emptyWorkspace() };
  const before = structuredClone(state);
  const prototypeKeys = Reflect.ownKeys(Object.prototype);
  for (const category of ['constructor', '__proto__', 'prototype', 'toString', 'hasOwnProperty', '', null, {}, []]) {
    assert.throws(() => upsertWorkspace(state, category, {}), { code: 'WORKSPACE_INVALID' });
    assert.deepEqual(state, before);
    assert.deepEqual(Reflect.ownKeys(Object.prototype), prototypeKeys);
  }
});
