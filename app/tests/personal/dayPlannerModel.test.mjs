import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayPlannerGroups } from '../../src/personal/dayPlannerModel.mjs';

test('day grouping combines all template sections, legacy tasks and one-offs exactly once', () => {
  const day = { entries: [
    { sections: [{ id: 'morning', title: 'Morning Flow', kind: 'tasks' }, { id: 'frtl', title: 'FRTL', kind: 'tasks' }, { id: 'journal', title: 'Daily Journal', kind: 'journal' }] },
    { sections: [{ id: 'frtl2', title: 'FRTL', kind: 'tasks' }, { id: 'xelab', title: 'XELAB', kind: 'tasks' }] },
  ] };
  const a = { id: 'a', title: 'Linked task', dueDate: '2026-10-13', section: 'Old title', plannerSectionId: 'frtl2' };
  const tasks = [a, a, { id: 'b', dueDate: '2026-10-13', section: 'FRTL' }, { id: 'c', dueDate: '2026-10-13', section: 'Other project' }, { id: 'future', dueDate: '2026-10-14' }, { id: 'unscheduled' }];
  const before = structuredClone({ day, tasks });
  const groups = dayPlannerGroups('2026-10-13', day, tasks);
  assert.deepEqual(groups.map(g => g.title), ['Morning Flow', 'FRTL', 'XELAB', 'Other project']);
  assert.deepEqual(groups[1].tasks.map(t => t.id), ['a', 'b']);
  assert.equal(groups[1].sectionId, 'frtl');
  assert.equal(groups.flatMap(g => g.tasks).length, 3);
  assert.deepEqual({ day, tasks }, before);
});

test('empty dates have a Personal capture section, and dates never inherit other tasks', () => {
  const groups = dayPlannerGroups('2026-10-14', undefined, [{ id: 'past', dueDate: '2026-10-13' }]);
  assert.deepEqual(groups, [{ title: 'Personal', sectionId: undefined, tasks: [] }]);
});
