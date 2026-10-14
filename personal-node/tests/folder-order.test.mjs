import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { emptyWorkspace, validateWorkspace } from '../workspace.mjs';
import { saveFolderOrder, validateFolderOrder } from '../folder-order.mjs';
import { createNodeServer } from '../server.mjs';
import { orderedFolders, moveFolderOrder } from '../../app/src/personal/folderOrder.mjs';

test('folder moves shift contiguous positions, preserve absent sections and do not mutate inputs', () => {
  const visible = ['FRTL', 'XELAB', 'LIFE'], saved = ['FRTL', 'Absent', 'XELAB', 'LIFE'];
  const next = moveFolderOrder(visible, saved, 'LIFE', 1);
  assert.deepEqual(next, ['LIFE', 'FRTL', 'XELAB', 'Absent']);
  assert.deepEqual(orderedFolders(visible, next, x => x), ['LIFE', 'FRTL', 'XELAB']);
  assert.deepEqual(orderedFolders(['New', ...visible], next, x => x), ['LIFE', 'FRTL', 'XELAB', 'New']);
  assert.deepEqual(visible, ['FRTL', 'XELAB', 'LIFE']);
  for (const position of [0, 4, 1.5, NaN]) assert.throws(() => moveFolderOrder(visible, saved, 'LIFE', position));
});

test('folder order is optional, bounded, independently scoped and revision checked', () => {
  const state = { workspace: emptyWorkspace() };
  validateWorkspace(state.workspace, new Set());
  saveFolderOrder(state, { scope: 'sections', order: ['FRTL', 'LIFE'], expectedOrder: [] });
  saveFolderOrder(state, { scope: 'statuses', order: ['done', 'todo', 'doing', 'review'], expectedOrder: [] });
  const before = structuredClone(state);
  assert.throws(() => saveFolderOrder(state, { scope: 'sections', order: ['LIFE'], expectedOrder: [] }), { code: 'WORKSPACE_STALE' });
  assert.deepEqual(state, before);
  for (const value of [{ sections: ['a', 'a'] }, { statuses: ['arbitrary'] }, { sections: [' '] }, { unknown: [] }, { sections: Array.from({length: 501}, (_, i) => String(i)) }]) assert.throws(() => validateFolderOrder(value));
  validateWorkspace(state.workspace, new Set());
});

test('owner folder order persists after encrypted reload and rejects member/stale writes', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'arkive-folder-order-')), token = 'synthetic-folder-order-owner-token'.repeat(2), phrase = 'Synthetic folder ordering passphrase';
  const server = await createNodeServer({ directory: root, host: '127.0.0.1', port: 0, token, provider: {}, allowedOrigins: ['http://127.0.0.1:4319'] });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const { port } = await server.start();
  const call = async (route, body, credential = token) => { const r = await fetch(`http://127.0.0.1:${port}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4319' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, body: await r.json() }; };
  await call('/v1/unlock', { passphrase: phrase, create: true, name: 'Ordering fixture' });
  const input = { scope: 'sections', expectedOrder: [], order: ['FRTL', 'XELAB'] };
  assert.equal((await call('/v1/workspace/folder-order', input)).status, 200);
  assert.equal((await call('/v1/workspace/folder-order', input)).status, 409);
  await call('/v1/lock', {}); await call('/v1/unlock', { passphrase: phrase });
  assert.deepEqual((await call('/v1/brain')).body.workspace.folderOrder.sections, input.order);
  assert.deepEqual((await call('/v1/brain')).body.workspace.tasks, []);
  const member = (await call('/v1/members', { name: 'Ordering member' })).body;
  assert.equal((await call('/v1/workspace/folder-order', input, member.token ?? member.credential)).status, 403);
  assert.equal((await call('/v1/brain', undefined, member.token ?? member.credential)).body.workspace.folderOrder, undefined);
});
