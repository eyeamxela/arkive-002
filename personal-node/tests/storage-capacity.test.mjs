import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { openBrain, restoreBrain } from '../brain.mjs';
import { encryptExport, decryptExport } from '../server.mjs';
import { MAX_BRAIN_BYTES, MAX_ENVELOPE_BYTES, MAX_TRANSFER_BYTES, BRAIN_INTAKE_BYTES,
  MAX_FOLDER_BATCH_FILES, MAX_FOLDER_BATCH_BYTES } from '../limits.mjs';

const MIB = 1024 * 1024;
const PASSWORD = 'synthetic capacity test passphrase';
const file = (index, text = `Synthetic file ${index}`) => ({ title: `note-${index}.md`, text,
  kind: 'document', sourcePath: `/synthetic-capacity-vault/note-${index}.md` });
const digest = (value) => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkive-capacity-'));
  const stores = [];
  t.after(async () => {
    for (const store of stores) await store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const directory = path.join(root, 'brain');
  const store = await openBrain(directory, PASSWORD, { create: true });
  stores.push(store);
  return { root, directory, store, stores,
    disk: () => fs.readFile(path.join(directory, 'brain.enc')) };
}

test('shared capacity limits include encryption overhead and governance headroom', () => {
  assert.equal(MAX_BRAIN_BYTES, 128 * MIB);
  assert.equal(MAX_ENVELOPE_BYTES, 180 * MIB);
  assert.equal(MAX_TRANSFER_BYTES, 192 * MIB);
  assert.equal(BRAIN_INTAKE_BYTES, MAX_BRAIN_BYTES - 2 * MIB);
  assert.ok(MAX_ENVELOPE_BYTES > Math.ceil(MAX_BRAIN_BYTES * 4 / 3) + 1024);
  assert.ok(MAX_TRANSFER_BYTES > MAX_ENVELOPE_BYTES);
  assert.equal(MAX_FOLDER_BATCH_FILES, 100);
  assert.equal(MAX_FOLDER_BATCH_BYTES, 4 * MIB);
});

test('folder batches retain distinct paths, revision history and caller isolation without rewriting unchanged data', async (t) => {
  const { store, disk } = await fixture(t);
  const files = [file(1, 'Same synthetic bytes'), file(2, 'Same synthetic bytes')];
  assert.deepEqual(await store.importFolderBatch(files), { imported: 2, unchanged: 0 });
  const first = await store.snapshot();
  assert.notEqual(first.objects[0].id, first.objects[1].id);
  const encrypted = digest(await disk());
  assert.deepEqual(await store.importFolderBatch(files), { imported: 0, unchanged: 2 });
  assert.deepEqual(await store.importFolderBatch([]), { imported: 0, unchanged: 0 });
  assert.equal(digest(await disk()), encrypted, 'A random encryption nonce would change bytes if the store were rewritten');
  assert.deepEqual(await store.snapshot(), first);
  const revised = { ...files[0], text: 'Updated synthetic contents' };
  const pending = store.importFolderBatch([revised, files[1]]);
  revised.text = 'Caller mutation must not change the pending transaction';
  assert.deepEqual(await pending, { imported: 1, unchanged: 1 });
  const after = await store.snapshot();
  assert.equal(after.objects[0].id, first.objects[0].id);
  assert.equal(after.objects[0].text, 'Updated synthetic contents');
  assert.equal(after.revisions.length, 3);
  assert.deepEqual(after.revisions[2].parentIds, [first.objects[0].revisionId]);
  assert.equal(after.revisions[0].text, 'Same synthetic bytes');
});

test('folder batch paths and byte/count limits reject unsafe or ambiguous input atomically', async (t) => {
  const { store, disk } = await fixture(t);
  await store.importFolderBatch([file(0)]);
  const before = digest(await disk());
  for (const files of [
    [file(1), file(1)],
    [{ ...file(1), sourcePath: undefined }],
    [{ ...file(1), sourcePath: '' }],
    [{ ...file(1), sourcePath: 'relative.md' }],
    [{ ...file(1), sourcePath: '/synthetic-capacity-vault/../alias.md' }],
    [file(1), { ...file(2), text: '\0' }],
    Array.from({ length: MAX_FOLDER_BATCH_FILES + 1 }, (_, index) => file(index)),
    Array.from({ length: 5 }, (_, index) => file(index, 'x'.repeat(MIB))),
    [file(1, 'x'.repeat(MIB + 1))],
  ]) {
    await assert.rejects(async () => store.importFolderBatch(files), { code: 'BRAIN_INVALID' });
    assert.equal(digest(await disk()), before);
  }
  const first = await store.importText(file(5));
  const duplicate = await store.importText(file(5));
  assert.notEqual(first.id, duplicate.id);
  const ambiguous = await store.snapshot();
  const priorDisk = digest(await disk());
  await assert.rejects(store.importFolderBatch([file(6), file(5, 'Do not pick a duplicate')]), { code: 'BRAIN_CONFLICT' });
  assert.deepEqual(await store.snapshot(), ambiguous);
  assert.equal(digest(await disk()), priorDisk);
});

test('folder batches resolve identities and compare payloads at their place in the store queue', async (t) => {
  const { store } = await fixture(t);
  const original = await store.importText(file(1));
  const latest = { ...file(1), text: 'A queued newer head' };
  const write = store.importText({ ...latest, objectId: original.id });
  const batch = store.importFolderBatch([latest]);
  const current = await write;
  assert.deepEqual(await batch, { imported: 0, unchanged: 1 });
  assert.equal((await store.snapshot()).objects[0].revisionId, current.revisionId);
  const create = store.importText(file(2));
  assert.deepEqual(await store.importFolderBatch([file(2)]), { imported: 0, unchanged: 1 });
  const newObject = await create;
  const state = await store.snapshot();
  assert.equal(state.objects.length, 2);
  assert.equal(state.objects[1].id, newObject.id);
});

test('a Brain above the former 32 MiB limit reopens, exports, restores and replicates without migration', async (t) => {
  const { store, stores, root, directory, disk } = await fixture(t);
  const text = 'Synthetic capacity fixture.\n'.repeat(Math.ceil(MIB / 28)).slice(0, MIB);
  const files = Array.from({ length: 18 }, (_, index) => file(index, text));
  for (let offset = 0; offset < files.length; offset += 4) {
    const batch = files.slice(offset, offset + 4);
    assert.deepEqual(await store.importFolderBatch(batch), { imported: batch.length, unchanged: 0 });
  }
  const original = await store.exportBundle();
  assert.equal(original.schemaVersion, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(original.state)) > 32 * MIB);
  assert.ok(Buffer.byteLength(JSON.stringify(original.state)) < MAX_BRAIN_BYTES);
  assert.ok((await disk()).length > 46 * MIB, 'Exercise the raised on-disk envelope guard');
  await store.close();
  const reopened = await openBrain(directory, PASSWORD); stores.push(reopened);
  const after = await reopened.exportBundle();
  assert.equal(after.checksum, original.checksum);
  const encrypted = await encryptExport(after, PASSWORD);
  assert.ok(JSON.stringify(encrypted).length > 48 * MIB, 'Exercise the raised encrypted recovery transport guard');
  assert.ok(!JSON.stringify(encrypted).includes('Synthetic capacity fixture'));
  const decoded = await decryptExport(encrypted, PASSWORD);
  assert.equal(decoded.checksum, original.checksum);
  const restored = await restoreBrain(path.join(root, 'restored'), PASSWORD, decoded); stores.push(restored);
  const replica = await restored.exportReplica();
  assert.equal(replica.state.brainId, original.state.brainId);
  assert.deepEqual(replica.state.objects.map((object) => [object.id, object.revisionId]), original.state.objects.map((object) => [object.id, object.revisionId]));
  assert.equal(replica.state.revisions.length, original.state.revisions.length);
  assert.deepEqual(await reopened.mergeBundle(replica), { importedObjects: 0, importedRevisions: 0, conflicts: 0 });
  assert.deepEqual(await restored.importFolderBatch(files.slice(0, 4)), { imported: 0, unchanged: 4 });
});

test('object capacity rejects the entire batch and retains both disk and state', async (t) => {
  const { store, disk } = await fixture(t);
  // Small synthetic records exercise the hard capacity boundary without requiring
  // a near-128 MiB fixture in every parallel test runner process.
  for (let offset = 0; offset < 10000; offset += 1000) {
    await store.importSnapshot(Array.from({ length: 1000 }, (_, index) => file(offset + index, 'x')));
  }
  const before = await store.exportBundle();
  const encrypted = digest(await disk());
  await assert.rejects(store.importFolderBatch([file(0, 'Must roll back this revision'), file(10000)]), { code: 'BRAIN_CAPACITY' });
  assert.equal((await store.exportBundle()).checksum, before.checksum);
  assert.equal(digest(await disk()), encrypted);
  assert.deepEqual(await store.importFolderBatch([file(0, 'x')]), { imported: 0, unchanged: 1 });
});

test('serialized Brain byte capacity accounts for JSON expansion and rolls back before encryption', async (t) => {
  const { store, disk } = await fixture(t);
  await store.importFolderBatch([file(0)]);
  const before = await store.exportBundle();
  const encrypted = digest(await disk());
  // Each input is only 1 MiB, but JSON encodes this permitted control character
  // as six bytes in both the current object and its immutable revision. Eleven
  // inputs therefore exceed 128 MiB without writing a huge fixture to disk.
  const expandingText = '\u0001'.repeat(MIB);
  await assert.rejects(store.importSnapshot(Array.from({ length: 11 }, (_, index) => file(index + 1, expandingText))), {
    code: 'BRAIN_CAPACITY', message: 'Brain exceeds the 128 MiB storage limit',
  });
  assert.equal((await store.exportBundle()).checksum, before.checksum);
  assert.equal(digest(await disk()), encrypted);
});
