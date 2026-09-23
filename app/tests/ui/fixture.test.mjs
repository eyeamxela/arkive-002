import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
const built = await build({ entryPoints: [fileURLToPath(new URL('./fixture.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
const fixture = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
test('browser fixture imports with no Node process or real environment', async () => {
  const browser = await build({ entryPoints: [fileURLToPath(new URL('./fixture.ts', import.meta.url))], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'Fixture', define: { 'process.env': '{}' } });
  const scope = { structuredClone, TextEncoder, TextDecoder, crypto: globalThis.crypto, console };
  runInNewContext(browser.outputFiles[0].text, scope);
  await scope.Fixture.initializeFixture();
  assert.equal(scope.Fixture.table('rooms').length, 3);
  assert.equal('process' in scope, false);
  const preview = await scope.Fixture.queryFixture('workspace:get', { room: 'dm:hermes', deny: true });
  assert.equal(preview.context.documents.length, 4);
});
test('isolated fixture initializes actual public handlers with synthetic data only', async () => {
  await fixture.initializeFixture();
  assert.equal(fixture.table('rooms').length, 3);
  assert.equal(fixture.table('brainObjects').length, 20);
  assert(fixture.table('brainObjects').every(doc => doc.fixture && doc.provenance === 'fixture'));
  const preview = await fixture.queryFixture('workspace:get', { room: 'dm:hermes', deny: true });
  assert.equal(preview.context.documents.length, 4);
  assert.throws(() => fixture.publicHandler('chat:reply'), /public handler/);
  assert.throws(() => fixture.publicHandler('documents:ingest'), /public handler/);
});
test('synthetic send failure, per-run approval and memory consent use real public semantics', async () => {
  fixture.failNextSend();
  await assert.rejects(fixture.mutateFixture('chat:sendMessage', { room: 'dm:hermes', deny: true, text: 'synthetic test' }), /injected send failure/);
  const waiting = fixture.table('runs').filter(run => run.state === 'waiting');
  await fixture.mutateFixture('ops:approvalDecide', { runId: waiting[0]._id, approve: true });
  assert.equal(waiting[1].state, 'waiting');
  const memory = fixture.table('proposals').find(row => row.kind === 'memory');
  await assert.rejects(fixture.mutateFixture('proposals:accept', { id: memory._id }), /consent/);
  await fixture.mutateFixture('proposals:accept', { id: memory._id, consent: true });
  assert.equal(fixture.table('proposals').find(row => row._id === memory._id).state, 'accepted');
});

test('fixture mutation failure leaves policy unchanged, then permits a successful retry', async () => {
  const before = fixture.table('tierPolicy')[0].curated;
  fixture.failNextMutation('ops:policySet');
  await assert.rejects(fixture.mutateFixture('ops:policySet', { tier: 'curated', mode: 'exclude' }), /injected mutation failure/);
  assert.equal(fixture.table('tierPolicy')[0].curated, before);
  await fixture.mutateFixture('ops:policySet', { tier: 'curated', mode: 'include' });
  assert.equal(fixture.table('tierPolicy')[0].curated, 'include');
});

test('fixture queued reply obeys revocation and never emits revoked source citations', async () => {
  const callbacks = [];
  globalThis.window = { setTimeout(callback) { callbacks.push(callback); } };
  try {
    const room = fixture.table('rooms').find(row => row.key === 'dm:hermes');
    const snapshotId = await fixture.mutateFixture('chat:sendMessage', { room: room.key, deny: true, text: 'synthetic revocation test' });
    await fixture.mutateFixture('ops:manifestRevoke', { id: room.activeManifestId });
    callbacks.forEach(callback => callback());
    // Queue behind the allowlisted simulation callback to await its completion.
    await fixture.mutateFixture('ops:policySet', { tier: 'curated', mode: 'include' });
    const reply = fixture.table('messages').find(row => row.snap === snapshotId);
    assert.match(reply.text, /cancelled/);
    assert.deepEqual(reply.cites, []);
  } finally { delete globalThis.window; }
});
