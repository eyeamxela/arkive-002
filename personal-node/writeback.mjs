import { constants } from 'node:fs';
import { lstat, realpath, open, rename, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { validateFolder } from './folders.mjs';

const MAX_FILE = 1024 * 1024;
const SENSITIVE = /(?:^|[._ -])(?:secret|secrets|credentials|passwords?|tokens?|private[-_ ]?key)(?:[._ -]|$)/i;
const EXCLUDED = new Set(['node_modules', 'vendor', 'venv', 'dist', 'build', 'coverage']);
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const hash = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const identity = (stat) => ({ dev: stat.dev, ino: stat.ino });
const sameIdentity = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino;

function validateInput(relativePath, text) {
  if (typeof relativePath !== 'string' || relativePath.length > 1024 || /[\x00-\x1f\x7f\\%?#:]/.test(relativePath) ||
    !relativePath.split('/').every((part) => part && part.length <= 255 && !part.startsWith('.') &&
      !SENSITIVE.test(part) && !EXCLUDED.has(part.toLowerCase())) || !/\.(md|markdown|txt)$/i.test(relativePath)) {
    throw fail('WRITEBACK_PATH', 'Choose a non-hidden relative Markdown or text path without sensitive names or traversal');
  }
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_FILE || text.includes('\0') ||
    Buffer.from(text, 'utf8').toString('utf8') !== text) {
    throw fail('WRITEBACK_TEXT', 'Writeback text must be valid UTF-8 without NUL bytes and at most 1 MiB');
  }
}
async function parents(root, relativePath) {
  const chain = []; let current = root;
  for (const part of ['', ...relativePath.split('/').slice(0, -1)]) {
    if (part) current = path.join(current, part);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(current) !== current) {
      throw fail('WRITEBACK_PATH', 'Writeback parent must be an existing real directory without symlinks');
    }
    chain.push({ path: current, ...identity(stat) });
  }
  return chain;
}
function compareParents(expected, actual) {
  if (!Array.isArray(expected) || expected.length !== actual.length || expected.some((entry, index) =>
    entry.path !== actual[index].path || !sameIdentity(entry, actual[index]))) {
    throw fail('WRITEBACK_CONFLICT', 'Source directory changed since preview; prepare a new preview', 409);
  }
}
async function readTarget(target) {
  let file;
  try {
    const before = await lstat(target);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_FILE) {
      throw fail('WRITEBACK_PATH', 'Writeback target must be a regular file, not a symlink or hardlink, at most 1 MiB');
    }
    file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || !sameIdentity(before, stat) || stat.size > MAX_FILE) throw fail('WRITEBACK_CONFLICT', 'Source changed while being read', 409);
    const buffer = Buffer.alloc(MAX_FILE + 1); let bytes = 0;
    while (bytes < buffer.length) {
      const read = await file.read(buffer, bytes, buffer.length - bytes, bytes);
      if (!read.bytesRead) break;
      bytes += read.bytesRead;
    }
    const after = await file.stat(); const current = await lstat(target);
    if (bytes > MAX_FILE || !sameIdentity(current, stat) || current.nlink !== 1 || !current.isFile() ||
      current.isSymbolicLink() || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs ||
      after.ctimeMs !== stat.ctimeMs || bytes !== stat.size || await realpath(target) !== target) {
      throw fail('WRITEBACK_CONFLICT', 'Source changed while being read', 409);
    }
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, bytes)); }
    catch { throw fail('WRITEBACK_TEXT', 'Existing source must be valid UTF-8 text'); }
    if (text.includes('\0')) throw fail('WRITEBACK_TEXT', 'Existing source contains binary NUL bytes');
    return { existed: true, text, hash: hash(text), identity: identity(stat), mode: stat.mode & 0o777 };
  } catch (error) {
    if (error.code === 'ENOENT' && !file) return { existed: false, text: '', hash: null, identity: null, mode: 0o600 };
    throw error;
  } finally { await file?.close(); }
}

/** Read-only preview. Persist the original in encrypted Brain history before approving apply. */
export async function prepareLocalWrite({ rootPath, relativePath, text } = {}) {
  validateInput(relativePath, text);
  const root = await validateFolder(rootPath);
  const parentChain = await parents(root, relativePath);
  const target = path.join(root, relativePath);
  const before = await readTarget(target);
  compareParents(parentChain, await parents(root, relativePath));
  return { kind: 'local', rootPath: root, relativePath, target, beforeText: before.text, afterText: text,
    expectedHash: before.hash, existed: before.existed, expectedIdentity: before.identity, parentChain };
}

/** Caller must use a server-held approved plan. No mkdir/delete or plaintext backup files.
 * Rechecks observed inode/hash/parents, but is not an OS sandbox against a malicious same-user
 * process racing the final check/rename. Use an exclusively trusted source directory. */
export async function applyLocalWrite(plan) {
  if (plan?.kind !== 'local') throw fail('WRITEBACK_PLAN', 'Invalid local writeback preview');
  validateInput(plan.relativePath, plan.afterText);
  validateInput(plan.relativePath, plan.beforeText);
  if (typeof plan.existed !== 'boolean' || (plan.existed ? plan.expectedHash !== hash(plan.beforeText) :
    plan.expectedHash !== null || plan.beforeText !== '' || plan.expectedIdentity !== null)) {
    throw fail('WRITEBACK_PLAN', 'Invalid local writeback preview');
  }
  const root = await validateFolder(plan.rootPath);
  const target = path.join(root, plan.relativePath);
  if (root !== plan.rootPath || target !== plan.target) throw fail('WRITEBACK_PLAN', 'Writeback target does not match the preview');
  compareParents(plan.parentChain, await parents(root, plan.relativePath));
  const current = await readTarget(target);
  const assertCurrent = (value) => {
    if (value.existed !== plan.existed || value.hash !== plan.expectedHash ||
      (plan.existed && !sameIdentity(value.identity, plan.expectedIdentity))) {
      throw fail('WRITEBACK_CONFLICT', 'Source changed since preview; prepare a new preview', 409);
    }
  };
  assertCurrent(current);
  const temporary = path.join(path.dirname(target), `.arkive-write-${randomBytes(16).toString('hex')}.tmp`);
  let file; let temporaryExists = false; let applied = false;
  try {
    file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    temporaryExists = true;
    await file.writeFile(plan.afterText, 'utf8');
    await file.chmod(current.mode);
    await file.sync();
    await file.close(); file = null;
    compareParents(plan.parentChain, await parents(root, plan.relativePath));
    assertCurrent(await readTarget(target));
    compareParents(plan.parentChain, await parents(root, plan.relativePath));
    if (plan.existed) await rename(temporary, target);
    else {
      // Linking the completed temporary inode is an atomic no-replace creation.
      try { await link(temporary, target); }
      catch (error) { if (error.code === 'EEXIST') throw fail('WRITEBACK_CONFLICT', 'Source appeared since preview; prepare a new preview', 409); throw error; }
      // The target already exists now, even if temporary-name cleanup fails.
      applied = true;
      await unlink(temporary);
    }
    temporaryExists = false; applied = true;
    compareParents(plan.parentChain, await parents(root, plan.relativePath));
    const after = await readTarget(target);
    if (!after.existed || after.hash !== hash(plan.afterText)) throw fail('WRITEBACK_UNCONFIRMED', 'Source write could not be verified; inspect the source before retrying', 500);
    return { target, sourcePath: target, relativePath: plan.relativePath, hash: after.hash, verified: true, created: !plan.existed };
  } catch (error) {
    if (applied) throw fail('WRITEBACK_UNCONFIRMED', 'Source write occurred but final verification failed; inspect the source before retrying', 500);
    throw error;
  } finally {
    await file?.close();
    if (temporaryExists) {
      // Only remove our exact random temporary path while its parent identity is unchanged.
      const unchanged = await parents(root, plan.relativePath).then((value) => { compareParents(plan.parentChain, value); return true; }).catch(() => false);
      if (unchanged) await unlink(temporary).catch(() => {});
    }
  }
}
