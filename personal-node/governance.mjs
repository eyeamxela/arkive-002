/** Local authority only. Replicas never import this state or its credentials. */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { BRAIN_INTAKE_BYTES, MAX_BRAIN_BYTES } from './limits.mjs';

const stamp = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${randomUUID()}`;
const clone = (value) => structuredClone(value);
const digest = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const owner = { owner: true, kind: 'owner' };
const bad = (message, code = 'GOVERNANCE_INVALID', status = 400) => { throw Object.assign(new Error(message), { code, status }); };
const array = (value, max = 1000) => { if (!Array.isArray(value) || value.length > max) bad('Invalid bounded list'); return value; };
function keys(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) bad('Expected a record');
  if (Object.keys(value).some((key) => !fields.includes(key) || ['__proto__', 'constructor', 'prototype'].includes(key))) bad('Unknown or unsafe governance field');
}
function text(value, max = 160, empty = false) {
  if (typeof value !== 'string' || value.includes('\0') || (!empty && !value.trim()) || Buffer.byteLength(value) > max) bad('Invalid governance text');
  return value;
}
function id(value, prefix) {
  if (typeof value !== 'string' || !new RegExp(`^${prefix}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).test(value)) bad('Invalid governance reference');
  return value;
}
function ids(value, prefix, max = 1000) {
  array(value, max).forEach((item) => id(item, prefix));
  if (new Set(value).size !== value.length) bad('Duplicate governance reference');
  return value;
}
function date(value) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) bad('Invalid governance timestamp'); }
function dates(item) { date(item.createdAt); if (item.updatedAt !== undefined) { date(item.updatedAt); if (item.updatedAt < item.createdAt) bad('Invalid timestamp order'); } }
function exists(items, reference, label) { const result = items.find((item) => item.id === reference); if (!result) bad(`${label} not found`, 'GOVERNANCE_NOT_FOUND', 404); return result; }
function sources(state, value) { ids(value, 'obj'); value.forEach((reference) => exists(state.objects, reference, 'Source')); return [...value]; }
function bindings(state, value) {
  const seen = new Set();
  for (const binding of array(value)) {
    keys(binding, ['sourceId', 'revisionId']); id(binding.sourceId, 'obj'); id(binding.revisionId, 'rev');
    if (seen.has(binding.sourceId)) bad('Duplicate source binding'); seen.add(binding.sourceId);
    if (exists(state.revisions, binding.revisionId, 'Revision').objectId !== binding.sourceId) bad('Invalid source revision binding');
  }
}
export const emptyGovernance = () => ({ layers: [], members: [], roomPolicies: [], manifests: [], runs: [] });
const gov = (state) => state.governance ?? emptyGovernance();
const policyFor = (state, roomId) => gov(state).roomPolicies.find((item) => item.roomId === roomId);
const publicMember = ({ tokenHash, ...member }) => member;
const MEMBER_LEDGER_BYTES = 8 * 1024 * 1024;
function memberUsage(state) {
  const runs = gov(state).runs.filter((run) => run.principalId !== 'owner'); const references = new Set(runs.map((run) => run.id));
  const messages = state.rooms.flatMap((room) => room.messages.filter((message) => references.has(message.runId)));
  const events = state.audit.filter((event) => references.has(event.targetId));
  return { runs, bytes: Buffer.byteLength(JSON.stringify({ runs, messages, events })) };
}
const quota = (message) => bad(message, 'RUN_QUOTA', 429);
function checkMemberQuota(state, input) {
  const usage = memberUsage(state); const own = usage.runs.filter((run) => run.principalId === input.principalId);
  if (own.filter((run) => run.state === 'awaiting-approval').length >= 3) quota('This member already has three pending requests; wait for owner review');
  if (own.length >= 20 || own.filter((run) => run.roomId === input.roomId).length >= 10) quota('Member retained-request quota reached; the owner can explicitly prune terminal receipts');
  if (usage.runs.length >= 200 || usage.bytes >= MEMBER_LEDGER_BYTES - 256000 || state.audit.length >= 49000 || Buffer.byteLength(JSON.stringify(state)) >= BRAIN_INTAKE_BYTES) quota('Member request storage budget is full; owner review is required');
}

export function validateGovernance(value, state) {
  keys(value, ['layers', 'members', 'roomPolicies', 'manifests', 'runs']);
  array(value.layers, 100); array(value.members, 100); array(value.roomPolicies, 1000); array(value.manifests, 2000); array(value.runs, 3000);
  const unique = new Set();
  const register = (item, prefix) => { id(item.id, prefix); if (unique.has(item.id)) bad('Duplicate governance ID'); unique.add(item.id); };
  for (const item of value.layers) {
    keys(item, ['id', 'name', 'description', 'mode', 'sourceIds', 'createdAt', 'updatedAt']); register(item, 'layer');
    text(item.name); text(item.description, 8000, true); if (!['include', 'ask', 'exclude'].includes(item.mode)) bad('Invalid layer mode'); sources(state, item.sourceIds); dates(item); date(item.updatedAt);
  }
  for (const item of value.members) {
    keys(item, ['id', 'name', 'tokenHash', 'createdAt', 'revokedAt']); register(item, 'member'); text(item.name); date(item.createdAt);
    if (item.tokenHash !== undefined && !/^[a-f0-9]{64}$/.test(item.tokenHash)) bad('Invalid credential digest');
    if (!item.tokenHash && !item.revokedAt) bad('Active member lacks a credential');
    if (item.revokedAt !== undefined) { date(item.revokedAt); if (item.revokedAt < item.createdAt) bad('Invalid revocation time'); }
  }
  const rooms = new Set();
  for (const item of value.roomPolicies) {
    keys(item, ['roomId', 'agentId', 'taskId', 'layerIds', 'memberGrants', 'activeManifestId', 'updatedAt']);
    exists(state.rooms, item.roomId, 'Room'); if (rooms.has(item.roomId)) bad('Duplicate room policy'); rooms.add(item.roomId);
    if (item.agentId !== undefined) exists(state.workspace?.agents ?? [], item.agentId, 'Agent');
    if (item.taskId !== undefined) exists(state.workspace?.tasks ?? [], item.taskId, 'Task');
    ids(item.layerIds, 'layer', 100).forEach((reference) => exists(value.layers, reference, 'Layer'));
    const members = new Set();
    for (const grant of array(item.memberGrants, 100)) {
      keys(grant, ['memberId', 'role', 'sourceIds', 'grantId']); id(grant.grantId, 'grant'); exists(value.members, grant.memberId, 'Member');
      if (members.has(grant.memberId)) bad('Duplicate room member'); members.add(grant.memberId);
      if (!['reader', 'participant'].includes(grant.role)) bad('Invalid member role'); sources(state, grant.sourceIds);
    }
    if (item.activeManifestId !== undefined && exists(value.manifests, item.activeManifestId, 'Manifest').roomId !== item.roomId) bad('Manifest belongs to another room');
    date(item.updatedAt);
  }
  for (const item of value.manifests) {
    keys(item, ['id', 'roomId', 'agentId', 'taskId', 'bindings', 'approvedLayerIds', 'scopeHash', 'createdAt', 'expiresAt', 'revokedAt']); register(item, 'seal');
    exists(state.rooms, item.roomId, 'Room'); bindings(state, item.bindings); ids(item.approvedLayerIds, 'layer', 100).forEach((reference) => exists(value.layers, reference, 'Layer'));
    if (item.agentId !== undefined) exists(state.workspace?.agents ?? [], item.agentId, 'Agent');
    if (item.taskId !== undefined) exists(state.workspace?.tasks ?? [], item.taskId, 'Task');
    if (!/^[a-f0-9]{64}$/.test(item.scopeHash)) bad('Invalid scope digest'); dates(item); date(item.expiresAt);
    if (item.expiresAt <= item.createdAt) bad('Invalid manifest expiry'); if (item.revokedAt !== undefined) date(item.revokedAt);
  }
  for (const item of value.runs) {
    keys(item, ['id', 'roomId', 'agentId', 'taskId', 'principalId', 'providerId', 'model', 'providerFingerprint', 'prompt', 'bindings', 'manifestId', 'approvedLayerIds', 'audience', 'grantIds', 'scopeHash', 'state', 'createdAt', 'updatedAt', 'completedAt', 'result', 'error', 'events']); register(item, 'run');
    exists(state.rooms, item.roomId, 'Room'); if (item.principalId !== 'owner') exists(value.members, item.principalId, 'Member');
    if (item.agentId !== undefined) exists(state.workspace?.agents ?? [], item.agentId, 'Agent');
    if (item.taskId !== undefined) exists(state.workspace?.tasks ?? [], item.taskId, 'Task');
    text(item.providerId, 80); text(item.model, 256); text(item.prompt, 128000); bindings(state, item.bindings);
    if (item.manifestId !== undefined && exists(value.manifests, item.manifestId, 'Manifest').roomId !== item.roomId) bad('Invalid run manifest');
    ids(item.approvedLayerIds, 'layer', 100).forEach((reference) => exists(value.layers, reference, 'Layer'));
    ids(item.audience, 'member', 100).forEach((reference) => exists(value.members, reference, 'Member'));
    ids(item.grantIds, 'grant', 100); if (item.grantIds.length !== item.audience.length) bad('Invalid grant binding');
    if (![item.providerFingerprint, item.scopeHash].every((part) => typeof part === 'string' && /^[a-f0-9]{64}$/.test(part))) bad('Invalid run digest');
    if (!['awaiting-approval', 'running', 'completed', 'failed', 'rejected'].includes(item.state)) bad('Invalid run state');
    dates(item); date(item.updatedAt);
    if (item.completedAt !== undefined) date(item.completedAt);
    if (['completed', 'failed', 'rejected'].includes(item.state) !== Boolean(item.completedAt)) bad('Invalid run completion time');
    if (item.result !== undefined) text(item.result, 512000); if (item.error !== undefined) text(item.error, 1000);
    if ((item.state === 'completed') !== (item.result !== undefined)) bad('Invalid run result');
    for (const event of array(item.events, 30)) { keys(event, ['type', 'at']); text(event.type, 80); date(event.at); }
    if (!item.events.length) bad('Run must have an event');
  }
}

export function authenticateMember(state, token) {
  if (typeof token !== 'string' || !/^ark_member_[a-f0-9]{64}$/.test(token)) return null;
  const hash = digest(token);
  const member = gov(state).members.find((item) => !item.revokedAt && item.tokenHash && timingSafeEqual(Buffer.from(item.tokenHash), Buffer.from(hash)));
  return member ? { owner: false, kind: 'member', memberId: member.id, name: member.name } : null;
}

function activeGrants(state, policy) {
  return (policy?.memberGrants ?? []).filter((grant) => gov(state).members.some((member) => member.id === grant.memberId && !member.revokedAt));
}
function currentScope(state, roomId) {
  const room = exists(state.rooms, roomId, 'Room'); const policy = policyFor(state, roomId);
  const layers = (policy?.layerIds ?? []).map((reference) => exists(gov(state).layers, reference, 'Layer'));
  const agent = policy?.agentId ? exists(state.workspace?.agents ?? [], policy.agentId, 'Agent') : undefined;
  const blocked = []; const permitted = new Set(room.selectedSourceIds);
  for (const reference of room.selectedSourceIds) {
    if (layers.some((layer) => layer.mode === 'exclude' && layer.sourceIds.includes(reference))) { permitted.delete(reference); blocked.push({ sourceId: reference, reason: 'excluded-layer' }); }
    else if (agent && !agent.sourceIds.includes(reference)) { permitted.delete(reference); blocked.push({ sourceId: reference, reason: 'outside-agent-profile' }); }
  }
  // Derived memory must not bypass deselection or a layer by retaining private evidence.
  let changed;
  do {
    changed = false;
    for (const reference of permitted) {
      const object = exists(state.objects, reference, 'Source');
      if (object.sourceIds.some((dependency) => !permitted.has(dependency))) { permitted.delete(reference); blocked.push({ sourceId: reference, reason: 'excluded-evidence' }); changed = true; }
    }
  } while (changed);
  const selected = state.objects.filter((item) => permitted.has(item.id));
  const bound = selected.map((item) => ({ sourceId: item.id, revisionId: item.revisionId }));
  const grants = activeGrants(state, policy);
  const sharedBlocked = selected.filter((item) => grants.length && (item.kind === 'code_graph' || grants.some((grant) => !grant.sourceIds.includes(item.id))));
  for (const item of sharedBlocked) blocked.push({ sourceId: item.id, reason: 'not-allowed-to-all-room-members' });
  const scopeHash = digest({ selectedSourceIds: room.selectedSourceIds, bindings: bound, layers,
    agent: agent ? { id: agent.id, providerId: agent.providerId, sourceIds: agent.sourceIds, updatedAt: agent.updatedAt } : null,
    taskId: policy?.taskId ?? null, grants, policyGrants: policy?.memberGrants ?? [], members: grants.map((grant) => grant.memberId) });
  const manifest = policy?.activeManifestId ? gov(state).manifests.find((item) => item.id === policy.activeManifestId) : undefined;
  const manifestStatus = !manifest ? 'none' : manifest.revokedAt ? 'revoked' : Date.parse(manifest.expiresAt) <= Date.now() ? 'expired' : manifest.scopeHash !== scopeHash ? 'stale' : 'active';
  return { room, policy, layers, selected, bindings: bound, grants, blocked, sharedBlocked, scopeHash, manifest, manifestStatus, profileProvider: agent?.providerId };
}
function visibleIds(state, roomId, memberId) {
  const scope = currentScope(state, roomId); const grant = scope.grants.find((item) => item.memberId === memberId);
  const permitted = new Set(grant ? scope.selected.filter((item) => item.kind !== 'code_graph' && grant.sourceIds.includes(item.id)).map((item) => item.id) : []);
  let changed;
  do { changed = false; for (const reference of permitted) if (exists(state.objects, reference, 'Source').sourceIds.some((dependency) => !permitted.has(dependency))) { permitted.delete(reference); changed = true; } } while (changed);
  return { scope, grant, permitted };
}
const contextKey = (scope) => digest({ scopeHash: scope.scopeHash, manifestId: scope.manifest?.id ?? null });
function checkExpectedContext(scope, expected) {
  if (expected !== undefined && (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) || expected !== contextKey(scope))) bad('Displayed room context changed; review its sources again', 'CONTEXT_STALE', 409);
}
function compile(state, roomId, approvedLayerIds = [], { pending = false, principalId = 'owner', ignoreManifest = false } = {}) {
  ids(approvedLayerIds, 'layer', 100);
  const scope = currentScope(state, roomId);
  if (approvedLayerIds.some((reference) => !scope.layers.some((layer) => layer.id === reference && layer.mode === 'ask'))) bad('Approval references an unattached ask layer');
  if (principalId !== 'owner' && !scope.grants.some((grant) => grant.memberId === principalId && grant.role === 'participant')) bad('Room participant access is required', 'ROOM_ACCESS_DENIED', 403);
  if (scope.sharedBlocked.length) bad('Selected context is not allowed to every active room member', 'ROOM_SCOPE_DENIED', 403);
  if (!ignoreManifest && !['none', 'active'].includes(scope.manifestStatus)) bad(`Room manifest is ${scope.manifestStatus}; seal a fresh manifest or detach it`, 'MANIFEST_INVALID', 409);
  const approved = new Set([...approvedLayerIds, ...(!ignoreManifest && scope.manifestStatus === 'active' ? scope.manifest.approvedLayerIds : [])]);
  if (!pending && scope.layers.some((layer) => layer.mode === 'ask' && layer.sourceIds.some((reference) => scope.selected.some((source) => source.id === reference)) && !approved.has(layer.id))) bad('Explicit approval is required for the selected ask layer', 'LAYER_APPROVAL_REQUIRED', 409);
  const context = scope.selected.map((item) => ({ sourceId: item.id, revisionId: item.revisionId, title: item.title, text: item.text }));
  if (JSON.stringify(context).length > 160000) bad('Selected context is too large; select fewer sources');
  return { ...scope, context, approvedLayerIds: [...approved], consentHash: digest({ scopeHash: scope.scopeHash, manifestId: ignoreManifest ? null : scope.manifest?.id ?? null }) };
}

export function governanceAction(state, action, input = {}) {
  state.governance ??= emptyGovernance(); const value = state.governance; const time = stamp();
  if (action === 'layer') {
    keys(input, ['id', 'name', 'description', 'mode', 'sourceIds', 'expectedLayerKey']);
    const previous = input.id ? exists(value.layers, input.id, 'Layer') : null;
    if (input.expectedLayerKey !== undefined && (!previous || typeof input.expectedLayerKey !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedLayerKey) || input.expectedLayerKey !== digest(previous))) bad('Displayed layer changed; reopen and review it before saving', 'LAYER_STALE', 409);
    const layer = { id: previous?.id ?? uid('layer'), name: text(input.name), description: text(input.description ?? '', 8000, true), mode: input.mode, sourceIds: sources(state, input.sourceIds ?? []), createdAt: previous?.createdAt ?? time, updatedAt: time };
    if (!['include', 'ask', 'exclude'].includes(layer.mode)) bad('Invalid layer mode');
    if (previous) value.layers[value.layers.indexOf(previous)] = layer; else value.layers.push(layer);
    return { result: { ...layer, versionKey: digest(layer) }, type: previous ? 'layer.updated' : 'layer.created', target: layer.id };
  }
  if (action === 'member') {
    keys(input, ['name']); const token = `ark_member_${randomBytes(32).toString('hex')}`;
    const member = { id: uid('member'), name: text(input.name), tokenHash: digest(token), createdAt: time }; value.members.push(member);
    return { result: { member: publicMember(member), token }, type: 'member.created', target: member.id };
  }
  if (action === 'revoke-member') {
    keys(input, ['id']); const member = exists(value.members, input.id, 'Member'); member.revokedAt ??= time; delete member.tokenHash;
    return { result: publicMember(member), type: 'member.revoked', target: member.id };
  }
  if (action === 'policy') {
    keys(input, ['roomId', 'agentId', 'taskId', 'layerIds', 'memberGrants', 'activeManifestId', 'expectedContextKey']); exists(state.rooms, input.roomId, 'Room');
    checkExpectedContext(currentScope(state, input.roomId), input.expectedContextKey);
    const previous = policyFor(state, input.roomId);
    const grants = array(input.memberGrants ?? [], 100).map((grant) => {
      keys(grant, ['memberId', 'role', 'sourceIds']);
      const old = previous?.memberGrants.find((item) => item.memberId === grant.memberId);
      return { ...clone(grant), grantId: old?.grantId ?? uid('grant') };
    });
    const policy = { roomId: input.roomId, layerIds: clone(input.layerIds ?? []), memberGrants: grants, updatedAt: time };
    for (const field of ['agentId', 'taskId', 'activeManifestId']) if (input[field]) policy[field] = input[field];
    if (previous) value.roomPolicies[value.roomPolicies.indexOf(previous)] = policy; else value.roomPolicies.push(policy);
    validateGovernance(value, state);
    return { result: policy, type: 'room.policy-updated', target: policy.roomId };
  }
  if (action === 'manifest') {
    keys(input, ['roomId', 'ttlSeconds', 'approvedLayerIds', 'expectedContextKey']); const ttl = input.ttlSeconds ?? 86400;
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 604800) bad('Manifest lifetime must be 1–604800 seconds');
    checkExpectedContext(currentScope(state, input.roomId), input.expectedContextKey);
    const scope = compile(state, input.roomId, input.approvedLayerIds ?? [], { ignoreManifest: true });
    const manifest = { id: uid('seal'), roomId: input.roomId, bindings: scope.bindings, approvedLayerIds: scope.approvedLayerIds, scopeHash: scope.scopeHash, createdAt: time, expiresAt: new Date(Date.parse(time) + ttl * 1000).toISOString() };
    for (const field of ['agentId', 'taskId']) if (scope.policy?.[field]) manifest[field] = scope.policy[field];
    value.manifests.push(manifest);
    let policy = policyFor(state, input.roomId);
    if (!policy) { policy = { roomId: input.roomId, layerIds: [], memberGrants: [], updatedAt: time }; value.roomPolicies.push(policy); }
    policy.activeManifestId = manifest.id; policy.updatedAt = time;
    return { result: manifest, type: 'manifest.sealed', target: manifest.id };
  }
  if (action === 'revoke-manifest') {
    keys(input, ['id']); const manifest = exists(value.manifests, input.id, 'Manifest'); manifest.revokedAt ??= time;
    return { result: manifest, type: 'manifest.revoked', target: manifest.id };
  }
  if (action === 'reject') {
    keys(input, ['id']); const run = exists(value.runs, input.id, 'Run'); if (run.state !== 'awaiting-approval') bad('Run is not awaiting approval', 'RUN_CONFLICT', 409);
    run.state = 'rejected'; run.updatedAt = time; run.completedAt = time; run.events.push({ type: 'owner.rejected', at: time });
    return { result: run, type: 'run.rejected', target: run.id };
  }
  if (action === 'prune') {
    keys(input, ['runIds', 'confirm']); ids(input.runIds, 'run', 100);
    if (input.confirm !== true || !input.runIds.length) bad('Explicit confirmation and 1–100 run IDs are required');
    const selected = input.runIds.map((reference) => exists(value.runs, reference, 'Run'));
    if (selected.some((run) => run.principalId === 'owner' || !['completed', 'failed', 'rejected'].includes(run.state))) bad('Only terminal member-request receipts can be pruned', 'RUN_CONFLICT', 409);
    const references = new Set(input.runIds); let messagesRemoved = 0;
    for (const room of state.rooms) { const retained = room.messages.filter((message) => !references.has(message.runId)); messagesRemoved += room.messages.length - retained.length; room.messages = retained; }
    value.runs = value.runs.filter((run) => !references.has(run.id));
    return { result: { prunedIds: [...input.runIds], messagesRemoved }, type: 'run.pruned', target: input.runIds[0], audits: selected.map((run) => ({ target: run.id,
      details: { roomId: run.roomId, principalId: run.principalId, state: run.state, promptHash: digest(run.prompt), bindingsHash: digest(run.bindings) } })) };
  }
  bad('Unsupported governance action');
}

export function beginRun(state, input) {
  if (input.principalId !== 'owner') checkMemberQuota(state, input);
  const scope = compile(state, input.roomId, input.approvedLayerIds ?? [], { pending: input.principalId !== 'owner', principalId: input.principalId });
  checkExpectedContext(scope, input.expectedContextKey);
  const profile = scope.policy?.agentId ? exists(state.workspace?.agents ?? [], scope.policy.agentId, 'Agent') : null;
  if (profile && profile.providerId !== input.providerId) bad('Associated profile uses a different provider; select a matching profile or configure that adapter', 'PROFILE_PROVIDER_MISMATCH', 409);
  text(input.prompt, 128000); text(input.providerId, 80); text(input.model, 256);
  const time = stamp(); const pending = input.principalId !== 'owner';
  const run = { id: uid('run'), roomId: input.roomId, principalId: input.principalId, providerId: input.providerId, model: input.model, providerFingerprint: input.providerFingerprint, prompt: input.prompt,
    bindings: scope.bindings, approvedLayerIds: pending ? [] : scope.approvedLayerIds, audience: scope.grants.map((grant) => grant.memberId), grantIds: scope.grants.map((grant) => grant.grantId), scopeHash: scope.consentHash,
    state: pending ? 'awaiting-approval' : 'running', createdAt: time, updatedAt: time, events: [{ type: pending ? 'approval.requested' : 'provider.started', at: time }] };
  for (const field of ['agentId', 'taskId']) if (scope.policy?.[field]) run[field] = scope.policy[field];
  if (scope.manifest) run.manifestId = scope.manifest.id;
  if (pending && (memberUsage(state).bytes + Buffer.byteLength(JSON.stringify(run)) > MEMBER_LEDGER_BYTES || Buffer.byteLength(JSON.stringify(state)) + Buffer.byteLength(JSON.stringify(run)) > BRAIN_INTAKE_BYTES)) quota('Member request storage budget is full; owner review is required');
  state.governance ??= emptyGovernance(); state.governance.runs.push(run);
  return { run, context: scope.context };
}
function checkedRun(state, run, approvedLayerIds) {
  const scope = compile(state, run.roomId, approvedLayerIds, { principalId: run.principalId });
  if (scope.profileProvider && scope.profileProvider !== run.providerId) bad('Associated profile uses a different provider; request a new run with a matching profile', 'PROFILE_PROVIDER_MISMATCH', 409);
  if (scope.consentHash !== run.scopeHash || JSON.stringify(scope.bindings) !== JSON.stringify(run.bindings)) bad('Room scope or source revisions changed; request a new run', 'RUN_STALE', 409);
  return scope;
}
export function approveRun(state, runId, approvedLayerIds, providerFingerprint) {
  const run = exists(gov(state).runs, runId, 'Run');
  if (run.state !== 'awaiting-approval') bad('Run is not awaiting approval', 'RUN_CONFLICT', 409);
  if (run.providerFingerprint !== providerFingerprint) bad('Provider configuration changed; request a new run', 'RUN_STALE', 409);
  // Reserve space before a paid call: a completion retains the answer in both
  // its receipt and room message, plus the exact prompt and compact events.
  const messageRefs = Buffer.byteLength(JSON.stringify({ sourceIds: run.bindings.map((binding) => binding.sourceId), audience: run.audience }));
  // The adapter permits 128000 answer characters. JSON escapes each control
  // character to at most six bytes, exceeding its raw UTF-8 byte length.
  const completionReserve = 2 * 128000 * 6 + Buffer.byteLength(JSON.stringify(run.prompt)) + 2 * messageRefs + 16384;
  if (memberUsage(state).bytes + completionReserve > MEMBER_LEDGER_BYTES) quota('Member result storage budget is full; prune terminal receipts before approval');
  if (Buffer.byteLength(JSON.stringify(state)) + completionReserve > MAX_BRAIN_BYTES) quota('Brain storage cannot safely retain the worst-case provider result; free space before approval');
  const scope = checkedRun(state, run, approvedLayerIds ?? []); const time = stamp();
  run.state = 'running'; run.approvedLayerIds = scope.approvedLayerIds; run.updatedAt = time; run.events.push({ type: 'owner.approved', at: time }, { type: 'provider.started', at: time });
  return { run, context: scope.context };
}
export function finishRun(state, runId, result, error = false) {
  const run = exists(gov(state).runs, runId, 'Run'); if (run.state !== 'running') bad('Run is not running', 'RUN_CONFLICT', 409);
  const time = stamp();
  if (!error) { checkedRun(state, run, run.approvedLayerIds); text(result, 512000); }
  run.state = error ? 'failed' : 'completed'; run.updatedAt = time; run.completedAt = time;
  if (error) run.error = text(result, 1000); else run.result = result;
  run.events.push({ type: error ? 'provider.failed' : 'provider.completed', at: time });
  return run;
}
export function publicGovernance(state, principal = owner) {
  const value = gov(state);
  const scopes = state.rooms.flatMap((room) => {
    const { scope, grant, permitted } = visibleIds(state, room.id, principal.memberId);
    if (!principal.owner && !grant) return [];
    return [{ roomId: room.id, sourceIds: principal.owner ? scope.selected.map((item) => item.id) : [...permitted], blocked: principal.owner ? scope.blocked : [],
      canSend: (principal.owner || grant?.role === 'participant') && !scope.sharedBlocked.length && (!scope.profileProvider || scope.profileProvider === 'openai-compatible') && ['none', 'active'].includes(scope.manifestStatus), manifestStatus: scope.manifestStatus, contextKey: contextKey(scope), ...(!principal.owner ? { role: grant.role } : {}) }];
  });
  if (principal.owner) return { ...clone(value), layers: value.layers.map((layer) => ({ ...clone(layer), versionKey: digest(layer) })), members: value.members.map(publicMember), scopes };
  const scopeByRoom = new Map(scopes.map((scope) => [scope.roomId, scope]));
  const runs = value.runs.filter((run) => run.audience.includes(principal.memberId) && scopeByRoom.has(run.roomId) &&
    policyFor(state, run.roomId)?.memberGrants.some((grant) => grant.memberId === principal.memberId && run.grantIds.includes(grant.grantId)) &&
    run.bindings.every((binding) => scopeByRoom.get(run.roomId).sourceIds.includes(binding.sourceId))).map((run) => {
    const result = {}; for (const field of ['id', 'roomId', 'prompt', 'state', 'createdAt', 'updatedAt', 'completedAt', 'result', 'error', 'events']) if (run[field] !== undefined) result[field] = clone(run[field]); return result;
  });
  return { layers: [], members: [], manifests: [], runs, scopes, roomPolicies: value.roomPolicies.filter((policy) => scopeByRoom.has(policy.roomId)).map((policy) => ({ roomId: policy.roomId, layerIds: [], memberGrants: [{ memberId: principal.memberId, role: scopeByRoom.get(policy.roomId).role, sourceIds: scopeByRoom.get(policy.roomId).sourceIds }], updatedAt: policy.updatedAt })) };
}
export function viewState(state, principal = owner) {
  const governance = publicGovernance(state, principal);
  if (principal.owner) return { ...clone(state), governance, access: clone(owner) };
  const visible = new Set(governance.scopes.flatMap((scope) => scope.sourceIds)); const runs = new Set(governance.runs.map((run) => run.id));
  const roomIds = new Set(governance.scopes.map((scope) => scope.roomId));
  return { schemaVersion: state.schemaVersion, brainId: state.brainId, name: 'Shared rooms', template: 'personal', access: clone(principal), governance,
    objects: state.objects.filter((object) => visible.has(object.id)).map(({ id: objectId, title, kind, text: body, sourceIds }) => ({ id: objectId, title, kind, text: body, sourceIds })),
    rooms: state.rooms.filter((room) => roomIds.has(room.id)).map((room) => ({ id: room.id, title: room.title, selectedSourceIds: governance.scopes.find((scope) => scope.roomId === room.id).sourceIds,
      messages: room.messages.filter((message) => message.runId && runs.has(message.runId) && message.audience?.includes(principal.memberId)).map(({ audience, ...message }) => clone(message)) })),
    revisions: [], proposals: [], audit: [], conflicts: [], folders: [], connections: [], workspace: { tasks: [], agents: [], manifests: [], collections: [] } };
}
export function portableState(state) {
  const result = clone(state);
  if (result.governance) for (const member of result.governance.members) { delete member.tokenHash; member.revokedAt ??= stamp(); }
  return result;
}
export function recoverRuns(state) {
  for (const run of gov(state).runs) if (run.state === 'running') { const time = stamp(); run.state = 'failed'; run.error = 'Node stopped before the provider result was durably recorded; inspect before retrying.'; run.updatedAt = time; run.completedAt = time; run.events.push({ type: 'node.interrupted', at: time }); }
}
