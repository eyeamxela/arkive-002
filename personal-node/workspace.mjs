import { randomUUID } from 'node:crypto';

// Saved context and organization only. These records grant no permissions and
// neither execute tools nor start autonomous or scheduled agents.
const CATEGORIES = Object.freeze({ tasks: { prefix: 'task', maximum: 500, name: 'title' },
  agents: { prefix: 'agent', maximum: 100, name: 'name' },
  manifests: { prefix: 'manifest', maximum: 200, name: 'name' },
  collections: { prefix: 'collection', maximum: 200, name: 'name' } });
const COMMON = ['id', 'description', 'sourceIds', 'createdAt', 'updatedAt'];
const STATUSES = new Set(['todo', 'doing', 'review', 'done']);
const fail = (message, code = 'WORKSPACE_INVALID', status = 400) => { throw Object.assign(new Error(message), { code, status }); };
const uuid = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).test(value);
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const allowedKeys = (value, keys) => plain(value) && Object.keys(value).every((key) => keys.includes(key));
const fields = (category) => [...COMMON, CATEGORIES[category].name, ...(category === 'tasks' ? ['status', 'agentId'] : category === 'agents' ? ['providerId'] : [])];
const text = (value, limit, required = false) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= limit &&
  !value.includes('\0') && (!required || Boolean(value.trim())) && Buffer.from(value, 'utf8').toString('utf8') === value;
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function emptyWorkspace() {
  return { tasks: [], agents: [], manifests: [], collections: [] };
}

/** Does not mutate stored state: legacy bundles without workspace retain their checksum. */
export function validateWorkspace(value, objectIds) {
  if (!allowedKeys(value, Object.keys(CATEGORIES)) || Object.keys(CATEGORIES).some((key) => !Array.isArray(value[key]) || value[key].length > CATEGORIES[key].maximum)) {
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
    }
  }
  return value;
}

/** Mutates only the caller's transaction clone. Server timestamps cannot be supplied. */
export function upsertWorkspace(state, category, input) {
  if (typeof category !== 'string' || !Object.hasOwn(CATEGORIES, category)) fail('Unknown workspace category');
  const settings = CATEGORIES[category];
  const allowed = fields(category).filter((key) => !['createdAt', 'updatedAt'].includes(key));
  if (!allowedKeys(input, allowed)) fail('Unknown or unsafe workspace fields');
  const workspace = state.workspace ?? emptyWorkspace();
  const previous = input.id === undefined ? undefined : workspace[category].find((item) => item.id === input.id);
  if (input.id !== undefined && (!uuid(input.id, settings.prefix) || !previous)) fail('Workspace record not found', 'WORKSPACE_NOT_FOUND', 404);
  if (!previous && workspace[category].length >= settings.maximum) fail('Workspace category has reached its record limit', 'WORKSPACE_LIMIT', 413);
  const stamp = new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) : 0)).toISOString();
  const record = { id: previous?.id ?? `${settings.prefix}_${randomUUID()}`,
    [settings.name]: previous?.[settings.name], description: previous?.description ?? '', sourceIds: previous?.sourceIds ?? [],
    ...(category === 'tasks' ? { status: previous?.status ?? 'todo', ...(previous?.agentId ? { agentId: previous.agentId } : {}) } : {}),
    ...(category === 'agents' ? { providerId: previous?.providerId ?? 'openai-compatible' } : {}),
    ...structuredClone(input), createdAt: previous?.createdAt ?? stamp, updatedAt: stamp };
  // Empty/null are explicit clear operations in input only; saved records omit the field.
  if (category === 'tasks' && (record.agentId === null || record.agentId === '')) delete record.agentId;
  const index = previous ? workspace[category].indexOf(previous) : workspace[category].length;
  workspace[category][index] = record;
  validateWorkspace(workspace, new Set(state.objects.map((object) => object.id)));
  state.workspace = workspace;
  return { record, created: !previous };
}
