import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { access, mkdir } from 'node:fs/promises';
import { randomBytes, scrypt as scryptCallback, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { openBrain, restoreBrain } from './brain.mjs';
import { describeProviders, executeChat, requestJson } from './execution.mjs';
import { validateFolder, refreshFolder } from './folders.mjs';
import { servePersonalUi } from './static.mjs';
import { createSourceRoutes } from './sources.mjs';

const scrypt = promisify(scryptCallback);
// Encrypted exports add base64 overhead to the 32 MiB plaintext Brain limit.
const BODY_LIMIT = 48 * 1024 * 1024;
const DEFAULT_ORIGINS = ['http://127.0.0.1:1420', 'http://localhost:1420',
  'http://127.0.0.1:1421', 'http://localhost:1421', 'tauri://localhost',
  'http://tauri.localhost', 'https://tauri.localhost'];

function fault(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
function equalToken(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(received); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function initialized(directory) {
  try { await access(path.join(directory, 'brain.enc')); return true; } catch { return false; }
}
function validatePassphrase(passphrase, create = false) {
  if (typeof passphrase !== 'string' || !passphrase || passphrase.length > 1024 ||
    (create && passphrase.length < 12)) throw fault('PASSPHRASE_INVALID', 'Use a passphrase of at least 12 characters when creating a Brain');
}
export async function encryptExport(bundle, passphrase) {
  const salt = randomBytes(32); const nonce = randomBytes(12);
  const key = await scrypt(passphrase, salt, 32);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from('arkive-encrypted-export:1'));
    const data = Buffer.concat([cipher.update(JSON.stringify(bundle), 'utf8'), cipher.final()]);
    return { format: 'arkive-encrypted-export', version: 1, kdf: 'scrypt', cipher: 'aes-256-gcm',
      salt: salt.toString('base64'), nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  } finally { key.fill(0); }
}
export async function decryptExport(envelope, passphrase) {
  if (envelope?.format !== 'arkive-encrypted-export' || envelope.version !== 1 || envelope.kdf !== 'scrypt' ||
    envelope.cipher !== 'aes-256-gcm' || ['salt', 'nonce', 'tag', 'data'].some((key) => typeof envelope[key] !== 'string')) {
    throw fault('EXPORT_INVALID', 'Expected an encrypted Arkive export');
  }
  const salt = Buffer.from(envelope.salt, 'base64'); const nonce = Buffer.from(envelope.nonce, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  if (salt.length !== 32 || nonce.length !== 12 || tag.length !== 16 || envelope.data.length > BODY_LIMIT) {
    throw fault('EXPORT_INVALID', 'Invalid encrypted export');
  }
  const key = await scrypt(passphrase, salt, 32);
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from('arkive-encrypted-export:1')); cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.data, 'base64')), cipher.final()]).toString('utf8'));
  } catch { throw fault('EXPORT_AUTH', 'Incorrect passphrase or damaged encrypted export'); }
  finally { key.fill(0); }
}

async function readBody(req, limit = BODY_LIMIT) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw fault('CONTENT_TYPE', 'Content-Type must be application/json', 415);
  }
  if (Number(req.headers['content-length']) > limit) throw fault('BODY_LIMIT', 'Request exceeds size limit', 413);
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw fault('BODY_LIMIT', 'Request exceeds size limit', 413);
    chunks.push(chunk);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch { throw fault('JSON_INVALID', 'Expected a JSON object'); }
}

/** A single-owner node. The sync credential is deliberately narrower than the owner credential. */
export async function createNodeServer(options = {}) {
  const directory = path.resolve(options.directory || process.env.ARKIVE_BRAIN_DIR || path.join(os.homedir(), '.arkive', 'brain'));
  const host = options.host ?? process.env.ARKIVE_HOST ?? '127.0.0.1';
  const port = Number(options.port ?? process.env.ARKIVE_PORT ?? 0);
  const allowRemote = options.allowRemote ?? process.env.ARKIVE_ALLOW_REMOTE === 'true';
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !allowRemote) {
    throw new Error('Remote bind requires explicit ARKIVE_ALLOW_REMOTE=true and a TLS reverse proxy');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const token = options.token ?? process.env.ARKIVE_TOKEN ?? randomBytes(32).toString('hex');
  const syncToken = options.syncToken ?? process.env.ARKIVE_SYNC_TOKEN;
  if (typeof token !== 'string' || token.length < 32 || (syncToken && (syncToken.length < 32 || equalToken(syncToken, token)))) {
    throw new Error('Owner/sync tokens must contain at least 32 characters and must be different');
  }
  const origins = new Set(options.allowedOrigins || (process.env.ARKIVE_ALLOWED_ORIGINS
    ? process.env.ARKIVE_ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean) : DEFAULT_ORIGINS));
  if (origins.has('*') || origins.has('null')) throw new Error('Wildcard and null browser origins are not allowed');
  const shutdown = new AbortController();
  const provider = { ...(options.provider || { baseUrl: process.env.ARKIVE_MODEL_BASE_URL,
    apiKey: process.env.ARKIVE_MODEL_API_KEY, model: process.env.ARKIVE_MODEL }), signal: shutdown.signal };
  const staticDirectory = options.staticDirectory || process.env.ARKIVE_UI_DIR;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let store = null; let passphrase = null; let queue = Promise.resolve();
  const sources = createSourceRoutes({ getStore: () => store,
    local: ['127.0.0.1', '::1', 'localhost'].includes(host), signal: shutdown.signal, request: options.githubRequest });
  let unlockFailures = 0; let unlockBlockedUntil = 0;
  const send = (res, status, body) => {
    if (res.destroyed) return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(JSON.stringify(body));
  };
  const status = async () => ({ locked: !store, initialized: Boolean(store) || await initialized(directory),
    nodeId: store ? (await store.snapshot()).brainId : null, providers: describeProviders(provider) });
  const lock = async () => { sources.clear(); if (store) await store.close(); store = null; passphrase = null; };
  if (options.passphrase || process.env.ARKIVE_BRAIN_PASSPHRASE) {
    passphrase = options.passphrase || process.env.ARKIVE_BRAIN_PASSPHRASE;
    store = await openBrain(directory, passphrase);
  }
  async function dispatch(req, res, route, peer) {
    shutdown.signal.throwIfAborted();
    const method = req.method;
    if (route === '/v1/status' && method === 'GET') return send(res, 200, await status());
    if (route === '/v1/unlock' && method === 'POST') {
      if (Date.now() < unlockBlockedUntil) throw fault('UNLOCK_THROTTLED', 'Too many unlock attempts; try again in one minute', 429);
      const body = await readBody(req, 8192);
      validatePassphrase(body.passphrase, body.create === true);
      if (store) throw fault('ALREADY_UNLOCKED', 'Lock the Brain before opening another session', 409);
      try { store = await openBrain(directory, body.passphrase,
        { create: body.create === true, template: body.template, name: body.name }); }
      catch (error) { if (++unlockFailures >= 5) { unlockBlockedUntil = Date.now() + 60_000; unlockFailures = 0; } throw error; }
      passphrase = body.passphrase; unlockFailures = 0;
      return send(res, 200, await status());
    }
    if (route === '/v1/lock' && method === 'POST') { await lock(); return send(res, 200, await status()); }
    if (route === '/v1/restore' && method === 'POST') {
      if (store || await initialized(directory)) throw fault('RESTORE_NOT_EMPTY', 'Restore is only allowed into an empty Brain directory', 409);
      const body = await readBody(req); validatePassphrase(body.passphrase);
      const bundle = await decryptExport(body.bundle, body.passphrase);
      store = await restoreBrain(directory, body.passphrase, bundle); passphrase = body.passphrase;
      return send(res, 200, await status());
    }
    if (!store) throw fault('BRAIN_LOCKED', 'Unlock the Brain first', 423);
    if (route === '/v1/replica') {
      if (!peer) throw fault('PEER_CREDENTIAL_REQUIRED', 'A dedicated peer credential is required', 403);
      if (method === 'GET') return send(res, 200, await store.exportReplica());
      if (method === 'POST') {
        const body = await readBody(req);
        return send(res, 200, await store.mergeBundle(body.bundle));
      }
    }
    if (route === '/v1/brain' && method === 'GET') return send(res, 200, await store.snapshot());
    const workspaceRoute = /^\/v1\/workspace\/(tasks|agents|manifests|collections)$/.exec(route);
    if (workspaceRoute && method === 'POST') {
      return send(res, 200, await store.upsertWorkspace(workspaceRoute[1], await readBody(req, 128 * 1024)));
    }
    if (/^\/v1\/(connections(?:\/|$)|writebacks\/|code-graphs$|gitnexus\/)/.test(route)) {
      if (method !== 'POST') throw fault('NOT_FOUND', 'Source endpoint not found', 404);
      return send(res, 200, await sources.handle(route, method, await readBody(req, 2 * 1024 * 1024)));
    }
    if (route === '/v1/folders' && method === 'GET') return send(res, 200, await store.listFolders());
    if (route === '/v1/folders' && method === 'POST') {
      if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw fault('FOLDER_LOCAL_ONLY', 'Folder registration is available only on a loopback node', 403);
      const body = await readBody(req, 8192);
      return send(res, 201, await store.registerFolder({ path: await validateFolder(body.path) }));
    }
    const folder = /^\/v1\/folders\/([^/]+)\/refresh$/.exec(route);
    if (folder && method === 'POST') {
      if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw fault('FOLDER_LOCAL_ONLY', 'Folder refresh is available only on a loopback node', 403);
      return send(res, 200, await refreshFolder(store, folder[1], { signal: shutdown.signal }));
    }
    if (route === '/v1/objects' && method === 'POST') {
      const body = await readBody(req, 2 * 1024 * 1024);
      if (body.kind && !['note', 'document'].includes(body.kind)) throw fault('OBJECT_KIND', 'Use a memory proposal to create reviewed memory');
      if (body.objectId && (await store.snapshot()).objects.some((object) => object.id === body.objectId && object.sourcePath)) {
        throw fault('SOURCE_WRITE_REQUIRED', 'Imported sources retain their original provenance. Use a reviewed source write, refresh, or create a separate note.', 409);
      }
      return send(res, 201, await store.importText({ objectId: body.objectId, title: body.title, text: body.text,
        kind: body.kind || 'note', sourceIds: body.sourceIds }));
    }
    if (route === '/v1/rooms' && method === 'POST') {
      const body = await readBody(req, 8192); return send(res, 201, await store.createRoom({ title: body.title }));
    }
    const room = /^\/v1\/rooms\/([^/]+)\/sources$/.exec(route);
    if (room && method === 'PUT') {
      const body = await readBody(req, 65536); return send(res, 200, await store.selectSources(room[1], body.objectIds));
    }
    const chat = /^\/v1\/rooms\/([^/]+)\/messages$/.exec(route);
    if (chat && method === 'POST') {
      const body = await readBody(req, 65536); return send(res, 200, await executeChat(store, chat[1], body, provider));
    }
    if (route === '/v1/proposals' && method === 'POST') {
      const body = await readBody(req, 2 * 1024 * 1024);
      return send(res, 201, await store.proposeMemory({ title: body.title, text: body.text, sourceIds: body.sourceIds }));
    }
    const proposal = /^\/v1\/proposals\/([^/]+)\/review$/.exec(route);
    if (proposal && method === 'POST') {
      const body = await readBody(req, 8192); return send(res, 200, await store.reviewProposal(proposal[1], body.decision));
    }
    if (route === '/v1/export' && method === 'GET') return send(res, 200, await encryptExport(await store.exportBundle(), passphrase));
    if (route === '/v1/sync' && method === 'POST') {
      const body = await readBody(req, 16384);
      if (typeof body.token !== 'string' || body.token.length < 32) throw fault('PEER_TOKEN_INVALID', 'Provide the peer-specific sync token');
      let url;
      try { url = new URL(body.url); } catch { throw fault('PEER_URL_INVALID', 'Provide a valid peer URL'); }
      if (url.pathname !== '/' || url.search || url.hash) throw fault('PEER_URL_INVALID', 'Use a peer base URL without a path or query');
      url.pathname = '/v1/replica';
      const headers = { Authorization: `Bearer ${body.token}` };
      const remote = await requestJson(url.href, { headers, maxBytes: BODY_LIMIT, signal: shutdown.signal });
      // A mismatched Brain is rejected locally before sending any local source data.
      const pulled = await store.mergeBundle(remote);
      const pushed = await requestJson(url.href, { method: 'POST', headers,
        body: { bundle: await store.exportReplica() }, maxBytes: BODY_LIMIT, signal: shutdown.signal });
      return send(res, 200, { pulled, pushed, note: 'Source/revision replication only. Chat history, folders, approvals and provider settings stay local.' });
    }
    throw fault('NOT_FOUND', 'Endpoint not found', 404);
  }
  const peerWork = new Set();
  const server = http.createServer((req, res) => {
    void handle(req, res).catch(() => send(res, 500, { error: { code: 'SERVER_ERROR', message: 'Node request failed safely' } }));
  });
  async function handle(req, res) {
    let route;
    try { route = new URL(req.url, 'http://localhost').pathname; }
    catch { send(res, 400, { error: { code: 'URL_INVALID', message: 'Invalid request URL' } }); return; }
    if (await servePersonalUi(req, res, route, staticDirectory)) return;
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) { send(res, 403, { error: { code: 'ORIGIN_DENIED', message: 'Browser origin is not allowed' } }); return; }
    const sameOriginBrowser = req.headers['sec-fetch-site'] === 'same-origin' && [...origins].some((value) => {
      try { return new URL(value).host === req.headers.host; } catch { return false; }
    });
    if (!origin && req.headers['sec-fetch-mode'] && !sameOriginBrowser) { send(res, 403, { error: { code: 'ORIGIN_REQUIRED', message: 'Browser requests require an allowed Origin' } }); return; }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(origin ? 204 : 403); res.end(); return; }
    if (route === '/health' && req.method === 'GET') { send(res, 200, { alive: true }); return; }
    const received = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    const peer = route === '/v1/replica' && equalToken(received, syncToken);
    if (!equalToken(received, token) && !peer) { send(res, 401, { error: { code: 'UNAUTHORIZED', message: 'A valid node credential is required' } }); return; }
    // Serialize storage mutations and execution so a lock/revocation cannot race a model dispatch.
    // Peer operations use the store's atomic queue directly. Putting these behind
    // an outbound sync would deadlock two nodes synchronizing simultaneously.
    const work = peer ? dispatch(req, res, route, peer) : queue.then(() => dispatch(req, res, route, peer));
    if (peer) { peerWork.add(work); work.finally(() => peerWork.delete(work)).catch(() => {}); }
    else queue = work.catch(() => {});
    work.catch((error) => {
      const code = typeof error.code === 'string' && /^(BRAIN_|EXPORT_|[A-Z_]+$)/.test(error.code) ? error.code : 'REQUEST_FAILED';
      const safe = error.status || code.startsWith('BRAIN_') || code.startsWith('EXPORT_');
      send(res, error.status || (code === 'BRAIN_LOCKED' ? 423 : code === 'BRAIN_IO' ? 500 : 400), {
        error: { code, message: safe ? error.message : 'Request could not be completed. Check configuration, selected sources and input; no changes were assumed successful.' },
      });
    });
  }
  server.requestTimeout = 60_000; server.headersTimeout = 15_000; server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 32;
  let address;
  return { server, token, directory,
    async start() {
      if (address) return address;
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      address = { port: server.address().port, host, token }; return address;
    },
    async close() {
      shutdown.abort();
      server.closeIdleConnections();
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      await queue; await Promise.allSettled([...peerWork]); await lock();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const desktop = process.argv.includes('--desktop');
  const index = process.argv.indexOf('--data-dir');
  try {
    const node = await createNodeServer({ directory: index >= 0 ? process.argv[index + 1] : undefined });
    const { port, token } = await node.start();
    if (desktop) process.stdout.write(`${JSON.stringify({ port, token })}\n`);
    else process.stdout.write(`Arkive personal node ready on port ${port}; credential not printed. Set ARKIVE_TOKEN to connect.\n`);
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; await node.close(); process.exit(0); };
    // Closing the parent pipe also handles an unexpected desktop-parent exit.
    if (desktop) { process.stdin.resume(); process.stdin.once('end', stop); }
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } catch { process.stderr.write('Arkive personal node failed to start; verify local configuration and Brain credentials.\n'); process.exit(1); }
}
