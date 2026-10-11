import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateGithubConfig, readGithubSnapshot, prepareGithubWrite, applyGithubWrite } from '../github.mjs';

const COMMIT = 'a'.repeat(40); const TREE = 'b'.repeat(40); const NEXT = 'c'.repeat(40);
const config = { repository: 'Example/Brain', ref: 'notes/main', subpath: 'notes' };
const sha = (text) => { const data = Buffer.from(text); return createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex'); };
function fixture({ entries = [{ path: 'notes/guide.md', text: '# Original' }], truncated = false, onRequest } = {}) {
  const calls = []; const blobs = new Map();
  const tree = [{ path: 'notes', mode: '040000', type: 'tree', sha: 'd'.repeat(40) }, ...entries.map(({ text = '', ...entry }) => {
    const blob = { sha: sha(text), size: Buffer.byteLength(text), encoding: 'base64', content: Buffer.from(text).toString('base64') };
    blobs.set(blob.sha, blob);
    return { mode: '100644', type: 'blob', size: blob.size, sha: blob.sha, ...entry };
  })];
  const request = async (url, options) => {
    calls.push({ url, options });
    assert.equal(new URL(url).origin, 'https://api.github.com');
    assert.equal(options.allowLoopback, false);
    const custom = await onRequest?.(url, options, { tree, blobs });
    if (custom !== undefined) return custom;
    if (url.endsWith('/commits/notes%2Fmain')) return { sha: COMMIT, commit: { tree: { sha: TREE } } };
    if (url.endsWith('/git/ref/heads/notes%2Fmain')) return { ref: 'refs/heads/notes/main', object: { type: 'commit', sha: COMMIT } };
    if (url.endsWith(`/git/commits/${COMMIT}`)) return { sha: COMMIT, tree: { sha: TREE } };
    if (url.endsWith(`/git/trees/${TREE}?recursive=1`)) return { sha: TREE, tree, truncated };
    if (url.includes('/git/blobs/')) return blobs.get(url.split('/').at(-1));
    if (options.method === 'PUT') {
      const text = Buffer.from(options.body.content, 'base64').toString('utf8');
      const blob = { sha: sha(text), size: Buffer.byteLength(text), encoding: 'base64', content: options.body.content };
      blobs.set(blob.sha, blob);
      return { content: { sha: blob.sha }, commit: { sha: NEXT } };
    }
    throw new Error(`Unexpected fixture path ${url}`);
  };
  return { request, calls, tree, blobs };
}

test('GitHub configuration normalizes repository identity and rejects unsafe routes', () => {
  assert.deepEqual(validateGithubConfig(config), { repository: 'example/brain', ref: 'notes/main', subpath: 'notes' });
  assert.deepEqual(validateGithubConfig({ repository: 'A/B', token: 'never retained', url: 'https://attacker.test' }), { repository: 'a/b', ref: 'main', subpath: '' });
  for (const repository of ['https://github.com/example/brain', '../repo', 'a/b/c', 'a/b.git', 'a/../b', 'a/b?bad', 'a@evil/b']) {
    assert.throws(() => validateGithubConfig({ repository }), { code: 'GITHUB_CONFIG' });
  }
  for (const ref of ['', '../main', 'bad..ref', 'foo@{bar', '/main', 'main/', 'refs//main', 'foo.lock', 'main?x', 'main%2Fother']) {
    assert.throws(() => validateGithubConfig({ ...config, ref }), { code: 'GITHUB_CONFIG' });
  }
  for (const subpath of ['/notes', '../notes', 'notes/.hidden', 'notes/passwords', 'notes\\escape', 'notes//bad']) {
    assert.throws(() => validateGithubConfig({ ...config, subpath }), { code: 'GITHUB_CONFIG' });
  }
});

test('snapshot pins commit/tree/blob, skips unsafe files and ignores remote download URLs', async () => {
  const mock = fixture({ entries: [
    { path: 'notes/guide.md', text: '# Original', download_url: 'https://attacker.test/file' },
    { path: 'notes/.hidden.md', text: 'private' }, { path: 'notes/passwords.txt', text: 'private' },
    { path: 'notes/link.md', mode: '120000', text: 'linked' }, { path: 'notes/submodule.md', mode: '160000', type: 'commit' },
    { path: 'notes/picture.png', text: 'binary' }, { path: 'outside.md', text: 'not selected' },
  ] });
  const result = await readGithubSnapshot(config, { token: 'request-only-token', request: mock.request });
  assert.equal(result.commitSha, COMMIT);
  assert.equal(result.skipped, 5);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].sourcePath, 'github://example/brain/notes%2Fmain/notes/guide.md');
  assert.deepEqual(result.files[0].sourceMetadata, { kind: 'github', repository: 'example/brain', ref: 'notes/main', path: 'notes/guide.md', commitSha: COMMIT, blobSha: sha('# Original') });
  assert.equal(result.files[0].text, '# Original');
  assert.ok(!JSON.stringify(result).includes('request-only-token'));
  assert.equal(mock.calls.length, 3);
  assert.ok(mock.calls.every(({ options }) => options.method === 'GET' && options.headers.Authorization === 'Bearer request-only-token'));
});

test('truncated trees and altered blob hashes fail instead of returning partial success', async () => {
  const truncated = fixture({ truncated: true });
  await assert.rejects(readGithubSnapshot(config, { request: truncated.request }), { code: 'GITHUB_TREE_TRUNCATED' });
  assert.equal(truncated.calls.length, 2);
  const changed = fixture({ onRequest: (url, options, { blobs }) => url.includes('/git/blobs/') ? {
    ...blobs.get(url.split('/').at(-1)), content: Buffer.from('# Altered!').toString('base64'),
  } : undefined });
  await assert.rejects(readGithubSnapshot(config, { request: changed.request }), { code: 'GITHUB_INTEGRITY' });
});

test('snapshot enforces text, individual file, file count, and cumulative byte bounds', async () => {
  const entries = [{ path: 'notes/too-large.md', text: 'large', size: 1024 * 1024 + 1 },
    { path: 'notes/binary.md', text: 'has\0null' },
    ...Array.from({ length: 1002 }, (_, index) => ({ path: `notes/n${index}.md`, text: 'tiny' }))];
  const result = await readGithubSnapshot(config, { request: fixture({ entries }).request });
  assert.equal(result.files.length, 1000);
  assert.equal(result.skipped, 4);
  const maxText = 'x'.repeat(1024 * 1024);
  const total = await readGithubSnapshot(config, { request: fixture({ entries: Array.from({ length: 17 }, (_, index) => ({ path: `notes/n${index}.md`, text: maxText })) }).request });
  assert.equal(total.files.length, 16);
  assert.equal(total.bytes, 16 * 1024 * 1024);
  assert.equal(total.skipped, 1);
});

test('UTF-8 BOM is retained and invalid UTF-8 is skipped', async () => {
  const mock = fixture({ entries: [{ path: 'notes/bom.md', text: '\ufefftext' }] });
  const result = await readGithubSnapshot(config, { request: mock.request });
  assert.equal(result.files[0].text, '\ufefftext');
  const bytes = Buffer.from([0xff]); const invalidSha = createHash('sha1').update('blob 1\0').update(bytes).digest('hex');
  mock.tree[1] = { path: 'notes/bad.md', type: 'blob', mode: '100644', size: 1, sha: invalidSha };
  mock.blobs.set(invalidSha, { sha: invalidSha, size: 1, encoding: 'base64', content: bytes.toString('base64') });
  assert.equal((await readGithubSnapshot(config, { request: mock.request })).skipped, 1);
});

test('request errors and configuration cannot leak token or choose another host', async () => {
  const token = 'super-private-request-token';
  await assert.rejects(readGithubSnapshot({ ...config, apiUrl: 'http://127.0.0.1' }, {
    token, request: async (url) => { assert.equal(new URL(url).origin, 'https://api.github.com'); throw new Error(`Authorization: ${token}`); },
  }), (error) => !JSON.stringify({ message: error.message, ...error }).includes(token) && error.code === 'GITHUB_REQUEST');
  await assert.rejects(readGithubSnapshot(config, { token: 'bad\r\nheader', request: async () => assert.fail('no network') }), { code: 'GITHUB_TOKEN' });
});

test('GitHub preview performs no writes, apply uses original SHA and verifies committed blob', async () => {
  const mock = fixture();
  const plan = await prepareGithubWrite(config, { path: 'notes/guide.md', text: '# Revised', token: 'read-token', request: mock.request });
  assert.equal(plan.beforeText, '# Original');
  assert.equal(plan.expectedSha, sha('# Original'));
  assert.ok(mock.calls.every(({ options }) => options.method === 'GET'));
  assert.ok(!JSON.stringify(plan).includes('read-token'));
  const result = await applyGithubWrite(plan, { token: 'write-token', request: mock.request });
  assert.equal(result.verified, true); assert.equal(result.created, false);
  assert.equal(result.commitSha, NEXT); assert.equal(result.blobSha, sha('# Revised'));
  const write = mock.calls.find(({ options }) => options.method === 'PUT');
  assert.equal(write.url, 'https://api.github.com/repos/example/brain/contents/notes/guide.md');
  assert.equal(write.options.body.sha, sha('# Original'));
  assert.equal(write.options.body.branch, 'notes/main');
  assert.equal(write.options.headers.Authorization, 'Bearer write-token');
  assert.equal(mock.calls.at(-1).url, `https://api.github.com/repos/example/brain/git/blobs/${sha('# Revised')}`);
});

test('new GitHub files omit SHA but require an existing branch and stay in selected subpath', async () => {
  const mock = fixture();
  const plan = await prepareGithubWrite(config, { path: 'notes/new.md', text: 'new', request: mock.request });
  assert.equal(plan.existed, false); assert.equal(plan.expectedSha, null); assert.equal(plan.beforeText, '');
  assert.equal((await applyGithubWrite(plan, { token: 'write-token', request: mock.request })).created, true);
  assert.equal(Object.hasOwn(mock.calls.find(({ options }) => options.method === 'PUT').options.body, 'sha'), false);
  await assert.rejects(prepareGithubWrite(config, { path: 'elsewhere.md', text: 'no', request: mock.request }), { code: 'GITHUB_PATH' });
  const tag = fixture({ onRequest: (url) => url.includes('/git/ref/heads/') ? { ref: 'refs/tags/notes/main', object: { type: 'commit', sha: COMMIT } } : undefined });
  await assert.rejects(prepareGithubWrite(config, { path: 'notes/new.md', text: 'no', request: tag.request }), { code: 'GITHUB_BRANCH' });
});

test('GitHub writeback rejects stale plans, unsafe targets, no token, and provider conflicts', async () => {
  const mock = fixture();
  const plan = await prepareGithubWrite(config, { path: 'notes/guide.md', text: 'new', request: mock.request });
  mock.tree[1].sha = sha('changed');
  await assert.rejects(applyGithubWrite(plan, { token: 'write-token', request: mock.request }), { code: 'WRITEBACK_CONFLICT' });
  assert.ok(!mock.calls.some(({ options }) => options.method === 'PUT'));
  await assert.rejects(applyGithubWrite(plan, { request: mock.request }), { code: 'GITHUB_TOKEN' });
  for (const entry of [ { path: 'notes/link.md', mode: '120000', text: 'target.md' }, { path: 'notes/module.md', mode: '160000', type: 'commit' } ]) {
    await assert.rejects(prepareGithubWrite(config, { path: entry.path, text: 'no', request: fixture({ entries: [entry] }).request }), { code: 'GITHUB_PATH' });
  }
  const conflict = fixture({ onRequest: (url, options) => { if (options.method === 'PUT') throw Object.assign(new Error('request write-token failed'), { status: 409 }); } });
  const stale = await prepareGithubWrite(config, { path: 'notes/guide.md', text: 'new', request: conflict.request });
  await assert.rejects(applyGithubWrite(stale, { token: 'write-token', request: conflict.request }), (error) => error.code === 'WRITEBACK_CONFLICT' && !error.message.includes('write-token'));
});

test('lost PUT receipts and failed post-write readback report inspect-before-retry ambiguity', async () => {
  for (const failDuring of ['PUT', 'readback']) {
    let wrote = false;
    const mock = fixture({ onRequest: (url, options) => {
      if (options.method === 'PUT') {
        wrote = true;
        if (failDuring === 'PUT') throw new Error('write-token mock connection reset after commit');
      }
      if (failDuring === 'readback' && wrote && url.includes('/git/blobs/')) throw new Error('write-token readback failed');
    } });
    const plan = await prepareGithubWrite(config, { path: 'notes/guide.md', text: 'after', request: mock.request });
    await assert.rejects(applyGithubWrite(plan, { token: 'write-token', request: mock.request }), (error) =>
      error.code === 'GITHUB_WRITE_UNCONFIRMED' && /inspect or refresh.*before retrying/i.test(error.message) && !error.message.includes('write-token'));
    assert.equal(mock.calls.filter(({ options }) => options.method === 'PUT').length, 1);
  }
});
