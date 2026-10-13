import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProviderSettings } from '../provider-settings.mjs';
import { encryptExport, decryptExport } from '../server.mjs';
import { executeChat, executeApprovedRun } from '../execution.mjs';
import { describeExecutionSystem, resolveExecutionRoute } from '../runtime-contract.mjs';

const passphrase = 'Synthetic registry test passphrase';
const config = { enabled: true, baseUrl: 'http://127.0.0.1:12345/v1', model: 'test-model', timeoutMs: 45000, apiKey: 'synthetic-first-key' };
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arkive-connections-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const args = { directory, initial: {}, encrypt: encryptExport, decrypt: decryptExport };
  return { directory, args, settings: createProviderSettings(args) };
}
const add = (settings, name, patch = {}) => settings.update({ action: 'save', name, config: { ...config, apiKey: '', ...patch }, expectedRevision: settings.registry().revision }, passphrase);

test('named connections keep separate keys; save never activates; explicit switching survives restart', async t => {
  const { settings, args, directory } = await fixture(t);
  await settings.save({ ...config, expectedRevision: 'environment' }, passphrase);
  let registry = await add(settings, 'Second');
  const second = registry.connections[1];
  assert.equal(second.hasApiKey, false);
  assert.equal(registry.activeId, 'default');
  assert.equal(settings.config().apiKey, config.apiKey);
  assert.ok(!JSON.stringify(registry).includes(config.apiKey));
  await assert.rejects(settings.update({ action: 'activate', id: second.id, expectedRevision: registry.revision }, passphrase), /Confirm/);
  registry = await settings.update({ action: 'activate', id: second.id, confirmActivation: true, expectedRevision: registry.revision }, passphrase);
  assert.equal(settings.config().apiKey, '');
  const reopened = createProviderSettings(args); await reopened.load(passphrase);
  assert.deepEqual(reopened.registry(), registry);
  assert.equal(reopened.config().connectionId, second.id);
  const raw = await readFile(path.join(directory, 'provider-settings.enc'), 'utf8');
  assert.ok(!raw.includes('Second') && !raw.includes(config.apiKey));
  assert.deepEqual(registry.history.map(row => row.type), ['saved', 'created', 'activated']);
});

test('registry rejects stale writes, duplicates, unknown settings and disabled activation', async t => {
  const { settings } = await fixture(t);
  await settings.save({ ...config, expectedRevision: 'environment' }, passphrase);
  const registry = await add(settings, 'Disabled', { enabled: false });
  await assert.rejects(add(settings, 'disabled'), /unique/);
  await assert.rejects(add(settings, 'Bad', { tools: true }), /Unknown/);
  await assert.rejects(settings.update({ action: 'activate', id: registry.connections[1].id, expectedRevision: registry.revision, confirmActivation: true }, passphrase), /enabled/);
  const input = { action: 'save', name: 'Concurrent', config: { ...config, apiKey: '' }, expectedRevision: registry.revision };
  const outcomes = await Promise.allSettled([settings.update(input, passphrase), settings.update({ ...input, name: 'Other' }, passphrase)]);
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(value => value.status === 'rejected').reason.status, 409);
});

test('v1 sidecar loads without a write, then migrates on explicit save; failed encryption preserves state', async t => {
  const { args, directory } = await fixture(t);
  const filename = path.join(directory, 'provider-settings.enc');
  const legacy = { format: 'arkive-node-provider', version: 1, config, revision: 'legacy-revision', updatedAt: new Date().toISOString() };
  const original = JSON.stringify(await encryptExport(legacy, passphrase));
  await writeFile(filename, original, { mode: 0o600 });
  const settings = createProviderSettings(args); await settings.load(passphrase);
  assert.equal(settings.snapshot().revision, legacy.revision);
  assert.equal(await readFile(filename, 'utf8'), original);
  const failed = createProviderSettings({ ...args, encrypt: async () => { throw new Error('Synthetic disk failure'); } });
  await failed.load(passphrase);
  await assert.rejects(failed.save({ ...config, model: 'changed', expectedRevision: legacy.revision }, passphrase), /Synthetic/);
  assert.equal(failed.config().model, config.model);
  assert.equal(await readFile(filename, 'utf8'), original);
  await settings.save({ ...config, expectedRevision: legacy.revision }, passphrase);
  const migrated = await decryptExport(JSON.parse(await readFile(filename, 'utf8')), passphrase);
  assert.equal(migrated.version, 3); assert.equal(migrated.connections[0].config.apiKey, config.apiKey);
});

test('connection identity invalidates approval even when endpoint and model match', async () => {
  let fingerprint; let requests = 0;
  const store = { beginRun: async value => { fingerprint = value.providerFingerprint; return { run: { id: 'run', prompt: value.prompt }, context: [] }; }, completeRun: async () => ({}), failRun: async () => {}, approveRun: async (_id, _layers, current) => { assert.notEqual(current, fingerprint); throw new Error('Connection changed'); } };
  const provider = { ...config, connectionId: 'default', request: async () => { requests++; return { choices: [{ message: { content: 'fixture' } }] }; } };
  await executeChat(store, 'room', { text: 'test', allowExternal: true }, provider);
  await assert.rejects(executeApprovedRun(store, 'run', { allowExternal: true }, { ...provider, connectionId: 'other' }), /Connection changed/);
  assert.equal(requests, 1);
  await assert.rejects(executeChat(store, 'room', { text: 'test', allowExternal: true }, { ...provider, harness: 'hermes' }), /not implemented/);
  assert.equal(requests, 1);
});

test('execution descriptor is redacted and unsupported runtimes fail closed', () => {
  const descriptor = describeExecutionSystem(config);
  assert.ok(!JSON.stringify(descriptor).includes(config.apiKey));
  assert.equal(descriptor.effective.capabilities.tools, false);
  assert.equal(descriptor.effective.policy.memory, 'compiled-room-sources');
  assert.equal(descriptor.adapters.find(item => item.id === 'hermes').implemented, false);
  assert.throws(() => resolveExecutionRoute({ ...config, apiMode: 'responses' }), /not implemented/);
});

test('chat pins survive default changes and restart; disabled pins never silently fall back', async t => {
  const { settings, args } = await fixture(t);
  await settings.save({ ...config, expectedRevision: 'environment' }, passphrase);
  const registry = await add(settings, 'Alternate', { model: 'alternate-model' });
  const alternate = registry.connections[1].id;
  await settings.bind('room_one', { connectionId: 'default', expectedRevision: registry.revision }, passphrase);
  await settings.bind('room_two', { connectionId: alternate, expectedRevision: settings.registry().revision }, passphrase);
  assert.equal(settings.config('room_one').model, config.model);
  assert.equal(settings.config('room_two').model, 'alternate-model');
  await settings.update({ action: 'activate', id: alternate, confirmActivation: true, expectedRevision: settings.registry().revision }, passphrase);
  assert.equal(settings.config('room_unpinned').model, 'alternate-model');
  assert.equal(settings.config('room_one').model, config.model);
  const reopened = createProviderSettings(args); await reopened.load(passphrase);
  assert.equal(reopened.binding('room_two'), alternate);
  assert.equal(reopened.binding('toString'), null);
  await reopened.update({ action: 'save', id: alternate, name: 'Alternate', config: { ...config, enabled: false, model: 'alternate-model' }, expectedRevision: reopened.registry().revision }, passphrase);
  assert.equal(reopened.config('room_two').enabled, false);
  await assert.rejects(reopened.bind('room_three', { connectionId: alternate, expectedRevision: reopened.registry().revision }, passphrase), /enabled/);
  await assert.rejects(reopened.bind('room_three', { connectionId: 'default', expectedRevision: 'stale' }, passphrase), /changed/);
  await assert.rejects(reopened.bind('__proto__', { connectionId: 'default', expectedRevision: reopened.registry().revision }, passphrase), /room ID/);
  await assert.rejects(reopened.bind('room_three', { connectionId: 'default', tools: true, expectedRevision: reopened.registry().revision }, passphrase), /Unknown/);
  await reopened.bind('room_one', { connectionId: null, expectedRevision: reopened.registry().revision }, passphrase);
  assert.equal(reopened.binding('room_one'), null);
  assert.equal(reopened.config('room_one').enabled, false);
});

test('v2 sidecar migrates without automatic disk writes and failed pin persistence rolls back', async t => {
  const { args, directory } = await fixture(t);
  const legacy = { format: 'arkive-node-provider', version: 2, revision: 'v2', updatedAt: new Date().toISOString(), activeId: 'default', connections: [{ id: 'default', name: 'Default', config }], history: [] };
  const filename = path.join(directory, 'provider-settings.enc');
  const original = JSON.stringify(await encryptExport(legacy, passphrase));
  await writeFile(filename, original);
  const failed = createProviderSettings({ ...args, encrypt: async () => { throw new Error('Synthetic failure'); } });
  await failed.load(passphrase);
  assert.equal(await readFile(filename, 'utf8'), original);
  await assert.rejects(failed.bind('room_one', { connectionId: 'default', expectedRevision: 'v2' }, passphrase), /Synthetic/);
  assert.equal(failed.binding('room_one'), null);
  assert.equal(await readFile(filename, 'utf8'), original);
});
