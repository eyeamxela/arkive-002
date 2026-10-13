import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHarnessSettings } from '../harness-settings.mjs';
import { createNodeServer, encryptExport, decryptExport } from '../server.mjs';

const passphrase = 'Synthetic Hermes settings passphrase';
const token = 'synthetic-hermes-only-key';
const origin = 'http://127.0.0.1:12346';
const descriptor = { object: 'hermes.api_server.capabilities', platform: 'hermes-agent', runtime: { mode: 'server_agent' }, auth: { required: true }, features: { run_submission: true, skills_api: true }, endpoints: { dangerous: { path: 'https://example.com/exfiltrate' } } };
const respond = url => url.endsWith('/capabilities') ? descriptor : { data: [{ name: 'fixture', description: `Untrusted ${token}`, category: 'Research', enabled: true, configured: true, tools: ['read'] }] };
async function fixture(t, request = async url => respond(url)) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arkive-harness-settings-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const args = { directory, encrypt: encryptExport, decrypt: decryptExport, request };
  return { directory, args, settings: createHarnessSettings(args) };
}
const save = (s, patch = {}) => s.update({ action: 'save', name: 'Synthetic Hermes', baseUrl: origin, token, enabled: true, expectedRevision: s.snapshot().revision, confirm: true, ...patch }, passphrase);
const probe = s => s.probe({ id: s.snapshot().connections[0].id, expectedRevision: s.snapshot().revision, allowExternal: true }, passphrase);

test('Hermes registry encrypts independent keys, clears observations on restart and performs no implicit networking', async t => {
  const calls = []; const { settings, args, directory } = await fixture(t, async (url, options) => { calls.push({ url, options }); return respond(url); });
  await save(settings); assert.equal(calls.length, 0);
  const snapshot = await probe(settings); assert.equal(snapshot.executionEnabled, false);
  assert.equal(snapshot.connections[0].observation.status, 'reachable');
  assert.deepEqual(calls.map(c => new URL(c.url).pathname).sort(), ['/v1/capabilities', '/v1/skills', '/v1/toolsets']);
  assert.ok(calls.every(c => c.options.method === 'GET' && !c.options.body && c.options.headers.Authorization === `Bearer ${token}`));
  assert.ok(!JSON.stringify(snapshot).includes(token));
  assert.ok(!JSON.stringify(snapshot).includes('exfiltrate'));
  assert.equal(snapshot.connections[0].observation.skills.rows[0].enabled, undefined);
  const file = path.join(directory, 'harness-settings.enc');
  const raw = await readFile(file, 'utf8'); assert.ok(!raw.includes(token) && !raw.includes('Synthetic Hermes'));
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const reopened = createHarnessSettings(args); await reopened.load(passphrase);
  assert.equal(reopened.snapshot().connections[0].hasToken, true);
  assert.equal(reopened.snapshot().connections[0].observation, null);
  assert.equal(await readFile(file, 'utf8'), raw);
  settings.clear(); assert.equal(settings.snapshot().connections.length, 0);
  await assert.rejects(settings.load('wrong'), /Cannot unlock/);
});

test('Hermes settings validate origin, confirmation, revision, key replacement and independent identities', async t => {
  const { settings } = await fixture(t);
  for (const patch of [{ confirm: false }, { name: '' }, { token: 'bad\nkey' }, { enabled: 'yes' }, { baseUrl: 'http://example.com' }, { baseUrl: 'https://example.com/v1' }, { baseUrl: 'https://u:p@example.com' }, { baseUrl: 'https://example.com', token: '' }, { tools: true }]) await assert.rejects(save(settings, patch));
  await save(settings);
  const id = settings.snapshot().connections[0].id;
  await assert.rejects(save(settings, { expectedRevision: 'empty' }), /changed/);
  await assert.rejects(save(settings, { name: 'synthetic hermes' }), /unique/);
  await assert.rejects(save(settings, { id, baseUrl: 'http://127.0.0.1:12347', token: '' }), /replacement/);
  await save(settings, { name: 'Second Hermes', token: '', enabled: false });
  assert.equal(settings.snapshot().connections[1].hasToken, false);
  await save(settings, { id, enabled: false }); await assert.rejects(probe(settings), /enabled/);
});

test('Hermes checks require consent, reject private destinations, sanitize errors and discard stale inventories', async t => {
  let mode = 'good'; let calls = 0;
  const { settings } = await fixture(t, async url => { calls++; if (mode === 'bad' || (mode === 'partial' && url.endsWith('/skills'))) throw new Error(token); return respond(url); });
  await save(settings);
  await assert.rejects(settings.probe({ id: settings.snapshot().connections[0].id, expectedRevision: settings.snapshot().revision }, passphrase), /Confirm/);
  await probe(settings); mode = 'partial';
  let value = await probe(settings); assert.equal(value.connections[0].observation.status, 'partial'); assert.deepEqual(value.connections[0].observation.skills.rows, []);
  mode = 'bad'; value = await probe(settings); assert.equal(value.connections[0].observation.status, 'failed'); assert.equal(value.connections[0].observation.skills, undefined); assert.ok(!JSON.stringify(value).includes(token));
  const before = calls;
  await save(settings, { id: value.connections[0].id, baseUrl: 'https://169.254.169.254', token: 'new-synthetic-key' });
  assert.equal((await probe(settings)).connections[0].observation.status, 'failed'); assert.equal(calls, before);
});

test('Hermes catalogs are bounded and malformed metadata cannot become executable configuration', async t => {
  const { settings } = await fixture(t, async url => url.endsWith('/capabilities') ? descriptor : { data: Array.from({ length: 800 }, (_, i) => ({ name: `item-${i}`, description: 'x'.repeat(600), tools: ['tool', 'tool'], enabled: 'true', configured: 'true' })) });
  await save(settings); const v = (await probe(settings)).connections[0].observation;
  assert.equal(v.skills.rows.length, 500); assert.equal(v.toolsets.rows.length, 200); assert.equal(v.skills.truncated, true);
  assert.equal(v.toolsets.rows[0].enabled, false); assert.equal(v.skills.rows[0].description.length, 512);
  assert.equal(v.descriptor.flags.jobs_admin, false);
});

test('Hermes stale concurrent edits, failed encryption, symlinks and clear during probe fail closed', async t => {
  const { settings, args, directory } = await fixture(t); const revision = settings.snapshot().revision;
  const outcomes = await Promise.allSettled([save(settings, { expectedRevision: revision }), save(settings, { name: 'Other', expectedRevision: revision })]);
  assert.equal(outcomes.filter(v => v.status === 'fulfilled').length, 1);
  const raw = await readFile(path.join(directory, 'harness-settings.enc'), 'utf8');
  const failed = createHarnessSettings({ ...args, encrypt: async () => { throw new Error('Synthetic disk failure'); } }); await failed.load(passphrase);
  await assert.rejects(save(failed, { id: failed.snapshot().connections[0].id }), /disk failure/);
  assert.equal(await readFile(path.join(directory, 'harness-settings.enc'), 'utf8'), raw);
  const link = await fixture(t); await symlink(path.join(directory, 'harness-settings.enc'), path.join(link.directory, 'harness-settings.enc')); await assert.rejects(link.settings.load(passphrase), /Cannot read/);
  let started; let resume; const waiting = new Promise(r => { started = r; }); const gate = new Promise(r => { resume = r; });
  const pending = createHarnessSettings({ ...args, request: async url => { started(); await gate; return respond(url); } }); await pending.load(passphrase);
  const operation = probe(pending); await waiting; pending.clear(); resume(); await assert.rejects(operation, /session changed/);
  assert.equal(pending.snapshot().connections.length, 0); assert.equal(await readFile(path.join(directory, 'harness-settings.enc'), 'utf8'), raw);
});

test('Hermes owner routes enforce lock, member and peer boundaries and exclude secrets from exports', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arkive-harness-http-')); const owner = 'synthetic-harness-owner-'.repeat(2); const peer = 'synthetic-harness-peer-'.repeat(2); let requests = 0;
  const node = await createNodeServer({ directory, token: owner, syncToken: peer, provider: {}, harnessRequest: async url => { requests++; return respond(url); } });
  const address = await node.start(); t.after(async () => { await node.close(); await rm(directory, { recursive: true, force: true }); });
  const call = async (route, body, credential = owner) => { const r = await fetch(`http://127.0.0.1:${address.port}${route}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${credential}`, Origin: 'http://127.0.0.1:1421', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json() }; };
  assert.equal((await call('/v1/settings/harnesses')).status, 423);
  assert.equal((await call('/v1/unlock', { passphrase, create: true })).status, 200);
  const member = await call('/v1/members', { name: 'Synthetic member' }); assert.equal(member.status, 201);
  for (const [credential, expected] of [[peer, 401], [member.body.token, 403]]) for (const [route, body] of [['/v1/settings/harnesses', undefined], ['/v1/settings/harnesses', {}], ['/v1/settings/harnesses/probe', {}]]) assert.equal((await call(route, body, credential)).status, expected);
  let value = await call('/v1/settings/harnesses', { action: 'save', name: 'HTTP fixture', baseUrl: origin, token, enabled: true, expectedRevision: 'empty', confirm: true }); assert.equal(value.status, 200); assert.equal(requests, 0);
  value = await call('/v1/settings/harnesses/probe', { id: value.body.connections[0].id, expectedRevision: value.body.revision, allowExternal: true }); assert.equal(value.status, 200); assert.equal(requests, 3);
  const bundle = await decryptExport((await call('/v1/export')).body, passphrase); assert.ok(!JSON.stringify(bundle).includes(token)); assert.ok(!JSON.stringify(bundle).includes('HTTP fixture'));
  await call('/v1/lock', {}); assert.equal((await call('/v1/settings/harnesses')).status, 423);
  await call('/v1/unlock', { passphrase }); assert.equal((await call('/v1/settings/harnesses')).body.connections[0].observation, null);
  const current = (await call('/v1/settings/harnesses')).body;
  const removed = await call('/v1/settings/harnesses', { action: 'remove', id: current.connections[0].id, expectedRevision: current.revision, confirm: true });
  assert.equal(removed.status, 200); assert.equal(removed.body.connections.length, 0); assert.equal(requests, 3);
  await call('/v1/lock', {}); await call('/v1/unlock', { passphrase }); assert.equal((await call('/v1/settings/harnesses')).body.connections.length, 0);
});
