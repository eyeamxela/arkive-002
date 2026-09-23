import { internalMutation } from './_generated/server';
import { Id } from './_generated/dataModel';

// dev fixture — data copied verbatim from design/arkive-v2.html (class Component: TIERS, NAMES, state, AGM).
// paths, tiers, briefs, hashes and copy must match the prototype exactly. run via `npm run seed`.

const BASE = Date.UTC(2026, 7, 6, 21, 34); // prototype clock: 06 aug 2026 · 21:34

const TIERS = [
  { id: 'canon', n: 9, op: 1.0, d: 9, tok: 4.6 },
  { id: 'curated', n: 20, op: 0.66, d: 6.5, tok: 3.1 },
  { id: 'dashboards', n: 14, op: 0.46, d: 5.5, tok: 1.4 },
  { id: 'legal', n: 8, op: 0.4, d: 5.5, tok: 5.2 },
  { id: 'inbox', n: 58, op: 0.26, d: 4.5, tok: 0.7 }
] as const;

const NAMES: Record<string, string[] | null> = {
  canon: ['xela.md', 'brands.md', 'voice.md', 'operator.md', 'standing-rules.md', 'hermes-brain-canon.md', 'three-brains.md', 'relay-posture.md', 'sovereignty.md'],
  curated: ['arkive-product-blueprint.md', 'graph-brain-architecture.md', 'frtl-ops-build-plan.md', 'xela-system-audit.md', 'buzz-pilot-verdict.md', 'manifest-primitive.md', 'vault-indexer-notes.md', 'exo-dos-stack.md', 'tailscale-posture.md', 'kind-number-table.md', 'listener-transport.md', 'glob-semantics.md', 'jrny-proposal-brief.md', 'zbmd-scope.md', 'per-customer-platform.md', 'night-desk-spec.md', 'capture-loop.md', 'embedding-local.md', 'phase-gates.md', 'divergence-is-debt.md'],
  dashboards: ['night-desk-2026-w31.md', 'night-desk-2026-w30.md', 'fleet-uptime.md', 'relay-health.md', 'vault-growth.md', 'token-spend.md', 'capture-rate.md', 'manifest-log.md', 'brief-archive.md', 'okf-memory-map.md', 'cron-matrix.md', 'skill-inventory.md', 'pilot-verdict-tracker.md', 'audit-window.md'],
  legal: ['msa-jrny.md', 'nda-template.md', 'ip-assignment.md', 'contractor-frtl.md', 'terms-arkive.md', 'dpa-eu.md', 'retention-policy.md', 'sovereignty-clause.md'],
  inbox: null
};

const CENTERS: Record<string, [number, number]> = { canon: [50, 47], curated: [30, 30], dashboards: [72, 27], legal: [79, 65], inbox: [50, 68] };
const SPREAD: Record<string, number> = { canon: 11, curated: 15, dashboards: 12, legal: 11, inbox: 34 };

// ported verbatim from Component.rng — seed 20260805 reproduces the prototype's exact hash sequence
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// port of Component.graph() — identical rng consumption order (positions, hash, drift, edges)
// so every path and hash matches the prototype. x/y are discarded; the app relays out live.
function buildGraph() {
  const r = rng(20260805);
  const nodes: { id: string; tier: string; path: string; hash: string }[] = [];
  const pos: { x: number; y: number }[] = [];
  TIERS.forEach((T) => {
    const count = Math.max(3, Math.round(T.n));
    for (let i = 0; i < count; i++) {
      const c = CENTERS[T.id], s = SPREAD[T.id];
      let x = 0, y = 0, tries = 0;
      do {
        const ang = r() * Math.PI * 2, rad = Math.sqrt(r()) * s;
        x = c[0] + Math.cos(ang) * rad * 1.25;
        y = c[1] + Math.sin(ang) * rad * 0.92;
        tries++;
      } while (tries < 14 && pos.some((n) => Math.hypot(n.x - x, (n.y - y) * 0.7) < 2.4));
      const list = NAMES[T.id];
      const name = list ? list[i % list.length] : 'hermes/2026-0' + (6 + (i % 2)) + '-' + String(1 + (i * 7) % 28).padStart(2, '0') + '-' + String(1 + (i * 13) % 23).padStart(2, '0') + '30.md';
      pos.push({ x: Math.max(5, Math.min(95, x)), y: Math.max(7, Math.min(92, y)) });
      nodes.push({ id: T.id + ':' + i, tier: T.id, path: T.id + '/' + name, hash: 'sha256:' + Math.floor(r() * 0xfffff).toString(16).padStart(5, '0') });
      r(); // drift roll — consumed to keep the sequence aligned with the prototype
    }
  });
  const byTier: Record<string, number[]> = {};
  nodes.forEach((n, i) => { (byTier[n.tier] = byTier[n.tier] || []).push(i); });
  const edges: [number, number][] = [];
  nodes.forEach((n, i) => {
    const same = byTier[n.tier];
    if (same.length > 1) {
      const j = same[Math.floor(r() * same.length)];
      if (j !== i) edges.push([i, j]);
    }
    if (n.tier === 'curated' && r() < 0.75) edges.push([i, byTier.canon[Math.floor(r() * byTier.canon.length)]]);
    if (n.tier === 'inbox' && r() < 0.4) edges.push([i, byTier.curated[Math.floor(r() * byTier.curated.length)]]);
    if (n.tier === 'dashboards' && r() < 0.5) edges.push([i, byTier.canon[Math.floor(r() * byTier.canon.length)]]);
    if (n.tier === 'legal' && r() < 0.4) edges.push([i, byTier.curated[Math.floor(r() * byTier.curated.length)]]);
  });
  return { nodes, edges };
}

const AUTHORITY: Record<string, string> = { canon: 'canonical', curated: 'reviewed', dashboards: 'reviewed', legal: 'approved', inbox: 'draft' };
const STAR_IDS = ['canon:0', 'curated:1'];
const ALWAYS_IDS = ['canon:4', 'canon:0', 'canon:5'];

const SEED_TABLES = [
  'brainObjects', 'proposals', 'manifests', 'rooms', 'messages', 'contextSummaries', 'agents', 'runs', 'tasks',
  'cartridges', 'grants', 'accessRequests', 'skills', 'connectors', 'plugins', 'watchedFolders', 'syncState', 'tierPolicy', 'userSettings'
] as const;

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of SEED_TABLES) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }

    // ── brainObjects: 9 canon · 20 curated · 14 dashboards · 8 legal · 58 inbox
    const { nodes, edges } = buildGraph();
    if (nodes.some((n) => n.path.startsWith('inbox/dreams/'))) throw new Error('sealed tier violation: inbox/dreams/** must never get a row');
    const docIds: Id<'brainObjects'>[] = [];
    const idByNode: Record<string, Id<'brainObjects'>> = {};
    for (const n of nodes) {
      const id = await ctx.db.insert('brainObjects', {
        type: 'source', path: n.path, title: n.path.split('/').pop()!, tier: n.tier as 'canon',
        authority: AUTHORITY[n.tier], lifecycle: n.tier === 'inbox' ? 'inbox' : 'active', provenance: 'fixture', fixture: true, hash: n.hash,
        derivedFrom: [], relations: [],
        permissions: { owner: 'you', sensitivity: n.tier === 'legal' ? 'restricted' : 'private' },
        reviewStatus: 'n/a', starred: STAR_IDS.includes(n.id), alwaysLoad: ALWAYS_IDS.includes(n.id),
        createdAt: BASE, modifiedAt: BASE
      });
      docIds.push(id);
      idByNode[n.id] = id;
    }
    const relBySource: Record<number, { to: Id<'brainObjects'>; kind: string }[]> = {};
    for (const [i, j] of edges) (relBySource[i] = relBySource[i] || []).push({ to: docIds[j], kind: 'edge' });
    for (const [i, relations] of Object.entries(relBySource)) await ctx.db.patch(docIds[Number(i)], { relations });

    // ── proposals: state.inbox p1–p6
    const proposals = [
      { kind: 'note', state: 'pending', conf: 0.92, sourceRef: 'from rec:2026-08-06 · 00:41', brief: 'this capture reads like a durable concept — promote it to curated/red-park-concept.md so it stops living in a raw capture.', quote: '“infrared film turns the park red — that is the whole billboard.”', diff: ['creates curated/red-park-concept.md', 'tier curated', 'hash pinned on accept'], targetPath: 'curated/red-park-concept.md', targetTier: 'curated' as const },
      { kind: 'task', state: 'pending', conf: 0.88, sourceRef: 'from rec:2026-08-06 · 04:28', brief: 'brief nezu on the moodboard before friday — extracted as a task. assignable to an agent from the agents tab.', quote: '“nezu needs the moodboard before the print window closes.”', diff: ['creates inbox/tasks/brief-nezu.md', 'tier inbox', 'assignable'], targetPath: 'inbox/tasks/brief-nezu.md', targetTier: 'inbox' as const },
      { kind: 'person', state: 'pending', conf: 0.81, sourceRef: 'from dm:hermes · 3 mentions', brief: 'link “nezu” across three captures to npub1nz0…7ta1 — one person, one reference.', diff: ['links 3 docs', 'no new file'], rel: ['curated/night-desk-spec.md', 'canon/brands.md'] },
      { kind: 'memory', state: 'pending', conf: 0.74, sourceRef: 'from dm:hermes · recurring', brief: 'operator prefers terse briefs — two lines, no exclamation marks. memory writes always need explicit consent.', diff: ['appends canon/ops/operator-prefs.md', 'consent required'], targetPath: 'canon/ops/operator-prefs.md', targetTier: 'canon' as const, consent: true },
      { kind: 'relation', state: 'pending', conf: 0.69, sourceRef: 'inferred · co-cited 6×', brief: 'propose an edge: graph-brain-architecture.md ↔ three-brains.md — co-cited in six answers this week.', diff: ['adds 1 edge', 'no content change'], rel: ['curated/graph-brain-architecture.md', 'canon/three-brains.md'] },
      { kind: 'note', state: 'pending', conf: 0.41, sourceRef: 'low confidence · possible duplicate', brief: 'looks like a duplicate of curated/capture-loop.md — merge into it, or dismiss with a reason.', diff: ['merges into capture-loop.md', 'original kept in history'], dup: true, targetPath: 'curated/capture-loop.md', targetTier: 'curated' as const }
    ];
    for (const p of proposals) await ctx.db.insert('proposals', { ...p, createdAt: BASE });

    // ── manifests: state.manifests + a7f2c1 (state.mid — the dm:hermes session manifest, canon only)
    const canonPaths = nodes.filter((n) => n.tier === 'canon').map((n) => n.path);
    const midA7 = await ctx.db.insert('manifests', { key: 'a7f2c1', room: 'dm:hermes', docHashes: canonPaths, n: 9, tiers: 'canon', ttl: 'session', state: 'active', brief: 'canon only', createdAt: BASE });
    const mid8ea = await ctx.db.insert('manifests', { key: '8ea201', room: '#xela', docHashes: ['dashboards/night-desk-2026-w31.md', 'dashboards/fleet-uptime.md', 'dashboards/token-spend.md', '+1'], n: 4, tiers: 'dashboards', ttl: 'until-revoked', state: 'active', brief: 'night-desk source set — dashboards only, feeds the 21:30 brief', createdAt: Date.UTC(2026, 7, 6, 8, 2) });
    await ctx.db.insert('manifests', { key: '4b90de', room: 'dm:hermes', docHashes: ['canon/xela.md', 'canon/brands.md', 'inbox/hermes/2026-07-*.md', '+21'], n: 24, tiers: 'canon+curated+inbox', ttl: 'session', state: 'superseded', brief: 'brief for jrny proposal — canon + last 30d captures, no dreams', createdAt: Date.UTC(2026, 7, 5, 9, 14) });
    await ctx.db.insert('manifests', { key: 'c31a77', room: 'dm:hermes', docHashes: ['legal/msa-jrny.md', 'legal/ip-assignment.md', 'canon/brands.md', '+4'], n: 7, tiers: 'legal+canon', ttl: 'session', state: 'revoked', brief: 'legal review — msa + brand canon, inbox excluded', createdAt: Date.UTC(2026, 7, 2, 16, 40) });

    // ── rooms: manifest pointer lives on the room
    await ctx.db.insert('rooms', { key: 'dm:hermes', activeManifestId: midA7 });
    await ctx.db.insert('rooms', { key: '#xela', activeManifestId: mid8ea });

    // ── messages: state.msgs (not in the 01 table list, but part of state — chat panel needs them)
    const msgs = [
      { role: 'op', text: 'given deny-by-tier, what can you actually see right now?', at: Date.UTC(2026, 7, 6, 21, 31), snap: 'canon only', cites: [] as string[] },
      { role: 'ag', text: 'canon only. nine docs, 41k tokens — identity, brands, voice, standing rules, relay posture. i cannot see inbox, dashboards, legal or dreams until you widen scope. nothing widens silently.', at: Date.UTC(2026, 7, 6, 21, 31), snap: '9 docs', cites: ['canon/xela.md', 'canon/standing-rules.md', 'canon/relay-posture.md'] },
      { role: 'op', text: 'manifest primitive, one line', at: Date.UTC(2026, 7, 6, 21, 33), snap: 'canon only', cites: [] as string[] },
      { role: 'ag', text: 'scope becomes an object — signed by your npub, pinned by content hash, bound to one dm or channel, revocable by supersession. the audit answer falls out for free.', at: Date.UTC(2026, 7, 6, 21, 33), snap: '9 docs', cites: ['curated/graph-brain-architecture.md'] }
    ];
    for (const m of msgs) await ctx.db.insert('messages', { room: 'dm:hermes', ...m });

    // ── contextSummaries: state.ctxVersions
    await ctx.db.insert('contextSummaries', { room: 'dm:hermes', version: 'v1', tokens: 1.2, on: false, note: 'sessions 1–9', at: Date.UTC(2026, 7, 2) });
    await ctx.db.insert('contextSummaries', { room: 'dm:hermes', version: 'v2', tokens: 1.8, on: false, note: 'sessions 1–14', at: Date.UTC(2026, 7, 4) });
    await ctx.db.insert('contextSummaries', { room: 'dm:hermes', version: 'v3', tokens: 2.1, on: true, note: 'sessions 1–18 · rolling', at: Date.UTC(2026, 7, 6) });

    // ── agents: AGM + agentModel + agentPaused (ledger model falls back to 'haiku' like the prototype)
    const agents = [
      { key: 'hermes', name: 'hermes', purpose: 'routes work, reviews context, coordinates the specialists, returns the operator debrief. never sends without you.', model: 'sonnet', harness: 'launchd · mac mini', paused: false },
      { key: 'nezu', name: 'nezu', purpose: 'turns dashboards + curated docs into two-line briefs.', model: 'haiku', harness: 'launchd · mac mini', paused: false },
      { key: 'scout', name: 'scout', purpose: 'flags duplicates + drift in inbox/ before they spread.', model: 'haiku', harness: 'droplet', paused: true },
      { key: 'ledger', name: 'ledger', purpose: 'assembles the 21:30 fleet brief and posts it — only after the operator gate.', model: 'haiku', harness: 'droplet', paused: false }
    ];
    for (const a of agents) await ctx.db.insert('agents', { ...a, instructionsV: 4, memoryPolicy: 'proposals via brain inbox — 0 silent writes' });

    // ── runs: state.runs (cost strings '$0.41'/'—' → number | undefined; saw string kept verbatim in sawText)
    const dashDocs = ['dashboards/night-desk-2026-w31.md', 'dashboards/fleet-uptime.md', 'dashboards/token-spend.md', '+1'];
    await ctx.db.insert('runs', { key: '#413', agentKey: 'hermes', task: 'post 21:30 brief → #xela', state: 'waiting', saw: { instructionsV: 4, manifestId: mid8ea, docHashes: dashDocs }, sawText: 'instructions v4 · manifest-8ea201: 4 dashboards docs at pinned hashes — nothing else readable', did: 'draft ready · the send is gated on your approval · grant dies after the send', evidence: [], startedAt: Date.UTC(2026, 7, 6, 21, 30) });
    const run412 = await ctx.db.insert('runs', { key: '#412', agentKey: 'hermes', task: 'draft 21:30 brief', state: 'done', cost: 0.41, saw: { instructionsV: 4, manifestId: mid8ea, docHashes: dashDocs }, sawText: 'instructions v4 · manifest-8ea201 at pinned hashes · 4 docs', did: 'brief.md drafted · cited fleet-uptime.md ×2 · grant expired 21:31 · 0 out-of-scope reads', evidence: [], startedAt: Date.UTC(2026, 7, 6, 21, 25), endedAt: Date.UTC(2026, 7, 6, 21, 31) });
    await ctx.db.insert('runs', { key: '#405', agentKey: 'hermes', task: 'draft 21:30 brief · opus trial', state: 'done', cost: 0.89, saw: { instructionsV: 4, manifestId: mid8ea, docHashes: dashDocs }, sawText: 'same manifest, same instructions — only the model differed', did: 'longer draft, 2× the cost · you kept #412 · comparison logged as a version event', evidence: [], startedAt: Date.UTC(2026, 7, 5, 21, 25), endedAt: Date.UTC(2026, 7, 5, 21, 32) });
    await ctx.db.insert('runs', { key: '#398', agentKey: 'nezu', task: 'summarize inbox captures', state: 'failed', cost: 0.02, saw: { instructionsV: 4, docHashes: [] }, sawText: 'inbox manifest @ f0a1b2 · 12 docs', did: 'parser crashed · zero writes occurred · retry re-uses the same pinned context, no re-grant', evidence: [], startedAt: Date.UTC(2026, 7, 4, 21, 12), endedAt: Date.UTC(2026, 7, 4, 21, 13) });

    // ── tasks: state.tasks (t3 evidence 'run #412' → evidenceRunId)
    await ctx.db.insert('tasks', { title: 'brief nezu on the moodboard', status: 'queued', due: 'fri', sourceRef: 'rec 2026-08-06 · 04:28' });
    await ctx.db.insert('tasks', { title: 'lock aerochrome film stock vendor', status: 'blocked', assignee: 'you', due: 'aug 22', sourceRef: 'note: red-park-concept' });
    await ctx.db.insert('tasks', { title: 'weekly fleet digest', status: 'done', assignee: 'hermes', due: '—', sourceRef: 'schedule', evidenceRunId: run412 });

    // ── cartridges: state.carts (docHashes = realDocs where the prototype has them, else the display list)
    await ctx.db.insert('cartridges', { key: 'jrny01', name: 'jrny-brief pack', rel: 'owned', templates: [], docHashes: ['canon/xela.md', 'canon/brands.md', 'curated/jrny-proposal-brief.md', 'canon/voice.md', 'curated/manifest-primitive.md', 'curated/exo-dos-stack.md'], meta: 'v1 · 6 refs · signed npub1q7f…3xk2', exec: false, execConsented: false, version: 1, publisher: 'npub1q7f…3xk2', purpose: 'canon voice plus the jrny proposal set — the whole context in one signed object another brain can mount.' });
    await ctx.db.insert('cartridges', { key: 'nezu03', name: 'nezu-desk pack', rel: 'installed', templates: [], docHashes: ['nezu/print-specs.md', 'nezu/vendors.md', '+12'], meta: 'v2 mounted · by npub1nz0…7ta1 · update v3 proposed', exec: true, execConsented: true, version: 2, publisher: 'npub1nz0…7ta1', purpose: 'nezu’s print production set, mounted behind its own boundary. origin and the update link stay attached for the life of the install.', updatePending: 3 });
    await ctx.db.insert('cartridges', { key: 'frtl02', name: 'frtl math pack', rel: 'temp', templates: [], docHashes: ['frtl/campaign-math.md', '+2'], meta: 'temporary · this room only · unverified signer', exec: false, execConsented: false, version: 1, publisher: 'unverified signer', purpose: 'available to dm:hermes only — dies with the session and never lands in the vault.' });

    // ── grants: state.tmOut
    await ctx.db.insert('grants', { principal: 'nezu', title: 'jrny working set → nezu', meta: 'view + edit · granted 11 aug · audited', objectIds: [], perms: ['view', 'edit'], noDownload: false });
    await ctx.db.insert('grants', { principal: 'kiln', title: 'moodboard canvas → kiln', meta: 'guest link · expires 01 sep · downloads blocked', objectIds: [], perms: ['view', 'comment'], noDownload: true, expiresAt: Date.UTC(2026, 8, 1) });

    // ── accessRequests: state.tmReqs (q2 who: 'hermes' verbatim, though the text names scout)
    await ctx.db.insert('accessRequests', { who: 'kiln', what: 'kiln (guest) requests: moodboard canvas', why: 'wants view + comment · external · 30d expiry suggested', state: 'pending', at: BASE });
    await ctx.db.insert('accessRequests', { who: 'hermes', what: 'scout (agent) requests: curated/print-specs.md', why: 'for drift watching · read-only · per-run grant', state: 'pending', at: BASE });

    // ── skills · connectors · plugins: state.capSkills / capConns / bie-full-stack pane
    await ctx.db.insert('skills', { key: 'json-ld-blog-schema', by: 'you', on: true, scope: 'hermes', updatedAt: Date.UTC(2026, 3, 17) });
    await ctx.db.insert('skills', { key: 'morning', by: 'anthropic', on: true, scope: 'all', updatedAt: Date.UTC(2026, 7, 13) });
    await ctx.db.insert('skills', { key: 'skill-creator', by: 'anthropic', on: false, scope: 'none', updatedAt: Date.UTC(2026, 7, 13) });
    await ctx.db.insert('skills', { key: 'web-artifacts-builder', by: 'anthropic', on: true, scope: 'hermes', updatedAt: Date.UTC(2026, 7, 13) });
    const conns: [string, string][] = [['html.to.design', 'error'], ['notion', 'error'], ['github integration', 'connected'], ['gmail', 'connected'], ['google calendar', 'connected'], ['figma', 'connected'], ['google drive', 'off'], ['slack', 'off']];
    for (const [key, status] of conns) await ctx.db.insert('connectors', { key, status });
    await ctx.db.insert('plugins', { key: 'bie-full-stack', on: true, execConsented: false, version: 1, publisher: '—' });

    // ── watchedFolders · syncState · tierPolicy · userSettings
    await ctx.db.insert('watchedFolders', { path: '~/vault-xela', tier: 'auto', docs: 109, status: 'watching', primary: true });
    await ctx.db.insert('watchedFolders', { path: '~/desktop/captures', tier: 'inbox', docs: 12, status: 'watching', primary: false });
    await ctx.db.insert('syncState', { pending: 3, indexing: false, head: '7c41e0a', lastScanAt: BASE - 14000, macOnline: true, queued: 0 });
    await ctx.db.insert('tierPolicy', { canon: 'index', curated: 'index', dashboards: 'index', legal: 'index', inbox: 'index', dreams: 'exclude' });
    await ctx.db.insert('userSettings', {
      theme: 'near-black', density: 'comfortable',
      opt: {
        captureAlerts: true, manifestAlerts: true, driftAlerts: true, briefAlerts: false, quiet: true,
        watchOnWake: true, autoReindex: true, localEmbed: true, keepAwake: false,
        autoSupersede: true, hashPin: true,
        approvalGate: true, shareNoDl: true,
        xWorkflows: false, xPrefetch: false, xServerEnforce: false, xFederation: false
      }
    });

    const counts: Record<string, number> = {};
    for (const table of SEED_TABLES) counts[table] = (await ctx.db.query(table).collect()).length;
    return counts;
  }
});
