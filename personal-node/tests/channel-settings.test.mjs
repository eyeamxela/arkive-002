import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createChannelSettings } from '../channel-settings.mjs';
import { createNodeServer, encryptExport, decryptExport } from '../server.mjs';

const passphrase = 'Synthetic channel recovery passphrase';
const token = 'synthetic-dashboard-session-token';
const baseUrl = 'http://127.0.0.1:12888';
const descriptors = () => ({ platforms: [{ id: 'telegram', name: 'Telegram', description: 'Run from Telegram.', configured: false, enabled: false, gateway_running: false, state: 'disabled', env_vars: [
  { key: 'TELEGRAM_BOT_TOKEN', prompt: 'Bot token', is_password: true, required: true, is_set: false, redacted_value: null, value: 'must-never-escape' },
  { key: 'TELEGRAM_ALLOWED_USERS', prompt: 'Allowed Telegram user IDs', is_list: true, is_set: false, value: null },
  { key: 'TELEGRAM_WEBHOOK_SECRET', prompt: 'Webhook secret', is_password: true, is_set: true, redacted_value: 'also-do-not-expose' },
] }] });
async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arkive-channels-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = []; const data = descriptors();
  const request = async (url, options) => {
    calls.push({ url, ...options });
    assert.equal(new URL(url).searchParams.get('profile'), 'default');
    assert.equal(options.headers['X-Hermes-Session-Token'], token);
    if (options.method === 'GET') return structuredClone(data);
    if (url.includes('/test?')) return { ok: false, state: 'gateway_stopped', message: token };
    if (options.method === 'PUT') {
      const row = data.platforms[0];
      for (const [key, value] of Object.entries(options.body.env ?? {})) {
        const field = row.env_vars.find(field => field.key === key); field.is_set = true; field.redacted_value = 'redacted-' + value.slice(-2); if (field.is_list) field.value = value;
      }
      if (options.body.enabled !== undefined) row.enabled = options.body.enabled;
      row.configured = row.env_vars.filter(field => field.required).every(field => field.is_set);
    }
    return { ok: true, hot_served: false };
  };
  const args = { directory, encrypt: encryptExport, decrypt: decryptExport, request, ...overrides };
  return { directory, data, calls, args, settings: createChannelSettings(args) };
}
const configure = (settings, changes = {}) => settings.configure({ baseUrl, profile: 'default', token, expectedRevision: settings.snapshot().revision, confirm: true, ...changes }, passphrase);
const refresh = settings => settings.refresh({ expectedRevision: settings.snapshot().revision, allowExternal: true });
const action = (settings, changes = {}) => settings.operate({ expectedRevision: settings.snapshot().revision, expectedVersion: settings.snapshot().catalog?.platforms[0].version, platform: 'telegram', action: 'save', env: { TELEGRAM_BOT_TOKEN: 'fixture-bot-token', TELEGRAM_ALLOWED_USERS: '123456' }, confirm: true, ...changes }, passphrase);

test('management settings encrypt locally, never implicitly network, redact fields and reset observations on reload', async t => {
  const { settings, args, calls, directory } = await fixture(t);
  await configure(settings); assert.equal(calls.length, 0);
  const file = path.join(directory, 'channel-settings.enc'); const raw = await readFile(file, 'utf8');
  assert.ok(!raw.includes(token)); assert.equal((await stat(file)).mode & 0o777, 0o600);
  const value = await refresh(settings);
  assert.ok(!JSON.stringify(value).includes(token)); assert.ok(!JSON.stringify(value).includes('must-never-escape')); assert.ok(!JSON.stringify(value).includes('also-do-not-expose'));
  assert.equal(calls[0].body, undefined); assert.equal(value.catalog.platforms[0].fields[0].value, '');
  const reopened = createChannelSettings(args); await reopened.load(passphrase);
  assert.equal(reopened.snapshot().connection.hasToken, true); assert.equal(reopened.snapshot().catalog, null);
  await assert.rejects(reopened.load('wrong'), /Cannot unlock/);
});

test('management destination, profile, revision and credential replacement are explicit', async t => {
  const { settings, calls } = await fixture(t);
  for (const changes of [{ baseUrl: 'https://example.com' }, { baseUrl: 'http://127.0.0.1:1/api' }, { baseUrl: 'http://u:p@localhost' }, { profile: 'current' }, { profile: '../private' }, { confirm: false }, { token: 'bad\nkey' }, { arbitrary: true }]) await assert.rejects(configure(settings, changes));
  await configure(settings);
  await assert.rejects(configure(settings, { expectedRevision: 'empty' }), /changed/);
  await assert.rejects(configure(settings, { profile: 'work', token: '' }), /Re-enter/);
  await assert.rejects(settings.refresh({ expectedRevision: settings.snapshot().revision }), /Confirm/);
  assert.equal(calls.length, 0);
});

test('channel writes validate schema and user IDs, pin revisions and distinguish save, enabled and running', async t => {
  const { settings, calls, data } = await fixture(t); await configure(settings); await refresh(settings);
  await assert.rejects(action(settings, { confirm: false }), /Confirm/);
  await assert.rejects(action(settings, { env: { ARBITRARY_SECRET: 'value' } }), /Invalid/);
  await assert.rejects(action(settings, { env: { TELEGRAM_ALLOWED_USERS: 'everyone' } }), /numeric/);
  await assert.rejects(action(settings, { expectedVersion: 'stale' }), /changed/);
  assert.equal(calls.filter(c => c.method === 'PUT').length, 0);
  const saved = await action(settings); assert.equal(saved.result.saved, true); assert.equal(saved.result.readback, true); assert.equal(saved.result.needsRestart, true);
  assert.equal(saved.catalog.platforms[0].enabled, false); assert.equal(saved.catalog.platforms[0].gatewayRunning, false);
  const put = calls.find(c => c.method === 'PUT'); assert.equal(typeof put.body, 'object'); assert.equal(put.body.env.TELEGRAM_BOT_TOKEN, 'fixture-bot-token'); assert.ok(!JSON.stringify(saved).includes('fixture-bot-token'));
  await action(settings, { action: 'toggle', env: undefined, enabled: true }); assert.equal(data.platforms[0].enabled, true);
  await assert.rejects(action(settings, { env: {}, clear: ['TELEGRAM_ALLOWED_USERS'] }), /Disable Telegram/);
  const checked = await action(settings, { action: 'test', env: undefined }); assert.equal(checked.result.ok, false); assert.ok(!JSON.stringify(checked).includes(token));
  data.platforms[0].env_vars[1].value = '';
  await refresh(settings); await assert.rejects(action(settings, { action: 'toggle', env: undefined, enabled: true }), /allowed Telegram/);
});

test('concurrent upstream edits and uncertain mutations require fresh review; restart is not running', async t => {
  const { settings, data, calls } = await fixture(t); await configure(settings); await refresh(settings);
  data.platforms[0].env_vars[2].redacted_value = 'changed';
  await assert.rejects(action(settings), /changed in Hermes/); assert.equal(calls.filter(c => c.method === 'PUT').length, 0);
  const restarted = await settings.restart({ expectedRevision: settings.snapshot().revision, confirm: true }, passphrase);
  assert.equal(restarted.result.restartRequested, true); assert.equal(restarted.catalog, null);
  await assert.rejects(action(settings), /Load channels/);
  const uncertain = await fixture(t, { request: async (_url, options) => { if (options.method === 'PUT') throw new Error(token); return descriptors(); } });
  await configure(uncertain.settings); await refresh(uncertain.settings);
  await assert.rejects(action(uncertain.settings), error => !error.message.includes(token) && /may have applied/.test(error.message));
  assert.equal(uncertain.settings.snapshot().catalog, null);
});

test('clear aborts in-flight metadata and cannot repopulate a locked session', async t => {
  let resume; let started; const gate = new Promise(r => { resume = r; }); const waiting = new Promise(r => { started = r; });
  const { settings } = await fixture(t, { request: async () => { started(); await gate; return descriptors(); } });
  await configure(settings); const promise = refresh(settings); await waiting; settings.clear(); resume();
  await assert.rejects(promise, /session changed/); assert.equal(settings.snapshot().connection, null); assert.equal(settings.snapshot().catalog, null);
});

test('channel service is owner-only, locked by default and excluded from Brain exports', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arkive-channel-http-')); const owner = 'synthetic-channel-owner-'.repeat(2); const peer = 'synthetic-channel-peer-'.repeat(2);
  const node = await createNodeServer({ directory, token: owner, syncToken: peer, provider: {}, channelRequest: async () => descriptors() });
  const address = await node.start(); t.after(async () => { await node.close(); await rm(directory, { recursive: true, force: true }); });
  const call = async (route, body, credential = owner) => { const response = await fetch(`http://127.0.0.1:${address.port}${route}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${credential}`, Origin: 'http://127.0.0.1:1421', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, body: await response.json() }; };
  assert.equal((await call('/v1/settings/channels')).status, 423);
  await call('/v1/unlock', { passphrase, create: true });
  const member = await call('/v1/members', { name: 'Synthetic member' });
  for (const [credential, expected] of [[peer, 401], [member.body.token, 403]]) for (const [route, body] of [['/v1/settings/channels', undefined], ['/v1/settings/channels', {}], ['/v1/settings/channels/refresh', {}], ['/v1/settings/channels/action', {}], ['/v1/settings/channels/restart', {}]]) assert.equal((await call(route, body, credential)).status, expected);
  assert.equal((await call('/v1/settings/channels', { baseUrl, token, profile: 'default', expectedRevision: 'empty', confirm: true })).status, 200);
  const bundle = await decryptExport((await call('/v1/export')).body, passphrase); assert.ok(!JSON.stringify(bundle).includes(token));
  await call('/v1/lock', {}); assert.equal((await call('/v1/settings/channels')).status, 423);
  await call('/v1/unlock', { passphrase }); assert.equal((await call('/v1/settings/channels')).body.connection.hasToken, true);
});
