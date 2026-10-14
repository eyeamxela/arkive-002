import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTemplateDraft, templateSaveInput } from '../../src/personal/templateDraft.mjs';
import { saveTaskTemplate, populatePlannerDay } from '../../../personal-node/planner.mjs';
import { emptyWorkspace, upsertWorkspace } from '../../../personal-node/workspace.mjs';

test('legacy templates expose unique headings without changing the saved template or losing preset tasks', () => {
  const state = { objects: [], workspace: emptyWorkspace() };
  const legacy = saveTaskTemplate(state, { name: 'FRTL', repeat: 'manual', startsOn: '2026-10-13', enabled: false, items: [{ title: 'Existing task', section: 'FRTL' }, { title: 'Another task', section: 'XELAB' }, { title: 'Third task', section: 'XELAB' }] }).template;
  const before = structuredClone(legacy), draft = createTemplateDraft(legacy, '2026-10-14');
  assert.deepEqual(draft.sections.map(s => s.title), ['FRTL', 'XELAB']);
  assert.deepEqual(draft.items, legacy.items);
  assert.deepEqual(legacy, before);
  assert.equal(draft.expectedUpdatedAt, legacy.updatedAt);
});

test('legacy template saves with sections only, keeps old days and accepts tasks on a future date', () => {
  const state = { objects: [], workspace: emptyWorkspace() };
  const legacy = saveTaskTemplate(state, { name: 'FRTL', repeat: 'manual', startsOn: '2026-10-13', enabled: false, items: [{ title: 'Old task', section: 'FRTL' }, { title: 'Old work', section: 'XELAB' }] }).template;
  populatePlannerDay(state, { date: '2026-10-13', templateId: legacy.id });
  const oldTasks = structuredClone(state.workspace.tasks);
  const draft = createTemplateDraft(legacy, '2026-10-13');
  draft.items = draft.items.map(item => ({ ...item, title: '  ' }));
  const saved = saveTaskTemplate(state, templateSaveInput(draft)).template;
  assert.equal(saved.items.length, 0);
  assert.deepEqual(saved.sections.map(s => s.title), ['FRTL', 'XELAB']);
  assert.deepEqual(state.workspace.tasks, oldTasks);
  assert.equal(populatePlannerDay(state, { date: '2027-01-01', templateId: saved.id }).added, 0);
  assert.equal(populatePlannerDay(state, { date: '2027-01-01', templateId: saved.id }).changed, false);
  upsertWorkspace(state, 'tasks', { title: 'Future work', dueDate: '2027-01-01', section: 'XELAB', plannerSectionId: saved.sections[1].id });
  assert.equal(state.workspace.tasks.at(-1).dueDate, '2027-01-01');
  assert.deepEqual(state.workspace.tasks.slice(0, 2), oldTasks);
  const reopened = createTemplateDraft(saved, '2027-01-01');
  assert.deepEqual(reopened.sections, saved.sections);
});

test('new template needs only a name and headings; optional empty rows are omitted', () => {
  const draft = createTemplateDraft(undefined, '2026-10-13');
  draft.name = '  Personal  ';
  draft.items.push({ title: '', section: '' });
  const input = templateSaveInput(draft);
  assert.equal(input.name, 'Personal'); assert.equal(input.items.length, 0);
  assert.equal(input.sections.length, 8);
  const state = { objects: [], workspace: emptyWorkspace() };
  saveTaskTemplate(state, input);
  populatePlannerDay(state, { date: '2026-10-15' });
  assert.equal(state.workspace.tasks.length, 0);
  assert.equal(state.workspace.plannerDays[0].entries[0].sections.length, 8);
});
