/**
 * Arkive's dependency-free, single-user Brain repository.
 * The on-disk file is encrypted; exportBundle() intentionally returns plaintext
 * for a caller to encrypt or transmit over an authenticated secure channel.
 * Checksums detect corruption, not the identity of a remote peer.
 */
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, scrypt, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const VERSION = 1;
const MAX_TEXT = 1024 * 1024;
const MAX_STATE = 32 * 1024 * 1024;
const MAX_ENVELOPE = 46 * 1024 * 1024;
const AAD = Buffer.from('arkive-encrypted-brain:v1:scrypt-N32768-r8-p1:aes-256-gcm');
const TYPES = new Set(['personal', 'creator', 'business']);
const ROLES = new Set(['user', 'assistant', 'system', 'tool']);
const STATUSES = new Set(['complete', 'completed', 'pending', 'error', 'cancelled', 'streaming', 'model-output-unverified']);
const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${randomUUID()}`;

function fail(message, code = 'BRAIN_INVALID') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (BAD_KEYS.has(key)) fail(`Unsafe key in ${label}`);
  return value;
}

function keys(value, allowed, label) {
  record(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`Unknown ${label} field: ${key}`);
}

function text(value, label, maximum = MAX_TEXT, allowEmpty = true) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.includes('\0') ||
      Buffer.byteLength(value, 'utf8') > maximum) fail(`Invalid ${label}`);
  return value;
}

function id(value, prefix) {
  if (typeof value !== 'string' || !new RegExp(`^${prefix}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).test(value)) fail(`Invalid ${prefix} ID`);
  return value;
}

function date(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(`Invalid ${label}`);
}

function list(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) fail(`Invalid ${label} list`);
  return value;
}

function ids(value, prefix, label, maximum = 1000) {
  list(value, label, maximum).forEach((value) => id(value, prefix));
  if (new Set(value).size !== value.length) fail(`Duplicate ${label}`);
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    record(value, 'JSON');
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) fail('Invalid JSON value');
  return JSON.stringify(value);
}

const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex');
const same = (a, b) => canonical(a) === canonical(b);

function parseJson(raw) {
  try {
    return JSON.parse(raw, (key, value) => {
      if (BAD_KEYS.has(key)) fail('Unsafe JSON key');
      return value;
    });
  } catch { fail('Invalid or unsafe Brain JSON'); }
}

function sourcePath(value) {
  text(value, 'source path', 4096, false);
  if (/[\u0000-\u001f]/u.test(value)) fail('Invalid source path');
}

function payload(value) {
  const result = { title: text(value.title, 'title', 512, false), text: text(value.text, 'text'), kind: value.kind ?? 'document', sourceIds: value.sourceIds ?? [] };
  if (typeof result.kind !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(result.kind)) fail('Invalid object kind');
  ids(result.sourceIds, 'obj', 'source IDs');
  if (value.sourcePath !== undefined) {
    sourcePath(value.sourcePath);
    result.sourcePath = value.sourcePath;
  }
  return result;
}

function revisionHash(revision) {
  const { contentHash, ...rest } = revision;
  return hash(rest);
}

function objectFrom(revision) {
  return { id: revision.objectId, ...payload(revision), revisionId: revision.id };
}

function validateState(state) {
  keys(state, ['schemaVersion', 'brainId', 'name', 'template', 'objects', 'revisions', 'rooms', 'proposals', 'audit', 'conflicts', 'folders'], 'state');
  if (state.schemaVersion !== VERSION) fail('Unsupported Brain schema');
  id(state.brainId, 'brain');
  text(state.name, 'Brain name', 512, false);
  if (!TYPES.has(state.template)) fail('Invalid Brain template');
  list(state.objects, 'objects', 10000);
  list(state.revisions, 'revisions', 50000);
  list(state.rooms, 'rooms', 1000);
  list(state.proposals, 'proposals', 10000);
  list(state.audit, 'audit', 50000);
  list(state.conflicts, 'conflicts', 10000);
  list(state.folders, 'folders', 1000);
  const seen = new Set();
  const unique = (value, prefix) => {
    id(value, prefix);
    if (seen.has(value)) fail('Duplicate record ID');
    seen.add(value);
  };
  const objects = new Map(state.objects.map((item) => [item.id, item]));
  const revisions = new Map(state.revisions.map((item) => [item.id, item]));
  for (const revision of state.revisions) {
    keys(revision, ['id', 'objectId', 'parentIds', 'title', 'text', 'kind', 'sourcePath', 'sourceIds', 'contentHash', 'createdAt'], 'revision');
    unique(revision.id, 'rev');
    id(revision.objectId, 'obj');
    ids(revision.parentIds, 'rev', 'parent IDs', 20);
    if (revision.parentIds.includes(revision.id)) fail('Revision cannot parent itself');
    payload(revision);
    date(revision.createdAt, 'revision timestamp');
    if (revision.contentHash !== revisionHash(revision)) fail('Revision checksum mismatch');
    if (!objects.has(revision.objectId)) fail('Revision has unknown object');
    for (const parentId of revision.parentIds) {
      const parent = revisions.get(parentId);
      if (!parent || parent.objectId !== revision.objectId) fail('Invalid revision parent');
    }
    for (const source of revision.sourceIds) if (!objects.has(source)) fail('Unknown revision source');
  }
  // Iterative DFS avoids a recursive stack overflow on long revision histories.
  const completed = new Set();
  for (const revision of state.revisions) {
    const stack = [[revision.id, false]];
    const visiting = new Set();
    while (stack.length) {
      const [current, exiting] = stack.pop();
      if (exiting) { visiting.delete(current); completed.add(current); continue; }
      if (completed.has(current)) continue;
      if (visiting.has(current)) fail('Cyclic revision history');
      visiting.add(current);
      stack.push([current, true]);
      for (const parent of revisions.get(current).parentIds) stack.push([parent, false]);
    }
  }
  for (const object of state.objects) {
    keys(object, ['id', 'title', 'text', 'kind', 'revisionId', 'sourcePath', 'sourceIds'], 'object');
    unique(object.id, 'obj');
    id(object.revisionId, 'rev');
    payload(object);
    const revision = revisions.get(object.revisionId);
    if (!revision || revision.objectId !== object.id || !same(object, objectFrom(revision))) fail('Object does not match its revision');
  }
  for (const room of state.rooms) {
    keys(room, ['id', 'title', 'selectedSourceIds', 'messages'], 'room');
    unique(room.id, 'room');
    text(room.title, 'room title', 512, false);
    ids(room.selectedSourceIds, 'obj', 'selected source IDs');
    for (const source of room.selectedSourceIds) if (!objects.has(source)) fail('Unknown selected source');
    list(room.messages, 'messages', 10000);
    for (const message of room.messages) {
      keys(message, ['id', 'role', 'text', 'sourceIds', 'status', 'createdAt'], 'message');
      unique(message.id, 'msg');
      if (!ROLES.has(message.role) || !STATUSES.has(message.status)) fail('Invalid message role or status');
      text(message.text, 'message');
      ids(message.sourceIds, 'obj', 'message source IDs');
      for (const source of message.sourceIds) if (!objects.has(source)) fail('Unknown message source');
      date(message.createdAt, 'message timestamp');
    }
  }
  for (const proposal of state.proposals) {
    keys(proposal, ['id', 'title', 'text', 'sourceIds', 'status', 'createdAt', 'reviewedAt', 'objectId'], 'proposal');
    unique(proposal.id, 'prop');
    text(proposal.title, 'proposal title', 512, false);
    text(proposal.text, 'proposal text');
    ids(proposal.sourceIds, 'obj', 'proposal sources');
    if (!proposal.sourceIds.length) fail('A memory proposal needs a source');
    for (const source of proposal.sourceIds) if (!objects.has(source)) fail('Unknown proposal source');
    if (!['pending', 'accepted', 'rejected'].includes(proposal.status)) fail('Invalid proposal status');
    date(proposal.createdAt, 'proposal timestamp');
    if (proposal.status === 'pending') {
      if (proposal.reviewedAt !== undefined || proposal.objectId !== undefined) fail('Pending proposal has review data');
    } else {
      date(proposal.reviewedAt, 'review timestamp');
      if (proposal.status === 'accepted') {
        const object = objects.get(proposal.objectId);
        if (!object || object.kind !== 'memory') fail('Accepted proposal has no memory');
      } else if (proposal.objectId !== undefined) fail('Rejected proposal has a memory');
    }
  }
  for (const event of state.audit) {
    keys(event, ['id', 'type', 'targetId', 'createdAt'], 'audit event');
    unique(event.id, 'evt');
    text(event.type, 'event type', 80, false);
    text(event.targetId, 'event target', 100, false);
    date(event.createdAt, 'event timestamp');
  }
  for (const conflict of state.conflicts) {
    keys(conflict, ['id', 'objectId', 'localRevisionId', 'remoteRevisionId', 'status', 'createdAt'], 'conflict');
    unique(conflict.id, 'conflict');
    if (conflict.status !== 'unresolved') fail('Invalid conflict status');
    if (!objects.has(conflict.objectId)) fail('Unknown conflict object');
    for (const ref of [conflict.localRevisionId, conflict.remoteRevisionId]) if (revisions.get(ref)?.objectId !== conflict.objectId) fail('Invalid conflict revision');
    date(conflict.createdAt, 'conflict timestamp');
  }
  const folderPaths = new Set();
  for (const folder of state.folders) {
    keys(folder, ['id', 'path', 'createdAt', 'lastRefreshedAt', 'importedCount', 'error'], 'folder');
    unique(folder.id, 'folder');
    sourcePath(folder.path);
    if (!path.isAbsolute(folder.path) || path.resolve(folder.path) !== folder.path || folderPaths.has(folder.path)) fail('Invalid or duplicate folder path');
    folderPaths.add(folder.path);
    date(folder.createdAt, 'folder timestamp');
    if (folder.lastRefreshedAt !== undefined) date(folder.lastRefreshedAt, 'folder refresh');
    if (folder.importedCount !== undefined && (!Number.isSafeInteger(folder.importedCount) || folder.importedCount < 0 || folder.importedCount > 100000)) fail('Invalid folder import count');
    if (folder.error !== undefined) text(folder.error, 'folder error', 4096);
  }
  if (Buffer.byteLength(JSON.stringify(state)) > MAX_STATE) fail('Brain exceeds the 32 MiB beta limit');
  return state;
}

function validateBundle(bundle) {
  keys(bundle, ['format', 'schemaVersion', 'state', 'checksum'], 'bundle');
  if (bundle.format !== 'arkive-brain-bundle' || bundle.schemaVersion !== VERSION) fail('Unsupported Brain bundle');
  const state = validateState(bundle.state);
  if (typeof bundle.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(bundle.checksum) ||
      !timingSafeEqual(Buffer.from(bundle.checksum), Buffer.from(hash(state)))) fail('Bundle checksum mismatch');
  return clone(state);
}

function audit(state, type, targetId) {
  state.audit.push({ id: uid('evt'), type, targetId, createdAt: now() });
}

function addObject(state, input) {
  const old = input.objectId ? state.objects.find((object) => object.id === id(input.objectId, 'obj')) : undefined;
  if (input.objectId && !old) fail('Object not found', 'BRAIN_NOT_FOUND');
  const data = payload({ ...input, sourceIds: input.sourceIds ?? old?.sourceIds ?? [], kind: input.kind ?? old?.kind ?? 'document', sourcePath: input.sourcePath ?? old?.sourcePath });
  for (const ref of data.sourceIds) if (!state.objects.some((object) => object.id === ref)) fail('Unknown source');
  if (old && same(payload(old), data)) return old;
  const revision = { id: uid('rev'), objectId: old?.id ?? uid('obj'), parentIds: old ? [old.revisionId] : [], ...data, createdAt: now() };
  revision.contentHash = revisionHash(revision);
  state.revisions.push(revision);
  const object = objectFrom(revision);
  if (old) state.objects[state.objects.indexOf(old)] = object;
  else state.objects.push(object);
  audit(state, old ? 'object.revised' : 'object.imported', object.id);
  return object;
}

async function keyFor(passphrase, salt) {
  text(passphrase, 'passphrase', 1024, false);
  if (passphrase.length < 12) fail('Passphrase must contain at least 12 characters');
  return derive(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function base64(value, label, length) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail(`Invalid ${label}`);
  const buffer = Buffer.from(value, 'base64');
  if (buffer.toString('base64') !== value || (length !== undefined && buffer.length !== length)) fail(`Invalid ${label}`);
  return buffer;
}

function encrypt(state, key, salt) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()]);
  return JSON.stringify({ format: 'arkive-encrypted-brain', version: VERSION, kdf: 'scrypt-N32768-r8-p1', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
}

async function decrypt(raw, passphrase) {
  const envelope = parseJson(raw);
  keys(envelope, ['format', 'version', 'kdf', 'salt', 'iv', 'tag', 'ciphertext'], 'encrypted Brain');
  if (envelope.format !== 'arkive-encrypted-brain' || envelope.version !== VERSION || envelope.kdf !== 'scrypt-N32768-r8-p1') fail('Unsupported encrypted Brain format');
  const salt = base64(envelope.salt, 'salt', 32);
  const key = await keyFor(passphrase, salt);
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, base64(envelope.iv, 'nonce', 12));
    cipher.setAAD(AAD);
    cipher.setAuthTag(base64(envelope.tag, 'authentication tag', 16));
    const ciphertext = base64(envelope.ciphertext, 'ciphertext');
    if (ciphertext.length > MAX_STATE) fail('Encrypted Brain exceeds size limit');
    const plaintext = Buffer.concat([cipher.update(ciphertext), cipher.final()]);
    let state;
    try { state = validateState(parseJson(plaintext.toString('utf8'))); }
    finally { plaintext.fill(0); }
    return { state, key, salt };
  } catch {
    key.fill(0);
    fail('Cannot unlock Brain: wrong passphrase, damaged data, or unsupported records', 'BRAIN_AUTH');
  }
}

async function safeDirectory(directory, create) {
  text(directory, 'Brain directory', 4096, false);
  const resolved = path.resolve(directory);
  let stat;
  try { stat = await fs.lstat(resolved); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!create) fail('Brain not found', 'BRAIN_NOT_FOUND');
    await fs.mkdir(resolved, { recursive: true, mode: 0o700 });
    stat = await fs.lstat(resolved);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('Brain directory must not be a symlink');
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) fail('Brain directory must belong to the current user');
  await fs.chmod(resolved, 0o700);
  return fs.realpath(resolved);
}

async function safeFile(filename, allowMissing = false) {
  try {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('Brain storage file must be an ordinary unlinked file');
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) fail('Brain storage file must belong to the current user');
    return stat;
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function atomicWrite(directory, filename, content) {
  await safeFile(filename, true);
  const temporary = path.join(directory, `.brain-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await safeFile(filename, true);
    await fs.rename(temporary, filename);
    const folder = await fs.open(directory, 'r');
    try { await folder.sync(); } finally { await folder.close(); }
  } finally {
    if (handle) await handle.close();
    await fs.unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

async function acquire(directory) {
  const filename = path.join(directory, '.brain.lock');
  let handle;
  try { handle = await fs.open(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600); }
  catch (error) { if (error.code === 'EEXIST' || error.code === 'ELOOP') fail('Brain is already open, or has a stale .brain.lock requiring manual recovery', 'BRAIN_LOCKED'); throw error; }
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: now() })); await handle.sync(); }
  catch (error) { await handle.close(); await fs.unlink(filename); throw error; }
  return async () => { await handle.close(); await fs.unlink(filename); };
}

function ancestor(revisions, older, newer) {
  const stack = [newer];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === older) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...revisions.get(current).parentIds);
  }
  return false;
}

function makeStore(directory, initial, key, salt, release) {
  let state = initial;
  let queue = Promise.resolve();
  let closing = false;
  let closed;
  function enqueue(operation) {
    if (closing) return Promise.reject(Object.assign(new Error('Brain is closed'), { code: 'BRAIN_LOCKED' }));
    const pending = queue.then(operation);
    queue = pending.catch(() => {});
    return pending;
  }
  function change(operation) {
    return enqueue(async () => {
      const next = clone(state);
      const result = operation(next);
      validateState(next);
      await atomicWrite(directory, path.join(directory, 'brain.enc'), encrypt(next, key, salt));
      state = next;
      return clone(result);
    });
  }
  function existingSources(next, values) {
    ids(values, 'obj', 'source IDs');
    for (const value of values) if (!next.objects.some((object) => object.id === value)) fail('Source not found', 'BRAIN_NOT_FOUND');
    return [...values];
  }
  return {
    snapshot: () => enqueue(() => clone(state)),
    importText(input) {
      keys(input, ['objectId', 'title', 'text', 'sourcePath', 'kind', 'sourceIds'], 'import');
      return change((next) => addObject(next, clone(input)));
    },
    createRoom(input) {
      keys(input, ['title'], 'room input');
      const title = text(input.title, 'room title', 512, false);
      return change((next) => {
        const room = { id: uid('room'), title, selectedSourceIds: [], messages: [] };
        next.rooms.push(room);
        audit(next, 'room.created', room.id);
        return room;
      });
    },
    selectSources(roomId, values) {
      id(roomId, 'room');
      const selected = clone(values);
      return change((next) => {
        const room = next.rooms.find((room) => room.id === roomId);
        if (!room) fail('Room not found', 'BRAIN_NOT_FOUND');
        room.selectedSourceIds = existingSources(next, selected);
        audit(next, 'room.sources-selected', room.id);
        return room;
      });
    },
    addMessage(roomId, input) {
      id(roomId, 'room');
      keys(input, ['role', 'text', 'sourceIds', 'status'], 'message input');
      const data = clone(input);
      return change((next) => {
        const room = next.rooms.find((room) => room.id === roomId);
        if (!room) fail('Room not found', 'BRAIN_NOT_FOUND');
        if (!ROLES.has(data.role) || !STATUSES.has(data.status ?? 'complete')) fail('Invalid message role or status');
        const sourceIds = existingSources(next, data.sourceIds ?? []);
        if (sourceIds.some((value) => !room.selectedSourceIds.includes(value))) fail('Message source is not selected in this room');
        const message = { id: uid('msg'), role: data.role, text: text(data.text, 'message'), sourceIds, status: data.status ?? 'complete', createdAt: now() };
        room.messages.push(message);
        return message;
      });
    },
    proposeMemory(input) {
      keys(input, ['title', 'text', 'sourceIds'], 'proposal input');
      const data = clone(input);
      return change((next) => {
        const sourceIds = existingSources(next, data.sourceIds);
        if (!sourceIds.length) fail('A memory proposal needs at least one existing source');
        const proposal = { id: uid('prop'), title: text(data.title, 'proposal title', 512, false), text: text(data.text, 'proposal'), sourceIds, status: 'pending', createdAt: now() };
        next.proposals.push(proposal);
        audit(next, 'memory.proposed', proposal.id);
        return proposal;
      });
    },
    reviewProposal(proposalId, decision) {
      id(proposalId, 'prop');
      if (!['accept', 'reject'].includes(decision)) fail('Review must be accept or reject');
      return change((next) => {
        const proposal = next.proposals.find((proposal) => proposal.id === proposalId);
        if (!proposal) fail('Proposal not found', 'BRAIN_NOT_FOUND');
        if (proposal.status !== 'pending') fail('Proposal has already been reviewed', 'BRAIN_CONFLICT');
        existingSources(next, proposal.sourceIds);
        proposal.status = decision === 'accept' ? 'accepted' : 'rejected';
        proposal.reviewedAt = now();
        if (decision === 'accept') proposal.objectId = addObject(next, { title: proposal.title, text: proposal.text, kind: 'memory', sourceIds: proposal.sourceIds }).id;
        audit(next, `memory.${proposal.status}`, proposal.id);
        return proposal;
      });
    },
    registerFolder(input) {
      keys(input, ['path'], 'folder input');
      sourcePath(input.path);
      if (!path.isAbsolute(input.path)) fail('Folder path must be absolute');
      const location = path.resolve(input.path);
      return change((next) => {
        const found = next.folders.find((folder) => folder.path === location);
        if (found) return found;
        const folder = { id: uid('folder'), path: location, createdAt: now() };
        next.folders.push(folder);
        audit(next, 'folder.registered', folder.id);
        return folder;
      });
    },
    listFolders: () => enqueue(() => clone(state.folders)),
    updateFolder(folderId, updates) {
      id(folderId, 'folder');
      keys(updates, ['lastRefreshedAt', 'importedCount', 'error'], 'folder update');
      const data = clone(updates);
      return change((next) => {
        const folder = next.folders.find((folder) => folder.id === folderId);
        if (!folder) fail('Folder not found', 'BRAIN_NOT_FOUND');
        Object.assign(folder, data);
        return folder;
      });
    },
    exportBundle: () => enqueue(() => ({ format: 'arkive-brain-bundle', schemaVersion: VERSION, state: clone(state), checksum: hash(state) })),
    exportReplica: () => enqueue(() => {
      const replica = { ...clone(state), rooms: [], proposals: [], audit: [], conflicts: [], folders: [] };
      return { format: 'arkive-brain-bundle', schemaVersion: VERSION, state: replica, checksum: hash(replica) };
    }),
    mergeBundle(bundle) {
      const incoming = validateBundle(bundle);
      return change((next) => {
        if (incoming.brainId !== next.brainId) fail('Cannot sync different Brains', 'BRAIN_CONFLICT');
        const revisions = new Map(next.revisions.map((revision) => [revision.id, revision]));
        const result = { importedObjects: 0, importedRevisions: 0, conflicts: 0 };
        for (const revision of incoming.revisions) {
          const existing = revisions.get(revision.id);
          if (existing && !same(existing, revision)) fail('Revision ID collision', 'BRAIN_CONFLICT');
          if (!existing) { revisions.set(revision.id, clone(revision)); next.revisions.push(clone(revision)); result.importedRevisions++; }
        }
        for (const remote of incoming.objects) {
          const local = next.objects.find((object) => object.id === remote.id);
          if (!local) { next.objects.push(clone(remote)); result.importedObjects++; continue; }
          if (local.revisionId === remote.revisionId || ancestor(revisions, remote.revisionId, local.revisionId)) continue;
          if (ancestor(revisions, local.revisionId, remote.revisionId)) {
            next.objects[next.objects.indexOf(local)] = clone(remote);
          } else if (!next.conflicts.some((conflict) => conflict.objectId === local.id && conflict.localRevisionId === local.revisionId && conflict.remoteRevisionId === remote.revisionId)) {
            next.conflicts.push({ id: uid('conflict'), objectId: local.id, localRevisionId: local.revisionId, remoteRevisionId: remote.revisionId, status: 'unresolved', createdAt: now() });
            result.conflicts++;
          }
        }
        // Remote rooms, proposal decisions, folder grants and audit claims are
        // deliberately not adopted. The service must authenticate its peer.
        audit(next, 'sync.merged', next.brainId);
        return result;
      });
    },
    close() {
      if (closed) return closed;
      closing = true;
      closed = queue.then(async () => { key.fill(0); await release(); });
      return closed;
    },
  };
}

async function initialize(directory, passphrase, options, restored) {
  const dir = await safeDirectory(directory, Boolean(options.create || restored));
  const filename = path.join(dir, 'brain.enc');
  const stat = await safeFile(filename, true);
  if ((options.create || restored) && stat) fail('Brain already exists', 'BRAIN_EXISTS');
  if (!stat && !options.create && !restored) fail('Brain not found', 'BRAIN_NOT_FOUND');
  if (!stat && (await fs.readdir(dir)).length) fail('New Brain requires an empty directory', 'BRAIN_EXISTS');
  const release = await acquire(dir);
  let key;
  try {
    let state;
    let salt;
    if (stat) {
      if (stat.size > MAX_ENVELOPE) fail('Encrypted Brain exceeds size limit');
      const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const checked = await handle.stat();
        if (!checked.isFile() || checked.nlink !== 1 || checked.size > MAX_ENVELOPE) fail('Invalid Brain file');
        ({ state, salt, key } = await decrypt(await handle.readFile('utf8'), passphrase));
      } finally { await handle.close(); }
    } else {
      salt = randomBytes(32);
      key = await keyFor(passphrase, salt);
      state = restored ?? { schemaVersion: VERSION, brainId: uid('brain'), name: options.name ?? 'My Brain', template: options.template ?? 'personal', objects: [], revisions: [], rooms: [], proposals: [], audit: [], conflicts: [], folders: [] };
      validateState(state);
      audit(state, restored ? 'brain.restored' : 'brain.created', state.brainId);
      validateState(state);
      await atomicWrite(dir, filename, encrypt(state, key, salt));
    }
    return makeStore(dir, state, key, salt, release);
  } catch (error) {
    key?.fill(0);
    await release();
    throw error;
  }
}

export async function openBrain(directory, passphrase, options = {}) {
  keys(options, ['create', 'template', 'name'], 'Brain options');
  if (options.create !== undefined && typeof options.create !== 'boolean') fail('Invalid create option');
  return initialize(directory, passphrase, options);
}

export async function restoreBrain(directory, passphrase, bundle) {
  const state = validateBundle(bundle);
  // A restored repository is data, not a grant to inspect the new host's paths.
  state.folders = [];
  return initialize(directory, passphrase, {}, state);
}
