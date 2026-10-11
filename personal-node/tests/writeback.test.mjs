import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { prepareLocalWrite, applyLocalWrite } from '../writeback.mjs';

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'arkive-writeback-')));
  await fs.mkdir(path.join(root, 'notes'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, target: path.join(root, 'notes', 'guide.md'),
    prepare: (text, relativePath = 'notes/guide.md') => prepareLocalWrite({ rootPath: root, relativePath, text }) };
}

test('local preview is read-only; atomic apply preserves mode and leaves no backup clutter', async (t) => {
  const { root, target, prepare } = await fixture(t);
  await fs.writeFile(target, '\ufeffOriginal\n', { mode: 0o640 });
  const plan = await prepare('Revised\n');
  assert.equal(plan.beforeText, '\ufeffOriginal\n');
  assert.equal(await fs.readFile(target, 'utf8'), '\ufeffOriginal\n');
  assert.deepEqual(await fs.readdir(path.join(root, 'notes')), ['guide.md']);
  assert.equal(plan.existed, true);
  const result = await applyLocalWrite(plan);
  assert.equal(result.verified, true); assert.equal(result.created, false);
  assert.equal(await fs.readFile(target, 'utf8'), 'Revised\n');
  assert.equal((await fs.stat(target)).mode & 0o777, 0o640);
  assert.deepEqual(await fs.readdir(path.join(root, 'notes')), ['guide.md']);
});

test('new files require existing parents and are atomically created without overwriting', async (t) => {
  const { root, target, prepare } = await fixture(t);
  const plan = await prepare('New');
  assert.equal(plan.existed, false); assert.equal(plan.expectedHash, null);
  await assert.rejects(fs.access(target), { code: 'ENOENT' });
  assert.equal((await applyLocalWrite(plan)).created, true);
  assert.equal(await fs.readFile(target, 'utf8'), 'New');
  assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
  await assert.rejects(applyLocalWrite(plan), { code: 'WRITEBACK_CONFLICT' });
  await assert.rejects(prepare('No implicit directory', 'absent/new.md'), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(root), ['notes']);
});

test('changed bytes, removed/replaced inode, and newly appeared targets reject stale previews', async (t) => {
  const { target, prepare } = await fixture(t);
  await fs.writeFile(target, 'before');
  const first = await prepare('after');
  await fs.writeFile(target, 'someone else');
  await assert.rejects(applyLocalWrite(first), { code: 'WRITEBACK_CONFLICT' });
  assert.equal(await fs.readFile(target, 'utf8'), 'someone else');
  const second = await prepare('after');
  await fs.rename(target, `${target}.old`);
  await fs.writeFile(target, 'someone else');
  await assert.rejects(applyLocalWrite(second), { code: 'WRITEBACK_CONFLICT' });
  const third = await prepare('after');
  await fs.unlink(target);
  await assert.rejects(applyLocalWrite(third), { code: 'WRITEBACK_CONFLICT' });
  const fourth = await prepare('after');
  await fs.writeFile(target, 'new other source');
  await assert.rejects(applyLocalWrite(fourth), { code: 'WRITEBACK_CONFLICT' });
});

test('traversal, hidden and sensitive targets, binary text, and oversized writes are forbidden', async (t) => {
  const { prepare } = await fixture(t);
  for (const relativePath of ['../escape.md', '/outside.md', 'notes/../guide.md', '.hidden.md', 'notes/.obsidian/config.md',
    'notes/secrets.md', 'notes/passwords.txt', 'notes/private-key.md', 'notes\\escape.md', 'notes//x.md', 'notes/file.js']) {
    await assert.rejects(prepare('text', relativePath), { code: 'WRITEBACK_PATH' });
  }
  await assert.rejects(prepare('x'.repeat(1024 * 1024 + 1)), { code: 'WRITEBACK_TEXT' });
  await assert.rejects(prepare('bad\0text'), { code: 'WRITEBACK_TEXT' });
  await assert.rejects(prepare('\ud800'), { code: 'WRITEBACK_TEXT' });
});

test('symlinks, hardlinks, and replaced parent directories are rejected', async (t) => {
  const { root, target, prepare } = await fixture(t);
  const outside = path.join(root, 'outside.md');
  await fs.writeFile(outside, 'original');
  await fs.symlink(outside, target);
  await assert.rejects(prepare('no'), { code: 'WRITEBACK_PATH' });
  await fs.unlink(target);
  await fs.link(outside, target);
  await assert.rejects(prepare('no'), { code: 'WRITEBACK_PATH' });
  await fs.unlink(target);
  await fs.writeFile(target, 'before');
  const plan = await prepare('after');
  await fs.rename(path.join(root, 'notes'), path.join(root, 'old-notes'));
  await fs.mkdir(path.join(root, 'notes'));
  await fs.writeFile(target, 'before');
  await assert.rejects(applyLocalWrite(plan), { code: 'WRITEBACK_CONFLICT' });
  await fs.rename(path.join(root, 'notes'), path.join(root, 'replacement-notes'));
  await fs.symlink(path.join(root, 'old-notes'), path.join(root, 'notes'));
  await assert.rejects(prepare('no'), { code: 'WRITEBACK_PATH' });
  assert.equal(await fs.readFile(outside, 'utf8'), 'original');
});

test('apply revalidates target symlink/hardlink and rejects tampered plan destinations', async (t) => {
  const { root, target, prepare } = await fixture(t);
  await fs.writeFile(target, 'before');
  const plan = await prepare('after');
  await assert.rejects(applyLocalWrite({ ...plan, target: path.join(root, 'elsewhere.md') }), { code: 'WRITEBACK_PLAN' });
  await assert.rejects(applyLocalWrite({ ...plan, beforeText: 'fabricated' }), { code: 'WRITEBACK_PLAN' });
  await fs.rename(target, `${target}.original`);
  await fs.symlink(`${target}.original`, target);
  await assert.rejects(applyLocalWrite(plan), { code: 'WRITEBACK_PATH' });
  await fs.unlink(target);
  await fs.link(`${target}.original`, target);
  await assert.rejects(applyLocalWrite(plan), { code: 'WRITEBACK_PATH' });
  assert.equal(await fs.readFile(`${target}.original`, 'utf8'), 'before');
});
