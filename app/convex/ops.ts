import { internalMutation, mutation } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { safePath, expiry } from './integrity';
import { assertUsableManifest, contextDocumentEligible, resolveContext, tierAllowsContext } from './lib';

// write layer for the screens. every state-changing mutation appends an auditEvent — no silent writes.

const audit = async (ctx: { db: { insert: Function } }, kind: string, summary: string, objectIds: string[] = [], raw: unknown = {}) => {
  await (ctx.db.insert as Function)('auditEvents', { kind, actor: 'you', objectIds, summary, raw, at: Date.now() });
};

// ── manifests: sign publishes a new manifest and moves the room pointer; rollback is a pointer move.
export const manifestSign = mutation({
  args: { room: v.string(), docPaths: v.array(v.string()), objectIds: v.optional(v.array(v.id('brainObjects'))), tiers: v.string(), ttl: v.string(), brief: v.string() },
  handler: async (ctx, { room, docPaths, objectIds, tiers, ttl, brief }) => {
    expiry(ttl);
    const docs = await ctx.db.query('brainObjects').collect();
    for (const path of docPaths) safePath(path);
    const selected = objectIds !== undefined
      ? [...new Set(objectIds)].map((id) => {
        const doc = docs.find((candidate) => candidate._id === id);
        if (!doc || !contextDocumentEligible(doc)) throw new Error('Unknown or unavailable manifest document');
        return doc;
      })
      : [...new Set(docPaths)].map((path) => {
        const matches = docs.filter((doc) => doc.path === path && contextDocumentEligible(doc));
        if (matches.length !== 1) throw new Error('Unknown or ambiguous manifest document; select exact objects');
        return matches[0];
      });
    if (objectIds !== undefined && (docPaths.some((path) => !selected.some((doc) => doc.path === path)) || selected.some((doc) => !docPaths.includes(doc.path!)))) throw new Error('Manifest paths do not match selected objects');
    const policy = await ctx.db.query('tierPolicy').first();
    if (selected.some((doc) => !tierAllowsContext(policy, doc.tier))) throw new Error('Excluded or ask tier cannot enter manifest without scoped consent');
    const key = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    const id = await ctx.db.insert('manifests', { key, room, docHashes: [...new Set(selected.map((d)=>d.hash))], documents: selected.map((doc) => ({ objectId: doc._id, hash: doc.hash, path: doc.path!, tier: doc.tier })), n: selected.length, tiers, ttl, state: 'active', brief, createdAt: Date.now() });
    const r = await ctx.db.query('rooms').withIndex('by_key', (q) => q.eq('key', room)).first();
    if (r) {
      if (r.activeManifestId) { const prev = await ctx.db.get(r.activeManifestId); if (prev && prev.state === 'active') await ctx.db.patch(prev._id, { state: 'superseded' }); }
      await ctx.db.patch(r._id, { activeManifestId: id });
    } else await ctx.db.insert('rooms',{key:room,activeManifestId:id});
    await audit(ctx, 'manifest', 'pinned manifest-' + key + ' · ' + selected.length + ' docs · ' + ttl + ' · no cryptographic signature', [id], { docPaths, objectIds: selected.map((doc) => doc._id), tiers });
    return key;
  }
});

export const manifestRollback = mutation({
  args: { id: v.id('manifests') },
  handler: async (ctx, { id }) => {
    const m = await ctx.db.get(id); if (!m) throw new Error('Unknown manifest');
    assertUsableManifest(m, m.room);
    // Validate bindings before moving the pointer, not just when sending later.
    await resolveContext(ctx, { room: m.room, deny: false, manifestId: id });
    const r = await ctx.db.query('rooms').withIndex('by_key', (q) => q.eq('key', m.room)).first();
    if (r?.activeManifestId === id) return;
    if (r) await ctx.db.patch(r._id, { activeManifestId: id });
    else await ctx.db.insert('rooms', { key: m.room, activeManifestId: id });
    await audit(ctx, 'manifest', 'loaded manifest-' + m.key + ' — room pointer changed; pinned source bindings retained', [id]);
  }
});

export const manifestRevoke = mutation({
  args: { id: v.id('manifests') },
  handler: async (ctx, { id }) => {
    const manifest = await ctx.db.get(id);
    if (!manifest) throw new Error('Unknown manifest');
    if (manifest.state === 'revoked' || manifest.revokedAt !== undefined) return;
    await ctx.db.patch(id, { state: 'revoked', revokedAt: Date.now() });
    // Keep room pointers as revoked sentinels. Clearing one would silently
    // re-enable default policy scope; explicit fresh selection is required.
    await audit(ctx, 'revoke', 'revoked manifest-' + manifest.key + ' · queued and new uses will be blocked', [id], { room: manifest.room });
  }
});

// ── work: assign → run with a per-run grant; the simulated step completes it with evidence.
export const workAssign = mutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const t = await ctx.db.get(taskId); if (!t || t.status === 'done') return;
    const agent = await ctx.db.query('agents').withIndex('by_key',(q)=>q.eq('key','hermes')).first();
    if (!agent || agent.paused) throw new Error('Agent paused or unavailable');
    if (t.status === 'running' || (await ctx.db.query('runs').collect()).some((r)=>r.taskId === taskId && ['running','waiting'].includes(r.state))) return;
    const source = (await ctx.db.query('brainObjects').collect()).find((d)=>d.path === t.sourceRef || d.hash === t.sourceRef);
    const n = (await ctx.db.query('runs').collect()).length;
    const key = '#' + (398 + n);
    const runId = await ctx.db.insert('runs', {
      key, agentKey: 'hermes', task: t.title, taskId, state: 'running',
      saw: { instructionsV: agent.instructionsV, docHashes: source ? [source.hash] : [] }, sawText: 'simulation · instructions v' + agent.instructionsV + ' · ' + t.sourceRef,
      did: 'running · simulated step', evidence: [], startedAt: Date.now()
    });
    const grantId = await ctx.db.insert('grants', { principal: 'hermes', title: t.title + ' → hermes', meta: 'per-run lease · ' + t.sourceRef, objectIds: source ? [source._id] : [], perms: ['read'], runId, noDownload: true });
    await ctx.db.patch(taskId, { status: 'running', assignee: 'hermes' });
    await audit(ctx, 'run', 'assigned "' + t.title + '" → hermes · run ' + key + ' · per-run grant issued', [key]);
    await ctx.scheduler.runAfter(1500, internal.ops.workComplete, { runId, taskId, grantId, key });
  }
});

export const workComplete = internalMutation({
  args: { runId: v.id('runs'), taskId: v.id('tasks'), grantId: v.id('grants'), key: v.string() },
  handler: async (ctx, { runId, taskId, grantId, key }) => {
    const run = await ctx.db.get(runId), task = await ctx.db.get(taskId), grant = await ctx.db.get(grantId);
    if (!run || run.state !== 'running' || run.taskId !== taskId || run.key !== key || !task || task.status !== 'running' || task.assignee !== run.agentKey || !grant || grant.runId !== runId || grant.principal !== run.agentKey) return;
    const agent = await ctx.db.query('agents').withIndex('by_key',(q)=>q.eq('key',run.agentKey)).first();
    if (!agent || agent.paused || grant.revokedAt || (grant.expiresAt && grant.expiresAt <= Date.now())) {
      await ctx.db.patch(runId,{state:'failed',did:'simulation cancelled: agent paused or grant revoked',endedAt:Date.now()});
      await ctx.db.patch(taskId,{status:'queued',assignee:undefined});
      if (!grant.revokedAt) await ctx.db.patch(grantId,{revokedAt:Date.now()});
      await audit(ctx,'run','simulation cancelled at lease check',[runId]); return;
    }
    await ctx.db.patch(runId, { state: 'done', did: 'completed · simulated step only · no external operation', evidence: ['simulation receipt · run ' + key], endedAt: Date.now(), cost: 0 });
    await ctx.db.patch(taskId, { status: 'done', evidenceRunId: runId });
    await ctx.db.patch(grantId, { expiresAt: Date.now(), revokedAt: Date.now() });
    await audit(ctx, 'run', 'run ' + key + ' done · evidence attached · grant expired on completion', [key]);
  }
});

// ── approvals: the gated #413 send
export const approvalDecide = mutation({
  args: { approve: v.boolean(), runId: v.id('runs') },
  handler: async (ctx, { approve, runId }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.state !== 'waiting') return;
    await ctx.db.patch(run._id, { state: approve ? 'done' : 'failed', did: approve ? 'simulation approved · no external send occurred' : 'send declined at the gate · zero external writes', endedAt: Date.now() });
    if (run.taskId) {
      const task = await ctx.db.get(run.taskId);
      const competing = (await ctx.db.query('runs').collect()).some((other)=>other._id !== run._id && other.taskId === run.taskId && ['running','waiting'].includes(other.state));
      if (task && task.assignee === run.agentKey && ['running','waiting'].includes(task.status) && !competing) await ctx.db.patch(task._id,approve ? {status:'done',evidenceRunId:run._id} : {status:'queued',assignee:undefined});
    }
    for (const grant of (await ctx.db.query('grants').collect()).filter((g)=>g.runId === run._id && !g.revokedAt)) await ctx.db.patch(grant._id,{revokedAt:Date.now(),expiresAt:Date.now()});
    await audit(ctx, 'approval', (approve ? 'approved simulation' : 'declined') + ' · run ' + run.key, [run._id]);
  }
});

// ── team / sharing
export const grantRevoke = mutation({
  args: { id: v.id('grants') },
  handler: async (ctx, { id }) => {
    const g = await ctx.db.get(id); if (!g || g.revokedAt) return;
    await ctx.db.patch(id, { revokedAt: Date.now() });
    await audit(ctx, 'revoke', 'revoked · ' + g.title, [g.principal]);
  }
});

export const requestDecide = mutation({
  args: { id: v.id('accessRequests'), approve: v.boolean() },
  handler: async (ctx, { id, approve }) => {
    const q = await ctx.db.get(id); if (!q || q.state !== 'pending') return;
    await ctx.db.patch(id, { state: approve ? 'granted' : 'denied' });
    if (approve) await ctx.db.insert('grants', { principal: q.who, title: q.what, meta: q.why + ' · granted just now', objectIds: [], perms: ['view'], noDownload: true });
    await audit(ctx, 'grant', (approve ? 'granted' : 'denied') + ' · ' + q.what, [q.who]);
  }
});

export const shareGrant = mutation({
  args: { principal: v.string(), title: v.string(), meta: v.string(), perms: v.array(v.string()), expiresAt: v.optional(v.number()), noDownload: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.insert('grants', { ...args, objectIds: [] });
    await audit(ctx, 'grant', 'shared · ' + args.title + ' · ' + args.perms.join('+'), [args.principal]);
  }
});

// ── library: update review honors "declined ▣ = structurally absent"; builder sign inserts the pack.
export const cartridgeUpdateReview = mutation({
  args: { id: v.id('cartridges'), mode: v.union(v.literal('knowledge'), v.literal('exec'), v.literal('stay')) },
  handler: async (ctx, { id, mode }) => {
    const c = await ctx.db.get(id); if (!c || !c.updatePending) return;
    if (mode === 'stay') { await audit(ctx, 'update', c.name + ' · stayed on v' + c.version, [c.key]); return; }
    const vNew = c.updatePending;
    await ctx.db.patch(id, {
      version: vNew, updatePending: undefined,
      meta: 'v' + vNew + ' mounted · by ' + c.publisher + (mode === 'knowledge' ? ' · ▣ declined' : ' · ▣ consented'),
      exec: mode === 'exec', execConsented: mode === 'exec'
    });
    await audit(ctx, mode === 'exec' ? 'capability' : 'update', c.name + ' → v' + vNew + (mode === 'knowledge' ? ' · knowledge accepted · capability declined — structurally absent' : ' · ▣ consented — revocable'), [c.key]);
  }
});

export const cartridgeSign = mutation({
  args: { name: v.string(), purpose: v.string(), templates: v.array(v.string()), docHashes: v.array(v.string()), exec: v.boolean() },
  handler: async (ctx, { name, purpose, templates, docHashes, exec }) => {
    const key = 'bl' + Math.floor(Math.random() * 0xffff).toString(16);
    await ctx.db.insert('cartridges', {
      key, name: name || 'untitled pack', rel: 'owned', templates, docHashes,
      meta: 'v1 · ' + (templates.join(' + ') || 'pack') + ' · signed npub1q7f…3xk2',
      exec, execConsented: exec, version: 1, publisher: 'npub1q7f…3xk2', purpose: purpose || 'no purpose written yet.'
    });
    await audit(ctx, 'install', 'signed cartridge · ' + (name || 'untitled pack') + ' · ' + docHashes.length + ' refs' + (exec ? ' · ▣' : ''), [key]);
  }
});

// ── policies / settings / folders / vault marks / agents
export const policySet = mutation({
  args: { tier: v.string(), mode: v.string() },
  handler: async (ctx, { tier, mode }) => {
    if (!['canon','curated','dashboards','legal','inbox'].includes(tier) || !['index','include','exclude','ask'].includes(mode)) throw new Error('Unsupported tier policy');
    const p = await ctx.db.query('tierPolicy').first(); if (!p) return;
    await ctx.db.patch(p._id, { [tier]: mode } as Record<string, string>);
    await audit(ctx, 'policy', 'tier ' + tier + ' → ' + mode, [tier]);
  }
});

export const settingsUpdate = mutation({
  args: { theme: v.optional(v.string()), density: v.optional(v.string()), opt: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const s = await ctx.db.query('userSettings').first(); if (!s) return;
    await ctx.db.patch(s._id, { ...(args.theme ? { theme: args.theme } : {}), ...(args.density ? { density: args.density } : {}), ...(args.opt ? { opt: { ...s.opt, ...args.opt } } : {}) });
    await audit(ctx, 'policy', 'settings updated', [], args);
  }
});

export const folderAdd = mutation({
  args: { path: v.string(), tier: v.string() },
  handler: async (ctx, { path, tier }) => {
    if (!['auto','canon','curated','dashboards','legal','inbox'].includes(tier)) throw new Error('Unsupported folder tier');
    safePath(path.replace(/^\//,''));
    await ctx.db.insert('watchedFolders', { path, tier, docs: 0, status: 'watching', primary: false });
    await audit(ctx, 'policy', 'watching ' + path + ' · tier ' + tier, [path]);
  }
});

export const folderRemove = mutation({
  args: { id: v.id('watchedFolders') },
  handler: async (ctx, { id }) => {
    const f = await ctx.db.get(id); if (!f) return;
    await ctx.db.delete(id);
    await audit(ctx, 'policy', 'stopped watching ' + f.path, [f.path]);
  }
});

export const starToggle = mutation({
  args: { id: v.id('brainObjects') },
  handler: async (ctx, { id }) => { const d = await ctx.db.get(id); if (d) await ctx.db.patch(id, { starred: !d.starred }); }
});

export const alwaysToggle = mutation({
  args: { id: v.id('brainObjects') },
  handler: async (ctx, { id }) => { const d = await ctx.db.get(id); if (d) { await ctx.db.patch(id, { alwaysLoad: !d.alwaysLoad }); await audit(ctx,'policy','always-load '+(!d.alwaysLoad ? 'enabled' : 'disabled'),[id]); } }
});

export const agentSetModel = mutation({
  args: { key: v.string(), model: v.string() },
  handler: async (ctx, { key, model }) => {
    const a = await ctx.db.query('agents').withIndex('by_key', (q) => q.eq('key', key)).first(); if (!a) return;
    await ctx.db.patch(a._id, { model });
    await audit(ctx, 'model-swap', key + ' → ' + model + ' · identity, memory + grants untouched', [key]);
  }
});

export const agentSetPaused = mutation({
  args: { key: v.string(), paused: v.boolean() },
  handler: async (ctx, { key, paused }) => {
    const a = await ctx.db.query('agents').withIndex('by_key', (q) => q.eq('key', key)).first(); if (!a) return;
    await ctx.db.patch(a._id, { paused });
    await audit(ctx, 'policy', key + (paused ? ' paused — lease issuance frozen, data untouched' : ' resumed'), [key]);
  }
});

export const skillToggle = mutation({
  args: { id: v.id('skills') },
  handler: async (ctx, { id }) => {
    const s = await ctx.db.get(id); if (!s) return;
    await ctx.db.patch(id, { on: !s.on });
    await audit(ctx, 'capability', 'skill ' + s.key + (s.on ? ' disabled' : ' enabled'), [s.key]);
  }
});

// ── capture: derived things land as proposals, never as documents.
export const proposalsAdd = mutation({
  args: {
    items: v.array(v.object({
      kind: v.string(), conf: v.number(), sourceRef: v.string(), brief: v.string(),
      quote: v.optional(v.string()), diff: v.array(v.string()),
      targetPath: v.optional(v.string()), targetTier: v.optional(v.string()), consent: v.optional(v.boolean())
    }))
  },
  handler: async (ctx, { items }) => {
    for (const p of items) {
      if (p.targetPath) safePath(p.targetPath);
      if(p.targetTier && !['canon','curated','dashboards','legal','inbox'].includes(p.targetTier)) throw new Error('Unsupported proposal tier');
      await ctx.db.insert('proposals', { ...p, targetTier: p.targetTier as 'inbox' | undefined, state: 'pending', createdAt: Date.now() });
    }
    await audit(ctx, 'capture', items.length + ' proposals → brain inbox — nothing writes itself', items.map((p) => p.kind));
  }
});
