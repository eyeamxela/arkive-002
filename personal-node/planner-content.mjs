import { randomUUID } from 'node:crypto';
import { validPlannerDate } from './planner-dates.mjs';

const fail = (message, code = 'WORKSPACE_INVALID', status = 400) => { throw Object.assign(new Error(message), { code, status }); };
const keys = (v, allowed) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => allowed.includes(k));
const text = (v, max, required = false) => typeof v === 'string' && Buffer.byteLength(v) <= max && !v.includes('\0') && (!required || !!v.trim());
const identifier = (v, prefix) => typeof v === 'string' && new RegExp(`^${prefix}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).test(v);
const stamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export function validateSections(sections) {
  if (!Array.isArray(sections) || !sections.length || sections.length > 50) fail('Use 1–50 template sections');
  const ids = new Set();
  for (const s of sections) {
    if (!keys(s, ['id', 'title', 'kind']) || !identifier(s.id, 'section') || ids.has(s.id) || !text(s.title, 80, true) || !['tasks', 'journal'].includes(s.kind)) fail('Invalid template section');
    ids.add(s.id);
  }
  if (sections.filter(s => s.kind === 'journal').length > 1) fail('Use one daily journal section');
}
export function validatePlannerContent(workspace) {
  const days = workspace.plannerDays ?? [], dates = new Set(), taskIds = new Set(workspace.tasks.map(t => t.id)), sectionIds = new Set();
  if (!Array.isArray(days) || days.length > 5000) fail('Keep at most 5,000 saved planner dates');
  for (const day of days) {
    if (!keys(day, ['date', 'entries', 'blocks', 'updatedAt', 'journal', 'color']) || !validPlannerDate(day.date) || dates.has(day.date) || !stamp(day.updatedAt) || !Array.isArray(day.entries) || day.entries.length > 100) fail('Invalid planner day');
    if (day.journal !== undefined && !text(day.journal, 24000)) fail('Invalid day journal');
    if (day.color !== undefined && !/^#[0-9a-f]{6}$/i.test(day.color)) fail('Invalid day color');
    dates.add(day.date); const entryIds = new Set();
    for (const e of day.entries) {
      if (!keys(e, ['id', 'name', 'sections', 'journal', 'color']) || !identifier(e.id, 'template') || entryIds.has(e.id) || !text(e.name, 160, true) || !text(e.journal, 24000) || !/^#[0-9a-f]{6}$/i.test(e.color)) fail('Invalid daily entry');
      entryIds.add(e.id); validateSections(e.sections); e.sections.forEach(s => sectionIds.add(s.id));
    }
    if (!Array.isArray(day.blocks) || day.blocks.length > 200 || Buffer.byteLength(JSON.stringify(day.blocks)) > 200000) fail('Keep boards under 200 blocks / 200 KB');
    const blockIds = new Set(day.blocks.map(b => b?.id));
    if (blockIds.size !== day.blocks.length) fail('Duplicate board block');
    for (const b of day.blocks) {
      if (!keys(b, ['id', 'kind', 'text', 'url', 'taskId', 'parentId', 'x', 'y', 'points']) || !identifier(b.id, 'block') || !['note', 'link', 'comment', 'column', 'task', 'drawing'].includes(b.kind) || !text(b.text, 4000) || ![b.x, b.y].every(v => Number.isFinite(v) && Math.abs(v) <= 100000)) fail('Invalid board block');
      if (b.url !== undefined) { try { if (!text(b.url, 2000) || !['http:', 'https:'].includes(new URL(b.url).protocol)) fail('Use an http(s) link'); } catch { fail('Use an http(s) link'); } }
      if (b.taskId !== undefined && (b.kind !== 'task' || !taskIds.has(b.taskId))) fail('Board task reference is unavailable');
      if (b.kind === 'task' && !taskIds.has(b.taskId)) fail('Choose an existing task for this block');
      if (b.parentId !== undefined && (b.kind === 'column' || !day.blocks.some(p => p.id === b.parentId && p.kind === 'column'))) fail('Choose a valid board column');
      if (b.points !== undefined && (b.kind !== 'drawing' || !Array.isArray(b.points) || b.points.length > 500 || b.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(v => Number.isFinite(v) && Math.abs(v) <= 100000)))) fail('Invalid drawing');
    }
  }
  for (const t of workspace.tasks) if (t.plannerSectionId !== undefined && !sectionIds.has(t.plannerSectionId)) fail('Task section is not in a saved daily entry');
}
export function snapshotSections(workspace, templates, date) {
  if (!templates.some(t => t.sections)) return false;
  workspace.plannerDays ??= [];
  let day = workspace.plannerDays.find(d => d.date === date);
  if (!day) { day = { date, entries: [], blocks: [], updatedAt: new Date().toISOString() }; workspace.plannerDays.push(day); }
  for (const t of templates.filter(t => t.sections)) day.entries.push({ id: t.id, name: t.name, sections: structuredClone(t.sections), journal: '', color: t.color ?? '#f4bc59' });
  day.updatedAt = new Date(Math.max(Date.now(), Date.parse(day.updatedAt) + 1)).toISOString();
  return true;
}
/** Revision-checked full board or entry patch; never changes task status or source files. */
export function patchPlannerDay(state, input) {
  if (!keys(input, ['date', 'expectedUpdatedAt', 'entryId', 'journal', 'color', 'blocks']) || !validPlannerDate(input.date)) fail('Invalid daily edit');
  if (input.blocks === undefined && input.journal === undefined && input.color === undefined) fail('Provide daily content to save');
  const workspace = structuredClone(state.workspace), days = workspace.plannerDays ?? [];
  const previous = days.find(d => d.date === input.date);
  if ((previous?.updatedAt ?? null) !== input.expectedUpdatedAt) fail('This day changed. Reload it before saving; your draft is kept.', 'WORKSPACE_STALE', 409);
  const day = previous ?? { date: input.date, entries: [], blocks: [], updatedAt: new Date().toISOString() };
  if (input.journal !== undefined || input.color !== undefined) {
    const entry = input.entryId === undefined ? day : day.entries.find(e => e.id === input.entryId);
    if (!entry) fail('Daily entry not found', 'WORKSPACE_NOT_FOUND', 404);
    if (input.journal !== undefined) entry.journal = input.journal;
    if (input.color !== undefined) entry.color = input.color;
  } else if (input.entryId !== undefined) fail('Unexpected daily entry');
  if (input.blocks !== undefined) day.blocks = structuredClone(input.blocks);
  day.updatedAt = new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString();
  if (!previous) days.push(day);
  workspace.plannerDays = days; validatePlannerContent(workspace); state.workspace = workspace;
  return { added: 0, changed: true, date: input.date, templateIds: [], day };
}
export const newSection = (title, kind = 'tasks') => ({ id: `section_${randomUUID()}`, title, kind });
