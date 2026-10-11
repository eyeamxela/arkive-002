import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createNodeServer } from '../server.mjs';
import { MAX_BRAIN_BYTES, MAX_TRANSFER_BYTES } from '../limits.mjs';

const OWNER = 'synthetic-scan-owner-00000000000000001';
const PEER = 'synthetic-scan-peer-000000000000000001';
const PASSWORD = 'synthetic scan test passphrase only';

async function fixture(t, count = 0) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'arkive-scan-service-')));
  const vault = path.join(root, 'vault'); await fs.mkdir(vault);
  // Synthetic files only. Keep fixture writes bounded, too.
  for (let start = 0; start < count; start += 100) await Promise.all(
    Array.from({ length: Math.min(100, count - start) }, (_, i) => fs.writeFile(path.join(vault, `note-${start + i}.md`), `# Note ${start + i}\nSynthetic local source.`)));
  const node = await createNodeServer({ directory: path.join(root, 'brain'), token: OWNER, syncToken: PEER, port: 0, provider: {} });
  const { port } = await node.start();
  t.after(async () => { await node.close(); await fs.rm(root, { recursive: true, force: true }); });
  const request = (route, { method = 'GET', body, token = OWNER, signal } = {}) => new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${port}${route}`, { method, signal: signal || AbortSignal.timeout(60_000),
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, (res) => {
      const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const ok = async (route, options, status = 200) => {
    const result = await request(route, options); assert.equal(result.status, status, JSON.stringify(result.body)); return result.body;
  };
  await ok('/v1/unlock', { method: 'POST', body: { create: true, passphrase: PASSWORD, template: 'personal' } });
  const folder = await ok('/v1/folders', { method: 'POST', body: { path: vault } }, 201);
  const base = `/v1/folders/${folder.id}`;
  const until = async (predicate, timeout = 15_000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const value = await ok(`${base}/scan`); if (predicate(value.scan)) return value.scan; await delay(15); }
    assert.fail('Expected scan progress before deadline');
  };
  return { request, ok, until, folder, vault, base };
}

test('whole-vault HTTP refresh passes 1,000 files, exposes owner progress and preserves unchanged revisions', async (t) => {
  const a = await fixture(t, 2_205); const scanId = randomUUID();
  const status = await a.ok('/v1/status');
  assert.deepEqual(status.limits, { brainBytes: MAX_BRAIN_BYTES, transferBytes: MAX_TRANSFER_BYTES });
  assert.equal((await a.ok(`${a.base}/scan`)).scan, null);
  const work = a.ok(`${a.base}/refresh`, { method: 'POST', body: { scanId } });
  const running = await a.until((scan) => scan?.scanId === scanId && scan.phase === 'scanning' && scan.imported >= 100);
  assert.ok(running.imported < 2_205); assert.ok(running.batches >= 1);
  const result = await work;
  assert.equal(result.complete, true); assert.equal(result.phase, 'completed');
  assert.equal(result.imported, 2_205); assert.equal(result.unchanged, 0); assert.equal(result.scanId, scanId);
  assert.equal(result.batches, 23);
  const before = await a.ok('/v1/brain');
  assert.equal(before.objects.length, 2_205);
  assert.equal(before.folders[0].importedCount, 2_205);
  assert.equal((await a.ok(`${a.base}/scan`)).scan.phase, 'completed');
  assert.equal((await a.request(`${a.base}/refresh`, { method: 'POST', body: { scanId } })).status, 409);
  // Legacy clients can still issue an empty POST, without a content-type.
  const unchanged = await a.ok(`${a.base}/refresh`, { method: 'POST' });
  assert.equal(unchanged.imported, 0); assert.equal(unchanged.unchanged, 2_205);
  const after = await a.ok('/v1/brain'); assert.deepEqual(after.revisions, before.revisions);
  await fs.writeFile(path.join(a.vault, 'note-2020.md'), '# Changed after first scan');
  const edited = await a.ok(`${a.base}/refresh`, { method: 'POST', body: { scanId: randomUUID() } });
  assert.equal(edited.imported, 1); assert.equal(edited.unchanged, 2_204);
  const final = await a.ok('/v1/brain'); assert.equal(final.revisions.length, before.revisions.length + 1);
  assert.equal(final.objects.find((item) => item.sourcePath.endsWith('/note-2020.md')).id,
    before.objects.find((item) => item.sourcePath.endsWith('/note-2020.md')).id);
});

test('cancel bypasses scan queue, retains committed batches, and retry completes the remaining vault', async (t) => {
  const a = await fixture(t, 2_005); const scanId = randomUUID();
  const work = a.ok(`${a.base}/refresh`, { method: 'POST', body: { scanId } });
  await a.until((scan) => scan?.scanId === scanId && scan.imported >= 100 && scan.phase === 'scanning');
  assert.equal((await a.request(`${a.base}/scan/cancel`, { method: 'POST', body: { scanId: randomUUID() } })).status, 409);
  await a.ok(`${a.base}/scan/cancel`, { method: 'POST', body: { scanId } });
  const result = await work;
  assert.equal(result.phase, 'cancelled'); assert.equal(result.complete, false);
  assert.ok(result.imported >= 100 && result.imported < 2_005);
  const partial = await a.ok('/v1/brain'); assert.equal(partial.objects.length, result.imported);
  assert.equal(partial.folders[0].lastRefreshedAt, undefined);
  assert.equal((await a.ok(`${a.base}/scan`)).scan.phase, 'cancelled');
  const retry = await a.ok(`${a.base}/refresh`, { method: 'POST', body: { scanId: randomUUID() } });
  assert.equal(retry.complete, true); assert.equal(retry.imported + retry.unchanged, 2_005);
  assert.equal(retry.unchanged, partial.objects.length);
});

test('progress and cancellation stay owner-only, reject invalid scan IDs and clear on lock', async (t) => {
  const a = await fixture(t, 1);
  const member = await a.ok('/v1/members', { method: 'POST', body: { name: 'Synthetic member' } }, 201);
  for (const token of [null, 'wrong', PEER, member.token]) {
    const expected = token === member.token ? 403 : 401;
    assert.equal((await a.request(`${a.base}/scan`, { token })).status, expected);
    assert.equal((await a.request(`${a.base}/scan/cancel`, { token, method: 'POST', body: { scanId: randomUUID() } })).status, expected);
    assert.equal((await a.request(`${a.base}/refresh`, { token, method: 'POST' })).status, expected);
  }
  assert.equal((await a.request(`${a.base}/refresh`, { method: 'POST', body: { scanId: 'not-a-uuid' } })).status, 400);
  assert.equal((await a.request(`${a.base}/refresh`, { method: 'POST', body: { scanId: randomUUID(), bypass: true } })).status, 400);
  await a.ok(`${a.base}/refresh`, { method: 'POST' });
  await a.ok('/v1/lock', { method: 'POST' });
  assert.equal((await a.request(`${a.base}/scan`)).status, 423);
  await a.ok('/v1/unlock', { method: 'POST', body: { passphrase: PASSWORD } });
  assert.equal((await a.ok(`${a.base}/scan`)).scan, null);
});

test('disconnect stops traversal and a failed refresh leaves a truthful failed status', async (t) => {
  const a = await fixture(t, 2_005); const scanId = randomUUID(); const controller = new AbortController();
  const work = a.request(`${a.base}/refresh`, { method: 'POST', body: { scanId }, signal: controller.signal });
  // Attach rejection handler immediately so client disconnect is expected.
  const disconnected = assert.rejects(work, { name: 'AbortError' });
  await a.until((scan) => scan?.scanId === scanId && scan.imported >= 100 && scan.phase === 'scanning');
  controller.abort(); await disconnected;
  const stopped = await a.until((scan) => scan?.scanId === scanId && scan.phase === 'cancelled');
  assert.ok(stopped.imported < 2_005);
  await fs.rename(a.vault, `${a.vault}-moved`);
  const failedId = randomUUID();
  const failed = await a.request(`${a.base}/refresh`, { method: 'POST', body: { scanId: failedId } });
  assert.equal(failed.status, 400);
  const progress = (await a.ok(`${a.base}/scan`)).scan;
  assert.equal(progress.scanId, failedId); assert.equal(progress.phase, 'failed'); assert.ok(progress.error);
  assert.equal((await a.ok('/v1/brain')).objects.length, stopped.imported);
});
