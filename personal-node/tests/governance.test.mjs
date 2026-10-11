import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { createNodeServer, decryptExport, encryptExport } from '../server.mjs';
import { openBrain } from '../brain.mjs';
import { approveRun, beginRun, emptyGovernance, governanceAction, validateGovernance } from '../governance.mjs';
import { executeApprovedRun } from '../execution.mjs';
import { MAX_BRAIN_BYTES } from '../limits.mjs';

const PASSWORD = 'synthetic governance passphrase only';
const OWNER = 'synthetic-governance-owner-000000000000001';
const PEER = 'synthetic-governance-peer-0000000000000001';
const KEY = 'synthetic-provider-key-never-persist';
const post = (body) => ({ method: 'POST', body });
const put = (body) => ({ method: 'PUT', body });
async function fixture(t, request) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'arkive-governance-')));
  const stops = []; const calls = [];
  t.after(async () => { for (const stop of stops.reverse()) await stop(); await fs.rm(root, { recursive: true, force: true }); });
  const node = async (name, overrides = {}) => {
    const instance = await createNodeServer({ directory: path.join(root, name), host: '127.0.0.1', port: 0,
      token: OWNER, syncToken: PEER, provider: { baseUrl: 'https://synthetic-provider.invalid/v1', model: 'synthetic-model', apiKey: KEY,
        request: async (url, options) => { calls.push({ url, ...options }); return request ? request(url, options) : { choices: [{ message: { content: 'Synthetic source-grounded answer' } }] }; }, ...overrides } });
    const address = await instance.start(); stops.push(() => instance.close());
    const ask = (route, { method = 'GET', body, token = OWNER } = {}) => new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${address.port}${route}`, { method, signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, (res) => {
        const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('error', reject);
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); } catch (error) { reject(error); } });
      }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
    });
    const ok = async (route, options, status = 200) => { const response = await ask(route, options); assert.equal(response.status, status, `${route}: ${JSON.stringify(response.body)}`); return response.body; };
    return { ask, ok, port: address.port, directory: instance.directory,
      create: () => ok('/v1/unlock', post({ passphrase: PASSWORD, create: true })),
      object: (title, sourceIds = []) => ok('/v1/objects', post({ title, text: `${title} contents`, sourceIds }), 201),
      room: (title) => ok('/v1/rooms', post({ title }), 201),
      member: (name) => ok('/v1/members', post({ name }), 201),
      select: (room, ids) => ok(`/v1/rooms/${room.id}/sources`, put({ objectIds: ids })),
      policy: (room, memberGrants, rest = {}) => ok(`/v1/rooms/${room.id}/policy`, put({ layerIds: [], memberGrants, ...rest })),
      send: (room, text = 'Synthetic prompt') => ok(`/v1/rooms/${room.id}/messages`, post({ text, allowExternal: true })) };
  };
  return { root, node, calls };
}
async function setup(a) {
  await a.create(); const source = await a.object('Permitted evidence'); const secret = await a.object('PRIVATE SECRET');
  const room = await a.room('Shared room'); const other = await a.room('Private room'); await a.select(room, [source.id]); await a.select(other, [secret.id]);
  const participant = await a.member('Participant'); const reader = await a.member('Reader');
  const grants = [participant, reader].map((entry, index) => ({ memberId: entry.member.id, role: index ? 'reader' : 'participant', sourceIds: [source.id] }));
  await a.policy(room, grants); return { source, secret, room, other, participant, reader, grants };
}

test('member credentials enforce room scope, endpoint restrictions, reader denial, and server-derived identity', async (t) => {
  const { node, calls } = await fixture(t); const a = await node('access'); const { source, secret, room, other, participant, reader } = await setup(a);
  const brain = await a.ok('/v1/brain', { token: participant.token });
  assert.deepEqual(brain.access, { owner: false, kind: 'member', memberId: participant.member.id, name: 'Participant' });
  assert.deepEqual(brain.objects.map((item) => item.id), [source.id]); assert.deepEqual(brain.rooms.map((item) => item.id), [room.id]);
  assert.equal(brain.governance.scopes[0].canSend, true); assert.equal(brain.governance.scopes[0].role, 'participant');
  assert.deepEqual(brain.governance.members, []); assert.deepEqual(brain.governance.layers, []); assert.deepEqual(brain.governance.manifests, []);
  assert.deepEqual(brain.revisions, []); assert.deepEqual(brain.audit, []); assert.deepEqual(brain.folders, []); assert.deepEqual(brain.workspace.agents, []);
  const serialized = JSON.stringify(brain); for (const marker of [secret.id, secret.text, reader.member.id, source.revisionId, 'sourceMetadata', 'sourcePath', KEY, 'tokenHash']) assert.ok(!serialized.includes(marker), marker);
  const status = await a.ok('/v1/status', { token: reader.token }); assert.equal(status.principal.owner, false);
  assert.equal((await a.ok('/v1/brain', { token: reader.token })).governance.scopes[0].canSend, false);
  for (const route of ['/v1/export', '/v1/folders', '/v1/replica']) assert.equal((await a.ask(route, { token: participant.token })).status, 403);
  for (const route of ['/v1/unlock', '/v1/lock', '/v1/restore', '/v1/objects', '/v1/rooms', '/v1/members', '/v1/layers', '/v1/workspace/agents', '/v1/sync', '/v1/code-graphs', '/v1/gitnexus/export', '/v1/connections/github']) assert.equal((await a.ask(route, { ...post({}), token: participant.token })).status, 403, route);
  assert.equal((await a.ask(`/v1/rooms/${other.id}/messages`, { ...post({ text: 'Denied cross-room' }), token: participant.token })).status, 403);
  assert.equal((await a.ask(`/v1/rooms/${room.id}/messages`, { ...post({ text: 'Denied reader' }), token: reader.token })).status, 403);
  assert.equal((await a.ask(`/v1/rooms/${room.id}/messages`, { ...post({ text: 'Spoof', principalId: 'owner' }), token: participant.token })).status, 400);
  assert.equal((await a.ask('/v1/brain', { token: PEER })).status, 401); assert.equal(calls.length, 0);
});

test('participant requests are durable pending runs; only owner approval dispatches the pinned exact prompt once', async (t) => {
  const { node, calls } = await fixture(t); const a = await node('approval'); const { source, room, participant } = await setup(a);
  const requested = await a.ok(`/v1/rooms/${room.id}/messages`, { ...post({ text: 'Exact member question' }), token: participant.token });
  assert.equal(requested.run.state, 'awaiting-approval'); assert.equal(calls.length, 0);
  let brain = await a.ok('/v1/brain'); let run = brain.governance.runs[0];
  assert.equal(run.principalId, participant.member.id); assert.equal(run.prompt, 'Exact member question'); assert.deepEqual(run.bindings, [{ sourceId: source.id, revisionId: source.revisionId }]);
  assert.equal(brain.rooms.find((item) => item.id === room.id).messages.length, 0);
  assert.equal((await a.ask(`/v1/runs/${run.id}/approve`, post({}))).status, 400);
  assert.equal((await a.ask(`/v1/runs/${run.id}/approve`, post({ allowExternal: true, text: 'Replacement' }))).status, 400);
  assert.equal((await a.ask(`/v1/runs/${run.id}/approve`, { ...post({ allowExternal: true }), token: participant.token })).status, 403);
  const result = await a.ok(`/v1/runs/${run.id}/approve`, post({ allowExternal: true }));
  assert.equal(result.run.state, 'completed'); assert.equal(calls.length, 1); assert.equal(calls[0].body.messages.at(-1).content, 'Exact member question');
  assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`); assert.equal(calls[0].body.messages.length, 3);
  assert.equal((await a.ask(`/v1/runs/${run.id}/approve`, post({ allowExternal: true }))).status, 409); assert.equal(calls.length, 1);
  brain = await a.ok('/v1/brain', { token: participant.token }); assert.equal(brain.rooms[0].messages.length, 2); assert.equal(brain.governance.runs[0].result, 'Synthetic source-grounded answer');
  assert.ok(!JSON.stringify(brain).includes(source.revisionId)); assert.ok(!JSON.stringify(brain).includes('grantIds'));
  assert.deepEqual((await a.ok('/v1/runs', { token: participant.token })).runs, brain.governance.runs);
  const reject = await a.ok(`/v1/rooms/${room.id}/messages`, { ...post({ text: 'Reject this request' }), token: participant.token });
  assert.equal((await a.ok(`/v1/runs/${reject.run.id}/reject`, post({}))).state, 'rejected');
  assert.equal((await a.ask(`/v1/runs/${reject.run.id}/approve`, post({ allowExternal: true }))).status, 409); assert.equal(calls.length, 1);
});

test('old owner transcripts, late joins, regrants, source revocation and credential revocation do not leak history', async (t) => {
  const { node } = await fixture(t); const a = await node('history'); await a.create(); const source = await a.object('Shared evidence'); const room = await a.room('Room'); await a.select(room, [source.id]);
  await a.send(room, 'Private owner history'); const one = await a.member('One');
  const grant = { memberId: one.member.id, role: 'participant', sourceIds: [source.id] }; await a.policy(room, [grant]);
  assert.equal((await a.ok('/v1/brain', { token: one.token })).rooms[0].messages.length, 0);
  await a.send(room, 'Shared after one joined'); assert.equal((await a.ok('/v1/brain', { token: one.token })).rooms[0].messages.length, 2);
  const two = await a.member('Two'); const second = { ...grant, memberId: two.member.id }; await a.policy(room, [grant, second]);
  assert.equal((await a.ok('/v1/brain', { token: two.token })).rooms[0].messages.length, 0);
  await a.policy(room, [second]); await a.policy(room, [grant, second]);
  assert.equal((await a.ok('/v1/brain', { token: one.token })).rooms[0].messages.length, 0);
  await a.send(room, 'Shared with both'); await a.policy(room, [{ ...grant, sourceIds: [] }, second]);
  const filtered = await a.ok('/v1/brain', { token: one.token }); assert.equal(filtered.objects.length, 0); assert.equal(filtered.rooms[0].messages.length, 0); assert.equal(filtered.governance.runs.length, 0); assert.equal(filtered.governance.scopes[0].canSend, false);
  await a.ok(`/v1/members/${one.member.id}/revoke`, post({}));
  for (const route of ['/v1/status', '/v1/brain', '/v1/runs']) assert.equal((await a.ask(route, { token: one.token })).status, 401);
  await a.ok('/v1/lock', post({})); assert.equal((await a.ask('/v1/status', { token: two.token })).status, 401);
});

test('layers, agent scope, all-member intersection and transitive evidence prevent context widening', async (t) => {
  const { node, calls } = await fixture(t); const a = await node('layers'); const { source, secret, room, participant, grants } = await setup(a);
  const derived = await a.object('Derived from private evidence', [secret.id]); await a.select(room, [source.id, derived.id]);
  await a.policy(room, grants.map((grant) => ({ ...grant, sourceIds: [source.id, derived.id] })));
  let brain = await a.ok('/v1/brain', { token: participant.token }); assert.deepEqual(brain.objects.map((item) => item.id), [source.id]);
  await a.send(room); let context = JSON.parse(calls.at(-1).body.messages[1].content.split('\n').slice(1).join('\n')); assert.deepEqual(context.map((item) => item.sourceId), [source.id]);
  await a.select(room, [source.id, secret.id]); assert.equal((await a.ask(`/v1/rooms/${room.id}/messages`, post({ text: 'Blocked', allowExternal: true }))).status, 403);
  const exclude = await a.ok('/v1/layers', post({ name: 'Private exclusion', mode: 'exclude', sourceIds: [secret.id] }));
  await a.policy(room, grants, { layerIds: [exclude.id] }); await a.send(room); context = JSON.parse(calls.at(-1).body.messages[1].content.split('\n').slice(1).join('\n')); assert.deepEqual(context.map((item) => item.sourceId), [source.id]);
  const ask = await a.ok('/v1/layers', post({ name: 'Ask before external use', mode: 'ask', sourceIds: [source.id] }));
  await a.policy(room, grants, { layerIds: [exclude.id, ask.id] });
  assert.equal((await a.ask(`/v1/rooms/${room.id}/messages`, post({ text: 'Needs explicit layer approval', allowExternal: true }))).status, 409);
  await a.ok(`/v1/rooms/${room.id}/messages`, post({ text: 'Approved ask', allowExternal: true, approvedLayerIds: [ask.id] }));
  const profile = await a.ok('/v1/workspace/agents', post({ name: 'Empty organizational context', sourceIds: [] }));
  const task = await a.ok('/v1/workspace/tasks', post({ title: 'Organized request', agentId: profile.id }));
  await a.policy(room, grants, { layerIds: [exclude.id, ask.id], agentId: profile.id, taskId: task.id });
  const sent = await a.send(room); assert.deepEqual(sent.context, []); assert.equal(sent.run.agentId, profile.id); assert.equal(sent.run.taskId, task.id);
  assert.equal(JSON.parse(calls.at(-1).body.messages[1].content.split('\n').slice(1).join('\n')).length, 0);
});

test('pinned manifests fail closed after expiry, revocation, source revision change or policy change', async (t) => {
  const { node, calls } = await fixture(t); const a = await node('manifests'); const { source, room, participant, grants } = await setup(a);
  const manifest = await a.ok(`/v1/rooms/${room.id}/manifests`, post({ ttlSeconds: 60 }), 201);
  assert.deepEqual(manifest.bindings, [{ sourceId: source.id, revisionId: source.revisionId }]); assert.equal((await a.ok('/v1/brain')).governance.scopes.find((scope) => scope.roomId === room.id).manifestStatus, 'active');
  const pending = await a.ok(`/v1/rooms/${room.id}/messages`, { ...post({ text: 'Pinned pending prompt' }), token: participant.token });
  await a.ok('/v1/objects', post({ objectId: source.id, title: source.title, text: 'Changed version' }), 201);
  assert.equal((await a.ask(`/v1/runs/${pending.run.id}/approve`, post({ allowExternal: true }))).status, 409); assert.equal(calls.length, 0);
  assert.equal((await a.ok('/v1/brain')).governance.scopes.find((scope) => scope.roomId === room.id).manifestStatus, 'stale');
  const fresh = await a.ok(`/v1/rooms/${room.id}/manifests`, post({}), 201); await a.send(room);
  await a.ok(`/v1/manifests/${fresh.id}/revoke`, post({})); assert.equal((await a.ask(`/v1/rooms/${room.id}/messages`, post({ text: 'Revoked', allowExternal: true }))).status, 409);
  await a.policy(room, grants); const short = await a.ok(`/v1/rooms/${room.id}/manifests`, post({ ttlSeconds: 1 }), 201);
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, Date.parse(short.expiresAt) - Date.now() + 15)));
  assert.equal((await a.ask(`/v1/rooms/${room.id}/messages`, post({ text: 'Expired', allowExternal: true }))).status, 409);
  assert.equal((await a.ok('/v1/brain')).governance.scopes.find((scope) => scope.roomId === room.id).manifestStatus, 'expired');
  await a.policy(room, grants); const pending2 = await a.ok(`/v1/rooms/${room.id}/messages`, { ...post({ text: 'Policy-bound' }), token: participant.token });
  await a.select(room, []); assert.equal((await a.ask(`/v1/runs/${pending2.run.id}/approve`, post({ allowExternal: true }))).status, 409);
});

test('run start is visible during provider await; failures are durable and sanitized', async (t) => {
  let release; const waiting = new Promise((resolve) => { release = resolve; }); let entered; const started = new Promise((resolve) => { entered = resolve; });
  const { node } = await fixture(t, async () => { entered(); await waiting; throw new Error(`Sensitive upstream response ${KEY}`); });
  const a = await node('running'); const { room } = await setup(a);
  const sending = a.ask(`/v1/rooms/${room.id}/messages`, post({ text: 'Observable execution', allowExternal: true }));
  await started;
  const live = await Promise.race([a.ok('/v1/brain'), new Promise((_, reject) => setTimeout(() => reject(new Error('Read was blocked behind provider execution')), 1500))]);
  assert.equal(live.governance.runs[0].state, 'running'); assert.equal(live.governance.runs[0].events[0].type, 'provider.started');
  release(); const failed = await sending; assert.equal(failed.status, 400); assert.ok(!JSON.stringify(failed).includes(KEY));
  const brain = await a.ok('/v1/brain'); assert.equal(brain.governance.runs[0].state, 'failed'); assert.equal(brain.rooms.find((item) => item.id === room.id).messages.length, 0);
  assert.ok(!JSON.stringify(brain).includes(KEY)); assert.equal(brain.governance.runs[0].events.at(-1).type, 'provider.failed');
});

test('encrypted reopen retains member credentials, portable export revokes them, and replication carries no authority', async (t) => {
  const { node } = await fixture(t); const a = await node('persistent'); const { room, participant } = await setup(a); await a.send(room);
  const brain = await a.ok('/v1/brain'); const raw = await fs.readFile(path.join(a.directory, 'brain.enc'), 'utf8');
  for (const marker of [participant.token, participant.member.name, 'Synthetic prompt', KEY, 'tokenHash']) assert.ok(!raw.includes(marker));
  assert.ok(!JSON.stringify(brain).includes('tokenHash')); assert.ok(!JSON.stringify(brain).includes(participant.token));
  await a.ok('/v1/lock', post({})); await a.ok('/v1/unlock', post({ passphrase: PASSWORD })); assert.equal((await a.ok('/v1/brain', { token: participant.token })).rooms.length, 1);
  const encrypted = await a.ok('/v1/export'); const bundle = await decryptExport(encrypted, PASSWORD);
  assert.ok(!JSON.stringify(bundle).includes('tokenHash')); assert.ok(bundle.state.governance.members.every((member) => member.revokedAt));
  const b = await node('restored'); await b.ok('/v1/restore', post({ passphrase: PASSWORD, bundle: encrypted }));
  assert.equal((await b.ask('/v1/brain', { token: participant.token })).status, 401); assert.equal((await b.ok('/v1/brain')).governance.runs[0].state, 'completed');
  const replica = await a.ok('/v1/replica', { token: PEER }); assert.deepEqual(replica.state.governance, emptyGovernance()); assert.equal(replica.state.rooms.length, 0);
  await a.ok('/v1/replica', { ...post({ bundle: await decryptExport(await b.ok('/v1/export'), PASSWORD) }), token: PEER });
  assert.equal((await a.ok('/v1/brain', { token: participant.token })).rooms.length, 1);
});

test('governance mutations reject forged fields and invalid restored records atomically', async (t) => {
  const { node } = await fixture(t); const a = await node('strict'); const { room, participant, grants, source } = await setup(a);
  const before = await a.ok('/v1/brain');
  const attempts = [
    ['/v1/members', { name: 'Forged credential', tokenHash: '0'.repeat(64) }],
    ['/v1/members', { name: 'Forged date', createdAt: '2026-01-01T00:00:00.000Z' }],
    ['/v1/layers', { name: 'Unknown scope', mode: 'include', sourceIds: [`obj_${randomUUID()}`] }],
    ['/v1/layers', { name: 'Duplicate scope', mode: 'exclude', sourceIds: [source.id, source.id] }],
    ['/v1/layers', JSON.parse('{"name":"Unsafe","mode":"include","sourceIds":[],"__proto__":{}}')],
    [`/v1/rooms/${room.id}/manifests`, { ttlSeconds: 604801 }],
    [`/v1/rooms/${room.id}/manifests`, { bindings: [] }],
  ];
  for (const [route, body] of attempts) assert.ok([400, 404].includes((await a.ask(route, post(body))).status));
  for (const body of [{ layerIds: [], memberGrants: [...grants, grants[0]] }, { layerIds: [], memberGrants: [{ ...grants[0], role: 'owner' }] }, { layerIds: [], memberGrants: [{ ...grants[0], grantId: `grant_${randomUUID()}` }] }, { layerIds: [], memberGrants: grants, agentId: `agent_${randomUUID()}` }]) assert.ok([400, 404].includes((await a.ask(`/v1/rooms/${room.id}/policy`, put(body))).status));
  assert.deepEqual(await a.ok('/v1/brain'), before);
  const bundle = await decryptExport(await a.ok('/v1/export'), PASSWORD); const invalid = structuredClone(bundle); invalid.state.governance.members.push(invalid.state.governance.members[0]);
  const b = await node('malformed'); assert.equal((await b.ask('/v1/restore', post({ passphrase: PASSWORD, bundle: await encryptExport(invalid, PASSWORD) }))).status, 400);
  const altered = structuredClone(bundle.state); altered.governance.members[0].createdAt = 'yesterday'; assert.throws(() => validateGovernance(altered.governance, altered));
  const tooMany = structuredClone(bundle.state); tooMany.governance.layers = Array(101).fill({}); assert.throws(() => validateGovernance(tooMany.governance, tooMany));
  assert.equal((await a.ok('/v1/brain', { token: participant.token })).access.owner, false);
});

test('running executions become failed after a node restart and are never automatically replayed', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkive-run-recovery-')); let store;
  t.after(async () => { await store?.close(); await fs.rm(root, { recursive: true, force: true }); });
  store = await openBrain(root, PASSWORD, { create: true }); const room = await store.createRoom({ title: 'Interrupted execution' });
  const prepared = await store.beginRun({ roomId: room.id, prompt: 'Durable exact input', principalId: 'owner', providerId: 'openai-compatible', model: 'synthetic', providerFingerprint: '0'.repeat(64), approvedLayerIds: [] });
  assert.equal(prepared.run.state, 'running'); await store.close(); store = await openBrain(root, PASSWORD);
  const run = (await store.snapshot()).governance.runs[0]; assert.equal(run.state, 'failed'); assert.equal(run.events.at(-1).type, 'node.interrupted'); assert.equal(run.prompt, 'Durable exact input');
  assert.equal((await store.snapshot()).rooms[0].messages.length, 0);
});

test('displayed-context keys bind owner consent to exact current selection and revisions', async (t) => {
  const { node, calls } = await fixture(t); const a = await node('consent'); const { room, source } = await setup(a);
  const key = (await a.ok('/v1/brain')).governance.scopes.find((scope) => scope.roomId === room.id).contextKey;
  await a.ok('/v1/objects', post({ objectId: source.id, title: source.title, text: 'Revision changed after UI displayed consent' }), 201);
  for (const [route, body] of [[`/v1/rooms/${room.id}/messages`, { text: 'Old consent', allowExternal: true, expectedContextKey: key }], [`/v1/rooms/${room.id}/manifests`, { expectedContextKey: key }]]) {
    const response = await a.ask(route, post(body)); assert.equal(response.status, 409); assert.equal(response.body.error.code, 'CONTEXT_STALE');
  }
  assert.equal(calls.length, 0); assert.equal((await a.ok('/v1/brain')).governance.runs.length, 0);
  const current = (await a.ok('/v1/brain')).governance.scopes.find((scope) => scope.roomId === room.id).contextKey;
  await a.ok(`/v1/rooms/${room.id}/manifests`, post({ expectedContextKey: current }), 201);
  assert.equal((await a.ask(`/v1/rooms/${room.id}/messages`, post({ text: 'Manifest changed displayed context', allowExternal: true, expectedContextKey: current }))).status, 409);
  const pinned = (await a.ok('/v1/brain')).governance.scopes.find((scope) => scope.roomId === room.id).contextKey;
  await a.ok(`/v1/rooms/${room.id}/messages`, post({ text: 'Current consent', allowExternal: true, expectedContextKey: pinned })); assert.equal(calls.length, 1);
});

test('code graph payloads and new private provenance dependencies never enter member views', async (t) => {
  const { node } = await fixture(t); const a = await node('graph-boundary'); const { room, source, secret, participant, grants } = await setup(a);
  const graph = await a.ok('/v1/code-graphs', post({ title: 'Private code topology', graph: { format: 'arkive-code-graph', version: 1, repository: 'synthetic', nodes: [{ id: 'secret-node', label: 'Private path', type: 'File', filePath: 'private/path.mjs' }], edges: [], truncated: false } }));
  const graphObject = (await a.ok('/v1/brain')).objects.find((object) => object.kind === 'code_graph'); assert.ok(graphObject, JSON.stringify(graph));
  await a.select(room, [source.id, graphObject.id]); await a.policy(room, grants.map((grant) => ({ ...grant, sourceIds: [source.id, graphObject.id] })));
  let brain = await a.ok('/v1/brain', { token: participant.token }); assert.ok(!JSON.stringify(brain).includes('secret-node')); assert.ok(!JSON.stringify(brain).includes(graphObject.id)); assert.equal(brain.governance.scopes[0].canSend, false);
  await a.select(room, [source.id]); await a.policy(room, grants); await a.send(room);
  await a.ok('/v1/objects', post({ objectId: source.id, title: source.title, text: 'Derived content incorporates private evidence', sourceIds: [secret.id] }), 201);
  brain = await a.ok('/v1/brain', { token: participant.token }); assert.equal(brain.objects.length, 0); assert.equal(brain.governance.runs.length, 0); assert.equal(brain.rooms[0].messages.length, 0);
});

test('concurrent peer source updates invalidate in-flight result publication without importing ACL authority', async (t) => {
  let entered; const started = new Promise((resolve) => { entered = resolve; }); let release; const waiting = new Promise((resolve) => { release = resolve; });
  const { node } = await fixture(t, async () => { entered(); await waiting; return { choices: [{ message: { content: 'Result based on outdated evidence' } }] }; });
  const a = await node('source-race'); const { source, room, participant } = await setup(a);
  const b = await node('peer-copy'); await b.ok('/v1/restore', post({ passphrase: PASSWORD, bundle: await a.ok('/v1/export') }));
  await b.ok('/v1/objects', post({ objectId: source.id, title: source.title, text: 'Changed peer revision' }), 201); const remoteMember = await b.member('Peer cannot grant access here');
  const incoming = await decryptExport(await b.ok('/v1/export'), PASSWORD);
  const sending = a.ask(`/v1/rooms/${room.id}/messages`, post({ text: 'Original scoped execution', allowExternal: true })); await started;
  await a.ok('/v1/replica', { ...post({ bundle: incoming }), token: PEER }); release();
  const response = await sending; assert.equal(response.status, 409);
  const brain = await a.ok('/v1/brain'); assert.equal(brain.governance.runs[0].state, 'failed'); assert.equal(brain.rooms.find((item) => item.id === room.id).messages.length, 0);
  assert.equal((await a.ask('/v1/brain', { token: remoteMember.token })).status, 401); assert.ok(!brain.governance.members.some((member) => member.id === remoteMember.member.id));
  assert.equal((await a.ok('/v1/brain', { token: participant.token })).objects[0].text, 'Changed peer revision');
});

test('pending approval rechecks the actual provider configuration after reopen', async (t) => {
  const { node, calls } = await fixture(t); const a = await node('provider-change'); const { room, participant } = await setup(a);
  const pending = await a.ok(`/v1/rooms/${room.id}/messages`, { ...post({ text: 'Original provider only' }), token: participant.token });
  await a.ok('/v1/lock', post({})); const b = await node('provider-change', { baseUrl: 'https://different-provider.invalid/v1' });
  await b.ok('/v1/unlock', post({ passphrase: PASSWORD }));
  const response = await b.ask(`/v1/runs/${pending.run.id}/approve`, post({ allowExternal: true })); assert.equal(response.status, 409); assert.equal(response.body.error.code, 'RUN_STALE'); assert.equal(calls.length, 0);
});

test('member quotas preserve owner/other-member availability; explicit pruning retains compact audit evidence', async (t) => {
  const { node, calls } = await fixture(t); const a = await node('quotas'); const { room, source, participant, reader, grants } = await setup(a);
  const send = () => a.ok(`/v1/rooms/${room.id}/messages`, { ...post({ text: 'Bounded untrusted member input' }), token: participant.token });
  const pending = []; for (let index = 0; index < 3; index++) pending.push((await send()).run);
  const full = await a.ask(`/v1/rooms/${room.id}/messages`, { ...post({ text: 'Fourth pending request' }), token: participant.token }); assert.equal(full.status, 429); assert.equal(full.body.error.code, 'RUN_QUOTA');
  assert.equal(calls.length, 0); await a.send(room, 'Owner remains available');
  assert.equal((await a.ask('/v1/runs/prune', post({ runIds: [pending[0].id], confirm: true }))).status, 409);
  for (const run of pending) await a.ok(`/v1/runs/${run.id}/reject`, post({}));
  for (let index = 0; index < 7; index++) { const { run } = await send(); await a.ok(`/v1/runs/${run.id}/reject`, post({})); }
  assert.equal((await a.ask(`/v1/rooms/${room.id}/messages`, { ...post({ text: 'Eleventh retained room request' }), token: participant.token })).status, 429);
  await a.policy(room, grants.map((grant) => ({ ...grant, role: 'participant' })));
  assert.equal((await a.ok(`/v1/rooms/${room.id}/messages`, { ...post({ text: 'Other member remains available' }), token: reader.token })).run.state, 'awaiting-approval');
  const another = await a.room('Another room'); await a.select(another, [source.id]); await a.policy(another, [grants[0]]);
  for (let index = 0; index < 10; index++) { const { run } = await a.ok(`/v1/rooms/${another.id}/messages`, { ...post({ text: 'Cross-room bounded member input' }), token: participant.token }); await a.ok(`/v1/runs/${run.id}/reject`, post({})); }
  const third = await a.room('Third room'); await a.select(third, [source.id]); await a.policy(third, [grants[0]]);
  assert.equal((await a.ask(`/v1/rooms/${third.id}/messages`, { ...post({ text: 'Over total member quota' }), token: participant.token })).status, 429);
  const before = await a.ok('/v1/brain'); const ownerRun = before.governance.runs.find((run) => run.principalId === 'owner');
  assert.equal((await a.ask('/v1/runs/prune', post({ runIds: [ownerRun.id], confirm: true }))).status, 409);
  assert.equal((await a.ask('/v1/runs/prune', post({ runIds: [pending[0].id] }))).status, 400);
  assert.equal((await a.ask('/v1/runs/prune', { ...post({ runIds: [pending[0].id], confirm: true }), token: participant.token })).status, 403);
  assert.deepEqual(await a.ok('/v1/brain'), before);
  const pruned = await a.ok('/v1/runs/prune', post({ runIds: [pending[0].id], confirm: true })); assert.deepEqual(pruned.prunedIds, [pending[0].id]);
  const audit = (await a.ok('/v1/brain')).audit.find((event) => event.type === 'run.pruned');
  assert.equal(audit.targetId, pending[0].id); assert.equal(audit.details.roomId, room.id); assert.equal(audit.details.principalId, participant.member.id); assert.equal(audit.details.state, 'rejected'); assert.match(audit.details.promptHash, /^[a-f0-9]{64}$/); assert.match(audit.details.bindingsHash, /^[a-f0-9]{64}$/);
  const { run } = await send(); await a.ok(`/v1/runs/${run.id}/approve`, post({ allowExternal: true }));
  assert.equal((await a.ok('/v1/runs/prune', post({ runIds: [run.id], confirm: true }))).messagesRemoved, 2);
  assert.ok(!(await a.ok('/v1/brain')).rooms.find((item) => item.id === room.id).messages.some((message) => message.runId === run.id));
});

test('associated profile provider mismatch fails closed without claiming a different harness executed', async (t) => {
  const { node, calls } = await fixture(t); const a = await node('profile-provider'); const { source, room, participant, grants } = await setup(a);
  const profile = await a.ok('/v1/workspace/agents', post({ name: 'Hermes organizational profile', providerId: 'hermes', sourceIds: [source.id] }));
  await a.policy(room, grants, { agentId: profile.id });
  for (const options of [post({ text: 'Wrong provider', allowExternal: true }), { ...post({ text: 'Wrong profile request' }), token: participant.token }]) {
    const response = await a.ask(`/v1/rooms/${room.id}/messages`, options); assert.equal(response.status, 409); assert.equal(response.body.error.code, 'PROFILE_PROVIDER_MISMATCH');
  }
  assert.equal(calls.length, 0); assert.equal((await a.ok('/v1/brain')).governance.runs.length, 0);
});

test('partial member uploads cannot hold the mutation queue, and revocation is rechecked after parsing', async (t) => {
  const { node } = await fixture(t); const a = await node('slow-upload'); const { room, participant, reader } = await setup(a);
  const payload = JSON.stringify({ text: 'Complete only after revocation' });
  function partial(token) {
    let req;
    const response = new Promise((resolve, reject) => {
      req = http.request(`http://127.0.0.1:${a.port}/v1/rooms/${room.id}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
        const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
      }); req.on('error', reject); req.write(payload.slice(0, 8));
    });
    response.catch(() => {}); t.after(() => req.destroy()); return { req, response };
  }
  const first = partial(participant.token); const second = partial(participant.token);
  let capped = false;
  for (let index = 0; index < 30; index++) { const response = await a.ask('/v1/status', { token: participant.token }); if (response.status === 429) { capped = true; break; } await new Promise((resolve) => setTimeout(resolve, 10)); }
  assert.equal(capped, true); assert.equal((await a.ok('/v1/status', { token: reader.token })).principal.memberId, reader.member.id);
  await Promise.race([a.ok(`/v1/members/${participant.member.id}/revoke`, post({})), new Promise((_, reject) => setTimeout(() => reject(new Error('Partial member upload blocked owner revocation')), 1000))]);
  first.req.end(payload.slice(8)); second.req.end(payload.slice(8)); assert.equal((await first.response).status, 401); assert.equal((await second.response).status, 401);
  const third = partial(reader.token);
  await Promise.race([a.ok('/v1/lock', post({})), new Promise((_, reject) => setTimeout(() => reject(new Error('Partial member upload blocked owner lock')), 1000))]);
  third.req.end(payload.slice(8)); assert.equal((await third.response).status, 401);
  await a.ok('/v1/unlock', post({ passphrase: PASSWORD })); assert.equal((await a.ok('/v1/brain')).governance.runs.length, 0);
});

test('stale policy and layer drafts cannot restore revoked grants or overwritten layer rules', async (t) => {
  const { node } = await fixture(t); const a = await node('optimistic-edits'); const { room, source, reader, grants } = await setup(a);
  let snapshot = await a.ok('/v1/brain'); const openedPolicyKey = snapshot.governance.scopes.find((scope) => scope.roomId === room.id).contextKey;
  await a.policy(room, grants.map((grant) => ({ ...grant, sourceIds: [] })), { expectedContextKey: openedPolicyKey });
  let before = await a.ok('/v1/brain');
  for (const expectedContextKey of [openedPolicyKey, 'forged']) {
    const response = await a.ask(`/v1/rooms/${room.id}/policy`, put({ layerIds: [], memberGrants: grants, expectedContextKey })); assert.equal(response.status, 409); assert.equal(response.body.error.code, 'CONTEXT_STALE');
  }
  assert.deepEqual(await a.ok('/v1/brain'), before);
  await a.policy(room, grants); await a.ok(`/v1/members/${reader.member.id}/revoke`, post({}));
  const inactiveKey = (await a.ok('/v1/brain')).governance.scopes.find((scope) => scope.roomId === room.id).contextKey;
  await a.policy(room, [grants[0]], { expectedContextKey: inactiveKey });
  assert.equal((await a.ask(`/v1/rooms/${room.id}/policy`, put({ layerIds: [], memberGrants: grants, expectedContextKey: inactiveKey }))).status, 409);
  const layer = await a.ok('/v1/layers', post({ name: 'Versioned rule', mode: 'include', sourceIds: [source.id] }));
  assert.match(layer.versionKey, /^[a-f0-9]{64}$/); const initial = { id: layer.id, name: layer.name, description: layer.description, sourceIds: layer.sourceIds };
  const changed = await a.ok('/v1/layers', post({ ...initial, mode: 'exclude', expectedLayerKey: layer.versionKey })); assert.notEqual(changed.versionKey, layer.versionKey);
  before = await a.ok('/v1/brain'); assert.equal(before.governance.layers[0].versionKey, changed.versionKey);
  for (const expectedLayerKey of [layer.versionKey, 'forged']) {
    const response = await a.ask('/v1/layers', post({ ...initial, mode: 'include', expectedLayerKey })); assert.equal(response.status, 409); assert.equal(response.body.error.code, 'LAYER_STALE');
  }
  assert.deepEqual(await a.ok('/v1/brain'), before);
  const bundle = await decryptExport(await a.ok('/v1/export'), PASSWORD); assert.equal(Object.hasOwn(bundle.state.governance.layers[0], 'versionKey'), false);
});

test('approval reserves worst-case completion space against the whole Brain before any provider call', async () => {
  const roomId = `room_${randomUUID()}`;
  const state = { objects: [], revisions: [], rooms: [{ id: roomId, title: 'Capacity check', selectedSourceIds: [], messages: [] }], audit: [], governance: emptyGovernance() };
  const member = governanceAction(state, 'member', { name: 'Bounded member' }).result.member;
  governanceAction(state, 'policy', { roomId, layerIds: [], memberGrants: [{ memberId: member.id, role: 'participant', sourceIds: [] }] });
  const config = { baseUrl: 'https://synthetic-provider.invalid/v1', model: 'synthetic-model' };
  const providerFingerprint = createHash('sha256').update(JSON.stringify(config)).digest('hex');
  const { run } = beginRun(state, { roomId, principalId: member.id, prompt: 'Pinned before unrelated owner data grew', providerId: 'openai-compatible', model: config.model, providerFingerprint, approvedLayerIds: [] });
  // Synthetic unrelated owner objects/history grow after the request was queued.
  // Each text stays below the ordinary 1 MiB object bound; total leaves less
  // space than the worst-case completion reserve under the shared Brain limit.
  // Reuse this synthetic string so the fixture need not retain a text copy per row.
  const syntheticText = 'x'.repeat(500 * 1024);
  const objectCount = Math.floor((MAX_BRAIN_BYTES - 1024 * 1024) / (2 * Buffer.byteLength(syntheticText)));
  state.objects = Array.from({ length: objectCount }, () => ({ id: `obj_${randomUUID()}`, title: 'Owner data', text: syntheticText, sourceIds: [] }));
  state.revisions = state.objects.map((object) => ({ ...object, id: `rev_${randomUUID()}`, objectId: object.id }));
  const stateHash = () => createHash('sha256').update(JSON.stringify(state)).digest('hex');
  const original = stateHash(); assert.ok(Buffer.byteLength(JSON.stringify(state)) < MAX_BRAIN_BYTES);
  let providerCalls = 0;
  const store = { approveRun: (id, approved, fingerprint) => approveRun(state, id, approved, fingerprint) };
  await assert.rejects(() => executeApprovedRun(store, run.id, { allowExternal: true }, { ...config, request: async () => { providerCalls++; return {}; } }), { code: 'RUN_QUOTA', status: 429 });
  assert.equal(providerCalls, 0); assert.equal(stateHash(), original); assert.equal(run.state, 'awaiting-approval');
  state.objects = []; state.revisions = [];
  assert.equal(approveRun(state, run.id, [], providerFingerprint).run.state, 'running');
});
