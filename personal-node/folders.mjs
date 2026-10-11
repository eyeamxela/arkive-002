import { constants } from 'node:fs';
import { lstat, realpath, opendir, open } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { MAX_FOLDER_BATCH_FILES, MAX_FOLDER_BATCH_BYTES } from './limits.mjs';

const EXCLUDED = new Set(['.git', '.ssh', '.aws', '.azure', '.gnupg', '.codex', '.config', '.env',
  'node_modules', 'vendor', '.venv', 'venv', '.next', 'dist', 'build', 'coverage', '.trash']);
const SENSITIVE = /(?:^|[._ -])(?:secret|secrets|credentials|passwords?|tokens?|private[-_ ]?key)(?:[._ -]|$)/i;
const MAX_FILE = 1024 * 1024;
const BATCH_FILES = MAX_FOLDER_BATCH_FILES;
const BATCH_BYTES = MAX_FOLDER_BATCH_BYTES;
const contained = (root, candidate) => candidate === root || candidate.startsWith(`${root}${path.sep}`);

export async function validateFolder(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error('Choose an absolute folder path');
  const normalized = path.resolve(value);
  if (normalized === path.parse(normalized).root || normalized === os.homedir() ||
    normalized === path.dirname(os.homedir())) throw new Error('Choose a specific folder, not a disk or home directory');
  if (normalized.split(path.sep).some((segment) => EXCLUDED.has(segment.toLowerCase()) || SENSITIVE.test(segment))) {
    throw new Error('Sensitive/system folders cannot be connected');
  }
  const stat = await lstat(normalized);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Folder must be a real directory, not a symlink');
  const resolved = await realpath(normalized);
  // Reject symlink components in the selected path, not only the last component.
  if (resolved !== normalized) throw new Error('Folder path must not contain symlinks');
  return resolved;
}

const scanError = (code, message, cause) => Object.assign(new Error(message, { cause }), { code });

async function readSource(candidate, root, signal) {
  let file;
  try {
    signal?.throwIfAborted();
    const resolved = await realpath(candidate);
    if (!contained(root, resolved) || resolved !== candidate) return { skip: 'linked-or-outside' };
    // A file replaced by a FIFO must not block before the fstat rejection.
    file = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await file.stat();
    signal?.throwIfAborted();
    if (!stat.isFile()) return { skip: 'not-regular' };
    if (stat.nlink !== 1) return { skip: 'hardlink' };
    if (stat.size > MAX_FILE) return { skip: 'oversized' };
    // One extra byte detects growth without ever reading an unbounded source.
    const buffer = Buffer.alloc(Math.min(MAX_FILE + 1, stat.size + 1));
    let bytes = 0;
    while (bytes < buffer.length) {
      signal?.throwIfAborted();
      const read = await file.read(buffer, bytes, buffer.length - bytes, bytes);
      signal?.throwIfAborted();
      if (!read.bytesRead) break;
      bytes += read.bytesRead;
    }
    const afterPath = await realpath(candidate).catch(() => null);
    const afterStat = await lstat(candidate).catch(() => null);
    const afterHandle = await file.stat();
    signal?.throwIfAborted();
    if (bytes > MAX_FILE || bytes !== stat.size || afterPath !== candidate ||
      !afterStat?.isFile() || afterStat.isSymbolicLink() || afterStat.nlink !== 1 ||
      afterStat.dev !== stat.dev || afterStat.ino !== stat.ino || afterStat.size !== stat.size ||
      afterStat.mtimeMs !== stat.mtimeMs || afterStat.ctimeMs !== stat.ctimeMs ||
      afterHandle.size !== stat.size || afterHandle.mtimeMs !== stat.mtimeMs || afterHandle.ctimeMs !== stat.ctimeMs) return { skip: 'changed-during-scan' };
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes)); }
    catch { return { skip: 'invalid-utf8' }; }
    if (text.includes('\0')) return { skip: 'binary' };
    return { text, bytes };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { skip: ['ENOENT', 'ELOOP', 'ENOTDIR'].includes(error.code) ? 'changed-during-scan' : 'unreadable-file' };
  } finally { await file?.close(); }
}

/** Full traversal with bounded content batches. One directory handle is open
 * at a time; pending directory-path metadata is O(directory frontier).
 * This is not an OS sandbox against a malicious same-user filesystem race. */
export async function* scanFolder(rootPath, { signal, onProgress } = {}) {
  signal?.throwIfAborted();
  const root = await validateFolder(rootPath);
  const stats = { scanned: 0, eligible: 0, skipped: 0, skippedByReason: {} };
  const snapshot = () => ({ ...stats, skippedByReason: { ...stats.skippedByReason } });
  let lastReported = 0; let lastReportedAt = 0;
  const report = async (force = false) => {
    if (onProgress && (force || stats.scanned - lastReported >= 100 || Date.now() - lastReportedAt >= 250)) {
      lastReported = stats.scanned; lastReportedAt = Date.now(); await onProgress(snapshot());
    }
  };
  const skip = (reason) => { stats.skipped++; stats.skippedByReason[reason] = (stats.skippedByReason[reason] ?? 0) + 1; };
  let files = []; let bytes = 0;
  const directories = [root];
  await report(true);
  while (directories.length) {
    signal?.throwIfAborted();
    const directory = directories.pop();
    let entries;
    try {
      const resolved = await realpath(directory); const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || resolved !== directory || !contained(root, resolved)) throw new Error('Directory identity changed');
      signal?.throwIfAborted();
      entries = await opendir(directory);
    } catch (error) {
      if (signal?.aborted) throw error;
      throw scanError('SCAN_DIRECTORY', 'A directory became unavailable or unsafe; the vault scan is incomplete.', error);
    }
    try {
      while (true) {
        signal?.throwIfAborted();
        let entry;
        try { entry = await entries.read(); }
        catch (error) { throw scanError('SCAN_DIRECTORY', 'A directory could not be fully enumerated; the vault scan is incomplete.', error); }
        signal?.throwIfAborted();
        if (!entry) break;
        stats.scanned++;
        try {
          if (EXCLUDED.has(entry.name.toLowerCase())) { skip('excluded-directory-or-name'); continue; }
          if (entry.name.startsWith('.')) { skip('hidden'); continue; }
          if (SENSITIVE.test(entry.name)) { skip('sensitive-name'); continue; }
          if (entry.isSymbolicLink()) { skip('symlink'); continue; }
          if (/[\u0000-\u001f]/u.test(entry.name)) { skip('unsupported-path'); continue; }
          const candidate = path.join(directory, entry.name);
          if (entry.isDirectory()) { directories.push(candidate); continue; }
          if (!entry.isFile()) { skip('not-regular'); continue; }
          if (!/\.(md|markdown|txt)$/i.test(entry.name)) { skip('unsupported-type'); continue; }
          const source = await readSource(candidate, root, signal);
          signal?.throwIfAborted();
          if (source.skip) { skip(source.skip); continue; }
          stats.eligible++;
          // Batch byte bound is UTF-8 content size, matching importFolderBatch.
          const contentBytes = Buffer.byteLength(source.text, 'utf8');
          if (files.length && (files.length >= BATCH_FILES || bytes + contentBytes > BATCH_BYTES)) {
            await report(true); signal?.throwIfAborted();
            yield { files, bytes, progress: snapshot() };
            signal?.throwIfAborted(); files = []; bytes = 0;
          }
          files.push({ title: entry.name, text: source.text, kind: 'document', sourcePath: candidate }); bytes += contentBytes;
          if (files.length >= BATCH_FILES || bytes >= BATCH_BYTES) {
            await report(true); signal?.throwIfAborted();
            yield { files, bytes, progress: snapshot() };
            signal?.throwIfAborted(); files = []; bytes = 0;
          }
        } finally { await report(); }
      }
    } finally { await entries.close(); }
  }
  await report(true); signal?.throwIfAborted();
  if (files.length) yield { files, bytes, progress: snapshot() };
}

/** Committed batch counters remain truthful on cancellation or storage failure.
 * Files absent from a later scan remain in the Brain for explicit review. */
export async function refreshFolder(store, folderId, { signal, onProgress } = {}) {
  const progress = { phase: 'scanning', scanned: 0, eligible: 0, imported: 0, unchanged: 0, skipped: 0, bytes: 0, batches: 0, skippedByReason: {} };
  const snapshot = () => ({ ...progress, skippedByReason: { ...progress.skippedByReason } });
  const report = async () => { if (onProgress) await onProgress(snapshot()); };
  let folder;
  const recordError = async (message) => {
    if (folder) { try { folder = await store.updateFolder(folderId, { error: message }); } catch { /* Progress remains available even when storage is full/closed. */ } }
  };
  try {
    folder = (await store.listFolders()).find((item) => item.id === folderId);
    if (!folder) throw scanError('SCAN_NOT_FOUND', 'Folder not found');
    signal?.throwIfAborted(); await report();
    for await (const batch of scanFolder(folder.path, { signal, onProgress: async (observed) => { Object.assign(progress, observed); await report(); } })) {
      signal?.throwIfAborted();
      let receipt;
      try { receipt = await store.importFolderBatch(batch.files); }
      catch (error) { error.importPersistence = true; throw error; }
      if (!receipt || !Number.isSafeInteger(receipt.imported) || !Number.isSafeInteger(receipt.unchanged) || receipt.imported < 0 || receipt.unchanged < 0 || receipt.imported + receipt.unchanged !== batch.files.length) throw scanError('SCAN_RECEIPT', 'The committed source batch returned an invalid receipt; inspect the Brain before retrying.');
      progress.imported += receipt.imported; progress.unchanged += receipt.unchanged;
      progress.bytes += batch.bytes; progress.batches++;
      await report(); signal?.throwIfAborted();
    }
    signal?.throwIfAborted();
    folder = await store.updateFolder(folderId, { lastRefreshedAt: new Date().toISOString(), importedCount: progress.imported + progress.unchanged, error: '' });
    progress.phase = 'completed'; await report();
    return { folder, ...snapshot(), complete: true, note: 'Full read-only traversal finished. Unsupported or unsafe entries are counted by reason. Missing files remain in the Brain; no source files were written or deleted.' };
  } catch (error) {
    if (signal?.aborted && !error.importPersistence) {
      progress.phase = 'cancelled'; progress.error = 'Scan cancelled. Previously committed batches remain; the last completed scan metadata is unchanged.';
      await recordError(progress.error); await report();
      return { folder, ...snapshot(), complete: false, note: progress.error };
    }
    progress.phase = 'failed'; progress.error = String(error.message || 'Vault scan failed').slice(0, 1024);
    await recordError(progress.error); await report();
    error.scanProgress = snapshot(); throw error;
  }
}
