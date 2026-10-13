import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createNodeServer } from '../server.mjs';
import { emptyWorkspace, validateWorkspace, upsertWorkspace } from '../workspace.mjs';
import { saveTaskTemplate, populatePlannerDay, MAX_TASKS } from '../planner.mjs';
import { validPlannerDate, shiftPlannerDate, templateDue, plannerMonth } from '../planner-dates.mjs';

const password = 'Synthetic planner test passphrase';
const token = 'synthetic-planner-owner-token-only-'.repeat(2);
const input = { name: 'Daily routine', repeat: 'daily', startsOn: '2026-10-12', enabled: true, items: [{ title: 'Journal', section: 'Personal' }, { title: 'Review design', section: 'Arkive' }] };
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'arkive-planner-'));
  const servers = [];
  t.after(async () => { for (const server of servers) await server.close(); await rm(root, { recursive: true, force: true }); });
  return async name => {
    const server = await createNodeServer({ directory: path.join(root, name), host: '127.0.0.1', port: 0, token, provider: {}, allowedOrigins: ['http://127.0.0.1:4319'] });
    servers.push(server); const { port } = await server.start();
    const call = async (route, body, credential = token) => {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4319' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    };
    const ok = async (route, body) => { const result = await call(route, body); assert.ok(result.status >= 200 && result.status < 300, JSON.stringify(result)); return result.body; };
    return { call, ok, create: () => ok('/v1/unlock', { passphrase: password, create: true, name: 'Planner fixture' }) };
  };
}

test('civil dates survive leap years, DST boundaries, month and year navigation', () => {
  for (const date of ['2024-02-29', '2026-03-08', '2026-11-01', '1900-01-01', '2199-12-31']) assert.equal(validPlannerDate(date), true);
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', '2026-10-12T00:00Z', null, '2200-01-01']) assert.equal(validPlannerDate(date), false);
  assert.equal(shiftPlannerDate('2024-02-28', 1), '2024-02-29');
  assert.equal(shiftPlannerDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftPlannerDate('2026-03-08', 1), '2026-03-09');
  assert.equal(plannerMonth('2026-10-12').length, 42);
  assert.equal(plannerMonth('2026-10-12')[0], '2026-09-28');
});

test('daily templates create independent dates exactly once, even concurrently, and preserve edits and completion history', async t => {
  const node = await fixture(t), a = await node('main'); await a.create();
  const template = await a.ok('/v1/workspace/templates', input);
  const before = await a.ok('/v1/brain');
  const first = await Promise.all(Array.from({ length: 3 }, () => a.ok('/v1/workspace/planner/day', { date: '2026-10-12' })));
  assert.deepEqual(first.map(result => result.added).sort(), [0, 0, 2]);
  const day = (await a.ok('/v1/brain')).workspace.tasks;
  assert.deepEqual(day.map(task => task.section), ['Personal', 'Arkive']);
  const completed = await a.ok('/v1/workspace/tasks', { id: day[0].id, status: 'done' });
  assert.ok(completed.completedAt); assert.equal(completed.templateId, template.id); assert.equal(completed.dueDate, '2026-10-12');
  await a.ok('/v1/workspace/planner/day', { date: '2026-10-13' });
  const state = await a.ok('/v1/brain');
  assert.equal(state.workspace.tasks.length, 4);
  assert.equal(state.workspace.tasks.filter(task => task.status === 'done').length, 1);
  assert.equal(state.workspace.tasks.filter(task => task.dueDate === '2026-10-13').every(task => task.status === 'todo'), true);
  assert.deepEqual(state.objects, before.objects); assert.deepEqual(state.revisions, before.revisions); assert.deepEqual(state.rooms, before.rooms);
  assert.equal((await a.ok('/v1/workspace/planner/day', { date: '2026-10-12' })).added, 0);
  assert.deepEqual(await a.ok('/v1/brain'), state);
  const moved = await a.ok('/v1/workspace/tasks', { id: day[0].id, dueDate: '2026-10-14' });
  assert.equal(moved.completedAt, completed.completedAt); assert.equal(moved.templateDate, '2026-10-12');
  assert.equal((await a.ok('/v1/workspace/planner/day', { date: '2026-10-12' })).added, 0, 'rescheduling must not recreate the original occurrence');
  const reopened = await a.ok('/v1/workspace/tasks', { id: day[0].id, status: 'todo', dueDate: '' });
  assert.equal(reopened.completedAt, undefined); assert.equal(reopened.dueDate, undefined);
});

test('template edits and pauses affect only uncreated days, with stale-edit rejection and encrypted restore', async t => {
  const node = await fixture(t), a = await node('a'); await a.create();
  const template = await a.ok('/v1/workspace/templates', input);
  await a.ok('/v1/workspace/planner/day', { date: '2026-10-12' });
  const original = (await a.ok('/v1/brain')).workspace.tasks;
  const patch = { ...input, id: template.id, expectedUpdatedAt: template.updatedAt, items: [{ title: 'Updated routine', section: 'Business' }] };
  const changed = await a.ok('/v1/workspace/templates', patch);
  assert.equal((await a.call('/v1/workspace/templates', patch)).status, 409);
  assert.equal((await a.ok('/v1/workspace/planner/day', { date: '2026-10-12' })).added, 0);
  assert.deepEqual((await a.ok('/v1/brain')).workspace.tasks, original);
  await a.ok('/v1/workspace/planner/day', { date: '2026-10-13' });
  assert.equal((await a.ok('/v1/brain')).workspace.tasks.at(-1).title, 'Updated routine');
  await a.ok('/v1/workspace/templates', { ...patch, expectedUpdatedAt: changed.updatedAt, enabled: false });
  assert.equal((await a.ok('/v1/workspace/planner/day', { date: '2026-10-14' })).added, 0);
  const state = await a.ok('/v1/brain');
  const b = await node('b'); await b.ok('/v1/restore', { passphrase: password, bundle: await a.ok('/v1/export') });
  assert.deepEqual((await b.ok('/v1/brain')).workspace, state.workspace);
  await a.ok('/v1/lock', {}); await a.ok('/v1/unlock', { passphrase: password });
  assert.deepEqual((await a.ok('/v1/brain')).workspace, state.workspace);
});

test('weekday/start/manual recurrence is explicit and missing or malformed data fails without writes', async t => {
  const node = await fixture(t), a = await node('validation'); await a.create();
  const template = await a.ok('/v1/workspace/templates', { ...input, repeat: 'weekdays' });
  for (const date of ['2026-10-11', '2026-10-17', '2026-10-18']) assert.equal((await a.ok('/v1/workspace/planner/day', { date })).added, 0);
  assert.equal((await a.ok('/v1/workspace/planner/day', { date: '2026-10-19' })).added, 2);
  assert.equal(templateDue({ ...input, repeat: 'manual' }, '2026-10-19'), false);
  const manual = await a.ok('/v1/workspace/templates', { ...input, repeat: 'manual', name: 'Launch checklist' });
  assert.equal((await a.ok('/v1/workspace/planner/day', { date: '2026-10-10', templateId: manual.id })).added, 2);
  const state = await a.ok('/v1/brain');
  for (const body of [{ ...input, unknown: 1 }, { ...input, items: [] }, { ...input, startsOn: '2026-02-30' }, { ...input, items: [{ title: '', section: 'Personal' }] }, { ...input, items: Array(51).fill(input.items[0]) }]) assert.equal((await a.call('/v1/workspace/templates', body)).status, 400);
  for (const body of [{ date: '2026-02-30' }, { date: '2026-10-12', mode: 'replace' }, { date: '2026-10-12', templateId: 'bad' }]) assert.equal((await a.call('/v1/workspace/planner/day', body)).status, 400);
  assert.equal((await a.call('/v1/workspace/planner/day', { date: '2026-10-12', templateId: `template_${randomUUID()}` })).status, 404);
  const task = state.workspace.tasks[0];
  for (const body of [{ id: task.id, completedAt: new Date().toISOString() }, { id: task.id, templateId: template.id }, { id: task.id, dueDate: '2026-02-30' }]) assert.equal((await a.call('/v1/workspace/tasks', body)).status, 400);
  assert.deepEqual(await a.ok('/v1/brain'), state);
});

test('planner endpoints are owner-only and member snapshots contain no templates or task history', async t => {
  const node = await fixture(t), a = await node('access'); await a.create();
  await a.ok('/v1/workspace/templates', input);
  const member = await a.ok('/v1/members', { name: 'Reader' });
  for (const [route, body] of [['/v1/workspace/templates', input], ['/v1/workspace/planner/day', { date: '2026-10-12' }]]) {
    assert.equal((await a.call(route, body, member.token)).status, 403);
    assert.equal((await a.call(route, body, 'invalid')).status, 401);
  }
  const visible = (await a.call('/v1/brain', undefined, member.token)).body;
  assert.deepEqual(visible.workspace.tasks, []); assert.equal(visible.workspace.taskTemplates, undefined);
});

test('legacy workspace checksums remain untouched; task limits and invalid origins fail atomically', () => {
  const workspace = emptyWorkspace(), original = structuredClone(workspace);
  validateWorkspace(workspace, new Set()); assert.deepEqual(workspace, original);
  const state = { objects: [], workspace };
  const template = saveTaskTemplate(state, input).template;
  const task = upsertWorkspace(state, 'tasks', { title: 'Existing undated task' }).record;
  assert.equal(task.dueDate, undefined);
  const bad = structuredClone(state.workspace); bad.tasks[0].templateId = template.id;
  assert.throws(() => validateWorkspace(bad, new Set()), /origin/);
  state.workspace.tasks = Array.from({ length: MAX_TASKS - 1 }, () => ({ ...task, id: `task_${randomUUID()}` }));
  const before = structuredClone(state);
  assert.throws(() => populatePlannerDay(state, { date: '2026-10-12' }), { code: 'WORKSPACE_LIMIT' });
  assert.deepEqual(state, before);
});
