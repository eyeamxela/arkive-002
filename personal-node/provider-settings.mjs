import { open, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveEndpoint, requestJson } from './execution.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { code: 'PROVIDER_SETTINGS', status }); };
const fields = ['enabled', 'baseUrl', 'model', 'timeoutMs', 'temperature', 'maxTokens', 'apiKey'];
function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key))) fail('Unknown provider setting');
  if (typeof input.enabled !== 'boolean') fail('Choose whether the connection is enabled');
  let url;
  try { url = new URL(input.baseUrl); } catch { fail('Enter an API base URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) fail('Use HTTPS, or HTTP on localhost, with no URL credentials, query or fragment');
  if (/\/(chat\/completions|responses|messages)\/?$/.test(url.pathname)) fail('Enter the API base URL, not a completion endpoint');
  if (typeof input.model !== 'string' || !input.model.trim() || input.model.length > 200 || /[\x00-\x1f\x7f]/.test(input.model)) fail('Enter a model ID of 1–200 characters');
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1000 || input.timeoutMs > 55000) fail('Timeout must be 1–55 seconds');
  if (input.temperature !== undefined && (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2)) fail('Temperature must be 0–2, or omitted');
  if (input.maxTokens !== undefined && (!Number.isInteger(input.maxTokens) || input.maxTokens < 1 || input.maxTokens > 128000)) fail('Max output tokens must be 1–128000, or omitted');
  if (typeof input.apiKey !== 'string' || input.apiKey.length > 8192 || /[\x00-\x20\x7f]/.test(input.apiKey)) fail('API key contains invalid characters');
  return { ...input, baseUrl: url.href.replace(/\/$/, ''), model: input.model.trim() };
}

/** Node-local credential sidecar: never part of a Brain snapshot, replica or recovery export. */
export function createProviderSettings({ directory, initial, encrypt, decrypt }) {
  const filename = path.join(directory, 'provider-settings.enc');
  let saved = null;
  let mutations = Promise.resolve();
  const serialize = task => { const result = mutations.then(task); mutations = result.catch(() => {}); return result; };
  const active = () => saved?.connections.find(item => item.id === saved.activeId);
  const config = roomId => {
    const id = (saved && Object.hasOwn(saved.roomBindings, roomId) ? saved.roomBindings[roomId] : null) || saved?.activeId;
    const connection = saved?.connections.find(item => item.id === id);
    if (saved && !connection) fail('Pinned connection is missing; choose another connection explicitly', 409);
    return saved ? { request: initial.request, signal: initial.signal, ...connection.config, connectionId: id } : { ...initial };
  };
  const redacted = c => ({ enabled: c.enabled !== false, baseUrl: c.baseUrl || '', model: c.model || '',
    timeoutMs: c.timeoutMs || 45000, temperature: c.temperature ?? null, maxTokens: c.maxTokens ?? null,
    hasApiKey: Boolean(c.apiKey), adapter: 'openai-compatible', apiMode: 'chat-completions' });
  const snapshot = () => {
    const c = config();
    return { revision: saved?.revision || 'environment', updatedAt: saved?.updatedAt || null,
      source: saved ? 'encrypted-node' : 'environment', ...redacted(c),
      connectionId: saved?.activeId || 'default', name: active()?.name || 'Default connection' };
  };
  const registry = () => ({ version: 1, revision: snapshot().revision, activeId: snapshot().connectionId,
    scope: 'node-default', connections: saved ? saved.connections.map(item => ({ id: item.id, name: item.name, ...redacted(item.config) }))
      : [{ id: 'default', name: 'Default connection', ...redacted(initial) }], history: saved?.history || [] });
  const checkedRevision = input => {
    if (input.expectedRevision !== snapshot().revision) fail('Connection changed. Reload settings before saving.', 409);
  };
  const makeConfig = async (input, current = {}) => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => ![...fields, 'clearApiKey'].includes(key))) fail('Unknown provider setting');
    if (input.clearApiKey !== undefined && typeof input.clearApiKey !== 'boolean') fail('Invalid clear-key selection');
    if (input.apiKey !== undefined && typeof input.apiKey !== 'string') fail('Invalid API key');
    const next = validate({ enabled: input.enabled, baseUrl: input.baseUrl, model: input.model,
      timeoutMs: input.timeoutMs, ...(input.temperature == null ? {} : { temperature: input.temperature }),
      ...(input.maxTokens == null ? {} : { maxTokens: input.maxTokens }),
      apiKey: input.clearApiKey ? '' : (input.apiKey || current.apiKey || '') });
    if (input.clearApiKey && input.apiKey) fail('Choose a replacement key or clear it, not both');
    if (current.apiKey && next.baseUrl !== (current.baseUrl || '').replace(/\/$/, '') && !input.apiKey && !input.clearApiKey) fail('For a different endpoint, enter a new key or explicitly clear the saved key');
    await resolveEndpoint(next.baseUrl);
    return next;
  };
  const commit = async (connections, activeId, type, connectionId, passphrase, roomBindings = saved?.roomBindings || {}, roomId) => {
    const revision = randomUUID(); const updatedAt = new Date().toISOString();
    const value = { format: 'arkive-node-provider', version: 3, revision, updatedAt, activeId, connections, roomBindings,
      history: [...(saved?.history || []), { type, connectionId, revision, at: updatedAt, ...(roomId ? { roomId } : {}) }].slice(-100) };
    const temporary = path.join(directory, `.provider-settings-${randomUUID()}.tmp`);
    let handle;
    try {
      const encrypted = await encrypt(value, passphrase);
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(encrypted)); await handle.sync(); await handle.close(); handle = null;
      await rename(temporary, filename); saved = value;
    } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
  };
  return {
    config, snapshot, registry,
    binding(roomId) { return saved && Object.hasOwn(saved.roomBindings, roomId) ? saved.roomBindings[roomId] : null; },
    bind(roomId, input, passphrase) { return serialize(async () => {
      if (typeof roomId !== 'string' || !/^room_[a-zA-Z0-9_-]{1,95}$/.test(roomId)) fail('Invalid room ID');
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['connectionId', 'expectedRevision'].includes(key))) fail('Unknown chat routing field');
      checkedRevision(input);
      if (input.connectionId !== null && (typeof input.connectionId !== 'string' || !saved?.connections.some(item => item.id === input.connectionId && item.config.enabled))) fail('Choose a saved, enabled connection, or follow the node default');
      if (!saved) {
        if (input.connectionId === null) return;
        fail('Save a connection before pinning it to a chat');
      }
      const roomBindings = { ...saved.roomBindings };
      if (input.connectionId === null) delete roomBindings[roomId];
      else roomBindings[roomId] = input.connectionId;
      if (Object.keys(roomBindings).length > 1000) fail('Room connection limit reached (1000)');
      await commit(saved.connections, saved.activeId, input.connectionId === null ? 'unrouted' : 'routed', input.connectionId || saved.activeId, passphrase, roomBindings, roomId);
    }); },
    clear() { saved = null; },
    async load(passphrase) {
      let handle;
      try { handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
      catch (error) { if (error.code === 'ENOENT') { saved = null; return; } fail('Cannot read encrypted node settings', 500); }
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > 512 * 1024) fail('Invalid encrypted node settings', 500);
        const value = await decrypt(JSON.parse(await handle.readFile('utf8')), passphrase);
        if (value?.format !== 'arkive-node-provider' || ![1, 2, 3].includes(value.version) || typeof value.revision !== 'string' || typeof value.updatedAt !== 'string') fail('Invalid encrypted node settings', 500);
        const connections = value.version === 1 ? [{ id: 'default', name: 'Default connection', config: validate(value.config) }] : value.connections;
        if (!Array.isArray(connections) || !connections.length || connections.length > 20) fail('Invalid connections');
        const ids = new Set(); const names = new Set();
        const validated = connections.map(item => {
          if (!item || !/^(default|connection_[0-9a-f-]{36})$/.test(item.id) || ids.has(item.id)) fail('Invalid connection ID');
          const name = connectionName(item.name); if (names.has(name.toLowerCase())) fail('Duplicate connection name');
          ids.add(item.id); names.add(name.toLowerCase()); return { id: item.id, name, config: validate(item.config) };
        });
        const activeId = value.version === 1 ? 'default' : value.activeId;
        if (!ids.has(activeId)) fail('Invalid active connection');
        const history = value.version === 1 ? [] : value.history;
        if (!Array.isArray(history) || history.length > 100 || history.some(row => !row || !['saved', 'created', 'activated', 'routed', 'unrouted'].includes(row.type) || !ids.has(row.connectionId) || typeof row.revision !== 'string' || typeof row.at !== 'string' || (row.roomId !== undefined && (typeof row.roomId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.roomId))))) fail('Invalid connection history');
        const roomBindings = value.version === 3 ? value.roomBindings : {};
        if (!roomBindings || typeof roomBindings !== 'object' || Array.isArray(roomBindings) || Object.keys(roomBindings).length > 1000 || Object.entries(roomBindings).some(([id, connectionId]) => !/^room_[a-zA-Z0-9_-]{1,95}$/.test(id) || !ids.has(connectionId))) fail('Invalid room connections');
        saved = { format: value.format, version: 3, revision: value.revision, updatedAt: value.updatedAt, activeId, connections: validated, roomBindings: { ...roomBindings },
          history: history.map(({ type, connectionId, revision, at, roomId }) => ({ type, connectionId, revision, at, ...(roomId ? { roomId } : {}) })) };
      } catch { fail('Cannot unlock node settings. Keep the original settings file and verify the Brain passphrase.', 400); }
      finally { await handle.close(); }
    },
    save(input, passphrase) { return serialize(async () => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => ![...fields, 'expectedRevision', 'clearApiKey'].includes(key))) fail('Unknown provider setting');
      checkedRevision(input);
      const { expectedRevision, ...settings } = input;
      const next = await makeConfig(settings, config());
      const id = snapshot().connectionId;
      const connections = saved ? saved.connections.map(item => item.id === id ? { ...item, config: next } : item) : [{ id, name: 'Default connection', config: next }];
      await commit(connections, id, 'saved', id, passphrase);
      return snapshot();
    }); },
    update(input, passphrase) { return serialize(async () => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['action', 'id', 'name', 'config', 'expectedRevision', 'confirmActivation'].includes(key))) fail('Unknown connection field');
      checkedRevision(input);
      if (input.action === 'activate') {
        if (input.confirmActivation !== true || input.name !== undefined || input.config !== undefined) fail('Confirm switching the node default');
        const target = saved?.connections.find(item => item.id === input.id);
        if (!target || !target.config.enabled) fail('Choose a saved, enabled connection');
        await commit(saved.connections, target.id, 'activated', target.id, passphrase);
      } else if (input.action === 'save') {
        if (input.confirmActivation !== undefined) fail('Saving does not activate a connection');
        const name = connectionName(input.name);
        const previous = input.id ? saved?.connections.find(item => item.id === input.id) : null;
        if (input.id && !previous) fail('Connection not found', 404);
        if (!saved) fail('Save the default connection before adding others');
        if (saved.connections.some(item => item.id !== previous?.id && item.name.toLowerCase() === name.toLowerCase())) fail('Choose a unique connection name');
        if (!previous && saved.connections.length >= 20) fail('Connection limit reached (20)');
        const next = await makeConfig(input.config, previous?.config);
        const id = previous?.id || `connection_${randomUUID()}`;
        const row = { id, name, config: next };
        const connections = previous ? saved.connections.map(item => item.id === id ? row : item) : [...saved.connections, row];
        await commit(connections, saved.activeId, previous ? 'saved' : 'created', id, passphrase);
      } else fail('Unknown connection action');
      return registry();
    }); },
    async check(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['expectedRevision', 'allowExternal', 'connectionId'].includes(key)) || input.allowExternal !== true) fail('Confirm the model-list request first');
      if (input.expectedRevision !== snapshot().revision) fail('Connection changed. Reload settings before testing.', 409);
      const revision = snapshot().revision;
      const target = input.connectionId === undefined ? null : saved?.connections.find(item => item.id === input.connectionId);
      if (input.connectionId !== undefined && !target) fail('Choose a saved connection', 404);
      const c = target ? { ...config(), ...target.config, connectionId: target.id } : config();
      if (c.enabled === false || !c.baseUrl || !c.model) fail('Save and enable a connection first');
      const endpoint = new URL(c.baseUrl); endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/models`;
      let result;
      try {
        await resolveEndpoint(endpoint.href);
        result = await (c.request || requestJson)(endpoint.href, { headers: c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}, timeoutMs: Math.min(c.timeoutMs || 15000, 15000), maxBytes: 512 * 1024, signal: c.signal });
        if (!Array.isArray(result?.data)) throw new Error();
      } catch { fail('Model-list check failed. Verify the endpoint, key and /models support. No Brain content was sent.', 502); }
      if (revision !== snapshot().revision) fail('Connection changed during discovery. Reload and check again.', 409);
      const models = [...new Set(result.data.filter(item => typeof item?.id === 'string' && item.id.length > 0 && item.id.length <= 200 && !/[\x00-\x20\x7f]/.test(item.id) && (!c.apiKey || !item.id.includes(c.apiKey))).map(item => item.id))].slice(0, 500);
      return { checkedAt: new Date().toISOString(), revision, connectionId: c.connectionId, models, modelListed: models.includes(c.model), completionVerified: false };
    },
  };
}

function connectionName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 80 || /[\x00-\x1f\x7f]/.test(value)) fail('Enter a connection name of 1–80 characters');
  return value.trim();
}
