import { getFunctionName } from 'convex/server';
import * as panels from '../../convex/panels';
import * as workspace from '../../convex/workspace';
import * as messages from '../../convex/messages';
import * as documents from '../../convex/documents';
import * as chat from '../../convex/chat';
import * as ops from '../../convex/ops';
import * as proposals from '../../convex/proposals';

// Test-only in-memory implementation, never a Convex client, no network transport.
const modules: Record<string, any> = { panels, workspace, messages, documents, chat, ops, proposals };
export const tables = new Map<string, any[]>();
let sequence = 0;
export let dataRevision = 0;
let notifyRevision = 0;
let failSend = false;
let failMutation: string | null = null;
const listeners = new Set<() => void>();
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getRevision = () => notifyRevision;
export const notify = () => { notifyRevision++; listeners.forEach(listener => listener()); };
export const changed = () => { dataRevision++; notify(); };
export const table = (name: string): any[] => { if (!tables.has(name)) tables.set(name, []); return tables.get(name)!; };
export const db: any = {
  async get(id: string) { return [...tables.values()].flat().find(row => row._id === id) ?? null; },
  async insert(name: string, value: any) { const id = name + ':fixture-' + (++sequence); table(name).push({ ...structuredClone(value), _id: id, _creationTime: Date.now() }); return id; },
  async patch(id: string, value: any) { const row = await db.get(id); if (!row) throw Error('Missing fixture row ' + id); Object.assign(row, structuredClone(value)); },
  async delete(id: string) { for (const rows of tables.values()) { const index = rows.findIndex(row => row._id === id); if (index >= 0) rows.splice(index, 1); } },
  query(name: string) {
    let rows = [...table(name)];
    const query: any = {
      withIndex(_name: string, filter?: (range: any) => void) {
        if (filter) { const criteria: [string, unknown][] = []; const range = { eq(key: string, value: unknown) { criteria.push([key, value]); return range; } }; filter(range); rows = rows.filter(row => criteria.every(([key, value]) => row[key] === value)); }
        return query;
      },
      order(direction: string) { if (direction === 'desc') rows.reverse(); return query; },
      async collect() { return structuredClone(rows); },
      async first() { return structuredClone(rows[0] ?? null); },
      async take(count: number) { return structuredClone(rows.slice(0, count)); },
    }; return query;
  },
};
const queued: { delay: number; name: string; args: any }[] = [];
const ctx = {
  db,
  auth: { async getUserIdentity() { return null; } },
  scheduler: { async runAfter(delay: number, reference: any, args: any) { queued.push({ delay, name: getFunctionName(reference), args: structuredClone(args) }); } },
};
export function publicHandler(name: string): any {
  const [moduleName, exportName] = name.split(':');
  const handler = modules[moduleName]?.[exportName];
  if (!handler || handler.isInternal || typeof handler._handler !== 'function') throw Error('Isolated fixture only supports public handler ' + name);
  return handler;
}
export async function queryFixture(name: string, args: any) { return publicHandler(name)._handler(ctx, args); }
let mutationChain: Promise<unknown> = Promise.resolve();
export function mutateFixture(name: string, args: any) {
  const operation = mutationChain.then(async () => {
    if (name === 'chat:sendMessage' && failSend) { failSend = false; throw Error('Isolated fixture: injected send failure. Draft is safe to retry.'); }
    if (name === failMutation) { failMutation = null; throw Error('Isolated fixture: injected mutation failure. No changes saved.'); }
    const backup = structuredClone(tables); const queueSize = queued.length;
    try {
      const value = await publicHandler(name)._handler(ctx, args);
      changed();
      for (const job of queued.splice(queueSize)) {
        // Only this explicitly allowlisted reference-only simulation may run.
        // It uses the in-memory ctx above, never a provider or real Convex client.
        if (job.name === 'chat:reply') window.setTimeout(() => {
          const replyOperation = mutationChain.then(async () => {
            await (chat.reply as any)._handler(ctx, job.args);
            changed();
          });
          mutationChain = replyOperation.catch(error => { console.error('Fixture reply failed', error); });
        }, Math.min(job.delay, 850));
      }
      return value;
    } catch (error) { tables.clear(); for (const [name, rows] of backup) tables.set(name, rows); queued.length = queueSize; throw error; }
  });
  mutationChain = operation.catch(() => {}); return operation;
}
export const failNextSend = () => { failSend = true; };
export const failNextMutation = (name: string) => { failMutation = name; };
export const fixtureSnapshot = () => structuredClone(Object.fromEntries(tables));

export async function initializeFixture() {
  const now = Date.now();
  const docs = [];
  for (const tier of ['canon', 'curated', 'dashboards', 'legal', 'inbox']) for (let i = 1; i <= 4; i++) {
    docs.push(await db.insert('brainObjects', { type: 'source', path: tier + '/fixture-' + i + '.md', title: tier + ' fixture ' + i, tier, content: '# Synthetic ' + tier + ' fixture ' + i + '\n\nThis is generated UI test content, not user data.', authority: 'original', lifecycle: 'active', provenance: 'fixture', fixture: true, hash: 'sha256:fixture-' + tier + '-' + i, derivedFrom: [], relations: [], permissions: { owner: 'you', sensitivity: 'private' }, reviewStatus: 'reviewed', starred: i === 1, alwaysLoad: tier === 'canon' && i === 1, createdAt: now, modifiedAt: now }));
  }
  for (let i = 0; i < docs.length - 1; i++) await db.patch(docs[i], { relations: [{ to: docs[i + 1], kind: 'related' }] });
  await db.insert('tierPolicy', { canon: 'index', curated: 'index', dashboards: 'index', legal: 'index', inbox: 'index', dreams: 'exclude' });
  await db.insert('syncState', { head: 'fixture-only', pending: 0, indexing: false, lastScanAt: now, macOnline: true, queued: 0 });
  await db.insert('userSettings', { theme: 'near-black', density: 'comfortable', opt: { railOpen: true } });
  for (const [index, room] of ['dm:hermes', '#xela', 'dm:nezu'].entries()) {
    const tier = index === 0 ? 'canon' : index === 1 ? 'dashboards' : 'curated';
    const docHashes = table('brainObjects').filter(doc => doc.tier === tier).map(doc => doc.hash);
    const manifest = await db.insert('manifests', { key: 'fixture-' + index, room, docHashes, n: docHashes.length, tiers: tier, ttl: 'session', state: 'active', brief: 'Synthetic ' + tier + ' reference', createdAt: now });
    await db.insert('rooms', { key: room, activeManifestId: manifest });
    await db.insert('contextSummaries', { room, version: 'v1', tokens: 1.4, on: true, note: 'isolated fixture summary', at: now });
    for (let j = 0; j < 12; j++) await db.insert('messages', { room, role: j % 2 ? 'ag' : 'op', text: (j % 2 ? 'Synthetic reply ' : 'Synthetic question ') + (j + 1) + ' in ' + room + '. This room has independent context and a retained draft.', cites: j % 2 ? [tier + '/fixture-1.md'] : [], snap: 'fixture context', at: now - (12 - j) * 60000 });
    const run = await db.insert('runs', { key: '#fixture-' + index, agentKey: index === 2 ? 'nezu' : 'hermes', task: 'Synthetic room ' + index + ' action', state: index === 0 ? 'running' : 'waiting', saw: { instructionsV: 1, manifestId: manifest, docHashes }, sawText: docHashes.length + ' exact fixture hashes', did: 'No real operation. Isolated fixture only.', evidence: [], startedAt: now - index * 10000 });
    await db.insert('grants', { principal: index === 2 ? 'nezu' : 'hermes', title: 'Synthetic run grant', meta: 'isolated fixture', runId: run, objectIds: [], perms: ['view'], noDownload: true });
  }
  for (const key of ['hermes', 'nezu', 'scout', 'ledger']) await db.insert('agents', { key, name: key, model: 'fixture-model', paused: false, instructionsV: 1 });
  await db.insert('skills', { key: 'fixture-reader', by: 'test', on: true, scope: 'all', updatedAt: now });
  await db.insert('cartridges', { key: 'fixture-pack', name: 'Synthetic fixture pack', rel: 'installed', templates: [], docHashes: [], meta: 'test only', exec: false, execConsented: false, version: 1, publisher: 'fixture', purpose: 'UI testing only' });
  await db.insert('proposals', { kind: 'memory', state: 'pending', consent: false, conf: .9, sourceRef: 'inbox/fixture-1.md', brief: 'Synthetic preference requiring explicit consent.', diff: ['creates curated/fixture-memory.md'], targetPath: 'curated/fixture-memory.md', targetTier: 'curated', createdAt: now });
  await db.insert('proposals', { kind: 'task', state: 'pending', consent: false, conf: .85, sourceRef: 'inbox/fixture-2.md', brief: 'Synthetic review task', diff: ['creates inbox/fixture-task.md'], targetPath: 'inbox/fixture-task.md', targetTier: 'inbox', createdAt: now });
  await db.insert('tasks', { title: 'Synthetic queued task', status: 'queued', sourceRef: 'inbox/fixture-1.md' });
  await db.insert('grants', { principal: 'kiln', title: 'Synthetic shared grant', meta: 'fixture metadata only', objectIds: [], perms: ['view'], noDownload: true });
  await db.insert('accessRequests', { who: 'nezu', what: 'Synthetic access request', why: 'UI testing only', state: 'pending' });
  changed();
}
