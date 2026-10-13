import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createProviderSettings } from '../provider-settings.mjs';
import { createNodeServer, encryptExport, decryptExport } from '../server.mjs';
import { executeChat, executeApprovedRun } from '../execution.mjs';

const passphrase = 'Synthetic settings passphrase';
const secret = 'synthetic-provider-key-never-real';
const owner = 'synthetic-settings-owner-token-'.repeat(2);
const input = { expectedRevision: 'environment', enabled: true, baseUrl: 'http://127.0.0.1:12345/v1', model: 'fixture-model', timeoutMs: 45000, apiKey: secret, temperature: 0.3, maxTokens: 500 };
async function fixture(t, initial = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arkive-provider-settings-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const args = { directory, initial, encrypt: encryptExport, decrypt: decryptExport };
  return { directory, args, settings: createProviderSettings(args) };
}

test('provider settings are encrypted, redacted, restartable and revision guarded', async t => {
  const { directory, settings, args } = await fixture(t);
  const value = await settings.save(input, passphrase);
  assert.equal(value.hasApiKey, true); assert.equal(value.apiKey, undefined);
  assert.ok(!JSON.stringify(value).includes(secret));
  const file = await readFile(path.join(directory, 'provider-settings.enc'), 'utf8');
  assert.ok(!file.includes(secret) && !file.includes(input.model));
  assert.equal((await stat(path.join(directory, 'provider-settings.enc'))).mode & 0o777, 0o600);
  await assert.rejects(settings.save(input, passphrase), /changed/);
  const reopened = createProviderSettings(args); await reopened.load(passphrase);
  assert.deepEqual(reopened.snapshot(), value); assert.equal(reopened.config().apiKey, secret);
  reopened.clear(); assert.equal(reopened.snapshot().hasApiKey, false);
  await assert.rejects(reopened.load('wrong passphrase'), /Cannot unlock/);
  assert.equal(reopened.snapshot().hasApiKey, false);
});

test('provider validation blocks unsafe endpoints, invalid parameters, key reuse at another endpoint and symlink reads', async t => {
  const { directory, settings } = await fixture(t);
  for (const patch of [{ baseUrl: 'http://8.8.8.8/v1' }, { baseUrl: 'https://169.254.169.254/v1' }, { baseUrl: 'https://user:pass@8.8.8.8/v1' }, { baseUrl: 'https://8.8.8.8/v1?key=secret' }, { baseUrl: 'http://127.0.0.1/v1/chat/completions' }, { model: '' }, { apiKey: 'bad\nkey' }, { apiKey: 0 }, { timeoutMs: 60000 }, { temperature: 3 }, { maxTokens: 0 }, { toolAccess: true }]) {
    await assert.rejects(settings.save({ ...input, ...patch }, passphrase));
    assert.equal(settings.snapshot().revision, 'environment');
  }
  const value = await settings.save(input, passphrase);
  await assert.rejects(settings.save({ ...input, apiKey: '', baseUrl: 'http://127.0.0.1:23456/v1', expectedRevision: value.revision }, passphrase), /new key/);
  const cleared = await settings.save({ ...input, apiKey: '', clearApiKey: true, baseUrl: 'http://127.0.0.1:23456/v1', expectedRevision: value.revision }, passphrase);
  assert.equal(cleared.hasApiKey, false);
  const linked = await fixture(t);
  await symlink(path.join(directory, 'provider-settings.enc'), path.join(linked.directory, 'provider-settings.enc'));
  await assert.rejects(linked.settings.load(passphrase), /Cannot read/);
});

test('model-list check requires exact saved revision and consent, sends no context and sanitizes failures', async t => {
  const requests = [];
  const { settings } = await fixture(t, { request: async (url, options) => { requests.push({ url, options }); return { data: [{ id: 'fixture-model' }] }; } });
  const saved = await settings.save(input, passphrase);
  await assert.rejects(settings.check({ expectedRevision: saved.revision }), /Confirm/);
  await assert.rejects(settings.check({ expectedRevision: 'old', allowExternal: true }), /changed/);
  assert.equal(requests.length, 0);
  const checked = await settings.check({ expectedRevision: saved.revision, allowExternal: true });
  assert.equal(checked.modelListed, true); assert.equal(checked.completionVerified, false);
  assert.equal(requests[0].url, `${input.baseUrl}/models`); assert.equal(requests[0].options.body, undefined);
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${secret}`);
  const bad = await fixture(t, { ...input, request: async () => { throw new Error(secret); } });
  await assert.rejects(bad.settings.check({ expectedRevision: 'environment', allowExternal: true }), error => !error.message.includes(secret) && error.status === 502);
});

test('generation fields are sent only when configured and changes invalidate queued approval fingerprints', async () => {
  const sent = []; let fingerprint;
  const store = { beginRun: async value => { fingerprint = value.providerFingerprint; return { run: { id: 'run-fixture', prompt: value.prompt }, context: [] }; }, completeRun: async () => ({}), failRun: async () => {}, approveRun: async (_id, _layers, current) => { assert.notEqual(current, fingerprint); throw new Error('Provider changed'); } };
  const config = { ...input, request: async (_url, options) => { sent.push(options.body); return { choices: [{ message: { content: 'fixture' } }] }; } };
  await executeChat(store, 'room-fixture', { text: 'hello', allowExternal: true }, config);
  assert.equal(sent[0].temperature, 0.3); assert.equal(sent[0].max_tokens, 500);
  await assert.rejects(executeApprovedRun(store, 'run-fixture', { allowExternal: true }, { ...config, temperature: 0.4 }), /Provider changed/);
  assert.equal(sent.length, 1);
  await assert.rejects(executeChat(store, 'room-fixture', { text: 'hello', allowExternal: true }, { ...config, enabled: false }), /No model/);
  await executeChat(store, 'room-fixture', { text: 'hello', allowExternal: true }, { ...config, temperature: undefined, maxTokens: undefined });
  assert.equal(Object.hasOwn(sent[1], 'temperature'), false); assert.equal(Object.hasOwn(sent[1], 'max_tokens'), false);
});

test('discovery checks a nondefault connection with its own key and never activates it', async t => {
  const requests = [];
  const { settings } = await fixture(t, { request: async (url, options) => { requests.push({ url, options }); return { data: [{ id: 'second' }, { id: 'bad\nmodel' }, { id: 'other-key' }, { id: 'second' }] }; } });
  await settings.save(input, passphrase);
  const registry = await settings.update({ action: 'save', name: 'Second', config: { enabled: true, baseUrl: 'http://127.0.0.1:12347/v1', model: 'second', apiKey: 'other-key', timeoutMs: 15000 }, expectedRevision: settings.registry().revision }, passphrase);
  const id = registry.connections[1].id;
  const checked = await settings.check({ expectedRevision: registry.revision, connectionId: id, allowExternal: true });
  assert.deepEqual(checked.models, ['second']); assert.equal(checked.connectionId, id);
  assert.equal(requests[0].url, 'http://127.0.0.1:12347/v1/models'); assert.equal(requests[0].options.headers.Authorization, 'Bearer other-key');
  assert.equal(settings.registry().activeId, 'default'); assert.equal(settings.registry().revision, registry.revision);
  await assert.rejects(settings.check({ expectedRevision: registry.revision, connectionId: 'unknown', allowExternal: true }), /saved connection/);
});

test('settings HTTP endpoints enforce owner/unlocked/origin access and stay out of Brain exports', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arkive-provider-http-'));
  const seen = [];
  const upstream = http.createServer(async (req, res) => { const chunks = []; for await (const chunk of req) chunks.push(chunk); seen.push({ route: req.url, auth: req.headers.authorization, body: Buffer.concat(chunks).toString() }); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(req.url === '/v1/models' ? { data: [{ id: 'fixture-model' }] } : { choices: [{ message: { content: 'Synthetic configured-model reply' } }] })); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => upstream.close(resolve)));
  let node = await createNodeServer({ directory, token: owner, provider: {}, allowedOrigins: ['http://127.0.0.1:4319'] });
  t.after(async () => { await node.close(); await rm(directory, { recursive: true, force: true }); }); let address = await node.start();
  const call = async (route, body, credential = owner, origin = 'http://127.0.0.1:4319') => { const response = await fetch(`http://127.0.0.1:${address.port}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${credential}`, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, body: await response.json() }; };
  assert.equal((await call('/v1/settings/provider')).status, 423);
  for (const route of ['/v1/settings/connections', '/v1/settings/execution']) assert.equal((await call(route)).status, 423);
  assert.equal((await call('/v1/unlock', { passphrase, create: true, name: 'Settings fixture' })).status, 200);
  const member = (await call('/v1/members', { name: 'Reader' })).body;
  for (const [route, body] of [['/v1/settings/provider', undefined], ['/v1/settings/provider', input], ['/v1/settings/provider/check', { allowExternal: true }]]) assert.equal((await call(route, body, member.token)).status, 403);
  assert.equal((await call('/v1/settings/provider', input, owner, 'http://evil.invalid')).status, 403);
  for (const [route, body] of [['/v1/settings/connections', undefined], ['/v1/settings/connections', { action: 'activate' }], ['/v1/settings/execution', undefined]]) {
    assert.equal((await call(route, body, member.token)).status, 403);
    assert.equal((await call(route, body, owner, 'http://evil.invalid')).status, 403);
  }
  const saved = await call('/v1/settings/provider', { ...input, baseUrl: `http://127.0.0.1:${upstream.address().port}/v1` });
  assert.equal(saved.status, 200); assert.equal(seen.length, 0);
  const registry = (await call('/v1/settings/connections')).body;
  assert.equal(registry.activeId, 'default'); assert.ok(!JSON.stringify(registry).includes(secret));
  assert.equal((await call('/v1/settings/execution')).body.effective.capabilities.tools, false);
  assert.equal((await call('/v1/settings/provider/check', { expectedRevision: saved.body.revision, allowExternal: true })).status, 200);
  assert.equal(seen[0].body, ''); assert.equal(seen[0].auth, `Bearer ${secret}`);
  const room = (await call('/v1/rooms', { title: 'Settings chat' })).body;
  assert.equal((await call(`/v1/rooms/${room.id}/messages`, { text: 'hello' })).status, 400);
  assert.equal(seen.length, 1, 'Settings must not bypass per-send consent');
  assert.equal((await call(`/v1/rooms/${room.id}/messages`, { text: 'hello', allowExternal: true })).status, 200);
  assert.equal(seen[1].route, '/v1/chat/completions');
  assert.equal(JSON.parse(seen[1].body).temperature, input.temperature);
  assert.equal(JSON.parse(seen[1].body).max_tokens, input.maxTokens);
  const brain = (await call('/v1/brain')).body;
  assert.ok(!JSON.stringify(brain).includes(secret));
  const exported = await decryptExport((await call('/v1/export')).body, passphrase);
  assert.ok(!JSON.stringify(exported).includes(secret));
  await call('/v1/lock', {}); assert.equal((await call('/v1/settings/provider')).status, 423);
  await node.close(); node = await createNodeServer({ directory, token: owner, provider: {}, allowedOrigins: ['http://127.0.0.1:4319'] }); address = await node.start();
  await call('/v1/unlock', { passphrase }); assert.equal((await call('/v1/settings/provider')).body.revision, saved.body.revision);
  assert.equal((await call('/v1/status')).body.providers[0].configured, true);
});
