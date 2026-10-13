import { randomUUID } from 'node:crypto';
import { validPlannerDate, templateDue } from './planner-dates.mjs';

export const MAX_TASKS = 20000;
const fail = (message, code = 'WORKSPACE_INVALID', status = 400) => { throw Object.assign(new Error(message), { code, status }); };
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
const text = (value, max) => typeof value === 'string' && value.trim() === value && value.length > 0 && Buffer.byteLength(value) <= max && !/[\x00-\x1f]/.test(value);
const id = value => typeof value === 'string' && /^template_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function validatePlanner(workspace) {
  const templates = workspace.taskTemplates ?? [];
  if (!Array.isArray(templates) || templates.length > 100) fail('Keep at most 100 task templates');
  const seen = new Set();
  for (const template of templates) {
    if (!keys(template, ['id', 'name', 'repeat', 'startsOn', 'enabled', 'items', 'createdAt', 'updatedAt']) || !id(template.id) || seen.has(template.id) ||
      !text(template.name, 160) || !['manual', 'daily', 'weekdays'].includes(template.repeat) || !validPlannerDate(template.startsOn) || typeof template.enabled !== 'boolean' ||
      !stamp(template.createdAt) || !stamp(template.updatedAt) || template.updatedAt < template.createdAt ||
      !Array.isArray(template.items) || template.items.length < 1 || template.items.length > 50) fail('Invalid task template');
    seen.add(template.id);
    for (const item of template.items) if (!keys(item, ['title', 'section']) || !text(item.title, 160) || !text(item.section, 80)) fail('Each template task needs a title and section');
  }
  for (const task of workspace.tasks) {
    if (task.dueDate !== undefined && !validPlannerDate(task.dueDate)) fail('Use a valid date between 1900 and 2199');
    if (task.section !== undefined && !text(task.section, 80)) fail('Section must be 1–80 UTF-8 bytes');
    if (task.completedAt !== undefined && (!stamp(task.completedAt) || task.status !== 'done' || task.completedAt < task.createdAt || task.completedAt > task.updatedAt)) fail('Invalid task completion timestamp');
    if ((task.templateId !== undefined || task.templateDate !== undefined) && (!seen.has(task.templateId) || !validPlannerDate(task.templateDate))) fail('Invalid template origin');
  }
}

export function saveTaskTemplate(state, input) {
  if (!keys(input, ['id', 'name', 'repeat', 'startsOn', 'enabled', 'items', 'expectedUpdatedAt'])) fail('Unknown template fields');
  const workspace = structuredClone(state.workspace);
  const templates = workspace.taskTemplates ?? [];
  const previous = templates.find(template => template.id === input.id);
  if (input.id !== undefined && !previous) fail('Template not found', 'WORKSPACE_NOT_FOUND', 404);
  if (previous && input.expectedUpdatedAt !== previous.updatedAt) fail('Template changed. Reopen it before saving.', 'WORKSPACE_STALE', 409);
  if (!previous && templates.length >= 100) fail('Keep at most 100 templates', 'WORKSPACE_LIMIT', 413);
  const now = new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString();
  const template = { id: previous?.id ?? `template_${randomUUID()}`, name: input.name, repeat: input.repeat, startsOn: input.startsOn,
    enabled: input.enabled, items: structuredClone(input.items), createdAt: previous?.createdAt ?? now, updatedAt: now };
  if (previous) templates[templates.indexOf(previous)] = template; else templates.push(template);
  workspace.taskTemplates = templates; validatePlanner(workspace); state.workspace = workspace;
  return { template, created: !previous };
}

/** One snapshot per template/date, inside the encrypted store's serialized transaction. */
export function populatePlannerDay(state, input) {
  if (!keys(input, ['date', 'templateId']) || !validPlannerDate(input.date) || (input.templateId !== undefined && !id(input.templateId))) fail('Choose a valid planner date');
  const workspace = structuredClone(state.workspace);
  const templates = workspace.taskTemplates ?? [];
  if (input.templateId && !templates.some(template => template.id === input.templateId)) fail('Template not found', 'WORKSPACE_NOT_FOUND', 404);
  const applied = new Set(workspace.tasks.filter(task => task.templateDate === input.date).map(task => task.templateId));
  const selected = templates.filter(template => !applied.has(template.id) && (input.templateId ? template.id === input.templateId : templateDue(template, input.date)));
  const count = selected.reduce((sum, template) => sum + template.items.length, 0);
  if (workspace.tasks.length + count > MAX_TASKS) fail('The planner supports 20,000 saved tasks. Nothing was partially added.', 'WORKSPACE_LIMIT', 413);
  const now = new Date().toISOString();
  const added = selected.flatMap(template => template.items.map(item => ({ id: `task_${randomUUID()}`, title: item.title, section: item.section,
    description: '', sourceIds: [], status: 'todo', dueDate: input.date, templateId: template.id, templateDate: input.date, createdAt: now, updatedAt: now })));
  workspace.tasks.push(...added); validatePlanner(workspace); state.workspace = workspace;
  return { added: added.length, date: input.date, templateIds: selected.map(template => template.id) };
}
