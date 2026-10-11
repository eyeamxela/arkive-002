import { constants } from 'node:fs';
import { lstat, realpath, readdir, open } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const EXCLUDED = new Set(['.git', '.ssh', '.aws', '.azure', '.gnupg', '.codex', '.config', '.env',
  'node_modules', 'vendor', '.venv', 'venv', '.next', 'dist', 'build', 'coverage', '.trash']);
const SENSITIVE = /(?:^|[._ -])(?:secret|secrets|credentials|passwords?|tokens?|private[-_ ]?key)(?:[._ -]|$)/i;
const MAX_FILE = 1024 * 1024;
const MAX_FILES = 1000;
const MAX_TOTAL = 16 * 1024 * 1024;
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

export async function refreshFolder(store, folderId, { signal } = {}) {
  const folders = await store.listFolders();
  const folder = folders.find((item) => item.id === folderId);
  if (!folder) throw new Error('Folder not found');
  const root = await validateFolder(folder.path);
  const state = await store.snapshot();
  const existing = new Map(state.objects.filter((object) => object.sourcePath).map((object) => [object.sourcePath, object]));
  let imported = 0;
  let skipped = 0;
  let total = 0;
  let scanned = 0;
  const stack = [{ directory: root, depth: 0 }];
  while (stack.length) {
    signal?.throwIfAborted();
    const { directory, depth } = stack.pop();
    if (depth > 12 || scanned >= 5000 || imported >= MAX_FILES || total >= MAX_TOTAL) { skipped++; continue; }
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (++scanned > 5000 || imported >= MAX_FILES) { skipped++; break; }
      if (EXCLUDED.has(entry.name.toLowerCase()) || entry.name.startsWith('.') || SENSITIVE.test(entry.name) || entry.isSymbolicLink()) {
        skipped++; continue;
      }
      const candidate = path.join(directory, entry.name);
      // Reject observed symlinks. This is a read-only importer, not an OS sandbox
      // against a malicious same-user process racing directory replacements.
      const resolved = await realpath(candidate).catch(() => null);
      if (!resolved || !contained(root, resolved) || resolved !== candidate) { skipped++; continue; }
      if (entry.isDirectory()) { stack.push({ directory: candidate, depth: depth + 1 }); continue; }
      if (!entry.isFile() || !/\.(md|markdown|txt)$/i.test(entry.name)) { skipped++; continue; }
      let file;
      try {
        file = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
        const stat = await file.stat();
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_FILE || total + stat.size > MAX_TOTAL) { skipped++; continue; }
        // Read a bounded amount even if the file grows after stat().
        const buffer = Buffer.alloc(MAX_FILE + 1);
        let bytes = 0;
        while (bytes < buffer.length) {
          const read = await file.read(buffer, bytes, buffer.length - bytes, bytes);
          if (!read.bytesRead) break;
          bytes += read.bytesRead;
        }
        if (bytes > MAX_FILE || total + bytes > MAX_TOTAL) { skipped++; continue; }
        const afterPath = await realpath(candidate).catch(() => null);
        const afterStat = await lstat(candidate).catch(() => null);
        if (afterPath !== candidate || !afterStat?.isFile() || afterStat.isSymbolicLink() ||
          afterStat.nlink !== 1 || afterStat.dev !== stat.dev || afterStat.ino !== stat.ino ||
          afterStat.size !== stat.size || afterStat.mtimeMs !== stat.mtimeMs) { skipped++; continue; }
        const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes));
        if (text.includes('\0')) { skipped++; continue; }
        try {
          await store.importText({ objectId: existing.get(candidate)?.id, title: entry.name,
            text, kind: 'document', sourcePath: candidate });
        } catch (error) { error.importPersistence = true; throw error; }
        total += bytes;
        imported++;
      } catch (error) {
        if (error.importPersistence || error.code === 'BRAIN_IO' || error.code === 'BRAIN_LOCKED') throw error;
        skipped++;
      } finally { await file?.close(); }
    }
  }
  const updated = await store.updateFolder(folderId, { lastRefreshedAt: new Date().toISOString(), importedCount: imported });
  return { folder: updated, imported, skipped, bytes: total,
    note: 'Read-only manual refresh. Missing files remain in the Brain until explicitly reviewed; no source files are written or deleted.' };
}
