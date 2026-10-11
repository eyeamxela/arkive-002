import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { openBrain, restoreBrain } from '../brain.mjs';

const PASSWORD = 'local test passphrase never real';
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkive-brain-test-'));
  const stores = [];
  t.after(async () => {
    for (const store of stores) await store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const open = async (name = 'brain') => {
    const store = await openBrain(path.join(root, name), PASSWORD, { create: true, template: 'business', name: 'Test business' });
    stores.push(store);
    return store;
  };
  const restore = async (name, bundle) => {
    const store = await restoreBrain(path.join(root, name), PASSWORD, bundle);
    stores.push(store);
    return store;
  };
  return { root, open, restore, stores };
}

test('encrypted local repository persists original text and rejects wrong passphrase', async (t) => {
  const { root, open, stores } = await fixture(t);
  const store = await open();
  const object = await store.importText({ title: 'Private original', text: 'confidential sentinel', sourcePath: '/approved/source.md' });
  const raw = await fs.readFile(path.join(root, 'brain', 'brain.enc'), 'utf8');
  assert.ok(!raw.includes('confidential sentinel'));
  assert.ok(!raw.includes('/approved'));
  assert.equal((await fs.stat(path.join(root, 'brain', 'brain.enc'))).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.join(root, 'brain'))).mode & 0o777, 0o700);
  await store.close();
  await assert.rejects(openBrain(path.join(root, 'brain'), 'this is the wrong passphrase'), { code: 'BRAIN_AUTH' });
  const reopened = await openBrain(path.join(root, 'brain'), PASSWORD);
  stores.push(reopened);
  assert.deepEqual((await reopened.snapshot()).objects[0], object);
});

test('stable logical IDs, distinct source identities and immutable revisions', async (t) => {
  const { open } = await fixture(t);
  const store = await open();
  const first = await store.importText({ title: 'A', text: 'same bytes', sourcePath: '/a.md' });
  const second = await store.importText({ title: 'B', text: 'same bytes', sourcePath: '/b.md' });
  assert.notEqual(first.id, second.id);
  assert.deepEqual(await store.importText({ objectId: first.id, title: 'A', text: 'same bytes' }), first);
  const revised = await store.importText({ objectId: first.id, title: 'A', text: 'updated bytes' });
  assert.equal(revised.id, first.id);
  assert.notEqual(revised.revisionId, first.revisionId);
  const snapshot = await store.snapshot();
  assert.equal(snapshot.revisions.length, 3);
  assert.equal(snapshot.revisions[0].text, 'same bytes');
  assert.deepEqual(snapshot.revisions[2].parentIds, [first.revisionId]);
  snapshot.objects[0].text = 'caller mutation';
  assert.equal((await store.snapshot()).objects[0].text, 'updated bytes');
});

test('chat context selection is explicit and memory promotion requires review', async (t) => {
  const { open } = await fixture(t);
  const store = await open();
  const document = await store.importText({ title: 'Policy', text: 'Review all changes' });
  const room = await store.createRoom({ title: 'Policy chat' });
  await assert.rejects(store.addMessage(room.id, { role: 'assistant', text: 'answer', sourceIds: [document.id] }), /not selected/);
  await store.selectSources(room.id, [document.id]);
  const message = await store.addMessage(room.id, { role: 'assistant', text: 'answer', sourceIds: [document.id] });
  assert.equal(message.status, 'complete');
  await assert.rejects(store.proposeMemory({ title: 'Unsupported', text: 'claim', sourceIds: [] }), /source/);
  const proposal = await store.proposeMemory({ title: 'Review policy', text: 'Changes need review', sourceIds: [document.id] });
  assert.equal((await store.snapshot()).objects.length, 1);
  const approved = await store.reviewProposal(proposal.id, 'accept');
  assert.equal(approved.status, 'accepted');
  const memory = (await store.snapshot()).objects.find((object) => object.id === approved.objectId);
  assert.equal(memory.kind, 'memory');
  assert.deepEqual(memory.sourceIds, [document.id]);
  await assert.rejects(store.reviewProposal(proposal.id, 'reject'), { code: 'BRAIN_CONFLICT' });
});

test('portable restore retains Brain identity, history and chat, but not folder grants', async (t) => {
  const { open, restore, root } = await fixture(t);
  const store = await open();
  await store.importText({ title: 'Original', text: 'content' });
  const folder = await store.registerFolder({ path: '/approved/documents' });
  await store.updateFolder(folder.id, { lastRefreshedAt: new Date().toISOString(), importedCount: 1 });
  const room = await store.createRoom({ title: 'Saved room' });
  await store.addMessage(room.id, { role: 'user', text: 'Hello' });
  const bundle = await store.exportBundle();
  const restored = await restore('other', bundle);
  const state = await restored.snapshot();
  assert.equal(state.brainId, bundle.state.brainId);
  assert.deepEqual(state.objects, bundle.state.objects);
  assert.deepEqual(state.revisions, bundle.state.revisions);
  assert.deepEqual(state.rooms, bundle.state.rooms);
  assert.deepEqual(state.folders, []);
  await assert.rejects(restoreBrain(path.join(root, 'other'), PASSWORD, bundle), { code: 'BRAIN_EXISTS' });
  await fs.mkdir(path.join(root, 'occupied'));
  await fs.writeFile(path.join(root, 'occupied', 'keep.txt'), 'keep');
  await assert.rejects(restoreBrain(path.join(root, 'occupied'), PASSWORD, bundle), /empty/);
  assert.equal(await fs.readFile(path.join(root, 'occupied', 'keep.txt'), 'utf8'), 'keep');
});

test('sync fast-forwards existing history, is idempotent and does not import local-only state', async (t) => {
  const { open, restore } = await fixture(t);
  const a = await open();
  const original = await a.importText({ title: 'Guide', text: 'v1' });
  const b = await restore('peer', await a.exportBundle());
  const localRoom = await a.createRoom({ title: 'Local' });
  await a.selectSources(localRoom.id, [original.id]);
  await b.createRoom({ title: 'Remote room must stay remote' });
  await b.registerFolder({ path: '/private/remote' });
  await b.proposeMemory({ title: 'Unreviewed', text: 'draft', sourceIds: [original.id] });
  const revised = await b.importText({ objectId: original.id, title: 'Guide', text: 'v2' });
  const first = await a.mergeBundle(await b.exportBundle());
  assert.equal(first.importedRevisions, 1);
  const snapshot = await a.snapshot();
  assert.equal(snapshot.objects[0].revisionId, revised.revisionId);
  assert.equal(snapshot.rooms.length, 1);
  assert.deepEqual(snapshot.rooms[0].selectedSourceIds, [original.id]);
  assert.deepEqual(snapshot.proposals, []);
  assert.deepEqual(snapshot.folders, []);
  const again = await a.mergeBundle(await b.exportBundle());
  assert.deepEqual(again, { importedObjects: 0, importedRevisions: 0, conflicts: 0 });
});

test('divergent edits preserve both histories and never overwrite the local head', async (t) => {
  const { open, restore } = await fixture(t);
  const a = await open();
  const original = await a.importText({ title: 'Shared', text: 'base' });
  const b = await restore('peer', await a.exportBundle());
  const local = await a.importText({ objectId: original.id, title: 'Shared', text: 'local edit' });
  const remote = await b.importText({ objectId: original.id, title: 'Shared', text: 'remote edit' });
  const result = await a.mergeBundle(await b.exportBundle());
  assert.equal(result.conflicts, 1);
  const state = await a.snapshot();
  assert.equal(state.objects[0].revisionId, local.revisionId);
  assert.equal(state.revisions.length, 3);
  assert.equal(state.conflicts[0].remoteRevisionId, remote.revisionId);
  assert.equal((await a.mergeBundle(await b.exportBundle())).conflicts, 0);
});

test('different Brain IDs, checksum changes, malformed parents and unsafe keys are rejected', async (t) => {
  const { open } = await fixture(t);
  const a = await open('a');
  const b = await open('b');
  await assert.rejects(a.mergeBundle(await b.exportBundle()), { code: 'BRAIN_CONFLICT' });
  await a.importText({ title: 'Source', text: 'source' });
  const bundle = await a.exportBundle();
  const changed = structuredClone(bundle);
  changed.state.name = 'tampered';
  assert.throws(() => a.mergeBundle(changed), /checksum/);
  const badRevision = structuredClone(bundle);
  badRevision.state.revisions[0].text = 'rewritten history';
  assert.throws(() => a.mergeBundle(badRevision), /checksum/);
  assert.throws(() => a.importText(JSON.parse('{"title":"x","text":"x","__proto__":{}}')), /Unsafe/);
  await assert.rejects(a.importText({ objectId: '../../../path', title: 'x', text: 'x' }), /Invalid/);
});

test('atomic mutations are serialized; failed mutations do not corrupt later writes', async (t) => {
  const { open } = await fixture(t);
  const store = await open();
  await Promise.all(Array.from({ length: 15 }, (_, index) => store.importText({ title: `Item ${index}`, text: `${index}` })));
  await assert.rejects(store.importText({ title: 'Oversize', text: 'x'.repeat(1024 * 1024 + 1) }), /text/);
  await store.importText({ title: 'Still works', text: 'ok' });
  assert.equal((await store.snapshot()).objects.length, 16);
  await store.close();
  await assert.rejects(store.snapshot(), { code: 'BRAIN_LOCKED' });
});

test('exclusive writer lock, symlink directory and symlink state protections', async (t) => {
  const { root, open } = await fixture(t);
  const store = await open();
  await assert.rejects(openBrain(path.join(root, 'brain'), PASSWORD), { code: 'BRAIN_LOCKED' });
  await fs.symlink(path.join(root, 'brain'), path.join(root, 'alias'));
  await assert.rejects(openBrain(path.join(root, 'alias'), PASSWORD), /symlink/);
  await store.close();
  await fs.mkdir(path.join(root, 'symlink-state'));
  await fs.symlink(path.join(root, 'brain', 'brain.enc'), path.join(root, 'symlink-state', 'brain.enc'));
  await assert.rejects(openBrain(path.join(root, 'symlink-state'), PASSWORD), /ordinary/);
});

test('authenticated ciphertext alteration fails closed', async (t) => {
  const { root, open } = await fixture(t);
  const store = await open();
  await store.close();
  const filename = path.join(root, 'brain', 'brain.enc');
  const envelope = JSON.parse(await fs.readFile(filename, 'utf8'));
  const bytes = Buffer.from(envelope.ciphertext, 'base64');
  bytes[0] ^= 1;
  envelope.ciphertext = bytes.toString('base64');
  await fs.writeFile(filename, JSON.stringify(envelope), { mode: 0o600 });
  await assert.rejects(openBrain(path.join(root, 'brain'), PASSWORD), { code: 'BRAIN_AUTH' });
});
