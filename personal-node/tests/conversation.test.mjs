import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createNodeServer } from '../server.mjs';
import { pinConversation, readConversation, validateConversation } from '../conversation.mjs';

const base = { roomId: 'room', principalId: 'owner', scopeHash: 'scope', bindings: [], providerFingerprint: 'provider' };
const prior = (patch = {}) => ({ ...base, id: `run_${randomUUID()}`, state: 'completed', prompt: 'old question', result: 'old answer', ...patch });
test('conversation pins bounded exact-authority turns, rejecting other rooms, models, principals and revisions', () => {
  const allowed = Array.from({ length: 10 }, () => prior());
  const excluded = ['roomId', 'principalId', 'scopeHash', 'providerFingerprint', 'bindings'].map(field => prior({ [field]: field === 'bindings' ? ['different'] : 'different' }));
  const run = prior({ state: 'running' }); run.conversation = pinConversation([...allowed, ...excluded, prior({ state: 'failed' })], run);
  assert.deepEqual(run.conversation.runIds, allowed.slice(-8).map(item => item.id));
  assert.equal(readConversation(allowed, run).length, 16);
  assert.throws(() => readConversation(allowed.slice(0, -1), run), /changed/);
  assert.throws(() => readConversation(allowed.map((item, index) => index === 9 ? { ...item, result: 'tampered' } : item), run), /changed/);
  assert.throws(() => validateConversation({ ...run.conversation, runIds: [run.id] }, run), /invalid/);
  assert.equal(pinConversation([...allowed, prior({ result: 'a'.repeat(32000) })], run).runIds.length, 0);
});

const password = 'Synthetic conversation passphrase';
const owner = 'synthetic-conversation-owner-credential-0001';
const peer = 'synthetic-conversation-peer-credential-00001';
async function fixture(t, request) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arkive-conversation-')); const calls = [];
  const options = { directory, token: owner, syncToken: peer, allowedOrigins: ['http://127.0.0.1:4319'], provider: { baseUrl: 'http://127.0.0.1:12345/v1', model: 'fixture', request: async (_url, options) => { calls.push(options.body); return request ? request(options.body) : { choices: [{ message: { content: `Synthetic answer ${calls.length}` } }] }; } } };
  let node = await createNodeServer(options); let address = await node.start();
  t.after(async () => { await node.close(); await rm(directory, { recursive: true, force: true }); });
  const call = async (route, body, token = owner, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`http://127.0.0.1:${address.port}${route}`, { method, headers: { Authorization: `Bearer ${token}`, Origin: 'http://127.0.0.1:4319', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const ok = async (...args) => { const result = await call(...args); assert.ok(result.status < 300, JSON.stringify(result)); return result.body; };
  await ok('/v1/unlock', { passphrase: password, create: true });
  const room = await ok('/v1/rooms', { title: 'Conversation fixture' });
  const source = await ok('/v1/objects', { title: 'Evidence', text: 'Synthetic source', sourceIds: [] });
  await ok(`/v1/rooms/${room.id}/sources`, { objectIds: [source.id] }, owner, 'PUT');
  const send = (text, extra = {}) => ok(`/v1/rooms/${room.id}/messages`, { text, allowExternal: true, ...extra });
  const stream = async (token = owner) => {
    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/run-events`, { headers: { Authorization: `Bearer ${token}`, Origin: 'http://127.0.0.1:4319' }, signal: controller.signal });
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    t.after(() => controller.abort());
    return { response, close: () => controller.abort(), next: async () => {
      while (!buffer.includes('\n')) { const part = await reader.read(); if (part.done) return null; buffer += decoder.decode(part.value, { stream: true }); }
      const end = buffer.indexOf('\n'); const result = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); return result;
    } };
  };
  return { call, ok, room, source, send, calls, stream, restart: async () => { await node.close(); node = await createNodeServer(options); address = await node.start(); await ok('/v1/unlock', { passphrase: password }); } };
}

test('room routes select independent models; stale approvals, member edits and history crossover are blocked', async t => {
  const f = await fixture(t);
  const modelConfig = { enabled: true, baseUrl: 'http://127.0.0.1:12345/v1', model: 'fixture', timeoutMs: 45000 };
  await f.ok('/v1/settings/provider', { ...modelConfig, expectedRevision: 'environment' });
  const registry = await f.ok('/v1/settings/connections', { action: 'save', name: 'Second model', config: { ...modelConfig, model: 'second-model' }, expectedRevision: (await f.ok('/v1/settings/connections')).revision });
  const second = registry.connections[1].id;
  const other = await f.ok('/v1/rooms', { title: 'Independent second chat' });
  const pin = async (roomId, connectionId) => f.ok(`/v1/rooms/${roomId}/execution`, { connectionId, expectedRevision: (await f.ok('/v1/settings/chat-routing')).revision }, owner, 'PUT');
  await pin(f.room.id, 'default'); await pin(other.id, second);
  assert.equal(f.calls.length, 0, 'Selection sends nothing');
  const routes = await f.ok('/v1/settings/chat-routing');
  assert.equal((await f.ok('/v1/status')).roomProviders[other.id][0].model, 'second-model');
  assert.equal(routes.rooms.find(item => item.roomId === other.id).providers[0].model, 'second-model');
  assert.ok(!JSON.stringify(routes).includes('baseUrl'));
  const first = await f.send('First model');
  await f.ok(`/v1/rooms/${other.id}/messages`, { text: 'Second model', allowExternal: true });
  assert.deepEqual(f.calls.map(item => item.model), ['fixture', 'second-model']);
  await f.restart();
  assert.equal((await f.ok('/v1/settings/chat-routing')).rooms.find(item => item.roomId === other.id).connectionId, second);
  const member = await f.ok('/v1/members', { name: 'Route participant' });
  assert.equal((await f.ok('/v1/status', undefined, member.token)).roomProviders, undefined);
  await f.ok(`/v1/rooms/${f.room.id}/policy`, { layerIds: [], memberGrants: [{ memberId: member.member.id, role: 'participant', sourceIds: [f.source.id] }] }, owner, 'PUT');
  assert.equal((await f.call('/v1/settings/chat-routing', undefined, member.token)).status, 403);
  assert.equal((await f.call(`/v1/rooms/${f.room.id}/execution`, { connectionId: second, expectedRevision: routes.revision }, member.token, 'PUT')).status, 403);
  assert.equal((await f.call('/v1/rooms/room_missing/execution', { connectionId: second, expectedRevision: routes.revision }, owner, 'PUT')).status, 404);
  const pending = await f.ok(`/v1/rooms/${f.room.id}/messages`, { text: 'Pending on first route' }, member.token);
  await pin(f.room.id, second);
  const count = f.calls.length;
  assert.equal((await f.call(`/v1/runs/${pending.run.id}/approve`, { allowExternal: true })).status, 409);
  const oldKey = routes.rooms.find(item => item.roomId === f.room.id).providers[0].configurationKey;
  assert.equal((await f.call(`/v1/rooms/${f.room.id}/messages`, { text: 'Stale route', allowExternal: true, expectedProviderKey: oldKey })).status, 409);
  assert.equal(f.calls.length, count);
  const changed = await f.send('New route, no old history', { includeHistory: true });
  assert.equal(changed.run.conversation.runIds.includes(first.run.id), false);
  const pendingNew = await f.ok(`/v1/rooms/${f.room.id}/messages`, { text: 'Approve pinned model' }, member.token);
  await f.ok(`/v1/runs/${pendingNew.run.id}/approve`, { allowExternal: true });
  assert.equal(f.calls.at(-1).model, 'second-model');
  const r = await f.ok('/v1/settings/connections');
  await f.ok('/v1/settings/connections', { action: 'save', id: second, name: 'Second model', config: { ...modelConfig, model: 'second-model', enabled: false }, expectedRevision: r.revision });
  const disabledCount = f.calls.length;
  assert.ok((await f.call(`/v1/rooms/${other.id}/messages`, { text: 'Disabled pin', allowExternal: true })).status >= 400);
  assert.equal(f.calls.length, disabledCount);
  assert.equal((await f.ok('/v1/settings/chat-routing')).rooms.find(item => item.roomId === other.id).connectionId, second);
});

test('history is opt-in, persists encrypted across restart, and is excluded after source or connection change', async t => {
  const f = await fixture(t);
  const first = await f.send('Remember the synthetic first question');
  await f.send('No history by default'); assert.equal(f.calls[1].messages.length, 3);
  await f.restart();
  const follow = await f.send('Continue', { includeHistory: true });
  assert.deepEqual(follow.run.conversation.runIds[0], first.run.id);
  assert.equal(f.calls[2].messages.length, 7);
  assert.equal(f.calls[2].messages[2].content, first.run.prompt);
  await f.ok(`/v1/rooms/${f.room.id}/sources`, { objectIds: [] }, owner, 'PUT');
  const changed = await f.send('New context', { includeHistory: true });
  assert.equal(changed.run.conversation.runIds.length, 0); assert.equal(f.calls[3].messages.length, 3);
  await f.ok('/v1/settings/provider', { expectedRevision: 'environment', enabled: true, baseUrl: 'http://127.0.0.1:12345/v1', model: 'fixture', timeoutMs: 45000 });
  const switched = await f.send('Changed connection', { includeHistory: true }); assert.equal(switched.run.conversation.runIds.length, 0);
  const count = f.calls.length;
  assert.equal((await f.call(`/v1/rooms/${f.room.id}/messages`, { text: 'Stale', allowExternal: true, expectedProviderKey: 'wrong' })).status, 409);
  assert.equal((await f.call(`/v1/rooms/${f.room.id}/messages`, { text: 'Invalid', allowExternal: true, includeHistory: 'yes' })).status, 400);
  assert.equal(f.calls.length, count);
});

test('member history is pinned for owner inspection; pruning a pinned receipt blocks dispatch', async t => {
  const f = await fixture(t); const member = await f.ok('/v1/members', { name: 'Participant' });
  await f.ok(`/v1/rooms/${f.room.id}/policy`, { layerIds: [], memberGrants: [{ memberId: member.member.id, role: 'participant', sourceIds: [f.source.id] }] }, owner, 'PUT');
  await f.send('Owner-only history must not be inherited');
  const request = text => f.ok(`/v1/rooms/${f.room.id}/messages`, { text, includeHistory: true }, member.token);
  const first = await request('Member first'); assert.equal(f.calls.length, 1);
  const approved = await f.ok(`/v1/runs/${first.run.id}/approve`, { allowExternal: true });
  assert.equal(approved.run.conversation.runIds.length, 0);
  const second = await request('Member followup'); assert.equal(second.run.conversationTurns, 1);
  const run = (await f.ok('/v1/brain')).governance.runs.find(item => item.id === second.run.id);
  assert.deepEqual(run.conversation.runIds, [first.run.id]);
  await f.ok('/v1/runs/prune', { runIds: [first.run.id], confirm: true });
  assert.equal((await f.call(`/v1/runs/${second.run.id}/approve`, { allowExternal: true })).status, 409);
  assert.equal(f.calls.length, 2);
});

test('live events show running then completed during an outstanding request without exposing content', async t => {
  let release; let started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, async () => { started(); await new Promise(resolve => { release = resolve; }); return { choices: [{ message: { content: 'PRIVATE RESPONSE' } }] }; });
  t.after(() => release?.());
  const feed = await f.stream(); assert.equal(feed.response.status, 200); assert.deepEqual((await feed.next()).runs, []);
  const sending = f.send('PRIVATE PROMPT'); await ready;
  const active = await feed.next(); assert.equal(active.runs[0].state, 'running');
  assert.ok(!JSON.stringify(active).includes('PRIVATE') && !JSON.stringify(active).includes(f.source.id));
  release(); await sending;
  const done = await feed.next(); assert.equal(done.runs[0].state, 'completed');
  assert.equal(done.runs[0].events[0].id, active.runs[0].events[0].id);
  assert.ok(!JSON.stringify(done).includes('PRIVATE'));
  feed.close();
  const restored = await f.stream(); assert.equal((await restored.next()).runs[0].state, 'completed');
  assert.equal((await f.call('/v1/run-events', undefined, peer)).status, 401);
  await f.ok('/v1/lock', {}); assert.equal((await restored.next()).type, 'unavailable'); restored.close();
  assert.equal((await f.call('/v1/run-events')).status, 423);
});

test('live event membership is rechecked and revoked access clears the stream', async t => {
  const f = await fixture(t); const member = await f.ok('/v1/members', { name: 'Reader' });
  await f.send('Private before grant');
  const feed = await f.stream(member.token); assert.deepEqual((await feed.next()).runs, []);
  await f.ok(`/v1/rooms/${f.room.id}/policy`, { layerIds: [], memberGrants: [{ memberId: member.member.id, role: 'reader', sourceIds: [f.source.id] }] }, owner, 'PUT');
  const shared = await f.send('Shared after grant');
  const visible = await feed.next(); assert.deepEqual(visible.runs.map(run => run.id), [shared.run.id]);
  await f.ok(`/v1/rooms/${f.room.id}/policy`, { layerIds: [], memberGrants: [] }, owner, 'PUT');
  assert.deepEqual((await feed.next()).runs, []);
  await f.ok(`/v1/members/${member.member.id}/revoke`, {}); assert.equal((await feed.next()).type, 'unavailable');
  feed.close();
});
