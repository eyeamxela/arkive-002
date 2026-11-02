import { open, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { requestJson, resolveEndpoint } from './execution.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { code: 'CHANNEL_SETTINGS', status }); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => { if (!plain(value) || Object.keys(value).some(key => !keys.includes(key))) fail('Unknown channel setting'); };
const text = (value, max = 300) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max) : '';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const platformId = /^[a-z][a-z0-9_-]{0,79}$/;

function configuration(input) {
  let url; try { url = new URL(input.baseUrl); } catch { fail('Enter the Hermes dashboard origin'); }
  // Dashboard session-token auth is documented for loopback only. Do not send it to an OAuth-gated public deployment.
  if (!['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.username || url.password || url.search || url.hash) fail('Use a localhost dashboard origin (or a local SSH tunnel), without a path');
  // Pin the conventional local alias to a literal address, never trust a modified resolver for an admin secret.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  if (typeof input.token !== 'string' || !input.token || input.token.length > 8192 || /[\x00-\x20\x7f]/.test(input.token)) fail('Enter the dashboard session token, not the agent API key');
  if (typeof input.profile !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(input.profile) || ['current', 'custom'].includes(input.profile)) fail('Choose an explicit Hermes profile, such as default');
  return { baseUrl: url.origin, token: input.token, profile: input.profile };
}

/** Narrow owner-only adapter for Hermes Desktop's documented messaging REST surface.
 * No generic URL/config proxy, Brain context, credential readback or automatic service start.
 */
export function createChannelSettings({ directory, encrypt, decrypt, signal, request = requestJson }) {
  const filename = path.join(directory, 'channel-settings.enc');
  let state = { revision: 'empty', connection: null, history: [] };
  let catalog = null; let epoch = 0; let queue = Promise.resolve(); let session = new AbortController();
  const guard = generation => { if (generation !== epoch || signal?.aborted) fail('Channel settings session changed', 409); };
  const serial = action => { const generation = epoch; const work = queue.then(() => { guard(generation); return action(generation); }); queue = work.catch(() => {}); return work; };
  const snapshot = () => structuredClone({ revision: state.revision, connection: state.connection ? { baseUrl: state.connection.baseUrl, profile: state.connection.profile, hasToken: true } : null, catalog, history: state.history });
  const checked = input => { if (input.expectedRevision !== state.revision) fail('Management connection changed. Reload before continuing.', 409); };
  const commit = async (connection, entry, passphrase, generation) => {
    const next = { format: 'arkive-channel-settings', version: 1, revision: randomUUID(), connection, history: [...state.history, { ...entry, at: new Date().toISOString() }].slice(-100) };
    const temp = path.join(directory, `.channel-settings-${randomUUID()}.tmp`); let handle;
    try {
      const sealed = await encrypt(next, passphrase); guard(generation);
      handle = await open(temp, 'wx', 0o600); await handle.writeFile(JSON.stringify(sealed)); await handle.sync(); await handle.close(); handle = null;
      guard(generation); await rename(temp, filename); guard(generation); state = next;
    } finally { await handle?.close(); await unlink(temp).catch(() => {}); }
  };
  const remote = async (route, method = 'GET', body) => {
    if (!state.connection) fail('Connect the Hermes dashboard first', 409);
    const c = state.connection; const url = `${c.baseUrl}${route}?profile=${encodeURIComponent(c.profile)}`;
    const requestSignal = AbortSignal.any([session.signal, ...(signal ? [signal] : []), AbortSignal.timeout(15000)]);
    if (request !== requestJson) await resolveEndpoint(url);
    try { return await request(url, { method, headers: { 'X-Hermes-Session-Token': c.token }, ...(body ? { body } : {}), signal: requestSignal, timeoutMs: 15000, maxBytes: 1024 * 1024 }); }
    catch { fail('Hermes management request failed. Check the dashboard origin, session token and profile. A submitted change may have applied; reload status before retrying.', 502); }
  };
  const readCatalog = async generation => {
    const value = await remote('/api/messaging/platforms'); guard(generation);
    if (!plain(value) || !Array.isArray(value.platforms) || value.platforms.length > 100) fail('This endpoint did not return a Hermes channel catalog', 502);
    const ids = new Set();
    const platforms = value.platforms.map(row => {
      if (!plain(row) || !platformId.test(row.id) || ids.has(row.id) || !Array.isArray(row.env_vars) || row.env_vars.length > 100 || ['enabled', 'configured', 'gateway_running'].some(key => typeof row[key] !== 'boolean')) fail('Invalid Hermes channel descriptor', 502);
      ids.add(row.id); const keys = new Set();
      // Never forward secret values/previews, arbitrary URLs, paths or server error bodies.
      const fields = row.env_vars.map(field => {
        if (!plain(field) || !/^[A-Z][A-Z0-9_]{0,99}$/.test(field.key) || keys.has(field.key)) fail('Invalid Hermes channel field', 502);
        keys.add(field.key);
        const isList = field.is_list === true && /_ALLOWED_(USERS|GUILDS|GROUPS|CHANNELS)$/.test(field.key);
        return { key: field.key, label: text(field.prompt, 100) || field.key, help: text(field.description), required: field.required === true, secret: field.is_password === true || /TOKEN|SECRET|PASSWORD|KEY/.test(field.key), isSet: field.is_set === true, advanced: field.advanced === true, isList, value: isList ? text(field.value, 4096) : '' };
      });
      const result = { id: row.id, name: text(row.name, 80) || row.id, description: text(row.description), enabled: row.enabled, configured: row.configured, gatewayRunning: row.gateway_running, state: text(row.state, 60) || 'unknown', fields };
      // Include redacted previews in a one-way change token, not in the UI, to detect concurrent credential edits where possible.
      return { ...result, version: digest([result, row.env_vars.map(field => field.redacted_value ?? null)]) };
    });
    catalog = { checkedAt: new Date().toISOString(), platforms }; return catalog;
  };
  return {
    snapshot,
    clear() { epoch++; session.abort(); session = new AbortController(); state = { revision: 'empty', connection: null, history: [] }; catalog = null; },
    async load(passphrase) {
      let handle; try { handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
      catch (error) { if (error.code === 'ENOENT') return; fail('Cannot read channel settings', 500); }
      try {
        const stat = await handle.stat(); if (!stat.isFile() || stat.size > 512 * 1024) throw new Error();
        const value = await decrypt(JSON.parse(await handle.readFile('utf8')), passphrase);
        if (value.format !== 'arkive-channel-settings' || value.version !== 1 || typeof value.revision !== 'string' || !Array.isArray(value.history) || value.history.length > 100) throw new Error();
        state = { revision: value.revision, connection: value.connection ? configuration(value.connection) : null, history: value.history.map(row => ({ action: text(row.action, 30), platform: text(row.platform, 80), at: text(row.at, 40) })) }; catalog = null;
      } catch { fail('Cannot unlock channel settings; preserve the file and verify your passphrase'); }
      finally { await handle.close(); }
    },
    configure(input, passphrase) { return serial(async generation => {
      only(input, ['baseUrl', 'profile', 'token', 'expectedRevision', 'confirm', 'disconnect']); checked(input);
      if (input.confirm !== true) fail('Confirm this management connection change');
      if (input.disconnect !== undefined && typeof input.disconnect !== 'boolean') fail('Invalid disconnect selection');
      if (input.disconnect) { await commit(null, { action: 'disconnect' }, passphrase, generation); catalog = null; return snapshot(); }
      if (state.connection && (input.baseUrl !== state.connection.baseUrl || input.profile !== state.connection.profile) && !input.token) fail('Re-enter the session token when changing the origin or profile');
      const c = configuration({ ...input, token: input.token || state.connection?.token });
      await commit(c, { action: 'configure' }, passphrase, generation); catalog = null; return snapshot();
    }); },
    refresh(input) { return serial(async generation => {
      only(input, ['expectedRevision', 'allowExternal']); checked(input);
      if (input.allowExternal !== true) fail('Confirm reading Hermes channel metadata');
      catalog = null; await readCatalog(generation); return snapshot();
    }); },
    restart(input, passphrase) { return serial(async generation => {
      only(input, ['expectedRevision', 'confirm']); checked(input);
      if (input.confirm !== true || !catalog) fail('Load channels and confirm restarting the Hermes messaging gateway');
      let result; try { result = await remote('/api/gateway/restart', 'POST', {}); guard(generation); }
      finally { catalog = null; }
      if (result?.ok !== true) fail('Hermes did not acknowledge the restart request', 502);
      await commit(state.connection, { action: 'restart-requested' }, passphrase, generation);
      return { ...snapshot(), result: { restartRequested: true } };
    }); },
    operate(input, passphrase) { return serial(async generation => {
      only(input, ['expectedRevision', 'expectedVersion', 'platform', 'action', 'env', 'clear', 'enabled', 'confirm']); checked(input);
      if (input.confirm !== true) fail('Confirm the Hermes channel action');
      if (!platformId.test(input.platform) || !['save', 'toggle', 'test'].includes(input.action)) fail('Invalid channel action');
      if (!catalog) fail('Load channels before applying a change', 409);
      const fresh = await readCatalog(generation); const row = fresh.platforms.find(row => row.id === input.platform);
      if (!row) fail('Channel is no longer reported by Hermes', 409);
      if (input.expectedVersion !== row.version) fail('Channel changed in Hermes. Reload and review before applying.', 409);
      const route = `/api/messaging/platforms/${row.id}`;
      if (input.action === 'test') {
        const result = await remote(`${route}/test`, 'POST', {}); guard(generation);
        // Do not return arbitrary upstream messages that might contain credential fragments.
        return { ...snapshot(), result: { ok: result?.ok === true, state: text(result?.state, 60) || 'unknown', authPosture: text(result?.auth_posture, 60) || 'unknown' } };
      }
      let body;
      if (input.action === 'toggle') {
        if (typeof input.enabled !== 'boolean' || input.env || input.clear) fail('Invalid channel enablement');
        if (input.enabled && !row.configured) fail('Save the required credentials before enabling this channel');
        if (input.enabled && row.id === 'telegram' && !row.fields.find(field => field.key === 'TELEGRAM_ALLOWED_USERS')?.value.trim()) fail('Set allowed Telegram user IDs before enabling');
        body = { enabled: input.enabled };
      } else {
        if (input.enabled !== undefined) fail('Enable the channel separately after saving');
        const env = input.env ?? {}; const clear = input.clear ?? [];
        if (!plain(env) || !Array.isArray(clear) || clear.length > 100 || Object.keys(env).length > 100) fail('Invalid channel fields');
        const fields = new Map(row.fields.map(field => [field.key, field]));
        for (const [key, value] of Object.entries(env)) {
          if (!fields.has(key) || typeof value !== 'string' || !value.trim() || value.length > 8192 || /[\x00-\x1f\x7f]/.test(value) || clear.includes(key)) fail('Invalid channel field value');
          if (key === 'TELEGRAM_ALLOWED_USERS' && !/^\d{3,20}(\s*,\s*\d{3,20})*$/.test(value.trim())) fail('Telegram user IDs must be numeric, separated by commas');
          if (/_ALLOW_ALL_USERS$/.test(key) && !['false', '0', 'no'].includes(value.toLowerCase())) fail('Public access must be configured explicitly in Hermes; use an allowlist here');
        }
        if (clear.some(key => typeof key !== 'string' || !fields.has(key)) || new Set(clear).size !== clear.length) fail('Invalid clear-field selection');
        if (!Object.keys(env).length && !clear.length) fail('No field changes to save');
        if (row.enabled && row.id === 'telegram' && clear.includes('TELEGRAM_ALLOWED_USERS')) fail('Disable Telegram before removing its allowlist');
        body = { env, clear_env: clear };
      }
      let result;
      try { result = await remote(route, 'PUT', body); guard(generation); if (result?.ok !== true) fail('Hermes did not acknowledge the update', 502); }
      finally { catalog = null; } // An uncertain outcome must never offer a blind replay.
      await commit(state.connection, { action: input.action, platform: row.id }, passphrase, generation);
      // Persisted is not connected. Readback may fail after a successful write; return that distinction.
      let readback = true; try { await readCatalog(generation); } catch { readback = false; } guard(generation);
      return { ...snapshot(), result: { saved: true, readback, hotServed: result.hot_served === true, needsRestart: result.hot_served !== true } };
    }); },
  };
}
