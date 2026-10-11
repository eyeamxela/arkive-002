import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createNodeServer, decryptExport } from '../server.mjs';

const PASSWORD = 'synthetic source test passphrase';
const OWNER = 'synthetic-source-owner-00000000000000000001';
const PEER = 'synthetic-source-peer-000000000000000000001';
const TOKEN = 'synthetic-github-request-only-token';
const COMMIT = 'a'.repeat(40); const TREE = 'b'.repeat(40); const NEXT = 'c'.repeat(40);
const blobSha = (text) => { const bytes = Buffer.from(text); return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'); };
const post = (body) => ({ method: 'POST', body });

function githubFixture() {
  let text = '# Source v1'; let uncertain = false;
  const calls = []; const blobs = new Map();
  const blob = (value) => ({ sha: blobSha(value), size: Buffer.byteLength(value), encoding: 'base64', content: Buffer.from(value).toString('base64') });
  const request = async (url, options) => {
    calls.push({ url, options });
    assert.equal(new URL(url).origin, 'https://api.github.com');
    const current = blob(text); blobs.set(current.sha, current);
    if (url.endsWith('/commits/main')) return { sha: COMMIT, commit: { tree: { sha: TREE } } };
    if (url.endsWith('/git/ref/heads/main')) return { ref: 'refs/heads/main', object: { type: 'commit', sha: COMMIT } };
    if (url.endsWith(`/git/commits/${COMMIT}`)) return { sha: COMMIT, tree: { sha: TREE } };
    if (url.endsWith(`/git/trees/${TREE}?recursive=1`)) return { sha: TREE, truncated: false, tree: [
      { path: 'notes', type: 'tree', mode: '040000', sha: 'd'.repeat(40) },
      { path: 'notes/guide.md', type: 'blob', mode: '100644', sha: current.sha, size: current.size },
      { path: 'outside.md', type: 'blob', mode: '100644', sha: current.sha, size: current.size },
    ] };
    if (url.includes('/git/blobs/')) return blobs.get(url.split('/').at(-1));
    if (options.method === 'PUT') {
      if (options.body.sha && options.body.sha !== current.sha) throw Object.assign(new Error('conflict'), { status: 409 });
      text = Buffer.from(options.body.content, 'base64').toString('utf8');
      const saved = blob(text); blobs.set(saved.sha, saved);
      if (uncertain) throw new Error(`transport lost response ${TOKEN}`);
      return { content: { sha: saved.sha }, commit: { sha: NEXT } };
    }
    throw new Error('Unexpected mock GitHub URL');
  };
  return { request, calls, get text() { return text; }, set text(value) { text = value; }, set uncertain(value) { uncertain = value; } };
}

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'arkive-sources-')));
  const stops = [];
  t.after(async () => { for (const stop of stops.reverse()) await stop(); await fs.rm(root, { recursive: true, force: true }); });
  const node = async (name, options = {}) => {
    const instance = await createNodeServer({ directory: path.join(root, name), host: '127.0.0.1', port: 0,
      token: OWNER, syncToken: PEER, provider: {}, ...options });
    const address = await instance.start(); stops.push(() => instance.close());
    const request = (route, { method = 'GET', body, token = OWNER } = {}) => new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${address.port}${route}`, { method, signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, (res) => {
        const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('error', reject);
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch (error) { reject(error); } });
      });
      req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
    });
    const ok = async (route, options, expected = 200) => {
      const result = await request(route, options); assert.equal(result.status, expected, `${route}: ${JSON.stringify(result.body)}`); return result.body;
    };
    return { request, ok, directory: instance.directory,
      create: () => ok('/v1/unlock', post({ passphrase: PASSWORD, create: true, name: 'Synthetic source Brain', template: 'personal' })) };
  };
  const local = async (name) => {
    const instance = await node(name); await instance.create();
    const vault = path.join(root, `${name}-vault`); await fs.mkdir(vault);
    const target = path.join(vault, 'guide.md'); await fs.writeFile(target, 'Original vault text');
    const folder = await instance.ok('/v1/folders', post({ path: vault }), 201);
    return { ...instance, vault, target, folder,
      preview: (text) => instance.ok('/v1/writebacks/preview', post({ kind: 'local', folderId: folder.id, path: 'guide.md', text })) };
  };
  const github = async (name) => {
    const mock = githubFixture(); const instance = await node(name, { githubRequest: mock.request }); await instance.create();
    const connection = await instance.ok('/v1/connections', post({ repository: 'Example/Brain', ref: 'main', subpath: 'notes', token: TOKEN }));
    return { ...instance, mock, connection,
      refresh: () => instance.ok(`/v1/connections/${connection.id}/refresh`, post({ token: TOKEN })),
      preview: (text) => instance.ok('/v1/writebacks/preview', post({ kind: 'github', connectionId: connection.id, path: 'notes/guide.md', text, token: TOKEN })) };
  };
  return { root, node, local, github };
}

test('local writeback requires exact approval, preserves original history, and is single-use', async (t) => {
  const { local } = await fixture(t); const a = await local('local-approval');
  const preview = await a.preview('Approved new text');
  assert.equal(await fs.readFile(a.target, 'utf8'), 'Original vault text');
  assert.equal(preview.beforeText, 'Original vault text');
  assert.equal(preview.afterText, 'Approved new text');
  assert.equal(Object.hasOwn(preview, 'plan'), false);
  for (const confirm of [undefined, false, 'true']) {
    const denied = await a.request(`/v1/writebacks/${preview.id}/apply`, post({ confirm }));
    assert.equal(denied.status, 403); assert.equal(denied.body.error.code, 'APPROVAL_REQUIRED');
  }
  const applied = await a.ok(`/v1/writebacks/${preview.id}/apply`, post({ confirm: true, text: 'ignored injected replacement', path: '../escape.md' }));
  assert.equal(applied.verified, true);
  assert.equal(await fs.readFile(a.target, 'utf8'), 'Approved new text');
  const state = await a.ok('/v1/brain');
  assert.equal(state.objects[0].text, 'Approved new text');
  assert.deepEqual(state.revisions.map((item) => item.text), ['Original vault text', 'Approved new text']);
  assert.ok(state.audit.some((item) => item.type === 'source.write-verified'));
  assert.equal((await a.request(`/v1/writebacks/${preview.id}/apply`, post({ confirm: true }))).body.error.code, 'PREVIEW_EXPIRED');
  assert.deepEqual(await fs.readdir(a.vault), ['guide.md']);
});

test('cancel and lock clear approvals; unregistered paths and peer credentials cannot write', async (t) => {
  const { local } = await fixture(t); const a = await local('local-lock');
  const cancelled = await a.preview('cancelled');
  await a.ok(`/v1/writebacks/${cancelled.id}/cancel`, post({}));
  assert.equal((await a.request(`/v1/writebacks/${cancelled.id}/apply`, post({ confirm: true }))).body.error.code, 'PREVIEW_EXPIRED');
  const locked = await a.preview('locked');
  await a.ok('/v1/lock', post({}));
  assert.equal((await a.request(`/v1/writebacks/${locked.id}/apply`, post({ confirm: true }))).status, 423);
  await a.ok('/v1/unlock', post({ passphrase: PASSWORD }));
  assert.equal((await a.request(`/v1/writebacks/${locked.id}/apply`, post({ confirm: true }))).body.error.code, 'PREVIEW_EXPIRED');
  const missing = await a.request('/v1/writebacks/preview', post({ kind: 'local', folderId: 'unregistered', path: 'guide.md', text: 'no' }));
  assert.equal(missing.status, 404);
  for (const route of ['/v1/connections', '/v1/writebacks/preview', `/v1/writebacks/${locked.id}/apply`, '/v1/code-graphs', '/v1/gitnexus/import']) {
    assert.equal((await a.request(route, { ...post({ confirm: true }), token: PEER })).status, 401);
  }
  assert.equal(await fs.readFile(a.target, 'utf8'), 'Original vault text');
});

test('GitHub refresh is read-only, scoped, idempotent, and never persists request credentials', async (t) => {
  const { github } = await fixture(t); const a = await github('github-refresh');
  assert.deepEqual(await a.refresh(), { imported: 1, skipped: 0, commitSha: COMMIT });
  await a.refresh();
  const state = await a.ok('/v1/brain');
  assert.equal(state.objects.length, 1); assert.equal(state.revisions.length, 1);
  assert.equal(state.objects[0].sourcePath, 'github://example/brain/main/notes/guide.md');
  assert.deepEqual(state.objects[0].sourceMetadata, { kind: 'github', repository: 'example/brain', ref: 'main', path: 'notes/guide.md', commitSha: COMMIT, blobSha: blobSha('# Source v1') });
  assert.ok(a.mock.calls.every(({ options }) => options.method === 'GET'));
  const bundle = await decryptExport(await a.ok('/v1/export'), PASSWORD);
  for (const secret of [TOKEN, OWNER, PASSWORD]) assert.ok(!JSON.stringify(bundle).includes(secret));
  assert.ok(!(await fs.readFile(path.join(a.directory, 'brain.enc'), 'utf8')).includes('# Source v1'));
  const outside = await a.request('/v1/writebacks/preview', post({ kind: 'github', connectionId: a.connection.id, path: 'outside.md', text: 'no', token: TOKEN }));
  assert.equal(outside.body.error.code, 'GITHUB_PATH');
  const credentialKeys = Object.keys(state.connections[0]);
  assert.ok(!credentialKeys.some((key) => /token|password|credential/i.test(key)));
});

test('generic note edits cannot change source bytes while retaining a false GitHub commit identity', async (t) => {
  const { github } = await fixture(t); const a = await github('source-provenance');
  await a.refresh();
  const before = await a.ok('/v1/brain');
  const edit = await a.request('/v1/objects', post({ objectId: before.objects[0].id, title: 'Edited cache', text: 'Not the committed bytes', kind: 'note' }));
  assert.equal(edit.status, 409); assert.equal(edit.body.error.code, 'SOURCE_WRITE_REQUIRED');
  assert.deepEqual((await a.ok('/v1/brain')).objects, before.objects);
  const note = await a.ok('/v1/objects', post({ title: 'Separate interpretation', text: 'Owner-authored note', kind: 'note', sourceIds: [before.objects[0].id] }), 201);
  assert.equal(note.sourceMetadata, undefined);
});

test('encrypted restore and peer replicas retain source provenance but reset connection and folder grants', async (t) => {
  const { root, github, node } = await fixture(t); const a = await github('export-sources');
  await a.refresh();
  const vault = path.join(root, 'export-vault'); await fs.mkdir(vault);
  await a.ok('/v1/folders', post({ path: vault }), 201);
  const before = await a.ok('/v1/brain');
  const encrypted = await a.ok('/v1/export'); const decrypted = await decryptExport(encrypted, PASSWORD);
  assert.equal(decrypted.state.connections.length, 1); assert.equal(decrypted.state.folders.length, 1);
  const b = await node('restore-sources');
  await b.ok('/v1/restore', post({ bundle: encrypted, passphrase: PASSWORD }));
  const restored = await b.ok('/v1/brain');
  assert.deepEqual(restored.objects, before.objects); assert.deepEqual(restored.revisions, before.revisions);
  assert.deepEqual(restored.connections, []); assert.deepEqual(restored.folders, []);
  const replica = await a.ok('/v1/replica', { token: PEER });
  assert.deepEqual(replica.state.objects, before.objects);
  assert.deepEqual(replica.state.connections, []); assert.deepEqual(replica.state.folders, []);
  const denied = await b.request(`/v1/connections/${a.connection.id}/refresh`, post({ token: TOKEN }));
  assert.equal(denied.body.error.code, 'SOURCE_NOT_FOUND');
});

test('stale local approval leaves source and newer cached Brain head unchanged', async (t) => {
  const { local } = await fixture(t); const a = await local('stale-local');
  const preview = await a.preview('stale approved replacement');
  await fs.writeFile(a.target, 'Newer source text');
  await a.ok(`/v1/folders/${a.folder.id}/refresh`, post({}));
  const before = (await a.ok('/v1/brain')).objects[0];
  const failed = await a.request(`/v1/writebacks/${preview.id}/apply`, post({ confirm: true }));
  assert.equal(failed.status, 409); assert.equal(failed.body.error.code, 'WRITEBACK_CONFLICT');
  assert.equal(await fs.readFile(a.target, 'utf8'), 'Newer source text');
  const after = await a.ok('/v1/brain');
  assert.equal(after.objects[0].text, 'Newer source text');
  assert.equal(after.objects[0].revisionId, before.revisionId);
  assert.ok(after.revisions.some((item) => item.text === 'Original vault text'));
  assert.equal((await a.request(`/v1/writebacks/${preview.id}/apply`, post({ confirm: true }))).body.error.code, 'PREVIEW_EXPIRED');
});

test('GitHub stale approval preserves latest cache and successful approval uses fresh write token', async (t) => {
  const { github } = await fixture(t); const a = await github('github-approve');
  await a.refresh();
  const stale = await a.preview('stale update');
  a.mock.text = '# Source v2'; await a.refresh();
  const staleResult = await a.request(`/v1/writebacks/${stale.id}/apply`, post({ confirm: true, token: TOKEN }));
  assert.equal(staleResult.body.error.code, 'WRITEBACK_CONFLICT');
  assert.equal((await a.ok('/v1/brain')).objects[0].text, '# Source v2');
  assert.ok(a.mock.calls.every(({ options }) => options.method === 'GET'));
  const fresh = await a.preview('# Approved v3');
  const receipt = await a.ok(`/v1/writebacks/${fresh.id}/apply`, post({ confirm: true, token: 'synthetic-fresh-write-token' }));
  assert.equal(receipt.verified, true); assert.equal(a.mock.text, '# Approved v3');
  const state = await a.ok('/v1/brain');
  assert.equal(state.objects[0].text, '# Approved v3');
  assert.equal(state.objects[0].sourceMetadata.commitSha, NEXT);
  const put = a.mock.calls.find(({ options }) => options.method === 'PUT');
  assert.equal(put.options.headers.Authorization, 'Bearer synthetic-fresh-write-token');
  assert.equal(put.options.body.sha, blobSha('# Source v2'));
  assert.ok(!JSON.stringify(state).includes('synthetic-fresh-write-token'));
});

test('ambiguous GitHub write warns inspect-before-retry, consumes approval, and retains original history', async (t) => {
  const { github } = await fixture(t); const a = await github('github-uncertain');
  await a.refresh();
  const preview = await a.preview('# Written despite lost receipt'); a.mock.uncertain = true;
  const result = await a.request(`/v1/writebacks/${preview.id}/apply`, post({ confirm: true, token: TOKEN }));
  assert.equal(result.status, 502); assert.equal(result.body.error.code, 'GITHUB_WRITE_UNCONFIRMED');
  assert.match(result.body.error.message, /inspect or refresh.*before retrying/i);
  assert.ok(!JSON.stringify(result).includes(TOKEN));
  assert.equal(a.mock.text, '# Written despite lost receipt');
  assert.equal((await a.request(`/v1/writebacks/${preview.id}/apply`, post({ confirm: true, token: TOKEN }))).body.error.code, 'PREVIEW_EXPIRED');
  assert.equal(a.mock.calls.filter(({ options }) => options.method === 'PUT').length, 1);
  const state = await a.ok('/v1/brain');
  assert.ok(state.revisions.some((item) => item.text === '# Source v1'));
  assert.ok(state.audit.some((item) => item.type === 'source.write-failed-or-unconfirmed'));
});
