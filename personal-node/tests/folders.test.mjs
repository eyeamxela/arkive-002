import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { refreshFolder, scanFolder } from '../folders.mjs';
import { MAX_FOLDER_BATCH_FILES, MAX_FOLDER_BATCH_BYTES } from '../limits.mjs';

const PREVIOUS_SCAN = '2025-01-01T00:00:00.000Z';

async function fixture(t) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'arkive-folder-scan-')));
  const root = path.join(directory, 'vault'); await fs.mkdir(root);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const folder = { id: 'synthetic-folder', path: root, lastRefreshedAt: PREVIOUS_SCAN, importedCount: 7 };
  const documents = new Map(); const batches = []; let revisionWrites = 0;
  const store = {
    listFolders: async () => [{ ...folder }],
    updateFolder: async (id, patch) => { assert.equal(id, folder.id); Object.assign(folder, patch); return { ...folder }; },
    importFolderBatch: async (files) => {
      assert.ok(files.length > 0 && files.length <= MAX_FOLDER_BATCH_FILES);
      const bytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.text, 'utf8'), 0);
      assert.ok(bytes <= MAX_FOLDER_BATCH_BYTES);
      assert.equal(new Set(files.map((file) => file.sourcePath)).size, files.length);
      let imported = 0; let unchanged = 0;
      for (const file of files) {
        assert.ok(file.sourcePath.startsWith(`${root}${path.sep}`));
        assert.equal(file.kind, 'document');
        if (documents.get(file.sourcePath)?.text === file.text) unchanged++;
        else { documents.set(file.sourcePath, { ...file }); imported++; revisionWrites++; }
      }
      batches.push({ count: files.length, bytes, imported, unchanged });
      return { imported, unchanged };
    },
  };
  return { directory, root, folder, documents, batches, store, revisionWrites: () => revisionWrites };
}

async function writeMany(root, count, extension = 'md') {
  for (let start = 0; start < count; start += 64) await Promise.all(
    Array.from({ length: Math.min(64, count - start) }, (_, index) =>
      fs.writeFile(path.join(root, `note-${start + index}.${extension}`), `Synthetic source ${start + index}.`)));
}

test('scanner fully traverses beyond former file, entry, byte and depth caps with bounded batches', async (t) => {
  const a = await fixture(t);
  await writeMany(a.root, 1_005);
  await writeMany(a.root, 5_001, 'png');
  for (let index = 0; index < 17; index++) await fs.writeFile(path.join(a.root, `large-${index}.txt`), 'x'.repeat(1024 * 1024));
  let nested = a.root;
  for (let level = 0; level < 20; level++) { nested = path.join(nested, `level-${level}`); await fs.mkdir(nested); }
  await fs.writeFile(path.join(nested, 'deep.markdown'), 'Deep supported source.');
  const progress = [];
  const result = await refreshFolder(a.store, a.folder.id, { onProgress: (value) => progress.push(value) });
  assert.equal(result.phase, 'completed'); assert.equal(result.complete, true);
  assert.equal(result.scanned, 6_044); assert.equal(result.eligible, 1_023);
  assert.equal(result.imported, 1_023); assert.equal(result.unchanged, 0);
  assert.equal(result.skipped, 5_001); assert.deepEqual(result.skippedByReason, { 'unsupported-type': 5_001 });
  assert.ok(result.bytes > 16 * 1024 * 1024); assert.equal(result.bytes, a.batches.reduce((sum, batch) => sum + batch.bytes, 0));
  assert.equal(result.batches, a.batches.length); assert.ok(result.batches > 10);
  assert.equal(a.documents.size, 1_023); assert.equal(a.folder.importedCount, 1_023);
  assert.notEqual(a.folder.lastRefreshedAt, PREVIOUS_SCAN);
  assert.ok(progress.length > 60, 'Traversal reports progress even while unsupported entries dominate');
  for (let index = 1; index < progress.length; index++) {
    for (const field of ['scanned', 'eligible', 'imported', 'unchanged', 'skipped', 'bytes', 'batches']) assert.ok(progress[index][field] >= progress[index - 1][field], field);
  }
  assert.equal(progress.at(-1).phase, 'completed');
  assert.equal(await fs.readFile(path.join(nested, 'deep.markdown'), 'utf8'), 'Deep supported source.');
});

test('repeat traversal avoids source revisions; one edit adds one revision and absence never deletes', async (t) => {
  const a = await fixture(t); await writeMany(a.root, 205);
  const first = await refreshFolder(a.store, a.folder.id);
  assert.equal(first.imported, 205); assert.equal(a.revisionWrites(), 205);
  const second = await refreshFolder(a.store, a.folder.id);
  assert.equal(second.imported, 0); assert.equal(second.unchanged, 205); assert.equal(a.revisionWrites(), 205);
  await fs.writeFile(path.join(a.root, 'note-17.md'), 'Changed synthetic source.');
  await fs.unlink(path.join(a.root, 'note-3.md'));
  const third = await refreshFolder(a.store, a.folder.id);
  assert.equal(third.imported, 1); assert.equal(third.unchanged, 203); assert.equal(a.revisionWrites(), 206);
  assert.equal(a.documents.size, 205); assert.equal(a.folder.importedCount, 204);
  assert.equal(a.documents.get(path.join(a.root, 'note-3.md')).text, 'Synthetic source 3.');
  assert.equal(await fs.readFile(path.join(a.root, 'note-17.md'), 'utf8'), 'Changed synthetic source.');
});

test('sensitive, hidden, unsupported, invalid, oversized and linked sources remain excluded', async (t) => {
  const a = await fixture(t);
  for (const directory of ['.obsidian', 'node_modules', 'private-key']) {
    await fs.mkdir(path.join(a.root, directory)); await fs.writeFile(path.join(a.root, directory, 'never.md'), 'DO_NOT_IMPORT');
  }
  for (const name of ['.private.md', 'credentials.txt', 'password.md', 'api-token.txt', 'image.png', 'new\nline.md']) await fs.writeFile(path.join(a.root, name), 'DO_NOT_IMPORT');
  await fs.writeFile(path.join(a.root, 'invalid.txt'), Buffer.from([0xc3, 0x28]));
  await fs.writeFile(path.join(a.root, 'binary.txt'), Buffer.from([65, 0, 66]));
  await fs.writeFile(path.join(a.root, 'oversized.md'), Buffer.alloc(1024 * 1024 + 1, 65));
  await fs.writeFile(path.join(a.root, 'hard-original.md'), 'DO_NOT_IMPORT');
  await fs.link(path.join(a.root, 'hard-original.md'), path.join(a.root, 'hard-copy.md'));
  const outside = path.join(a.directory, 'outside'); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'external.md'), 'EXTERNAL_DO_NOT_IMPORT');
  await fs.symlink(path.join(outside, 'external.md'), path.join(a.root, 'link.md'));
  await fs.symlink(outside, path.join(a.root, 'linked-directory'));
  await fs.writeFile(path.join(a.root, 'valid.MARKDOWN'), 'Unicode source: café.');
  await fs.writeFile(path.join(a.root, 'empty.txt'), '');
  const result = await refreshFolder(a.store, a.folder.id);
  assert.equal(result.imported, 2); assert.equal(result.complete, true);
  assert.deepEqual([...a.documents.values()].map((item) => item.title).sort(), ['empty.txt', 'valid.MARKDOWN']);
  assert.equal(result.skippedByReason.hidden, 2);
  assert.equal(result.skippedByReason['excluded-directory-or-name'], 1);
  assert.equal(result.skippedByReason['sensitive-name'], 4);
  assert.equal(result.skippedByReason['unsupported-type'], 1);
  assert.equal(result.skippedByReason['unsupported-path'], 1);
  assert.equal(result.skippedByReason['invalid-utf8'], 1);
  assert.equal(result.skippedByReason.binary, 1);
  assert.equal(result.skippedByReason.oversized, 1);
  assert.equal(result.skippedByReason.hardlink, 2);
  assert.equal(result.skippedByReason.symlink, 2);
  assert.equal(result.skipped, Object.values(result.skippedByReason).reduce((sum, count) => sum + count, 0));
  assert.equal(await fs.readFile(path.join(outside, 'external.md'), 'utf8'), 'EXTERNAL_DO_NOT_IMPORT');
});

test('cancellation before work or after a commit retains truthful partial counters and prior completion metadata', async (t) => {
  const a = await fixture(t); await writeMany(a.root, 205);
  const early = new AbortController(); early.abort();
  const before = await refreshFolder(a.store, a.folder.id, { signal: early.signal });
  assert.equal(before.phase, 'cancelled'); assert.equal(before.imported, 0); assert.equal(before.batches, 0);
  assert.equal(a.documents.size, 0); assert.equal(a.folder.lastRefreshedAt, PREVIOUS_SCAN); assert.equal(a.folder.importedCount, 7);
  const controller = new AbortController(); const progress = [];
  const partial = await refreshFolder(a.store, a.folder.id, { signal: controller.signal, onProgress: (value) => {
    progress.push(value); if (value.batches === 1) controller.abort();
  } });
  assert.equal(partial.complete, false); assert.equal(partial.phase, 'cancelled');
  assert.equal(partial.imported, 100); assert.equal(partial.unchanged, 0); assert.equal(partial.batches, 1);
  assert.equal(partial.bytes, a.batches[0].bytes); assert.equal(a.documents.size, 100);
  assert.equal(a.folder.lastRefreshedAt, PREVIOUS_SCAN); assert.equal(a.folder.importedCount, 7);
  assert.match(a.folder.error, /cancelled/i); assert.equal(progress.at(-1).phase, 'cancelled');
  const completed = await refreshFolder(a.store, a.folder.id);
  assert.equal(completed.imported, 105); assert.equal(completed.unchanged, 100); assert.equal(a.documents.size, 205);
  assert.equal(a.folder.error, ''); assert.equal(a.revisionWrites(), 205);
});

test('persistence failure exposes failed progress without counting the rejected batch or claiming completion', async (t) => {
  const a = await fixture(t); await writeMany(a.root, 205);
  const importBatch = a.store.importFolderBatch; let calls = 0;
  a.store.importFolderBatch = async (files) => { if (++calls === 2) throw Object.assign(new Error('Synthetic storage capacity exhausted'), { code: 'BRAIN_CAPACITY' }); return importBatch(files); };
  // Even failure to record the error must not mask the original persistence failure.
  a.store.updateFolder = async () => { throw new Error('Synthetic full storage'); };
  const progress = [];
  await assert.rejects(refreshFolder(a.store, a.folder.id, { onProgress: (value) => progress.push(value) }), (error) => {
    assert.equal(error.code, 'BRAIN_CAPACITY'); assert.equal(error.scanProgress.phase, 'failed');
    assert.equal(error.scanProgress.imported, 100); assert.equal(error.scanProgress.unchanged, 0);
    assert.equal(error.scanProgress.batches, 1); assert.equal(error.scanProgress.bytes, a.batches[0].bytes);
    assert.equal(error.scanProgress.eligible, 200); return true;
  });
  assert.equal(calls, 2); assert.equal(a.documents.size, 100); assert.equal(progress.at(-1).phase, 'failed');
  assert.equal(a.folder.lastRefreshedAt, PREVIOUS_SCAN); assert.equal(a.folder.importedCount, 7);
});

test('queued directories are revalidated and replacement with an external symlink fails closed', async (t) => {
  const a = await fixture(t); await writeMany(a.root, 99);
  const child = path.join(a.root, 'nested'); await fs.mkdir(child); await fs.writeFile(path.join(child, 'safe.md'), 'Original synthetic child.');
  const outside = path.join(a.directory, 'outside'); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'external.md'), 'EXTERNAL_DO_NOT_IMPORT');
  let replaced = false;
  await assert.rejects(refreshFolder(a.store, a.folder.id, { onProgress: async (progress) => {
    if (!replaced && progress.scanned === 100) {
      replaced = true; await fs.rename(child, path.join(a.directory, 'old-child')); await fs.symlink(outside, child);
    }
  } }), (error) => {
    assert.equal(error.code, 'SCAN_DIRECTORY'); assert.equal(error.scanProgress.phase, 'failed');
    assert.equal(error.scanProgress.imported, 0); return true;
  });
  assert.equal(replaced, true); assert.equal(a.documents.size, 0);
  assert.equal(a.folder.lastRefreshedAt, PREVIOUS_SCAN); assert.equal(a.folder.importedCount, 7);
  assert.match(a.folder.error, /incomplete/i);
});

test('generator can be stopped after one batch and exclusion-only scans still report traversal', async (t) => {
  const a = await fixture(t); await writeMany(a.root, 205);
  const iterator = scanFolder(a.root); const first = await iterator.next();
  assert.equal(first.done, false); assert.equal(first.value.files.length, 100);
  await iterator.return(); assert.equal((await iterator.next()).done, true);
  const unsupported = path.join(a.directory, 'unsupported'); await fs.mkdir(unsupported); await writeMany(unsupported, 305, 'png');
  const observations = []; const batches = [];
  for await (const batch of scanFolder(unsupported, { onProgress: (value) => observations.push(value) })) batches.push(batch);
  assert.equal(batches.length, 0); assert.ok(observations.length >= 5);
  assert.equal(observations.at(-1).scanned, 305); assert.equal(observations.at(-1).skipped, 305);
  observations[0].skippedByReason.injected = 123;
  assert.equal(observations.at(-1).skippedByReason.injected, undefined, 'Progress snapshots do not share mutable counters');
});
