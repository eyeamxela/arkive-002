import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createNodeServer, decryptExport, encryptExport } from '../server.mjs';
import { openBrain } from '../brain.mjs';

const PASSWORD = 'synthetic node test passphrase only';
const OWNER = 'synthetic-owner-credential-0000000000000001';
const PEER = 'synthetic-peer-credential-00000000000000001';
const ORIGIN = 'http://127.0.0.1:1420';

// Native HTTP avoids fetch's automatic Sec-Fetch-Mode header so tests can
// independently exercise machine-client and browser-origin rules.
function requestUrl(url, { method = 'GET', body, token = OWNER, headers = {}, rawBody } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method, signal: AbortSignal.timeout(10_000),
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: response.statusCode, headers: new Headers(response.headers), text,
          body: text && response.headers['content-type']?.includes('application/json') ? JSON.parse(text) : null }); }
        catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
    request.end(rawBody ?? (body === undefined ? undefined : JSON.stringify(body)));
  });
}

async function deadline(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds} ms`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

// Every path, source, credential and provider in this file is created for the test.
// realpath is important on macOS, where os.tmpdir() may contain /var symlinks.
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'arkive-service-test-')));
  const stops = [];
  t.after(async () => {
    for (const stop of stops.reverse()) await stop();
    await fs.rm(root, { recursive: true, force: true });
  });
  const node = async (name, options = {}) => {
    const instance = await createNodeServer({ directory: path.join(root, name), host: '127.0.0.1',
      port: 0, token: OWNER, syncToken: PEER, provider: {}, ...options });
    const address = await instance.start();
    let closed = false;
    const stop = async () => { if (!closed) { closed = true; await instance.close(); } };
    stops.push(stop);
    const base = `http://127.0.0.1:${address.port}`;
    const request = (route, options) => requestUrl(`${base}${route}`, options);
    const ok = async (route, options, expected = 200) => {
      const result = await request(route, options);
      assert.equal(result.status, expected, `${route}: ${JSON.stringify(result.body)}`);
      return result.body;
    };
    const create = () => ok('/v1/unlock', { method: 'POST', body: {
      passphrase: PASSWORD, create: true, template: 'personal', name: 'Synthetic test Brain',
    } });
    return { base, request, ok, create, stop, directory: instance.directory };
  };
  const provider = async (reply) => {
    const calls = [];
    const server = http.createServer(async (req, res) => {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const call = { url: req.url, headers: req.headers,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
        calls.push(call);
        const result = reply ? reply(call, calls.length) : {
          choices: [{ message: { content: `Synthetic answer ${calls.length}` } }],
        };
        if (result === null) return; // A synthetic slow provider for cancellation tests.
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch { res.writeHead(500); res.end('{}'); }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
    });
    stops.push(async () => {
      server.closeIdleConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    return { calls, config: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      apiKey: 'synthetic-provider-key', model: 'synthetic-model' } };
  };
  return { root, node, provider, cleanup: (stop) => stops.push(stop) };
}

async function object(node, title, text, sourceIds) {
  return node.ok('/v1/objects', { method: 'POST', body: { title, text, sourceIds } }, 201);
}

async function room(node, title = 'Synthetic room') {
  return node.ok('/v1/rooms', { method: 'POST', body: { title } }, 201);
}

test('owner authentication, restricted peer credentials and browser-origin checks fail closed', async (t) => {
  const { node } = await fixture(t);
  const a = await node('auth');
  assert.deepEqual(await a.ok('/health', { token: null }), { alive: true });
  for (const token of [null, 'wrong', PEER]) {
    const denied = await a.request('/v1/status', { token });
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error.code, 'UNAUTHORIZED');
  }
  const noOrigin = await a.request('/v1/status', { headers: { 'Sec-Fetch-Mode': 'cors' } });
  assert.equal(noOrigin.status, 403);
  assert.equal(noOrigin.body.error.code, 'ORIGIN_REQUIRED');
  const evilOrigin = await a.request('/v1/status', { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(evilOrigin.status, 403);
  assert.equal(evilOrigin.body.error.code, 'ORIGIN_DENIED');
  assert.equal(evilOrigin.headers.get('access-control-allow-origin'), null);
  const allowed = await a.request('/v1/status', { headers: { Origin: ORIGIN } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(allowed.headers.get('cache-control'), 'no-store');
  assert.equal((await a.request('/v1/objects', { method: 'OPTIONS', token: null, headers: { Origin: ORIGIN } })).status, 204);
  assert.equal((await a.request('/v1/objects', { method: 'OPTIONS', token: null })).status, 403);
  await a.create();
  for (const route of ['/v1/brain', '/v1/export', '/v1/folders']) {
    assert.equal((await a.request(route, { token: PEER })).status, 401);
  }
  assert.equal((await a.request('/v1/lock', { method: 'POST', token: PEER })).status, 401);
  assert.equal((await a.request('/v1/proposals', { method: 'POST', token: PEER, body: {} })).status, 401);
  const ownerReplica = await a.request('/v1/replica');
  assert.equal(ownerReplica.status, 403);
  assert.equal(ownerReplica.body.error.code, 'PEER_CREDENTIAL_REQUIRED');
  const replica = await a.ok('/v1/replica', { token: PEER });
  assert.equal(replica.format, 'arkive-brain-bundle');
});

test('locked Brain, wrong passphrase and malformed request bodies do not change stored data', async (t) => {
  const { node } = await fixture(t);
  const a = await node('locking');
  assert.deepEqual((await a.ok('/v1/status')).locked, true);
  const locked = await a.request('/v1/brain');
  assert.equal(locked.status, 423);
  assert.equal(locked.body.error.code, 'BRAIN_LOCKED');
  assert.equal((await a.request('/v1/unlock', { method: 'POST', body: { create: true, passphrase: 'short' } })).status, 400);
  assert.equal((await a.ok('/v1/status')).initialized, false);
  const created = await a.create();
  const note = await object(a, 'Keep original', 'synthetic original text');
  const duplicate = await a.request('/v1/unlock', { method: 'POST', body: { passphrase: PASSWORD } });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'ALREADY_UNLOCKED');
  const lockedStatus = await a.ok('/v1/lock', { method: 'POST' });
  assert.equal(lockedStatus.locked, true);
  assert.equal(lockedStatus.initialized, true);
  assert.equal(lockedStatus.nodeId, null);
  const wrong = await a.request('/v1/unlock', { method: 'POST', body: { passphrase: 'incorrect synthetic passphrase' } });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error.code, 'BRAIN_AUTH');
  assert.equal((await a.ok('/v1/status')).locked, true);
  assert.equal((await a.request('/v1/export')).status, 423);
  assert.equal((await a.ok('/v1/unlock', { method: 'POST', body: { passphrase: PASSWORD } })).nodeId, created.nodeId);
  for (const [rawBody, headers, expectedCode, expectedStatus] of [
    ['{}', {}, 'CONTENT_TYPE', 415],
    ['{not json', { 'Content-Type': 'application/json' }, 'JSON_INVALID', 400],
    ['[]', { 'Content-Type': 'application/json' }, 'JSON_INVALID', 400],
  ]) {
    const bad = await a.request('/v1/objects', { method: 'POST', rawBody, headers });
    assert.equal(bad.status, expectedStatus);
    assert.equal(bad.body.error.code, expectedCode);
  }
  assert.deepEqual((await a.ok('/v1/brain')).objects, [note]);
});

test('encrypted export round-trips identity, source history and rooms but resets folder grants', async (t) => {
  const { root, node } = await fixture(t);
  const a = await node('exporter');
  const b = await node('restorer');
  await a.create();
  const marker = 'synthetic confidential export marker';
  const source = await object(a, 'Synthetic document', marker);
  const savedRoom = await room(a);
  await a.ok(`/v1/rooms/${savedRoom.id}/sources`, { method: 'PUT', body: { objectIds: [source.id] } });
  const folderPath = path.join(root, 'approved-documents');
  await fs.mkdir(folderPath);
  await a.ok('/v1/folders', { method: 'POST', body: { path: folderPath } }, 201);
  const before = await a.ok('/v1/brain');
  const exported = await a.ok('/v1/export');
  assert.equal(exported.format, 'arkive-encrypted-export');
  assert.ok(!JSON.stringify(exported).includes(marker));
  assert.ok(!JSON.stringify(exported).includes(folderPath));
  assert.ok(!JSON.stringify(exported).includes(before.brainId));
  assert.deepEqual((await decryptExport(exported, PASSWORD)).state.objects, before.objects);
  assert.ok(!(await fs.readFile(path.join(a.directory, 'brain.enc'), 'utf8')).includes(marker));
  const failed = await b.request('/v1/restore', { method: 'POST', body: { bundle: exported, passphrase: 'wrong restore passphrase' } });
  assert.equal(failed.status, 400);
  assert.equal(failed.body.error.code, 'EXPORT_AUTH');
  assert.equal((await b.ok('/v1/status')).initialized, false);
  const tampered = structuredClone(exported);
  const bytes = Buffer.from(tampered.data, 'base64'); bytes[0] ^= 1; tampered.data = bytes.toString('base64');
  assert.equal((await b.request('/v1/restore', { method: 'POST', body: { bundle: tampered, passphrase: PASSWORD } })).body.error.code, 'EXPORT_AUTH');
  const restored = await b.ok('/v1/restore', { method: 'POST', body: { bundle: exported, passphrase: PASSWORD } });
  assert.equal(restored.nodeId, before.brainId);
  const after = await b.ok('/v1/brain');
  for (const key of ['objects', 'revisions', 'rooms', 'proposals']) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(after.folders, []);
  const again = await b.request('/v1/restore', { method: 'POST', body: { bundle: exported, passphrase: PASSWORD } });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'RESTORE_NOT_EMPTY');
});

test('configured chat sends only current selected sources with explicit approval and labels output unverified', async (t) => {
  const f = await fixture(t);
  const model = await f.provider((_call, count) => ({ choices: [{ message: {
    content: count === 1 ? 'Prior answer containing old selected evidence' : 'Current synthetic answer',
  } }] }));
  const a = await f.node('chat', { provider: model.config });
  await a.create();
  const selected = await object(a, 'Selected', 'CURRENT_SELECTED_SYNTHETIC_SOURCE');
  const excluded = await object(a, 'Excluded', 'DO_NOT_SEND_UNSELECTED_SYNTHETIC_SOURCE');
  const savedRoom = await room(a);
  const route = `/v1/rooms/${savedRoom.id}/messages`;
  await a.ok(`/v1/rooms/${savedRoom.id}/sources`, { method: 'PUT', body: { objectIds: [excluded.id] } });
  assert.equal((await a.request(route, { method: 'POST', body: { text: 'No approval' } })).status, 400);
  assert.equal(model.calls.length, 0);
  assert.deepEqual((await a.ok('/v1/brain')).rooms[0].messages, []);
  const first = await a.ok(route, { method: 'POST', body: { text: 'Prior user question', allowExternal: true } });
  assert.equal(first.assistant.status, 'model-output-unverified');
  await a.ok(`/v1/rooms/${savedRoom.id}/sources`, { method: 'PUT', body: { objectIds: [selected.id] } });
  const second = await a.ok(route, { method: 'POST', body: { text: 'Current question', allowExternal: true,
    provider: 'openai-compatible', model: model.config.model } });
  assert.equal(model.calls.length, 2);
  const latest = model.calls[1];
  assert.equal(latest.url, '/v1/chat/completions');
  assert.equal(latest.headers.authorization, `Bearer ${model.config.apiKey}`);
  assert.equal(latest.body.model, model.config.model);
  assert.equal(latest.body.messages.length, 3);
  assert.deepEqual(latest.body.messages.map((message) => message.role), ['system', 'user', 'user']);
  assert.match(latest.body.messages[1].content, /Untrusted source evidence/);
  const sent = JSON.stringify(latest.body);
  for (const included of [selected.text, selected.id, selected.revisionId, 'Current question']) assert.ok(sent.includes(included));
  for (const omitted of [excluded.text, excluded.id, excluded.revisionId, 'Prior answer containing old selected evidence', 'Prior user question', PASSWORD, OWNER]) {
    assert.ok(!sent.includes(omitted), `Excluded context was sent: ${omitted}`);
  }
  assert.equal(second.assistant.status, 'model-output-unverified');
  assert.deepEqual(second.assistant.sourceIds, [selected.id]);
  assert.deepEqual(second.context, [{ sourceId: selected.id, revisionId: selected.revisionId }]);
  assert.match(second.citationStatus, /not independently verified/i);
  assert.equal((await a.ok('/v1/brain')).rooms[0].messages.length, 4);
  // Deselecting everything must also exclude the current room's prior answers.
  await a.ok(`/v1/rooms/${savedRoom.id}/sources`, { method: 'PUT', body: { objectIds: [] } });
  const empty = await a.ok(route, { method: 'POST', body: { text: 'No sources now', allowExternal: true } });
  assert.deepEqual(empty.context, []);
  assert.match(model.calls[2].body.messages[1].content, /\[\]$/);
  assert.ok(!JSON.stringify(model.calls[2].body).includes(selected.text));
  assert.ok(!JSON.stringify(model.calls[2].body).includes('Current synthetic answer'));
});

test('unconfigured provider and invalid provider responses fail without inventing or storing answers', async (t) => {
  const f = await fixture(t);
  const unconfigured = await f.node('no-provider');
  await unconfigured.create();
  const savedRoom = await room(unconfigured);
  const status = await unconfigured.ok('/v1/status');
  assert.equal(status.providers.find((provider) => provider.id === 'openai-compatible').configured, false);
  const failed = await unconfigured.request(`/v1/rooms/${savedRoom.id}/messages`, {
    method: 'POST', body: { text: 'Do not fake an answer', allowExternal: true },
  });
  assert.equal(failed.status, 400);
  assert.match(failed.body.error.message, /provider.*configured/i);
  assert.deepEqual((await unconfigured.ok('/v1/brain')).rooms[0].messages, []);
  const model = await f.provider(() => ({ choices: [{ message: { content: '' } }] }));
  const invalid = await f.node('invalid-provider', { provider: model.config });
  await invalid.create();
  const invalidRoom = await room(invalid);
  const route = `/v1/rooms/${invalidRoom.id}/messages`;
  for (const body of [
    { text: 'Wrong model', allowExternal: true, model: 'not-configured' },
    { text: 'Unavailable adapter', allowExternal: true, provider: 'hermes' },
  ]) assert.equal((await invalid.request(route, { method: 'POST', body })).status, 400);
  assert.equal(model.calls.length, 0);
  assert.equal((await invalid.request(route, { method: 'POST', body: { text: 'Invalid answer', allowExternal: true } })).status, 400);
  assert.equal(model.calls.length, 1);
  assert.deepEqual((await invalid.ok('/v1/brain')).rooms[0].messages, []);
});

test('source references are validated and memory remains a proposal until owner review', async (t) => {
  const { node } = await fixture(t);
  const a = await node('memory');
  await a.create();
  const source = await object(a, 'Evidence', 'synthetic supporting evidence');
  const derived = await object(a, 'Derived note', 'source-linked note', [source.id]);
  assert.deepEqual(derived.sourceIds, [source.id]);
  const bypass = await a.request('/v1/objects', { method: 'POST', body: {
    title: 'Unreviewed memory bypass', text: 'Must remain unpromoted', kind: 'memory', sourceIds: [source.id],
  } });
  assert.equal(bypass.status, 400);
  const missing = `obj_${randomUUID()}`;
  assert.equal((await a.request('/v1/objects', { method: 'POST', body: { title: 'Invalid', text: 'Invalid', sourceIds: [missing] } })).status, 400);
  const savedRoom = await room(a);
  const invalidSelection = await a.request(`/v1/rooms/${savedRoom.id}/sources`, { method: 'PUT', body: { objectIds: [missing] } });
  assert.equal(invalidSelection.status, 400);
  assert.deepEqual((await a.ok('/v1/brain')).rooms[0].selectedSourceIds, []);
  assert.equal((await a.request('/v1/proposals', { method: 'POST', body: { title: 'No evidence', text: 'claim', sourceIds: [] } })).status, 400);
  const proposal = await a.ok('/v1/proposals', { method: 'POST', body: {
    title: 'Reviewed memory', text: 'Evidence-backed synthetic memory', sourceIds: [source.id],
  } }, 201);
  assert.equal(proposal.status, 'pending');
  assert.equal((await a.ok('/v1/brain')).objects.length, 2);
  const reviewRoute = `/v1/proposals/${proposal.id}/review`;
  assert.equal((await a.request(reviewRoute, { method: 'POST', token: PEER, body: { decision: 'accept' } })).status, 401);
  assert.equal((await a.request(reviewRoute, { method: 'POST', body: { decision: 'auto-approve' } })).status, 400);
  const reviewed = await a.ok(reviewRoute, { method: 'POST', body: { decision: 'accept' } });
  assert.equal(reviewed.status, 'accepted');
  const state = await a.ok('/v1/brain');
  const memory = state.objects.find((item) => item.id === reviewed.objectId);
  assert.equal(memory.kind, 'memory');
  assert.deepEqual(memory.sourceIds, [source.id]);
  assert.equal((await a.request(reviewRoute, { method: 'POST', body: { decision: 'reject' } })).body.error.code, 'BRAIN_CONFLICT');
  const rejected = await a.ok('/v1/proposals', { method: 'POST', body: { title: 'Rejected', text: 'Do not promote', sourceIds: [source.id] } }, 201);
  assert.equal((await a.ok(`/v1/proposals/${rejected.id}/review`, { method: 'POST', body: { decision: 'reject' } })).status, 'rejected');
  assert.equal((await a.ok('/v1/brain')).objects.length, 3);
});

test('manual folder refresh ignores hidden, sensitive, unsupported and linked files and preserves immutable revisions', async (t) => {
  const { root, node } = await fixture(t);
  const a = await node('folders');
  await a.create();
  const documents = path.join(root, 'documents');
  const nested = path.join(documents, 'nested');
  const hidden = path.join(documents, '.hidden');
  const excluded = path.join(documents, 'node_modules');
  const outside = path.join(root, 'outside');
  for (const directory of [documents, nested, hidden, excluded, outside]) await fs.mkdir(directory);
  const ordinary = path.join(documents, 'ordinary.md');
  await fs.writeFile(ordinary, 'original synthetic source');
  await fs.writeFile(path.join(nested, 'SECOND.TXT'), 'nested synthetic source');
  for (const filename of ['.private.md', '.env', 'credentials.txt', 'passwords.md', 'api-token.md', 'private-key.txt', 'picture.png']) {
    await fs.writeFile(path.join(documents, filename), `excluded synthetic ${filename}`);
  }
  await fs.writeFile(path.join(hidden, 'invisible.md'), 'hidden synthetic source');
  await fs.writeFile(path.join(excluded, 'dependency.md'), 'dependency synthetic source');
  await fs.writeFile(path.join(outside, 'external.md'), 'OUTSIDE_SYNTHETIC_MUST_NOT_IMPORT');
  await fs.writeFile(path.join(documents, 'binary.txt'), Buffer.from([0, 65, 66]));
  await fs.writeFile(path.join(documents, 'invalid-utf8.txt'), Buffer.from([0xc3, 0x28]));
  await fs.writeFile(path.join(documents, 'oversized.txt'), 'x'.repeat(1024 * 1024 + 1));
  await fs.symlink(path.join(outside, 'external.md'), path.join(documents, 'linked.md'));
  await fs.symlink(outside, path.join(documents, 'linked-directory'));
  const alias = path.join(root, 'documents-alias');
  await fs.symlink(documents, alias);
  for (const location of [alias, path.join(alias, 'nested'), excluded, path.join(documents, '.env')]) {
    assert.equal((await a.request('/v1/folders', { method: 'POST', body: { path: location } })).status, 400);
  }
  const registered = await a.ok('/v1/folders', { method: 'POST', body: { path: documents } }, 201);
  assert.equal((await a.ok('/v1/folders', { method: 'POST', body: { path: documents } }, 201)).id, registered.id);
  const route = `/v1/folders/${registered.id}/refresh`;
  const initial = await a.ok(route, { method: 'POST' });
  assert.equal(initial.imported, 2);
  assert.ok(initial.skipped >= 12);
  const first = await a.ok('/v1/brain');
  assert.deepEqual(first.objects.map((item) => item.title).sort(), ['SECOND.TXT', 'ordinary.md']);
  assert.equal(first.revisions.length, 2);
  assert.ok(!JSON.stringify(first).includes('OUTSIDE_SYNTHETIC_MUST_NOT_IMPORT'));
  assert.equal(await fs.readFile(ordinary, 'utf8'), 'original synthetic source');
  await a.ok(route, { method: 'POST' });
  assert.equal((await a.ok('/v1/brain')).revisions.length, 2);
  await fs.writeFile(ordinary, 'revised synthetic source');
  await a.ok(route, { method: 'POST' });
  const revised = await a.ok('/v1/brain');
  const prior = first.objects.find((item) => item.sourcePath === ordinary);
  const current = revised.objects.find((item) => item.sourcePath === ordinary);
  assert.equal(current.id, prior.id);
  assert.notEqual(current.revisionId, prior.revisionId);
  assert.equal(revised.revisions.length, 3);
  assert.equal(revised.revisions.find((item) => item.id === prior.revisionId).text, 'original synthetic source');
  await fs.unlink(ordinary);
  await a.ok(route, { method: 'POST' });
  assert.equal((await a.ok('/v1/brain')).objects.length, 2);
});

test('paired nodes replicate only source/revision data and preserve both divergent heads', async (t) => {
  const { root, node } = await fixture(t);
  const a = await node('node-a');
  const b = await node('node-b');
  await a.create();
  const documents = path.join(root, 'shared-test-documents');
  await fs.mkdir(documents);
  const file = path.join(documents, 'shared.md');
  await fs.writeFile(file, 'base revision');
  const folderA = await a.ok('/v1/folders', { method: 'POST', body: { path: documents } }, 201);
  const refreshA = () => a.ok(`/v1/folders/${folderA.id}/refresh`, { method: 'POST' });
  await refreshA();
  const original = (await a.ok('/v1/brain')).objects[0];
  await b.ok('/v1/restore', { method: 'POST', body: { bundle: await a.ok('/v1/export'), passphrase: PASSWORD } });
  assert.deepEqual((await b.ok('/v1/brain')).folders, []);
  const roomA = await room(a, 'A-local-only room');
  const roomB = await room(b, 'B-local-only room');
  await b.ok('/v1/proposals', { method: 'POST', body: { title: 'B-local-only pending approval', text: 'Do not sync approval', sourceIds: [original.id] } }, 201);
  const folderB = await b.ok('/v1/folders', { method: 'POST', body: { path: documents } }, 201);
  const refreshB = () => b.ok(`/v1/folders/${folderB.id}/refresh`, { method: 'POST' });
  const newSource = await object(b, 'New B source', 'new B synthetic content');
  const replica = await b.ok('/v1/replica', { token: PEER });
  for (const key of ['rooms', 'folders', 'proposals', 'audit', 'conflicts']) assert.deepEqual(replica.state[key], []);
  for (const excluded of ['B-local-only room', 'B-local-only pending approval', PASSWORD, OWNER]) assert.ok(!JSON.stringify(replica).includes(excluded));
  const sync = () => a.ok('/v1/sync', { method: 'POST', body: { url: b.base, token: PEER } });
  const imported = await sync();
  assert.equal(imported.pulled.importedObjects, 1);
  assert.equal(imported.pulled.importedRevisions, 1);
  assert.match(imported.note, /stay local/i);
  const afterFirst = await a.ok('/v1/brain');
  assert.ok(afterFirst.objects.some((item) => item.id === newSource.id));
  assert.deepEqual(afterFirst.rooms.map((item) => item.id), [roomA.id]);
  assert.deepEqual(afterFirst.proposals, []);
  assert.deepEqual(afterFirst.folders.map((item) => item.id), [folderA.id]);
  assert.deepEqual((await b.ok('/v1/brain')).rooms.map((item) => item.id), [roomB.id]);
  const repeat = await sync();
  assert.deepEqual(repeat.pulled, { importedObjects: 0, importedRevisions: 0, conflicts: 0 });
  assert.deepEqual(repeat.pushed, { importedObjects: 0, importedRevisions: 0, conflicts: 0 });
  // Both owner requests wait on peer traffic; peer handling must not wait on
  // the same owner queue, or reciprocal sync deadlocks until HTTP timeout.
  const reciprocal = await deadline(Promise.all([sync(), b.ok('/v1/sync', {
    method: 'POST', body: { url: a.base, token: PEER },
  })]), 5000, 'Concurrent reciprocal sync');
  assert.equal(reciprocal.length, 2);
  for (const result of reciprocal) assert.deepEqual(result.pulled, { importedObjects: 0, importedRevisions: 0, conflicts: 0 });
  await fs.writeFile(file, 'B fast-forward revision');
  await refreshB();
  const fastForward = (await b.ok('/v1/brain')).objects.find((item) => item.id === original.id);
  assert.equal((await sync()).pulled.importedRevisions, 1);
  assert.equal((await a.ok('/v1/brain')).objects.find((item) => item.id === original.id).revisionId, fastForward.revisionId);
  await fs.writeFile(file, 'A divergent revision');
  await refreshA();
  await fs.writeFile(file, 'B divergent revision');
  await refreshB();
  const local = (await a.ok('/v1/brain')).objects.find((item) => item.id === original.id);
  const remote = (await b.ok('/v1/brain')).objects.find((item) => item.id === original.id);
  const divergent = await sync();
  assert.equal(divergent.pulled.conflicts, 1);
  assert.equal(divergent.pushed.conflicts, 1);
  for (const [node, own, other] of [[a, local, remote], [b, remote, local]]) {
    const state = await node.ok('/v1/brain');
    assert.equal(state.objects.find((item) => item.id === original.id).revisionId, own.revisionId);
    assert.ok(state.revisions.some((item) => item.id === other.revisionId));
    assert.equal(state.conflicts.length, 1);
    assert.equal(state.conflicts[0].localRevisionId, own.revisionId);
    assert.equal(state.conflicts[0].remoteRevisionId, other.revisionId);
  }
  assert.equal((await sync()).pulled.conflicts, 0);
});

test('sync rejects different Brain identities before any local sources reach the peer', async (t) => {
  const { node } = await fixture(t);
  const a = await node('different-a');
  const b = await node('different-b');
  await a.create(); await b.create();
  await object(a, 'A private synthetic source', 'MUST_NOT_REACH_DIFFERENT_BRAIN');
  await object(b, 'B source', 'Other Brain');
  const beforeA = await a.ok('/v1/brain');
  const beforeB = await b.ok('/v1/brain');
  const result = await a.request('/v1/sync', { method: 'POST', body: { url: b.base, token: PEER } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'BRAIN_CONFLICT');
  assert.deepEqual(await a.ok('/v1/brain'), beforeA);
  assert.deepEqual(await b.ok('/v1/brain'), beforeB);
});

test('encrypted export accepts envelopes larger than 32 MiB without exposing plaintext', async () => {
  // This tests the encrypted transport envelope, not Brain schema validation.
  // A valid 25 MiB plaintext needs over 32 MiB after base64 expansion.
  const bundle = { syntheticPayload: 'x'.repeat(25 * 1024 * 1024) };
  const encrypted = await encryptExport(bundle, PASSWORD);
  assert.ok(encrypted.data.length > 32 * 1024 * 1024);
  const decrypted = await decryptExport(encrypted, PASSWORD);
  assert.equal(decrypted.syntheticPayload.length, bundle.syntheticPayload.length);
  assert.equal(decrypted.syntheticPayload, bundle.syntheticPayload);
});

test('static UI serves only compiled public assets and same-origin API reads still require owner authentication', async (t) => {
  const { root, node } = await fixture(t);
  const ui = path.join(root, 'compiled-ui');
  await fs.mkdir(path.join(ui, 'assets'), { recursive: true });
  await fs.writeFile(path.join(ui, 'local.html'), '<!doctype html><title>Synthetic Personal UI</title>');
  await fs.writeFile(path.join(ui, 'assets', 'personal-test.js'), 'globalThis.syntheticUi = true;');
  await fs.writeFile(path.join(ui, 'assets', 'personal-test.css'), 'body { color: black; }');
  await fs.writeFile(path.join(ui, 'not-public.txt'), 'SYNTHETIC_PRIVATE_NOT_AN_ASSET');
  await fs.writeFile(path.join(root, 'outside.js'), 'SYNTHETIC_EXTERNAL_FILE_NOT_AN_ASSET');
  await fs.symlink(path.join(root, 'outside.js'), path.join(ui, 'assets', 'linked.js'));
  const a = await node('static-node', { staticDirectory: ui, allowedOrigins: ['http://synthetic-ui.example'] });
  for (const route of ['/', '/local.html']) {
    const result = await a.request(route, { token: null });
    assert.equal(result.status, 200);
    assert.match(result.text, /Synthetic Personal UI/);
    assert.match(result.headers.get('content-type'), /text\/html/);
    assert.match(result.headers.get('content-security-policy'), /default-src 'self'/);
  }
  for (const [route, mime] of [['/assets/personal-test.js', 'text/javascript'], ['/assets/personal-test.css', 'text/css']]) {
    const result = await a.request(route, { token: null });
    assert.equal(result.status, 200);
    assert.ok(result.headers.get('content-type').startsWith(mime));
  }
  for (const route of ['/not-public.txt', '/assets/linked.js', '/assets/../not-public.txt', '/assets/personal-test.js.map', '/brain.enc']) {
    const result = await a.request(route);
    assert.equal(result.status, 423); // Authenticated, but no Brain opened; never a file read.
    assert.ok(!result.text.includes('SYNTHETIC_PRIVATE_NOT_AN_ASSET'));
    assert.ok(!result.text.includes('SYNTHETIC_EXTERNAL_FILE_NOT_AN_ASSET'));
  }
  const sameOriginHeaders = { 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin', Host: 'synthetic-ui.example' };
  assert.equal((await a.request('/v1/status', { headers: sameOriginHeaders })).status, 200);
  assert.equal((await a.request('/v1/status', { token: null, headers: sameOriginHeaders })).status, 401);
  assert.equal((await a.request('/v1/status', { headers: { ...sameOriginHeaders, Host: 'untrusted.example' } })).status, 403);
  assert.equal((await a.request('/v1/status', { headers: { ...sameOriginHeaders, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
});

test('desktop stdin EOF cancels an in-flight provider call and releases the Brain writer lock', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t);
  let markReceived;
  const received = new Promise((resolve) => { markReceived = resolve; });
  const model = await f.provider(() => { markReceived(); return null; });
  const directory = path.join(f.root, 'desktop-child');
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ARKIVE_')));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url)), '--desktop', '--data-dir', directory], {
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...environment, ARKIVE_HOST: '127.0.0.1', ARKIVE_PORT: '0',
      ARKIVE_TOKEN: OWNER, ARKIVE_MODEL_BASE_URL: model.config.baseUrl,
      ARKIVE_MODEL: model.config.model, ARKIVE_MODEL_API_KEY: model.config.apiKey },
  });
  let stderr = ''; child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  f.cleanup(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 1000);
      try { await exited; } finally { clearTimeout(force); }
    }
  });
  const ready = await deadline(new Promise((resolve, reject) => {
    let output = ''; child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('\n')) {
        try { resolve(JSON.parse(output.slice(0, output.indexOf('\n')))); } catch (error) { reject(error); }
      }
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Desktop node exited before ready (${code}): ${stderr}`)));
  }), 5000, 'Desktop readiness');
  assert.equal(ready.token, OWNER);
  const base = `http://127.0.0.1:${ready.port}`;
  const request = (route, options) => requestUrl(`${base}${route}`, options);
  assert.equal((await request('/v1/unlock', { method: 'POST', body: { passphrase: PASSWORD, create: true } })).status, 200);
  const savedRoom = await request('/v1/rooms', { method: 'POST', body: { title: 'Pending desktop chat' } });
  assert.equal(savedRoom.status, 201);
  const pending = request(`/v1/rooms/${savedRoom.body.id}/messages`, {
    method: 'POST', body: { text: 'Wait for synthetic slow provider', allowExternal: true },
  }).catch((error) => error);
  await deadline(received, 5000, 'Synthetic provider request');
  const started = Date.now();
  child.stdin.end();
  const exit = await deadline(exited, 5000, 'Desktop shutdown');
  assert.deepEqual(exit, { code: 0, signal: null }, stderr);
  assert.ok(Date.now() - started < 5000);
  const cancelled = await pending;
  assert.ok(cancelled instanceof Error, 'In-flight client request should be cancelled during shutdown');
  await assert.rejects(fs.access(path.join(directory, '.brain.lock')), { code: 'ENOENT' });
  const reopened = await openBrain(directory, PASSWORD);
  try { assert.deepEqual((await reopened.snapshot()).rooms[0].messages, []); }
  finally { await reopened.close(); }
});
