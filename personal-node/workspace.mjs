import { randomUUID } from 'node:crypto';
import { MAX_TASKS, validatePlanner } from './planner.mjs';

// Saved context and organization only. These records grant no permissions and
// neither execute tools nor start autonomous or scheduled agents.
const CATEGORIES = Object.freeze({ tasks: { prefix: 'task', maximum: MAX_TASKS, name: 'title' },
  agents: { prefix: 'agent', maximum: 100, name: 'name' },
  manifests: { prefix: 'manifest', maximum: 200, name: 'name' },
  collections: { prefix: 'collection', maximum: 200, name: 'name' } });
const COMMON = ['id', 'description', 'sourceIds', 'createdAt', 'updatedAt'];
const STATUSES = new Set(['todo', 'doing', 'review', 'done']);
const fail = (message, code = 'WORKSPACE_INVALID', status = 400) => { throw Object.assign(new Error(message), { code, status }); };
const uuid = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).test(value);
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const allowedKeys = (value, keys) => plain(value) && Object.keys(value).every((key) => keys.includes(key));
const fields = (category) => [...COMMON, CATEGORIES[category].name, ...(category === 'tasks' ? ['status', 'agentId', 'dueDate', 'section', 'plannerSectionId', 'completedAt', 'templateId', 'templateDate'] : category === 'agents' ? ['providerId'] : category === 'collections' ? ['color'] : [])];
const text = (value, limit, required = false) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= limit &&
  !value.includes('\0') && (!required || Boolean(value.trim())) && Buffer.from(value, 'utf8').toString('utf8') === value;
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function emptyWorkspace() {
  return { tasks: [], agents: [], manifests: [], collections: [] };
}

/** Does not mutate stored state: legacy bundles without workspace retain their checksum. */
export function validateWorkspace(value, objectIds) {
  if (!allowedKeys(value, [...Object.keys(CATEGORIES), 'filing', 'taskTemplates', 'plannerDays']) || Object.keys(CATEGORIES).some((key) => !Array.isArray(value[key]) || value[key].length > CATEGORIES[key].maximum)) {
    fail('Workspace requires bounded tasks, agents, manifests, and collections arrays');
  }
  const seen = new Set();
  const agentIds = new Set(value.agents.map((agent) => agent?.id));
  for (const [category, settings] of Object.entries(CATEGORIES)) {
    for (const item of value[category]) {
      if (!allowedKeys(item, fields(category)) || !uuid(item.id, settings.prefix) || seen.has(item.id) ||
        !text(item[settings.name], 160, true) || !text(item.description, 8000) ||
        !timestamp(item.createdAt) || !timestamp(item.updatedAt) || item.updatedAt < item.createdAt) {
        fail(`Invalid or duplicate ${category} record`);
      }
      seen.add(item.id);
      if (!Array.isArray(item.sourceIds) || item.sourceIds.length > 1000 || new Set(item.sourceIds).size !== item.sourceIds.length ||
        item.sourceIds.some((id) => !uuid(id, 'obj') || !objectIds.has(id))) {
        fail('Workspace source selections must reference existing Brain objects', 'WORKSPACE_REFERENCE');
      }
      if (category === 'tasks' && (!STATUSES.has(item.status) || (Object.hasOwn(item, 'agentId') &&
        (!uuid(item.agentId, 'agent') || !agentIds.has(item.agentId))))) {
        fail('Tasks require a valid status and an existing saved agent profile', 'WORKSPACE_REFERENCE');
      }
      if (category === 'agents' && (typeof item.providerId !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(item.providerId))) {
        fail('Agent providerId must be a provider identifier, not credentials or a URL');
      }
      // Presentation only: colors never change source revisions or grant access.
      // Optional so pre-cabinet exports remain valid without rewriting checksums.
      if (category === 'collections' && Object.hasOwn(item, 'color') &&
        (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color))) {
        fail('Folder color must be a six-digit hexadecimal color');
      }
    }
  }
  if (value.filing !== undefined) {
    const filing = value.filing;
    if (!allowedKeys(filing, ['overrides', 'colors']) || !Array.isArray(filing.overrides) || filing.overrides.length > objectIds.size || !Array.isArray(filing.colors) || filing.colors.length > 200) fail('Invalid smart folder metadata');
    const sourceIds = new Set(), names = new Set();
    for (const item of filing.overrides) {
      if (!allowedKeys(item, ['sourceId', 'folder']) || !objectIds.has(item.sourceId) || sourceIds.has(item.sourceId) || !folderName(item.folder)) fail('Invalid smart folder refinement');
      sourceIds.add(item.sourceId);
    }
    for (const item of filing.colors) {
      if (!allowedKeys(item, ['folder', 'color']) || !folderName(item.folder) || names.has(item.folder) || typeof item.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(item.color)) fail('Invalid smart folder color');
      names.add(item.folder);
    }
  }
  validatePlanner(value);
  return value;
}

const folderName = value => text(value, 160, true) && value === value.trim() && !/[\x00-\x1f/\\]/.test(value);

/** Explicit corrections to derived grouping; never mutate source files or revisions. */
export function refineSmartFolders(state, input) {
  if (!allowedKeys(input, ['assignments', 'color']) || !Array.isArray(input.assignments) || input.assignments.length > 1000 || (!input.assignments.length && !input.color)) fail('Provide 1–1,000 refinements or a folder color');
  const workspace = structuredClone(state.workspace ?? emptyWorkspace());
  const filing = workspace.filing ?? { overrides: [], colors: [] };
  const overrides = new Map(filing.overrides.map(item => [item.sourceId, item.folder]));
  const objects = new Map(state.objects.map(object => [object.id, object]));
  const seen = new Set(); let changed = 0;
  for (const item of input.assignments) {
    if (!allowedKeys(item, ['sourceId', 'revisionId', 'expectedFolder', 'folder']) || seen.has(item.sourceId) || (item.folder !== null && !folderName(item.folder))) fail('Invalid folder refinement');
    seen.add(item.sourceId);
    const object = objects.get(item.sourceId);
    if (!object || object.kind === 'code_graph' || object.revisionId !== item.revisionId || (overrides.get(item.sourceId) ?? null) !== item.expectedFolder) fail('Source or filing changed. Refresh and try again.', 'WORKSPACE_STALE', 409);
    if ((overrides.get(item.sourceId) ?? null) === item.folder) continue;
    if (item.folder === null) overrides.delete(item.sourceId); else overrides.set(item.sourceId, item.folder);
    changed++;
  }
  if (input.color !== undefined) {
    const item = input.color;
    if (!allowedKeys(item, ['folder', 'color', 'expectedColor']) || !folderName(item.folder) || typeof item.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(item.color)) fail('Invalid folder color');
    const previous = filing.colors.find(color => color.folder === item.folder);
    if ((previous?.color ?? null) !== item.expectedColor) fail('Folder color changed. Refresh and try again.', 'WORKSPACE_STALE', 409);
    if (previous?.color !== item.color.toLowerCase()) {
      if (previous) previous.color = item.color.toLowerCase(); else filing.colors.push({ folder: item.folder, color: item.color.toLowerCase() });
      changed++;
    }
  }
  filing.overrides = [...overrides].map(([sourceId, folder]) => ({ sourceId, folder }));
  workspace.filing = filing;
  validateWorkspace(workspace, new Set(objects.keys()));
  state.workspace = workspace;
  return { changed };
}

/** Mutates only the caller's transaction clone. Server timestamps cannot be supplied. */
export function upsertWorkspace(state, category, input) {
  if (typeof category !== 'string' || !Object.hasOwn(CATEGORIES, category)) fail('Unknown workspace category');
  const settings = CATEGORIES[category];
  const allowed = fields(category).filter((key) => !['createdAt', 'updatedAt', 'completedAt', 'templateId', 'templateDate'].includes(key));
  if (!allowedKeys(input, allowed)) fail('Unknown or unsafe workspace fields');
  const workspace = state.workspace ?? emptyWorkspace();
  const previous = input.id === undefined ? undefined : workspace[category].find((item) => item.id === input.id);
  if (input.id !== undefined && (!uuid(input.id, settings.prefix) || !previous)) fail('Workspace record not found', 'WORKSPACE_NOT_FOUND', 404);
  if (!previous && workspace[category].length >= settings.maximum) fail('Workspace category has reached its record limit', 'WORKSPACE_LIMIT', 413);
  const stamp = new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) : 0)).toISOString();
  const record = { ...previous, id: previous?.id ?? `${settings.prefix}_${randomUUID()}`,
    [settings.name]: previous?.[settings.name], description: previous?.description ?? '', sourceIds: previous?.sourceIds ?? [],
    ...(category === 'tasks' ? { status: previous?.status ?? 'todo', ...(previous?.agentId ? { agentId: previous.agentId } : {}) } : {}),
    ...(category === 'agents' ? { providerId: previous?.providerId ?? 'openai-compatible' } : {}),
    ...(category === 'collections' && previous?.color ? { color: previous.color } : {}),
    ...structuredClone(input), createdAt: previous?.createdAt ?? stamp, updatedAt: stamp };
  // Empty/null are explicit clear operations in input only; saved records omit the field.
  if (category === 'tasks' && (record.agentId === null || record.agentId === '')) delete record.agentId;
  if (category === 'tasks') {
    if (record.dueDate === '' || record.dueDate === null) delete record.dueDate;
    if (record.status === 'done' && previous?.status !== 'done') record.completedAt = stamp;
    if (record.status !== 'done') delete record.completedAt;
  }
  const index = previous ? workspace[category].indexOf(previous) : workspace[category].length;
  workspace[category][index] = record;
  validateWorkspace(workspace, new Set(state.objects.map((object) => object.id)));
  state.workspace = workspace;
  return { record, created: !previous };
}

/** Owner-reviewed virtual filing. Validate a full batch before publishing any membership. */
export function organizeCollections(state, input) {
  if (!allowedKeys(input, ['operations']) || !Array.isArray(input.operations) || !input.operations.length || input.operations.length > 200) fail('Provide 1–200 collection operations');
  const next = { ...state, workspace: structuredClone(state.workspace ?? emptyWorkspace()) };
  const objects = new Map(state.objects.map(object => [object.id, object]));
  const seen = new Set(); const changed = []; let references = 0;
  for (const operation of input.operations) {
    if (!allowedKeys(operation, ['collectionId', 'expected', 'add', 'removeIds', 'order']) || seen.has(operation.collectionId)) fail('Invalid or duplicate collection operation');
    seen.add(operation.collectionId);
    const collection = next.workspace.collections.find(item => item.id === operation.collectionId);
    if (!collection) fail('Collection is no longer available. Review again.', 'WORKSPACE_STALE', 409);
    const expected = operation.expected;
    if (!plain(expected) || Object.keys(expected).length !== Object.keys(collection).length || Object.keys(collection).some(key => JSON.stringify(collection[key]) !== JSON.stringify(expected[key]))) {
      fail('Collection changed during review. Review again before applying.', 'WORKSPACE_STALE', 409);
    }
    if (!Array.isArray(operation.add) || !Array.isArray(operation.removeIds) || operation.add.length > 1000 || operation.removeIds.length > 1000) fail('Invalid filing selections');
    references += operation.add.length + operation.removeIds.length + (operation.order?.length ?? 0);
    if (references > 1000) fail('Review at most 1,000 references at a time', 'WORKSPACE_LIMIT', 413);
    const additions = new Set(); const removals = new Set(operation.removeIds);
    if (removals.size !== operation.removeIds.length || [...removals].some(id => !uuid(id, 'obj') || !collection.sourceIds.includes(id))) fail('Removal must reference an existing collection member');
    for (const binding of operation.add) {
      if (!allowedKeys(binding, ['sourceId', 'revisionId']) || !uuid(binding.sourceId, 'obj') || additions.has(binding.sourceId) || removals.has(binding.sourceId)) fail('Invalid or duplicate source binding');
      const object = objects.get(binding.sourceId);
      if (!object || object.kind === 'code_graph' || object.revisionId !== binding.revisionId) fail('Source changed during review. Review again before applying.', 'WORKSPACE_STALE', 409);
      additions.add(binding.sourceId);
    }
    let sourceIds = [...new Set([...collection.sourceIds.filter(id => !removals.has(id)), ...additions])];
    if (sourceIds.length > 1000) fail('A collection supports up to 1,000 sources. Nothing was changed.', 'WORKSPACE_LIMIT', 413);
    if (operation.order !== undefined) {
      if (operation.add.length || removals.size || !Array.isArray(operation.order) || operation.order.length !== sourceIds.length || new Set(operation.order).size !== sourceIds.length || operation.order.some(id => !sourceIds.includes(id))) fail('Manual order must preserve every collection reference');
      sourceIds = [...operation.order];
    }
    if (JSON.stringify(sourceIds) === JSON.stringify(collection.sourceIds)) continue;
    collection.sourceIds = sourceIds;
    collection.updatedAt = new Date(Math.max(Date.now(), Date.parse(collection.updatedAt) + 1)).toISOString();
    changed.push(collection);
  }
  validateWorkspace(next.workspace, new Set(objects.keys()));
  state.workspace = next.workspace;
  return { collections: changed, changed: changed.length };
}
