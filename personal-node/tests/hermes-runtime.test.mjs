import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createNodeServer } from '../server.mjs';
import { createHermesRuntime, hermesFingerprint, readHermesEvents } from '../hermes-runtime.mjs';

const owner = 'synthetic-hermes-owner-credential-000000001';
const passphrase = 'Synthetic Hermes runtime passphrase';
export const capabilities = { object: 'hermes.api_server.capabilities', platform: 'hermes-agent', runtime: { mode: 'server_agent' }, auth: { required: true },
  features: { run_submission: true, run_events_sse: true, run_stop: true, run_approval_response: true } };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arkive-hermes-runtime-'));
  const requests = []; let stream; let mode = 'approval'; let requestId = 0;
  const ready = deferred();
  const upstream = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ path: req.url, body, authorization: req.headers.authorization, key: req.headers['idempotency-key'] });
    const json = value => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.url === '/v1/capabilities') return json(capabilities);
    if (req.url === '/v1/runs') return json({ object: 'hermes.run', run_id: `remote_${++requestId}` });
    if (req.url.endsWith('/events')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }); stream = res;
      const id = `remote_${requestId}`;
      const event = value => res.write(`data: ${JSON.stringify({ run_id: id, ...value })}\n\n`);
      event({ event: 'message.delta', delta: 'Synthetic streamed answer' });
      event({ event: 'tool.started', tool: 'synthetic_read' });
      if (mode === 'disconnect') { res.end(); return; }
      if (mode === 'complete') { event({ event: 'run.completed', completed: true, output: 'Synthetic final answer', runtime: { model: 'fixture-model' } }); res.end(); return; }
      event({ event: 'approval.request', request_id: 'approval_exact', command: 'echo synthetic', description: 'Fixture approval', choices: ['once', 'session', 'always', 'deny'] });
      ready.resolve(); return;
    }
    if (req.url.endsWith('/approval')) {
      json({ object: 'hermes.run.approval_response', run_id: `remote_${requestId}`, request_id: body.request_id, choice: body.choice, resolved: 1 });
      stream.write(`data: ${JSON.stringify({ run_id: `remote_${requestId}`, event: 'tool.completed', tool: 'synthetic_read' })}\n\n`);
      stream.end(`data: ${JSON.stringify({ run_id: `remote_${requestId}`, event: 'run.completed', completed: true, output: 'Synthetic final answer', runtime: { model: 'fixture-model' } })}\n\n`); return;
    }
    if (req.url.endsWith('/stop')) { stream?.end(); return json({ stopping: true }); }
    res.writeHead(404); res.end('{}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${upstream.address().port}`;
  const node = await createNodeServer({ directory, token: owner, allowedOrigins: ['http://127.0.0.1:4319'] }); const address = await node.start();
  t.after(async () => { stream?.destroy(); await node.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const call = async (route, body, credential = owner) => {
    const res = await fetch(`http://127.0.0.1:${address.port}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${credential}`, Origin: 'http://127.0.0.1:4319', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  const ok = async (...args) => { const r = await call(...args); assert.ok(r.status < 300, JSON.stringify(r)); return r.body; };
  await ok('/v1/unlock', { passphrase, create: true, template: 'personal', name: 'Synthetic runtime Brain' });
  const room = await ok('/v1/rooms', { title: 'Private Hermes test' });
  const saved = await ok('/v1/settings/harnesses', { action: 'save', name: 'Fixture Hermes', baseUrl: origin, token: 'synthetic-gateway-secret', enabled: true, model: 'fixture-model', executionEnabled: true, runtimeAcknowledged: true, expectedRevision: 'empty', confirm: true });
  const routes = await ok('/v1/settings/chat-routing'); const provider = routes.rooms.find(row => row.roomId === room.id).providers.find(row => row.id.startsWith('hermes:'));
  const send = patch => call(`/v1/rooms/${room.id}/messages`, { text: 'Synthetic question', provider: provider.id, model: provider.model, expectedProviderKey: provider.configurationKey, allowExternal: true, ...patch });
  const progress = async () => {
    const abort = new AbortController(); const res = await fetch(`http://127.0.0.1:${address.port}/v1/run-events`, { headers: { Authorization: `Bearer ${owner}`, Origin: 'http://127.0.0.1:4319' }, signal: abort.signal });
    const reader = res.body.getReader(); let buffer = ''; const decoder = new TextDecoder();
    while (!buffer.includes('\n')) { const r = await reader.read(); if (r.done) break; buffer += decoder.decode(r.value); }
    abort.abort(); await reader.cancel().catch(() => {});
    return JSON.parse(buffer.split('\n')[0]);
  };
  return { call, ok, room, saved, send, requests, ready, progress, mode: value => { mode = value; } };
}

test('real HTTP Hermes run streams, maps exact once approval concurrently, and persists the scoped receipt', async t => {
  const f = await fixture(t); assert.equal(f.requests.length, 0, 'Saving/routing never calls Hermes');
  const completion = f.send(); await Promise.race([f.ready.promise, completion.then(value => { throw new Error(`Run ended before approval: ${JSON.stringify(value)}`); })]);
  let progress;
  for (let i = 0; i < 30; i++) { progress = await f.progress(); if (progress.runs[0]?.runtime?.approvals.length) break; }
  const run = progress.runs[0]; assert.equal(run.runtime.text, 'Synthetic streamed answer');
  assert.deepEqual(run.runtime.approvals[0].choices, ['once', 'deny']);
  assert.ok(!JSON.stringify(progress).includes('synthetic-gateway-secret'));
  assert.equal((await f.call(`/v1/hermes/runs/${run.id}/control`, { action: 'approval', requestId: 'wrong', choice: 'once' })).status, 409);
  assert.equal((await f.call(`/v1/hermes/runs/${run.id}/control`, { action: 'approval', requestId: 'approval_exact', choice: 'always' })).status, 409);
  assert.equal((await f.ok(`/v1/hermes/runs/${run.id}/control`, { action: 'approval', requestId: 'approval_exact', choice: 'once' })).confirmed, true);
  const result = await completion; assert.equal(result.status, 200); assert.equal(result.body.assistant.text, 'Synthetic final answer');
  assert.equal(result.body.run.providerId, 'hermes');
  const submitted = f.requests.find(row => row.path === '/v1/runs');
  assert.equal(submitted.key, run.id); assert.equal(submitted.body.session_id, `arkive_${run.id}`);
  assert.equal(submitted.body.previous_response_id, undefined);
  assert.match(submitted.body.conversation_history[0].content, /Untrusted source evidence/);
  assert.equal(f.requests.filter(row => row.path.endsWith('/approval')).length, 1);
  const brain = await f.ok('/v1/brain'); assert.equal(brain.audit.find(row => row.type === 'hermes.approval.once.confirmed').details.requestId, 'approval_exact');
  assert.equal(brain.audit.find(row => row.type === 'hermes.accepted').details.remoteRunId, 'remote_1');
  assert.match(brain.audit.find(row => row.type === 'hermes.approval.request').details.commandHash, /^[a-f0-9]{64}$/);
  await f.ok('/v1/lock', {}); await f.ok('/v1/unlock', { passphrase });
  assert.equal((await f.ok('/v1/brain')).rooms.find(row => row.id === f.room.id).messages.length, 2);
});

test('Hermes stale consent and members fail before disclosure; disconnect fails and stops without replay', async t => {
  const f = await fixture(t);
  assert.equal((await f.send({ allowExternal: false })).status, 409);
  assert.equal((await f.send({ expectedProviderKey: 'stale' })).status, 409);
  assert.equal(f.requests.length, 0);
  const member = await f.ok('/v1/members', { name: 'Synthetic member' });
  assert.equal((await f.call('/v1/hermes/runs/missing/control', { action: 'stop' }, member.token)).status, 403);
  f.mode('disconnect'); const failed = await f.send(); assert.equal(failed.status, 502);
  assert.equal(f.requests.filter(row => row.path === '/v1/runs').length, 1);
  assert.equal(f.requests.filter(row => row.path.endsWith('/stop')).length, 1);
  const brain = await f.ok('/v1/brain'); assert.equal(brain.rooms.find(row => row.id === f.room.id).messages.length, 0);
  assert.equal(brain.governance.runs[0].state, 'failed');
});

test('Hermes explicit stop unblocks a waiting stream and never publishes partial output', async t => {
  const f = await fixture(t); const result = f.send(); await Promise.race([f.ready.promise, result.then(value => { throw new Error(`Run ended before approval: ${JSON.stringify(value)}`); })]);
  const run = (await f.progress()).runs[0];
  const stopped = await f.ok(`/v1/hermes/runs/${run.id}/control`, { action: 'stop' }); assert.equal(stopped.stopping, true);
  assert.equal((await result).status, 502);
  assert.equal(f.requests.filter(row => row.path.endsWith('/stop')).length, 1);
});

test('Hermes private-room guard, capability guard and key fingerprint prevent widening', async () => {
  const connection = { id: 'test', baseUrl: 'http://127.0.0.1:4321', token: 'synthetic', model: 'fixture', enabled: true, executionEnabled: true };
  const input = { provider: 'hermes:test', model: connection.model, expectedProviderKey: hermesFingerprint(connection), allowExternal: true, text: 'hello' };
  assert.notEqual(hermesFingerprint(connection), hermesFingerprint({ ...connection, token: 'changed' }));
  let calls = 0;
  const runtime = createHermesRuntime({ settings: { execution: () => connection }, request: async () => { calls++; return capabilities; } });
  await assert.rejects(runtime.execute({}, 'room', input, { owner: false }), /owner-only/);
  const shared = { snapshot: async () => ({ governance: { roomPolicies: [{ roomId: 'room', memberGrants: [{}] }] } }) };
  await assert.rejects(runtime.execute(shared, 'room', input, { owner: true }), /private owner-only/); assert.equal(calls, 0);
  const unsupported = createHermesRuntime({ settings: { execution: () => connection }, request: async () => ({ ...capabilities, auth: { required: false } }) });
  await assert.rejects(unsupported.execute({ snapshot: async () => ({}) }, 'room', input, { owner: true }), /authenticated/);
});

test('SSE transport blocks redirects, malformed frames and oversize frames', async t => {
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: 'http://169.254.169.254/' }); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(req.url === '/large' ? `data: ${'x'.repeat(270000)}` : 'data: not-json\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  for (const route of ['/redirect', '/large', '/invalid']) await assert.rejects(readHermesEvents(`http://127.0.0.1:${server.address().port}${route}`, { signal: AbortSignal.timeout(2000), onEvent: () => assert.fail('No invalid event should be delivered') }));
});
