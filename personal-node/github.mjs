import { createHash } from 'node:crypto';
import { requestJson } from './execution.mjs';

const API = 'https://api.github.com';
const MAX_FILE = 1024 * 1024;
const MAX_FILES = 1000;
const MAX_TOTAL = 16 * 1024 * 1024;
const SHA = /^[a-f0-9]{40}$/;
const SENSITIVE = /(?:^|[._ -])(?:secret|secrets|credentials|passwords?|tokens?|private[-_ ]?key)(?:[._ -]|$)/i;
const EXCLUDED = new Set(['node_modules', 'vendor', 'venv', 'dist', 'build', 'coverage']);
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });

function safePath(value, { empty = false } = {}) {
  return typeof value === 'string' && ((empty && value === '') || (value.length <= 1024 &&
    !/[\x00-\x1f\x7f\\%?#:]/.test(value) && value.split('/').every((part) => part.length > 0 &&
      part.length <= 255 && !part.startsWith('.') && !EXCLUDED.has(part.toLowerCase()) && !SENSITIVE.test(part))));
}
function textPath(value) {
  if (!safePath(value) || !/\.(md|markdown|txt)$/i.test(value)) {
    throw fail('GITHUB_PATH', 'Choose a non-hidden Markdown or text path without sensitive names or traversal');
  }
  return value;
}
function validRef(ref) {
  return typeof ref === 'string' && ref.length > 0 && ref.length <= 255 && ref !== '@' &&
    !/[\s\x00-\x1f\x7f~^:?*\[\\%#]/.test(ref) && !ref.includes('..') && !ref.includes('@{') &&
    ref.split('/').every((part) => part && !part.startsWith('.') && !part.endsWith('.') && !part.endsWith('.lock'));
}
export function validateGithubConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('GITHUB_CONFIG', 'GitHub configuration is required');
  const repository = typeof value.repository === 'string' ? value.repository.trim().toLowerCase() : '';
  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?\/[a-z0-9_-][a-z0-9_.-]{0,99}$/.test(repository) ||
    repository.endsWith('.git') || repository.split('/')[1].includes('..')) {
    throw fail('GITHUB_CONFIG', 'Repository must be owner/repository, not a URL');
  }
  const ref = value.ref === undefined ? 'main' : value.ref;
  const subpath = value.subpath === undefined ? '' : value.subpath;
  if (!validRef(ref)) throw fail('GITHUB_CONFIG', 'Choose an explicit valid Git branch, tag, or commit ref');
  if (!safePath(subpath, { empty: true })) throw fail('GITHUB_CONFIG', 'Subpath must be a safe, non-hidden relative folder');
  return { repository, ref, subpath };
}
function validateText(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_FILE || text.includes('\0') ||
    Buffer.from(text, 'utf8').toString('utf8') !== text) {
    throw fail('GITHUB_TEXT', 'Writeback text must be valid UTF-8 without NUL bytes and at most 1 MiB');
  }
  return text;
}
function blobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
function decodeBlob(blob, expectedSha, expectedSize) {
  if (!blob || blob.encoding !== 'base64' || blob.sha !== expectedSha || !SHA.test(expectedSha) ||
    !Number.isSafeInteger(blob.size) || blob.size < 0 || blob.size > MAX_FILE ||
    (expectedSize !== undefined && blob.size !== expectedSize) || typeof blob.content !== 'string' ||
    blob.content.length > 2 * MAX_FILE) throw fail('GITHUB_INTEGRITY', 'GitHub returned invalid blob metadata', 502);
  const encoded = blob.content.replace(/[\r\n]/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw fail('GITHUB_INTEGRITY', 'GitHub returned invalid blob encoding', 502);
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== blob.size || blobSha(bytes) !== expectedSha || bytes.toString('base64') !== encoded) {
    throw fail('GITHUB_INTEGRITY', 'GitHub blob SHA or size verification failed', 502);
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw fail('GITHUB_ENCODING', 'Source is not valid UTF-8 text', 422); }
  if (text.includes('\0')) throw fail('GITHUB_ENCODING', 'Source contains binary NUL bytes', 422);
  return text;
}
function connection(config, { token, request = requestJson, signal } = {}) {
  if (token !== undefined && (typeof token !== 'string' || !token || token.length > 4096 || /[\s\x00-\x1f\x7f]/.test(token))) {
    throw fail('GITHUB_TOKEN', 'Provide a valid request-scoped GitHub token');
  }
  return async (suffix, { method = 'GET', body, maxBytes = 2 * MAX_FILE } = {}) => {
    signal?.throwIfAborted();
    // Never use API-provided urls/download_url, and never permit a configurable host.
    const url = `${API}/repos/${config.repository}${suffix}`;
    try {
      return await request(url, { method, body, signal, allowLoopback: false, maxBytes,
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Arkive-Personal-Node',
          'X-GitHub-Api-Version': '2026-03-10', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    } catch (error) {
      if (signal?.aborted) throw fail('GITHUB_CANCELLED', 'GitHub request cancelled', 499);
      // Do not relay upstream messages: injected transports may include headers/tokens.
      const httpStatus = Number(error?.status ?? error?.statusCode ?? error?.message?.match(/\((\d{3})\)/)?.[1]);
      throw fail(httpStatus === 409 || httpStatus === 422 ? 'WRITEBACK_CONFLICT' : 'GITHUB_REQUEST',
        httpStatus === 409 || httpStatus === 422 ? 'GitHub rejected a stale or conflicting write; prepare a new preview' :
          `GitHub request failed${[401, 403, 404, 429].includes(httpStatus) ? ` (${httpStatus})` : ''}`,
        httpStatus === 409 || httpStatus === 422 ? 409 : 502);
    }
  };
}
async function pinnedTree(config, api, { branchOnly = false } = {}) {
  let commitSha; let treeSha;
  if (branchOnly) {
    const branch = await api(`/git/ref/heads/${encodeURIComponent(config.ref)}`);
    if (branch?.ref !== `refs/heads/${config.ref}` || branch?.object?.type !== 'commit' || !SHA.test(branch?.object?.sha || '')) {
      throw fail('GITHUB_BRANCH', 'Writeback requires an existing branch, not a tag or commit');
    }
    commitSha = branch.object.sha;
    const commit = await api(`/git/commits/${commitSha}`);
    if (commit?.sha !== commitSha) throw fail('GITHUB_INTEGRITY', 'GitHub returned an inconsistent commit', 502);
    treeSha = commit?.tree?.sha;
  } else {
    const commit = await api(`/commits/${encodeURIComponent(config.ref)}`, { maxBytes: 8 * MAX_FILE });
    commitSha = commit?.sha;
    treeSha = commit?.commit?.tree?.sha;
  }
  if (!SHA.test(commitSha || '') || !SHA.test(treeSha || '')) throw fail('GITHUB_INTEGRITY', 'GitHub returned an invalid commit or tree', 502);
  const tree = await api(`/git/trees/${treeSha}?recursive=1`, { maxBytes: 8 * MAX_FILE });
  if (tree?.truncated !== false) throw fail('GITHUB_TREE_TRUNCATED', 'Repository tree is incomplete; no partial snapshot was imported', 422);
  if (tree.sha !== treeSha || !Array.isArray(tree.tree) || tree.tree.length > 100000) throw fail('GITHUB_INTEGRITY', 'GitHub returned an invalid tree', 502);
  const seen = new Set();
  for (const entry of tree.tree) {
    if (typeof entry?.path !== 'string' || seen.has(entry.path)) throw fail('GITHUB_INTEGRITY', 'GitHub returned duplicate or invalid paths', 502);
    seen.add(entry.path);
  }
  return { commitSha, entries: tree.tree };
}
const inScope = (config, filePath) => !config.subpath || filePath.startsWith(`${config.subpath}/`);
const regular = (entry) => entry?.type === 'blob' && ['100644', '100755'].includes(entry.mode);
const sourcePath = (config, filePath) => `github://${config.repository}/${encodeURIComponent(config.ref)}/${filePath}`;

export async function readGithubSnapshot(value, options = {}) {
  const config = validateGithubConfig(value);
  const api = connection(config, options);
  const { commitSha, entries } = await pinnedTree(config, api);
  const files = []; let skipped = 0; let total = 0;
  for (const entry of entries) {
    options.signal?.throwIfAborted();
    if (entry.type === 'tree' || !inScope(config, entry.path)) continue;
    if (!regular(entry) || !safePath(entry.path) || !/\.(md|markdown|txt)$/i.test(entry.path) ||
      !SHA.test(entry.sha || '') || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > MAX_FILE ||
      files.length >= MAX_FILES || total + entry.size > MAX_TOTAL) { skipped++; continue; }
    let text;
    try { text = decodeBlob(await api(`/git/blobs/${entry.sha}`), entry.sha, entry.size); }
    catch (error) { if (error.code === 'GITHUB_ENCODING') { skipped++; continue; } throw error; }
    total += entry.size;
    files.push({ path: entry.path, title: entry.path.split('/').at(-1), text,
      sourcePath: sourcePath(config, entry.path),
      sourceMetadata: { kind: 'github', repository: config.repository, ref: config.ref, path: entry.path, commitSha, blobSha: entry.sha } });
  }
  return { files, commitSha, skipped, bytes: total };
}
function targetEntry(config, entries, filePath) {
  textPath(filePath);
  if (!inScope(config, filePath)) throw fail('GITHUB_PATH', 'Writeback path is outside the connected subpath');
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const parts = filePath.split('/');
  for (let index = 1; index < parts.length; index++) {
    const parent = byPath.get(parts.slice(0, index).join('/'));
    if (parent && (parent.type !== 'tree' || parent.mode !== '040000')) {
      throw fail('GITHUB_PATH', 'Writeback parent is not a regular directory');
    }
  }
  const entry = byPath.get(filePath);
  if (entry && (!regular(entry) || !SHA.test(entry.sha || '') || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > MAX_FILE)) {
    throw fail('GITHUB_PATH', 'Writeback target must be a regular text file at most 1 MiB');
  }
  return entry;
}

/** Preview only. Caller keeps this plan server-side and requires explicit approval before apply. */
export async function prepareGithubWrite(value, { path: filePath, text, ...options } = {}) {
  const config = validateGithubConfig(value);
  validateText(text); textPath(filePath);
  if (!inScope(config, filePath)) throw fail('GITHUB_PATH', 'Writeback path is outside the connected subpath');
  const api = connection(config, options);
  const { commitSha, entries } = await pinnedTree(config, api, { branchOnly: true });
  const entry = targetEntry(config, entries, filePath);
  const beforeText = entry ? decodeBlob(await api(`/git/blobs/${entry.sha}`), entry.sha, entry.size) : '';
  return { kind: 'github', config, repository: config.repository, ref: config.ref, path: filePath,
    beforeText, afterText: text, expectedSha: entry?.sha ?? null, existed: Boolean(entry), commitSha,
    sourcePath: sourcePath(config, filePath) };
}

/** No authorization is inferred here: call ONLY with a server-held, explicitly approved preview. */
export async function applyGithubWrite(plan, options = {}) {
  if (plan?.kind !== 'github' || !options.token) throw fail('GITHUB_TOKEN', 'Approved GitHub writeback requires a fresh request-scoped write token');
  const config = validateGithubConfig(plan.config);
  validateText(plan.afterText); validateText(plan.beforeText); textPath(plan.path);
  if (plan.repository !== config.repository || plan.ref !== config.ref || !inScope(config, plan.path) ||
    typeof plan.existed !== 'boolean' || (plan.existed ? !SHA.test(plan.expectedSha || '') ||
      blobSha(Buffer.from(plan.beforeText, 'utf8')) !== plan.expectedSha : plan.expectedSha !== null || plan.beforeText !== '')) {
    throw fail('GITHUB_PLAN', 'Invalid writeback preview');
  }
  const api = connection(config, options);
  const { entries } = await pinnedTree(config, api, { branchOnly: true });
  const current = targetEntry(config, entries, plan.path);
  if ((current?.sha ?? null) !== plan.expectedSha) throw fail('WRITEBACK_CONFLICT', 'Source changed since preview; prepare a new preview', 409);
  const content = Buffer.from(plan.afterText, 'utf8');
  try {
    const result = await api(`/contents/${plan.path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT', body: { message: `Arkive: ${plan.existed ? 'update' : 'create'} ${plan.path}`,
        content: content.toString('base64'), branch: config.ref, ...(plan.existed ? { sha: plan.expectedSha } : {}) },
    });
    if (result?.content?.sha !== blobSha(content) || !SHA.test(result?.commit?.sha || '')) {
      throw fail('GITHUB_WRITE_UNCONFIRMED', 'GitHub write returned an unexpected receipt; inspect the source before retrying', 502);
    }
    // Verify immutable committed bytes rather than a branch head that another writer can move.
    const verified = decodeBlob(await api(`/git/blobs/${result.content.sha}`), result.content.sha, content.length);
    if (verified !== plan.afterText) throw fail('GITHUB_WRITE_UNCONFIRMED', 'GitHub write verification failed; inspect the source before retrying', 502);
    return { repository: config.repository, ref: config.ref, path: plan.path, sourcePath: sourcePath(config, plan.path),
      commitSha: result.commit.sha, blobSha: result.content.sha, verified: true, created: !plan.existed };
  } catch (error) {
    if (error.code === 'WRITEBACK_CONFLICT') throw error;
    // Once PUT starts, lost responses/failed readback cannot establish whether it committed.
    throw fail('GITHUB_WRITE_UNCONFIRMED', 'GitHub may have committed the source write, but it could not be verified. Inspect or refresh the source before retrying; do not repeat this approval.', 502);
  }
}
