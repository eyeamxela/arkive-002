import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { openBrain } from '../brain.mjs';
import { validateProviderReceipt } from '../provider-receipt.mjs';
import { validateGovernance } from '../governance.mjs';
import { describeProviderError } from '../provider-diagnostics.mjs';
import { pinConversation, readConversation } from '../conversation.mjs';
import { streamRunEvents } from '../run-feed.mjs';

const PASSWORD = 'Synthetic receipt test passphrase';
const fingerprint = 'a'.repeat(64);
const metadata = { outcome: 'complete', finishReason: 'stop', responseId: 'chatcmpl_test:001', returnedModel: 'test/model-v1',
  usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, reasoningTokens: 4 } };
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'arkive-receipts-'));
  let store = await openBrain(root, PASSWORD, { create: true });
  t.after(async () => { await store.close(); await rm(root, { recursive: true, force: true }); });
  const room = await store.createRoom({ title: 'Synthetic audit' });
  const start = (patch = {}) => store.beginRun({ roomId: room.id, principalId: 'owner', providerId: 'openai-compatible', model: 'test-model',
    providerFingerprint: fingerprint, prompt: 'Synthetic question', ...patch });
  return { root, room, get store() { return store; }, start,
    reopen: async () => { await store.close(); store = await openBrain(root, PASSWORD); return store; } };
}
async function feedSnapshot(snapshot) {
  const res = new EventEmitter(); let payload;
  res.writeHead = () => { res.headersSent = true; };
  res.write = chunk => { payload = JSON.parse(chunk); return false; };
  res.end = () => {};
  await streamRunEvents({}, res, { snapshot, signal: new AbortController().signal });
  return payload;
}

test('provider receipt accepts bounded exact metadata and rejects malformed or content-bearing fields', () => {
  assert.deepEqual(validateProviderReceipt(metadata), metadata);
  const invalid = [null, [], { ...metadata, secret: 'credential' }, { ...metadata, outcome: 'success' },
    { ...metadata, finishReason: 'raw upstream text' }, { ...metadata, finishReason: 'length' }, { ...metadata, responseId: 'has whitespace' },
    { ...metadata, returnedModel: 'x'.repeat(161) }, { ...metadata, responseId: '<script>' }, { ...metadata, usage: { inputTokens: -1 } },
    { ...metadata, usage: { totalTokens: 1.5 } }, { ...metadata, usage: { totalTokens: Infinity } },
    { ...metadata, usage: { totalTokens: 1_000_000_001 } }, { ...metadata, usage: { inputTokens: 20, outputTokens: 10, totalTokens: 25 } },
    { ...metadata, usage: { outputTokens: 10, reasoningTokens: 11 } }, { ...metadata, usage: { apiKey: 'secret' } },
    { ...metadata, finishReason: undefined }, Object.assign(Object.create({ inherited: true }), metadata),
    { ...metadata, get usage() { throw new Error('Getter must not execute'); } }, JSON.parse('{"outcome":"complete","__proto__":{}}')];
  for (const value of invalid) assert.throws(() => validateProviderReceipt(value), { code: 'PROVIDER_RECEIPT_INVALID' });
});

test('complete and legacy receipts survive encrypted reopening without requiring migration', async t => {
  const f = await fixture(t);
  const legacy = await f.start(); await f.store.completeRun(legacy.run.id, 'Legacy Hermes-style answer');
  const current = await f.start({ includeHistory: true }); assert.equal(current.history.length, 2);
  const result = await f.store.completeRun(current.run.id, 'Current complete answer', metadata);
  assert.equal(result.run.state, 'completed'); assert.equal(result.assistant.status, 'model-output-unverified');
  assert.deepEqual(result.run.providerReceipt, metadata);
  await f.reopen(); const state = await f.store.snapshot();
  assert.equal(state.governance.runs[0].providerReceipt, undefined);
  assert.deepEqual(state.governance.runs[1].providerReceipt, metadata);
  assert.equal(state.rooms[0].messages.length, 4);
  assert.ok(!(await readFile(path.join(f.root, 'brain.enc'), 'utf8')).includes('Current complete answer'));
  const withHistory = await f.start({ includeHistory: true }); assert.equal(withHistory.history.length, 4);
});

test('incomplete, refused, filtered, unsupported and unknown outcomes stay visible but cannot enter history', async t => {
  const f = await fixture(t);
  const complete = await f.start(); await f.store.completeRun(complete.run.id, 'History eligible', metadata);
  for (const outcome of ['incomplete', 'refused', 'filtered', 'unsupported', 'unknown']) {
    const prepared = await f.start({ includeHistory: true }); assert.equal(prepared.history.length, 2);
    const result = await f.store.completeRun(prepared.run.id, `Synthetic ${outcome} notice`, { outcome });
    assert.equal(result.run.state, 'incomplete'); assert.equal(result.assistant.status, 'incomplete');
    assert.equal(result.run.events.at(-1).type, 'provider.incomplete');
  }
  await f.reopen(); const state = await f.store.snapshot();
  assert.equal(state.governance.runs.filter(run => run.state === 'incomplete').length, 5);
  assert.equal(state.rooms[0].messages.length, 12);
  assert.equal(state.audit.filter(event => event.type === 'run.incomplete').length, 5);
  const future = await f.start({ includeHistory: true }); assert.deepEqual(future.run.conversation.runIds, [complete.run.id]);
  const tampered = structuredClone(state); delete tampered.governance.scopes; tampered.governance.runs[0].providerReceipt.outcome = 'incomplete';
  assert.throws(() => validateGovernance(tampered.governance, tampered), /outcome state/);
  assert.deepEqual(pinConversation(tampered.governance.runs, future.run).runIds, []);
  assert.throws(() => readConversation(tampered.governance.runs, future.run), { code: 'HISTORY_STALE' });
});

test('invalid receipt metadata is not committed and safe failures persist no raw upstream error', async t => {
  const f = await fixture(t); const prepared = await f.start();
  assert.throws(() => f.store.completeRun(prepared.run.id, 'Not committed', { ...metadata, credential: 'do-not-retain' }), { code: 'PROVIDER_RECEIPT_INVALID' });
  assert.equal((await f.store.snapshot()).rooms[0].messages.length, 0);
  const result = await f.store.failRun(prepared.run.id, { code: 'PROVIDER_AUTH', message: 'Bearer secret-key and private-response-content', responseBody: 'secret' });
  assert.equal(result.errorCode, 'PROVIDER_AUTH'); assert.equal(result.error, describeProviderError({ code: 'PROVIDER_AUTH' }).message);
  const other = await f.start(); await f.store.failRun(other.run.id, { code: 'SECRET_ARBITRARY_CODE', message: 'raw-key' });
  await f.reopen(); const state = await f.store.snapshot();
  assert.equal(state.governance.runs[1].errorCode, 'PROVIDER_REQUEST_FAILED');
  for (const secret of ['secret-key', 'private-response-content', 'SECRET_ARBITRARY_CODE', 'raw-key', 'do-not-retain']) assert.ok(!JSON.stringify(state).includes(secret));
  const progress = await f.store.runProgress(); assert.equal(progress.governance.runs[0].errorCode, 'PROVIDER_AUTH');
  const forged = structuredClone(state); delete forged.governance.scopes; forged.governance.runs[0].error = 'unsanitized';
  assert.throws(() => validateGovernance(forged.governance, forged), /safe run diagnostic/);
});

test('recovery fails only interrupted requests and leaves incomplete receipts and their metadata intact', async t => {
  const f = await fixture(t);
  const partial = await f.start(); const receipt = { ...metadata, outcome: 'incomplete', finishReason: 'length' };
  await f.store.completeRun(partial.run.id, 'Partial synthetic answer', receipt);
  const interrupted = await f.start(); await f.reopen();
  const state = await f.store.snapshot();
  const saved = state.governance.runs.find(run => run.id === partial.run.id);
  assert.equal(saved.state, 'incomplete'); assert.deepEqual(saved.providerReceipt, receipt);
  const recovered = state.governance.runs.find(run => run.id === interrupted.run.id);
  assert.equal(recovered.state, 'failed'); assert.equal(recovered.events.at(-1).type, 'node.interrupted');
  assert.equal(recovered.providerReceipt, undefined); assert.equal(state.rooms[0].messages.length, 2);
});

test('member receipts respect source revocation and incomplete receipts can be explicitly pruned', async t => {
  const f = await fixture(t);
  const source = await f.store.importText({ title: 'Permitted', text: 'Synthetic permitted evidence' });
  await f.store.selectSources(f.room.id, [source.id]);
  const member = await f.store.govern('member', { name: 'Synthetic participant' });
  const principal = { owner: false, memberId: member.member.id, kind: 'member' };
  const policy = { roomId: f.room.id, layerIds: [], memberGrants: [{ memberId: member.member.id, role: 'participant', sourceIds: [source.id] }] };
  await f.store.govern('policy', policy);
  const prepared = await f.start({ principalId: member.member.id }); await f.store.approveRun(prepared.run.id, [], fingerprint);
  const receipt = { ...metadata, outcome: 'incomplete', finishReason: 'length' };
  await f.store.completeRun(prepared.run.id, 'Partial synthetic result', receipt);
  const publicReceipt = { outcome: 'incomplete', finishReason: 'length' };
  const shared = await f.store.snapshot(principal); assert.deepEqual(shared.governance.runs[0].providerReceipt, publicReceipt);
  assert.equal(shared.rooms[0].messages[1].status, 'incomplete');
  const progress = await f.store.runProgress(principal);
  assert.deepEqual(progress.governance.runs[0].providerReceipt, publicReceipt);
  const streamed = await feedSnapshot(() => f.store.runProgress(principal));
  assert.deepEqual(streamed.runs[0].providerReceipt, publicReceipt);
  for (const response of [shared, progress, streamed]) for (const privateField of ['returnedModel', 'responseId', 'usage', 'inputTokens', 'test/model-v1', 'chatcmpl_test:001']) {
    assert.ok(!JSON.stringify(response).includes(privateField), privateField);
  }
  assert.deepEqual((await f.store.snapshot()).governance.runs[0].providerReceipt, receipt);
  assert.deepEqual((await f.store.runProgress()).governance.runs[0].providerReceipt, receipt);
  await f.store.govern('policy', { ...policy, memberGrants: [{ ...policy.memberGrants[0], sourceIds: [] }] });
  const revoked = await f.store.snapshot(principal); assert.equal(revoked.governance.runs.length, 0); assert.equal(revoked.rooms[0].messages.length, 0);
  assert.equal((await f.store.runProgress(principal)).governance.runs.length, 0);
  await f.store.govern('prune', { runIds: [prepared.run.id], confirm: true }); await f.reopen();
  const state = await f.store.snapshot(); assert.equal(state.governance.runs.length, 0);
  assert.equal(state.audit.find(event => event.type === 'run.pruned').details.state, 'incomplete');
});

test('context budget matches exact JSON evidence, permits the boundary and refuses one extra character', async t => {
  const f = await fixture(t); let source = await f.store.importText({ title: 'Synthetic boundary', text: 'x' });
  await f.store.selectSources(f.room.id, [source.id]);
  const evidence = item => [{ sourceId: item.id, revisionId: item.revisionId, title: item.title, text: item.text }];
  const overhead = JSON.stringify(evidence(source)).length - 1;
  source = await f.store.importText({ objectId: source.id, title: source.title, text: 'x'.repeat(160000 - overhead) });
  const scope = (await f.store.snapshot()).governance.scopes[0];
  assert.deepEqual(scope.contextBudget, { characters: 160000, limit: 160000, overLimit: false }); assert.equal(scope.canSend, true);
  const accepted = await f.start(); assert.equal(JSON.stringify(accepted.context).length, 160000); await f.store.completeRun(accepted.run.id, 'Boundary accepted', metadata);
  source = await f.store.importText({ objectId: source.id, title: source.title, text: `${source.text}x` });
  const over = (await f.store.snapshot()).governance.scopes[0];
  assert.deepEqual(over.contextBudget, { characters: 160001, limit: 160000, overLimit: true }); assert.equal(over.canSend, false);
  await assert.rejects(f.start(), { code: 'CONTEXT_TOO_LARGE', status: 413 });
  assert.equal((await f.store.snapshot()).governance.runs.length, 1);
});

test('budget counts escaping and visible evidence only, never unselected or excluded source sizes', async t => {
  const f = await fixture(t);
  const small = await f.store.importText({ title: 'Visible', text: 'Escaped " text\n and 😀' });
  const large = await f.store.importText({ title: 'Not permitted', text: 'z'.repeat(170000) });
  const member = await f.store.govern('member', { name: 'Synthetic reader' });
  const principal = { owner: false, memberId: member.member.id, kind: 'member' };
  await f.store.selectSources(f.room.id, [small.id]);
  const expected = JSON.stringify([{ sourceId: small.id, revisionId: small.revisionId, title: small.title, text: small.text }]).length;
  assert.equal((await f.store.snapshot()).governance.scopes[0].contextBudget.characters, expected);
  await f.store.selectSources(f.room.id, [small.id, large.id]);
  await f.store.govern('policy', { roomId: f.room.id, layerIds: [], memberGrants: [{ memberId: member.member.id, role: 'participant', sourceIds: [small.id] }] });
  const shared = (await f.store.snapshot(principal)).governance.scopes[0];
  assert.deepEqual(shared.contextBudget, { characters: expected, limit: 160000, overLimit: false }); assert.equal(shared.canSend, false);
  const layer = await f.store.govern('layer', { name: 'Excluded', mode: 'exclude', sourceIds: [large.id] });
  await f.store.govern('policy', { roomId: f.room.id, layerIds: [layer.id], memberGrants: [] });
  const allowed = (await f.store.snapshot()).governance.scopes[0];
  assert.equal(allowed.contextBudget.characters, expected); assert.equal(allowed.canSend, true);
  const compiled = await f.start(); assert.equal(JSON.stringify(compiled.context).length, expected); assert.equal(compiled.context.length, 1);
});
