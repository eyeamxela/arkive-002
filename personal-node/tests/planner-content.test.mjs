import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { emptyWorkspace, validateWorkspace, upsertWorkspace } from '../workspace.mjs';
import { saveTaskTemplate, populatePlannerDay } from '../planner.mjs';
import { newSection } from '../planner-content.mjs';
import { createNodeServer } from '../server.mjs';

const draft = () => ({ name: 'Personal', repeat: 'daily', enabled: true, startsOn: '2026-10-13', items: [], color: '#f4bc59', sections: [newSection('Morning Flow'), newSection('XELAB'), newSection('Daily Journal', 'journal')] });
const state = () => ({ objects: [], workspace: emptyWorkspace() });
const day = (s, date = '2026-10-13') => s.workspace.plannerDays.find(d => d.date === date);
const block = (kind = 'note', extra = {}) => ({ id: `block_${randomUUID()}`, kind, text: 'Synthetic note', x: 20, y: 40, ...extra });

test('day-first journal saves without a template, is dated and revision-safe, and preserves template journals', () => {
  const s = state();
  populatePlannerDay(s, { date: '2026-10-13', expectedUpdatedAt: null, journal: 'My day', color: '#f4bc59' });
  assert.equal(day(s).journal, 'My day');
  const before = structuredClone(s);
  assert.throws(() => populatePlannerDay(s, { date: '2026-10-13', expectedUpdatedAt: null, journal: 'Stale' }), { code: 'WORKSPACE_STALE' });
  assert.deepEqual(s, before);
  const template = saveTaskTemplate(s, draft()).template;
  populatePlannerDay(s, { date: '2026-10-13' });
  populatePlannerDay(s, { date: '2026-10-13', expectedUpdatedAt: day(s).updatedAt, entryId: template.id, journal: 'Earlier template journal' });
  assert.equal(day(s).journal, 'My day');
  populatePlannerDay(s, { date: '2026-10-14', expectedUpdatedAt: null, journal: 'Tomorrow' });
  assert.equal(day(s).entries[0].journal, 'Earlier template journal');
  assert.equal(day(s, '2026-10-14').journal, 'Tomorrow');
  assert.throws(() => populatePlannerDay(s, { date: '2026-10-13', expectedUpdatedAt: day(s).updatedAt, color: 'red' }), { code: 'WORKSPACE_INVALID' });
  validateWorkspace(s.workspace, new Set());
});

test('empty section templates instantiate once without placeholder tasks and preserve dated journal snapshots', () => {
  const s = state(), t = saveTaskTemplate(s, draft()).template;
  const first = populatePlannerDay(s, { date: '2026-10-13' });
  assert.equal(first.added, 0); assert.equal(first.changed, true); assert.equal(s.workspace.tasks.length, 0);
  assert.equal(populatePlannerDay(s, { date: '2026-10-13' }).changed, false);
  const originalSections = structuredClone(day(s).entries[0].sections);
  const current = day(s);
  populatePlannerDay(s, { date: current.date, expectedUpdatedAt: current.updatedAt, entryId: t.id, journal: 'Private daily thoughts', color: '#080d09' });
  saveTaskTemplate(s, { ...draft(), id: t.id, expectedUpdatedAt: t.updatedAt, name: 'Changed name' });
  populatePlannerDay(s, { date: '2026-10-14' });
  assert.equal(day(s).entries[0].name, 'Personal'); assert.equal(day(s).entries[0].journal, 'Private daily thoughts');
  assert.deepEqual(day(s).entries[0].sections, originalSections);
  assert.equal(day(s, '2026-10-14').entries[0].name, 'Changed name'); assert.equal(day(s, '2026-10-14').entries[0].journal, '');
  validateWorkspace(s.workspace, new Set());
});

test('daily edits reject stale revisions atomically and linked tasks retain provenance on rescheduling', () => {
  const s = state(), t = saveTaskTemplate(s, draft()).template; populatePlannerDay(s, { date: '2026-10-13' });
  const revision = day(s).updatedAt;
  populatePlannerDay(s, { date: '2026-10-13', expectedUpdatedAt: revision, entryId: t.id, journal: 'First editor' });
  const before = structuredClone(s);
  assert.throws(() => populatePlannerDay(s, { date: '2026-10-13', expectedUpdatedAt: revision, entryId: t.id, journal: 'Second editor' }), { code: 'WORKSPACE_STALE' });
  assert.deepEqual(s, before);
  const task = upsertWorkspace(s, 'tasks', { title: 'Write brief', dueDate: '2026-10-13', section: 'XELAB', plannerSectionId: t.sections[1].id }).record;
  upsertWorkspace(s, 'tasks', { id: task.id, dueDate: '2026-10-14', status: 'done' });
  assert.equal(s.workspace.tasks[0].plannerSectionId, t.sections[1].id); assert.ok(s.workspace.tasks[0].completedAt);
});

test('board blocks are bounded, typed, safe to link, and reject broken or cyclic column references', () => {
  const s = state(), t = saveTaskTemplate(s, draft()).template; populatePlannerDay(s, { date: '2026-10-13' });
  const task = upsertWorkspace(s, 'tasks', { title: 'Real task', dueDate: '2026-10-13', plannerSectionId: t.sections[0].id }).record;
  const column = block('column'); const note = block('note', { parentId: column.id });
  const valid = [column, note, block('comment'), block('link', { url: 'https://example.com/reference' }), block('task', { taskId: task.id }), block('drawing', { points: [[1, 2], [20, 40]] })];
  populatePlannerDay(s, { date: '2026-10-13', expectedUpdatedAt: day(s).updatedAt, blocks: valid });
  const before = structuredClone(s);
  for (const invalid of [[block('link', { url: 'javascript:alert(1)' })], [block('task', { taskId: 'missing' })], [block('note', { parentId: 'missing' })], [{ ...column, parentId: column.id }], [block('drawing', { points: [[Infinity, 1]] })], [block('note', { x: 100001 })], Array.from({ length: 201 }, () => block())]) {
    assert.throws(() => populatePlannerDay(s, { date: '2026-10-13', expectedUpdatedAt: day(s).updatedAt, blocks: invalid }), { code: 'WORKSPACE_INVALID' });
    assert.deepEqual(s, before);
  }
});

test('section identifiers and snapshot arrays reject malformed or cross-template input', () => {
  const s = state(), t = saveTaskTemplate(s, draft()).template;
  for (const sections of [null, {}, [], [t.sections[0], t.sections[0]], [newSection('Journal', 'journal'), newSection('Other journal', 'journal')]]) assert.throws(() => saveTaskTemplate(s, { ...draft(), sections }), { code: 'WORKSPACE_INVALID' });
  assert.throws(() => saveTaskTemplate(s, { ...draft(), sections: t.sections }), { code: 'WORKSPACE_INVALID' });
  assert.equal(s.workspace.taskTemplates.length, 1);
});

test('empty daily entries, journals and boards persist through encryption, lock/unlock and member redaction', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'arkive-content-')), token = 'synthetic-planner-content-owner-token'.repeat(2), phrase = 'Synthetic planner content passphrase';
  const server = await createNodeServer({ directory: root, host: '127.0.0.1', port: 0, token, provider: {}, allowedOrigins: ['http://127.0.0.1:4319'] });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const { port } = await server.start();
  const call = async (route, body, credential = token) => { const r = await fetch(`http://127.0.0.1:${port}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4319' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, body: await r.json() }; };
  const ok = async (route, body) => { const r = await call(route, body); assert.ok(r.status < 300, JSON.stringify(r)); return r.body; };
  await ok('/v1/unlock', { passphrase: phrase, create: true, name: 'Test only' });
  const template = await ok('/v1/workspace/templates', draft());
  const results = await Promise.all([ok('/v1/workspace/planner/day', { date: '2026-10-13' }), ok('/v1/workspace/planner/day', { date: '2026-10-13' })]);
  assert.equal(results.filter(r => r.changed).length, 1);
  let brain = await ok('/v1/brain'); const current = brain.workspace.plannerDays[0];
  await ok('/v1/workspace/planner/day', { date: current.date, expectedUpdatedAt: current.updatedAt, entryId: template.id, journal: 'Persisted journal', blocks: [block('note')] });
  brain = await ok('/v1/brain'); const saved = structuredClone(brain.workspace);
  await ok('/v1/lock', {}); await ok('/v1/unlock', { passphrase: phrase });
  assert.deepEqual((await ok('/v1/brain')).workspace, saved);
  const member = await ok('/v1/members', { name: 'Synthetic member' });
  const memberToken = member.token ?? member.credential;
  assert.ok(memberToken);
  assert.equal((await call('/v1/workspace/planner/day', { date: '2026-10-13', expectedUpdatedAt: null, blocks: [] }, memberToken)).status, 403);
  assert.equal((await call('/v1/brain', undefined, memberToken)).body.workspace.plannerDays, undefined);
});
