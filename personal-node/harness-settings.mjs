import { open, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { resolveEndpoint, requestJson } from './execution.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { code: 'HARNESS_SETTINGS', status }); };
const idPattern = /^harness_[0-9a-f-]{36}$/;
const featureNames = ['run_submission', 'run_status', 'run_events_sse', 'run_stop', 'run_steer', 'run_approval_response', 'tool_progress_events', 'approval_events', 'session_resources', 'model_options', 'session_chat', 'session_fork', 'session_model_lock', 'reasoning_streaming', 'skills_api', 'audio_api', 'realtime_voice', 'jobs_admin', 'memory_write_api'];
const clean = (value, max = 160, secret = '') => typeof value === 'string' ? (secret ? value.replaceAll(secret, '[redacted]') : value).replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max) : '';
function config(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['name', 'baseUrl', 'token', 'enabled'].includes(key))) fail('Unknown harness configuration');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 || /[\x00-\x1f\x7f]/.test(value.name)) fail('Enter a gateway name of 1–80 characters');
  let url; try { url = new URL(value.baseUrl); } catch { fail('Enter the Hermes API server origin'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) fail('Use an HTTPS origin or localhost HTTP origin, without a path, credentials, query or fragment');
  if (typeof value.enabled !== 'boolean') fail('Choose whether this gateway is enabled');
  if (typeof value.token !== 'string' || value.token.length > 8192 || /[\x00-\x20\x7f]/.test(value.token)) fail('Invalid gateway bearer key');
  if (value.enabled && !value.token) fail('Enabled Hermes gateways require a dedicated bearer key');
  return { name: value.name.trim(), baseUrl: url.origin, token: value.token, enabled: value.enabled };
}
function features(value) {
  if (!value || value.object !== 'hermes.api_server.capabilities' || value.platform !== 'hermes-agent' || value.runtime?.mode !== 'server_agent' || typeof value.features !== 'object' || !value.features || Array.isArray(value.features)) throw new Error('Unrecognized gateway');
  return { platform: 'hermes-agent', runtime: 'server_agent', authenticationRequired: value.auth?.required === true,
    flags: Object.fromEntries(featureNames.map(name => [name, value.features[name] === true])) };
}
function inventory(value, kind, secret) {
  if (!value || !Array.isArray(value.data)) throw new Error('Invalid inventory');
  const limit = kind === 'skills' ? 500 : 200;
  const rows = []; const seen = new Set();
  for (const item of value.data) {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) continue;
    const name = clean(item.name, 160, secret); if (seen.has(name)) continue; seen.add(name);
    if (rows.length === limit) break;
    rows.push({ name, description: clean(item.description, 512, secret),
      ...(kind === 'skills' ? { category: clean(item.category, 100, secret) } : {
        enabled: item.enabled === true, configured: item.configured === true,
        tools: Array.isArray(item.tools) ? [...new Set(item.tools.filter(value => typeof value === 'string').map(value => clean(value, 160, secret)))].slice(0, 100) : [],
        toolsReported: Array.isArray(item.tools) ? item.tools.length : 0,
      }) });
  }
  return { rows, reported: value.data.length, truncated: value.data.length > rows.length };
}

/** Read-only Hermes inventory bridge. Never submits a run, launches a process or grants tools. */
export function createHarnessSettings({ directory, encrypt, decrypt, signal, request = requestJson }) {
  const filename = path.join(directory, 'harness-settings.enc');
  let state = { revision: 'empty', connections: [], history: [] };
  let queue = Promise.resolve(); let epoch = 0;
  const guard = generation => { if (generation !== epoch || signal?.aborted) fail('Harness settings session changed', 409); };
  const serialize = task => { const generation = epoch; const promise = queue.then(() => { guard(generation); return task(generation); }); queue = promise.catch(() => {}); return promise; };
  const snapshot = () => structuredClone({ revision: state.revision, scope: 'node-local', executionEnabled: false,
    connections: state.connections.map(({ token, ...row }) => ({ ...row, hasToken: Boolean(token) })), history: state.history });
  const checked = input => { if (input.expectedRevision !== state.revision) fail('Gateway settings changed. Reload before applying.', 409); };
  const commit = async (connections, type, id, passphrase, generation) => {
    const revision = randomUUID(); const at = new Date().toISOString();
    const value = { format: 'arkive-harness-settings', version: 1, revision, connections,
      history: [...state.history, { type, id, at, revision }].slice(-100) };
    if (Buffer.byteLength(JSON.stringify(value)) > 1024 * 1024) fail('Gateway inventory storage limit reached; reduce the installed catalog');
    const temporary = path.join(directory, `.harness-settings-${randomUUID()}.tmp`); let handle;
    try {
      const encrypted = await encrypt(value, passphrase); guard(generation);
      handle = await open(temporary, 'wx', 0o600); await handle.writeFile(JSON.stringify(encrypted)); await handle.sync(); await handle.close(); handle = null;
      guard(generation); await rename(temporary, filename); guard(generation); state = value;
    } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
  };
  return {
    snapshot,
    clear() { epoch++; state = { revision: 'empty', connections: [], history: [] }; },
    async load(passphrase) {
      let handle;
      try { handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
      catch (error) { if (error.code === 'ENOENT') return; fail('Cannot read encrypted harness settings', 500); }
      try {
        const stat = await handle.stat(); if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error();
        const value = await decrypt(JSON.parse(await handle.readFile('utf8')), passphrase);
        if (value?.format !== 'arkive-harness-settings' || value.version !== 1 || typeof value.revision !== 'string' || !Array.isArray(value.connections) || value.connections.length > 10 || !Array.isArray(value.history) || value.history.length > 100) throw new Error();
        const ids = new Set(); const names = new Set();
        const connections = value.connections.map(row => {
          if (!row || !idPattern.test(row.id) || ids.has(row.id)) throw new Error();
          const c = config({ name: row.name, baseUrl: row.baseUrl, token: row.token, enabled: row.enabled });
          if (names.has(c.name.toLowerCase())) throw new Error(); ids.add(row.id); names.add(c.name.toLowerCase());
          // Inventory is an observation, not a persisted authority grant. Reload requires a fresh probe.
          return { id: row.id, ...c, observation: null };
        });
        const history = value.history.map(row => {
          if (!row || !['save', 'probe', 'remove'].includes(row.type) || !idPattern.test(row.id) || typeof row.at !== 'string' || typeof row.revision !== 'string') throw new Error();
          return { type: row.type, id: row.id, at: row.at, revision: row.revision };
        });
        state = { revision: value.revision, connections, history };
      } catch { fail('Cannot unlock harness settings. Preserve the file and verify the Brain passphrase.', 400); }
      finally { await handle.close(); }
    },
    update(input, passphrase) { return serialize(async generation => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['action', 'id', 'name', 'baseUrl', 'token', 'clearToken', 'enabled', 'expectedRevision', 'confirm'].includes(key))) fail('Unknown gateway setting');
      checked(input);
      if (input.confirm !== true) fail('Confirm the gateway settings change');
      const previous = state.connections.find(row => row.id === input.id);
      if (input.id && !previous) fail('Gateway not found', 404);
      if (input.action === 'remove') {
        if (!previous || Object.keys(input).some(key => !['action', 'id', 'expectedRevision', 'confirm'].includes(key))) fail('Invalid gateway removal');
        await commit(state.connections.filter(row => row.id !== input.id), 'remove', input.id, passphrase, generation);
      } else if (input.action === 'save') {
        if (input.clearToken !== undefined && typeof input.clearToken !== 'boolean') fail('Invalid clear-key selection');
        if (input.token !== undefined && typeof input.token !== 'string') fail('Invalid gateway key');
        if (input.token && input.clearToken) fail('Replace or clear the key, not both');
        const next = config({ name: input.name, baseUrl: input.baseUrl, enabled: input.enabled,
          token: input.clearToken ? '' : input.token || previous?.token || '' });
        if (previous?.token && previous.baseUrl !== next.baseUrl && !input.token && !input.clearToken) fail('Enter a replacement key or explicitly clear it when changing the gateway origin');
        if (state.connections.some(row => row.id !== input.id && row.name.toLowerCase() === next.name.toLowerCase())) fail('Choose a unique gateway name');
        if (!previous && state.connections.length >= 10) fail('Gateway limit reached (10)');
        const row = { id: previous?.id || `harness_${randomUUID()}`, ...next, observation: null };
        await commit(previous ? state.connections.map(item => item.id === row.id ? row : item) : [...state.connections, row], 'save', row.id, passphrase, generation);
      } else fail('Unknown gateway action');
      return snapshot();
    }); },
    probe(input, passphrase) { return serialize(async generation => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['id', 'expectedRevision', 'allowExternal'].includes(key)) || input.allowExternal !== true) fail('Confirm gateway metadata requests first');
      checked(input); const connection = state.connections.find(row => row.id === input.id);
      if (!connection || !connection.enabled) fail('Choose an enabled saved gateway');
      const get = async endpoint => {
        const url = `${connection.baseUrl}${endpoint}`;
        const deadline = AbortSignal.timeout(10000);
        const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
        // The real transport validates and pins DNS; injected test transports still validate destinations.
        if (request !== requestJson) await resolveEndpoint(url);
        return request(url, { method: 'GET', headers: connection.token ? { Authorization: `Bearer ${connection.token}` } : {}, timeoutMs: 10000, maxBytes: 1024 * 1024, signal: requestSignal });
      };
      let observation;
      try {
        const descriptor = features(await get('/v1/capabilities'));
        const parts = await Promise.allSettled(['/v1/skills', '/v1/toolsets'].map(endpoint => get(endpoint)));
        const read = (index, kind) => {
          try { if (parts[index].status !== 'fulfilled') throw new Error(); return { status: 'available', ...inventory(parts[index].value, kind, connection.token) }; }
          catch { return { status: 'unavailable', rows: [], reported: 0, truncated: false }; }
        };
        const skills = read(0, 'skills'); const toolsets = read(1, 'toolsets');
        observation = { checkedAt: new Date().toISOString(), status: skills.status === 'available' && toolsets.status === 'available' ? 'reachable' : 'partial', descriptor, skills, toolsets };
      } catch {
        observation = { checkedAt: new Date().toISOString(), status: 'failed', message: 'Gateway check failed. Verify the API-server origin, bearer key, network and supported Hermes version. No Brain data was sent.' };
      }
      guard(generation);
      await commit(state.connections.map(row => row.id === connection.id ? { ...row, observation } : row), 'probe', connection.id, passphrase, generation);
      return snapshot();
    }); },
  };
}
