import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

// port target: design/arkive-v2.html [data-screen-label='agents'] — approval banner + preflight sheet, network/list
// views, route detail overlay, agent drawer (9 tabs + model swap + actions), agent log (latest 50, filter + expand).
// simulated locally (no ops mutation exists): delegation revoke/restore · retry from pinned context · new agent….

const O = '#ff5a1f';
const mono = "'IBM Plex Mono', monospace";

// Component.AGM — agent identity constants (verbatim)
const AGM: Record<string, { glyph: string; role: string; node: string; npub: string; purpose: string }> = {
  hermes: { glyph: '◉', role: 'command layer', node: 'launchd · mac mini', npub: 'npub1h3r…m9s4', purpose: 'routes work, reviews context, coordinates the specialists, returns the operator debrief. never sends without you.' },
  nezu: { glyph: '◆', role: 'desk · briefs', node: 'launchd · mac mini', npub: 'npub1nz0…7ta1', purpose: 'turns dashboards + curated docs into two-line briefs.' },
  scout: { glyph: '◇', role: 'inbox watch', node: 'droplet', npub: 'npub1sc0…4qq8', purpose: 'flags duplicates + drift in inbox/ before they spread.' },
  ledger: { glyph: '▥', role: 'fleet + posting', node: 'droplet', npub: 'npub1ldg…2rr7', purpose: 'assembles the 21:30 fleet brief and posts it — only after the operator gate.' }
};

// agRouteBody — verbatim
const ROUTE_BODY: Record<string, string> = {
  nezu: 'kind: delegation — hermes hands brief-drafting to nezu\ncarries: task + a per-run grant (2 curated docs, pinned hashes)\nnever carries: standing access, canon, ▣ capability\nlast handoff: task “brief nezu — moodboard”\nfailure path: run #398 failed safely — zero writes, retry re-uses the pinned context',
  scout: 'kind: routing — hermes routes inbox triage to scout\ncarries: inbox/ read-only lease, renewed per sweep\nnever carries: write access, canon, sends\nlast sweep: 21:12 · 12 docs · 1 duplicate flagged',
  ledger: 'kind: handoff — ledger assembles + posts the 21:30 brief\ncarries: dashboards manifest @ pinned hashes\ngated: every post waits at the operator gate (approve on this tab)\nlast post: yesterday 21:30 · evidence attached to run #412'
};

const WHEN: Record<string, string> = { '#414': 'now', '#413': '21:30', '#412': '21:30', '#405': '20:12', '#398': '19:44' };
const D_TABS = ['identity', 'instructions', 'memory', 'knowledge', 'permissions', 'tools', 'runs', 'events', 'relationships'];
const SPECS = ['nezu', 'scout', 'ledger'] as const;

const fmtCost = (c?: number) => (c == null ? '—' : '$' + c.toFixed(2));
const agStFg = (st: string) => (st === 'running' || st === 'routing' ? O : st === 'waiting for approval' || st === 'waiting on you' ? '#d9a13a' : st === 'completed' ? '#6ec48a' : st === 'failed' ? '#cf4a3a' : '#5c5c5c');

type DRow = { k: string; v: string; fg: string };
type DAct = { label: string; onClick: () => void; bg: string; fg: string };

export function AgentsScreen({ focusRun }: { focusRun?: string | null }) {
  const agentsQ = useQuery(api.panels.agents) ?? [];
  const runsQ = useQuery(api.panels.runs);
  const tasks = useQuery(api.panels.tasks) ?? [];
  const auditEvents = useQuery(api.panels.auditEvents, {}) ?? [];
  const skills = useQuery(api.panels.skills) ?? [];
  const setModel = useMutation(api.ops.agentSetModel);
  const setPausedMut = useMutation(api.ops.agentSetPaused);
  const approvalDecide = useMutation(api.ops.approvalDecide);
  const workAssign = useMutation(api.ops.workAssign);

  const [agView, setAgView] = useState<'network' | 'list'>('network');
  const [agSel, setAgSel] = useState<string | null>(null);
  const [agDrawer, setAgDrawer] = useState<string | null>(null);
  const [agDTab, setAgDTab] = useState('identity');
  const [agRoute, setAgRoute] = useState<string | null>(null);
  const [agQ, setAgQ] = useState('');
  const [agLogF, setAgLogF] = useState('all');
  const [agActiveOnly, setAgActiveOnly] = useState(false);
  const [agZoom, setAgZoom] = useState(1);
  const [agDeleg, setAgDeleg] = useState<Record<string, boolean>>({});
  const [selRun, setSelRun] = useState<string | null>('#413');
  const [pfOpen, setPfOpen] = useState(false);
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  // retry is simulated locally — no ops mutation exists for it (gap)
  const [retrySim, setRetrySim] = useState<Record<string, { state: string; did: string; cost?: number }>>({});
  const retryT = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (retryT.current) clearTimeout(retryT.current); }, []);

  const model: Record<string, string> = {};
  const paused: Record<string, boolean> = {};
  for (const a of agentsQ) { model[a.key] = a.model; paused[a.key] = a.paused; }

  // newest first, local retry overrides merged over the live rows
  const runs = (runsQ ?? []).map((r) => (retrySim[r.key] ? { ...r, ...retrySim[r.key] } : r)).sort((a, b) => b.startedAt - a.startedAt);
  const approvalRun = runs.find((r) => r.key === selRun && r.state === 'waiting') ?? runs.find((r) => r.state === 'waiting');
  const approval = approvalRun ? 'waiting' : runs.some((r) => r.state === 'done') ? 'approved' : 'denied';
  const approvalOn = !!approvalRun;

  // Component.agStatus — verbatim over live rows
  const agStatus = (id: string): string => {
    const mine = runs.filter((r) => r.agentKey === id);
    if (id === 'hermes') return approval === 'waiting' ? 'waiting on you' : mine.some((r) => r.state === 'running') || runs.some((r) => r.state === 'running') ? 'routing' : 'idle';
    if (paused[id]) return 'paused';
    if (mine.some((r) => r.state === 'running')) return 'running';
    if (mine.some((r) => r.state === 'failed')) return 'failed';
    if (id === 'ledger') return approval === 'waiting' ? 'waiting for approval' : approval === 'approved' ? 'completed' : 'idle';
    if (mine.some((r) => r.state === 'done')) return 'completed';
    return 'idle';
  };

  // focusRun — open the drawer on that run's agent with the runs tab active
  const focusHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!focusRun || focusHandled.current === focusRun || !runsQ) return;
    const r = runsQ.find((x) => x.key === focusRun);
    if (!r) return;
    focusHandled.current = focusRun;
    setAgDrawer(r.agentKey);
    setAgDTab('runs');
    setAgSel(r.agentKey);
    setSelRun(focusRun);
  }, [focusRun, runsQ]);

  const agSelFn = (id: string) => () => setAgSel((s) => (s === id ? null : id));
  const agKeyFn = (id: string) => (e: React.KeyboardEvent) => { if (e.key === 'Enter') { setAgDrawer(id); setAgDTab('identity'); setAgSel(id); } };
  const agDetail = (id: string) => (e: React.MouseEvent) => { e.stopPropagation(); setAgDrawer(id); setAgDTab('identity'); setAgSel(id); };
  // simulated locally — delegations have no write mutation yet (gap); routes stop, history kept
  const agDelegToggle = (id: string) => () => { setAgDeleg((s) => ({ ...s, [id]: !s[id] })); setAgRoute(null); };
  const togglePause = (id: string) => () => void setPausedMut({ key: id, paused: !paused[id] });
  const retryRun = (key: string) => {
    setRetrySim((s) => ({ ...s, [key]: { state: 'running', did: 'retrying from the same pinned context — no re-grant needed' } }));
    if (retryT.current) clearTimeout(retryT.current);
    retryT.current = setTimeout(() => setRetrySim((s) => ({ ...s, [key]: { state: 'done', cost: 0.03, did: 'succeeded on retry · same manifest hash · summary committed to inbox/' } })), 1200);
  };
  const decideRun = async (approve: boolean) => {
    if (!approvalRun || decisionPending) return;
    setDecisionPending(true); setDecisionError(null);
    try { await approvalDecide({ approve, runId: approvalRun._id }); setPfOpen(false); setSelRun(approvalRun.key); }
    catch (error) { setDecisionError(error instanceof Error ? error.message : 'Decision failed. Please retry.'); }
    finally { setDecisionPending(false); }
  };
  const approveRun = () => { void decideRun(true); };
  const denyRun = () => { void decideRun(false); };
  const queuedTask = tasks.find((t) => t.status === 'queued');
  const hasQueued = tasks.some((t) => t.status === 'queued');
  const assignQueued = () => { if (queuedTask) void workAssign({ taskId: queuedTask._id }); };

  // ── network renderVals
  const orchSt = agStatus('hermes');
  const totalCost = runs.reduce((a, r) => a + (r.cost ?? 0), 0).toFixed(2);
  const orch = {
    st: orchSt, stFg: agStFg(orchSt),
    dot: orchSt === 'idle' ? '#4a4a4a' : orchSt === 'waiting on you' ? '#d9a13a' : '#3a7a4a',
    anim: orchSt === 'idle' ? 'none' : 'arkPulse 2s ease-in-out infinite',
    asg: approval === 'waiting' ? 'routing: 21:30 brief pipeline — send gated on you' : 'routing: 21:30 brief pipeline',
    metrics: runs.length + ' runs · 34 routed · 154 reads · 6 approvals · ' + runs.filter((r) => r.state === 'failed').length + ' failed · ~$' + totalCost,
    modelLine: (model.hermes || 'sonnet') + ' · ' + AGM.hermes.node,
    ring: agSel === 'hermes' ? O : '#2a1a12'
  };
  const specs = SPECS.map((id, i) => {
    const st = agStatus(id);
    const m = AGM[id];
    const mine = runs.filter((r) => r.agentKey === id);
    const active = st !== 'idle' && st !== 'paused';
    return {
      id, glyph: m.glyph, role: m.role, st, stFg: agStFg(st),
      dot: st === 'running' ? O : st === 'paused' || st === 'idle' ? '#4a4a4a' : st === 'failed' ? '#cf4a3a' : '#3a7a4a',
      anim: st === 'running' ? 'arkPulse 1.6s ease-in-out infinite' : 'none',
      left: ['2.5%', '35.5%', '68.5%'][i],
      asg: id === 'nezu'
        ? (tasks[0]?.status === 'queued' ? 'no active work — brief nezu is queued' : tasks[0]?.status === 'running' ? 'working: brief nezu — moodboard' : 'last: brief nezu — done, evidence attached')
        : id === 'scout'
          ? (paused.scout ? 'paused — watching nothing' : 'watching inbox/ — no active work')
          : approval === 'waiting' ? 'holding 21:30 brief at the operator gate' : approval === 'approved' ? 'posted 21:30 brief → #xela' : 'no active work',
      asgFg: active ? '#c8b4a6' : '#5c5c5c',
      metrics: mine.length + ' runs · ' + (id === 'nezu' ? '61 reads · 1 failed' : id === 'scout' ? '212 reads · 0 failed' : '48 reads · 6 approvals') + ' · ~$' + mine.reduce((a, r) => a + (r.cost ?? 0), 0).toFixed(2),
      modelLine: (model[id] || 'haiku') + ' · ' + m.node,
      ring: agSel === id ? O : agSel && agSel !== 'hermes' ? '#191919' : '#232323',
      op: (agSel && agSel !== id && agSel !== 'hermes') || (agActiveOnly && !active) ? 0.35 : 1
    };
  });
  const lines = SPECS.map((id, i) => {
    const st = agDeleg[id] ? 'revoked' : agStatus(id);
    const active = st !== 'idle' && st !== 'paused' && st !== 'revoked';
    const color = st === 'running' ? O : st === 'waiting for approval' ? '#d9a13a' : st === 'completed' ? '#3a7a4a' : st === 'failed' ? '#cf4a3a' : '#2e2e2e';
    const dim = (agSel && agSel !== id && agSel !== 'hermes') || (agActiveOnly && !active);
    return { x1: 50, y1: 34, x2: [17, 50, 83][i], y2: 61, color, w: active ? 0.5 : 0.3, dash: st === 'waiting for approval' || st === 'revoked' || st === 'paused' ? '2 1.4' : 'none', op: dim ? 0.15 : st === 'revoked' ? 0.35 : 0.9 };
  });
  const chips = SPECS.map((id, i) => {
    const st = agDeleg[id] ? 'revoked' : agStatus(id);
    const kind = ['delegation', 'routing', 'handoff'][i];
    const fg = st === 'running' ? O : st === 'waiting for approval' ? '#d9a13a' : st === 'completed' ? '#6ec48a' : st === 'failed' ? '#cf4a3a' : '#5c5c5c';
    return {
      id,
      left: [(50 + 17) / 2 + '%', '50%', (50 + 83) / 2 + '%'][i],
      label: kind + ' · ' + (st === 'waiting for approval' ? 'waiting' : st),
      fg, ring: st === 'idle' || st === 'paused' ? '#1c1c1c' : '#2a2018',
      dot: fg === '#5c5c5c' ? '#3a3a3a' : fg,
      anim: st === 'running' ? 'arkPulse 1.2s ease-in-out infinite' : 'none'
    };
  });
  const listRows = ['hermes', 'nezu', 'scout', 'ledger'].map((id) => {
    const st = agStatus(id);
    const m = AGM[id];
    return {
      id, glyph: m.glyph, role: m.role, st, stFg: agStFg(st),
      dot: st === 'idle' || st === 'paused' ? '#4a4a4a' : st === 'failed' ? '#cf4a3a' : O,
      asg: id === 'hermes' ? 'routes all work below' : agDeleg[id] ? 'delegation revoked — history kept' : 'delegated from hermes',
      route: id === 'hermes' ? '3 outgoing routes' : '← ' + (agDeleg[id] ? 'revoked' : agStatus(id)) + ' route from hermes',
      modelLine: model[id] || 'haiku',
      bg: agSel === id ? '#12100d' : 'transparent'
    };
  });

  // ── route detail
  const routeSt = agRoute ? (agDeleg[agRoute] ? 'revoked' : agStatus(agRoute)) : '';
  const routeStFg = agRoute ? agStFg(agDeleg[agRoute] ? 'idle' : agStatus(agRoute)) : '#5c5c5c';
  const routeDot = agRoute && !agDeleg[agRoute] && agStatus(agRoute) === 'running' ? O : '#4a4a4a';

  // ── drawer
  const dM = agDrawer ? AGM[agDrawer] : null;
  const dSt = agDrawer ? agStatus(agDrawer) : '';
  const mk = (k: string, v: string, hot?: boolean): DRow => ({ k, v, fg: hot ? '#c8b4a6' : '#a8a8a8' });
  const dRows: DRow[] = (() => {
    const id = agDrawer;
    if (!id || !dM) return [];
    const mine = runs.filter((r) => r.agentKey === id);
    const T: Record<string, DRow[]> = {
      identity: [mk('npub', dM.npub), mk('purpose', dM.purpose), mk('created', id === 'hermes' ? 'feb 2026 · 41 version events' : 'apr 2026'), mk('invariant', 'identity ≠ model — swaps below are logged version events, memory + grants untouched', true)],
      instructions: [mk('version', 'v4 · edited aug 09 — older versions kept, diffable'), mk('style', 'terse briefs · two lines · no exclamation marks'), mk('boundaries', 'never send without the operator gate · never touch canon', true)],
      memory: [mk('entries', id === 'hermes' ? '41 · consent-gated writes only' : '7 · consent-gated'), mk('policy', 'proposals via brain inbox — 0 silent writes', true), mk('recall', 'scoped per run, never shared between agents')],
      knowledge: [mk('grant', 'manifest-8ea201 · 4 dashboards docs @ pinned hashes'), mk('standing access', 'none — leases are issued per run and die on completion', true), mk('sealed', 'inbox/dreams/** invisible at the index layer')],
      permissions: [mk('read', id === 'scout' ? 'inbox/** read-only lease' : 'per-run manifest leases'), mk('send', id === 'ledger' || id === 'hermes' ? 'post → #xela · APPROVAL-GATED' : 'none', true), mk('inherit', 'nothing from your roles — agent grants never widen'), mk('revoke', 'pause below freezes lease issuance immediately')],
      tools: [
        mk('enabled', id === 'ledger' ? 'post:#xela (gated) · read:dashboards' : id === 'scout' ? 'read:inbox · flag:duplicate' : 'read:manifest · draft:md'),
        mk('skills', skills.filter((x) => x.on && (x.scope === 'all' || x.scope === id)).map((x) => x.key).join(' · ') || 'none — enable + scope in settings → capabilities', true),
        mk('connectors', 'none granted — connection ≠ access'),
        mk('disabled', 'email · file-write outside vault · anything ▣ unconsented', true)
      ],
      runs: mine.map((r) => mk(r.key, r.state + ' · ' + r.task + ' · ' + fmtCost(r.cost))).concat(mine.length ? [] : [mk('runs', 'none yet — assign work from the toolbar')]),
      events: auditEvents.slice(0, 4).map((e) => mk(e.kind, e.summary)).concat([mk('log', 'full trail in system → audit')]),
      relationships: id === 'hermes'
        ? [mk('→ nezu', 'delegation · brief drafting' + (agDeleg.nezu ? ' · REVOKED' : '')), mk('→ scout', 'routing · inbox triage' + (agDeleg.scout ? ' · REVOKED' : '')), mk('→ ledger', 'handoff · 21:30 posting' + (agDeleg.ledger ? ' · REVOKED' : ''))]
        : [mk('← hermes', agDeleg[id] ? 'delegation REVOKED — history kept' : 'active delegation — work arrives routed, never self-assigned', true)]
    };
    return T[agDTab] || [];
  })();
  const dActs: DAct[] = (() => {
    const id = agDrawer;
    if (!id) return [];
    const acts: DAct[] = [];
    const btn = (label: string, onClick: () => void, hot?: boolean): DAct => ({ label, onClick, bg: hot ? O : '#1c1c1c', fg: hot ? '#0a0a0a' : '#c8c8c8' });
    if (hasQueued && id === 'nezu') acts.push(btn('assign: brief nezu', assignQueued, true));
    const latest = runs.find((r) => r.agentKey === id);
    if (latest) acts.push(btn('open run ' + latest.key, () => { setSelRun(latest.key); setAgDrawer(null); }));
    acts.push(btn('what it saw', latest ? () => { setSelRun(latest.key); setAgDrawer(null); } : () => {}));
    if (id !== 'hermes') acts.push(btn(agDeleg[id] ? 'restore delegation' : 'revoke delegation', agDelegToggle(id)));
    acts.push(btn(paused[id] ? 'resume' : 'pause', togglePause(id)));
    if (runs.some((r) => r.agentKey === id && r.state === 'failed')) acts.push(btn('retry from pinned context', () => retryRun('#398'), true));
    return acts;
  })();

  // ── log: latest 50, filters agLogF + agQ
  const logRows = runs.filter((r) => {
    if (agLogF !== 'all' && agLogF !== r.agentKey && agLogF !== r.state) return false;
    if (agQ.trim() && !(r.task + ' ' + r.key + ' ' + r.agentKey).toLowerCase().includes(agQ.trim().toLowerCase())) return false;
    return true;
  }).slice(0, 50);

  return (
    <div data-screen-label="agents" className="ark-scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: '0 18px 18px 18px', position: 'relative', overflowY: 'auto' }}>
      {decisionError && <div role="alert" style={{ color: '#ff9670', fontSize: 11 }}>{decisionError}</div>}
      {approvalOn && (
        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 9, padding: '10px 14px', borderRadius: 11, background: '#12100e', border: '1px solid #2a1a12' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: 999, background: '#ff5a1f', animation: 'arkPulse 1.2s ease-in-out infinite', flex: 'none' }} />
            <div style={{ fontFamily: mono, fontSize: 11, color: '#e8e8e8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{approvalRun?.key} · {approvalRun?.agentKey} · {approvalRun?.task} — simulated action, waiting on you</div>
            <button onClick={() => setPfOpen((p) => !p)} style={{ padding: '6px 12px', borderRadius: 6, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 10, color: '#c8c8c8', cursor: 'pointer', flex: 'none' }}>{pfOpen ? 'hide preflight' : 'inspect preflight'}</button>
            <button disabled={decisionPending} onClick={approveRun} style={{ padding: '6px 12px', borderRadius: 6, background: '#ff5a1f', border: 'none', fontFamily: mono, fontSize: 10, color: '#0a0a0a', cursor: 'pointer', flex: 'none' }}>approve</button>
            <button disabled={decisionPending} onClick={denyRun} style={{ padding: '6px 12px', borderRadius: 6, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 10, color: '#c8c8c8', cursor: 'pointer', flex: 'none' }}>deny</button>
          </div>
          {pfOpen && (
            <div style={{ fontFamily: mono, fontSize: 10.5, color: '#c8b4a6', lineHeight: 1.7, animation: 'arkRise .14s ease-out' }}>preflight — {approvalRun?.key}: {approvalRun?.sawText} · {approvalRun?.saw.docHashes.length ?? 0} pinned hashes · completion revokes this run’s grant · simulation only, no external delivery.</div>
          )}
        </div>
      )}

      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: '#141414' }}>
          {(['network', 'list'] as const).map((v) => (
            <button key={v} onClick={() => setAgView(v)} role="tab" style={{ padding: '6px 12px', borderRadius: 5, fontSize: 11, cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: agView === v ? '#2a2a2a' : 'transparent', color: agView === v ? '#f6f6f6' : '#7a7a7a' }}>{v}</button>
          ))}
        </div>
        {([['all', 'all'], ['running', 'running'], ['waiting', 'waiting'], ['failed', 'failed'], ['routes', 'active routes only']] as const).map(([id, label]) => {
          const on = id === 'routes' ? agActiveOnly : agLogF === id;
          return (
            <button key={id} onClick={id === 'routes' ? () => setAgActiveOnly((v) => !v) : () => setAgLogF(id)} style={{ padding: '6px 11px', borderRadius: 6, background: on ? '#231610' : '#141414', border: '1px solid ' + (on ? '#3a2418' : '#1c1c1c'), fontFamily: mono, fontSize: 9.5, color: on ? O : '#7a7a7a', cursor: 'pointer' }}>{label}</button>
          );
        })}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {agView === 'network' && (
            <>
              <button onClick={() => setAgZoom(0.84)} style={{ padding: '6px 11px', borderRadius: 6, background: agZoom !== 1 ? '#231610' : '#141414', border: 'none', fontFamily: mono, fontSize: 9.5, color: '#8a8a8a', cursor: 'pointer' }}>fit</button>
              <button onClick={() => setAgZoom(1)} style={{ padding: '6px 11px', borderRadius: 6, background: agZoom === 1 ? '#231610' : '#141414', border: 'none', fontFamily: mono, fontSize: 9.5, color: '#8a8a8a', cursor: 'pointer' }}>100%</button>
            </>
          )}
          <button style={{ padding: '6px 12px', borderRadius: 6, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 9.5, color: '#c8c8c8', cursor: 'pointer' }}>new agent…</button>
          <button onClick={hasQueued ? assignQueued : undefined} style={{ padding: '6px 12px', borderRadius: 6, background: hasQueued ? O : '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 9.5, color: hasQueued ? '#0a0a0a' : '#5c5c5c', cursor: 'pointer', whiteSpace: 'nowrap', flex: 'none' }}>{hasQueued ? 'assign: brief nezu' : 'assigned · in log'}</button>
        </div>
      </div>

      {agView === 'network' && (
        <div style={{ flex: 'none', height: 'clamp(360px, 48vh, 470px)', borderRadius: 14, background: '#0d0d0d', border: '1px solid #191919', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, transform: 'scale(' + agZoom + ')', transformOrigin: '50% 0' }}>
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 100 100" preserveAspectRatio="none">
              {lines.map((l, i) => (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeWidth={l.w} strokeDasharray={l.dash} opacity={l.op} />
              ))}
            </svg>
            <div onClick={agSelFn('hermes')} onKeyDown={agKeyFn('hermes')} tabIndex={0} role="button" aria-label="orchestrator hermes" style={{ position: 'absolute', left: '50%', top: 14, transform: 'translateX(-50%)', width: 'min(430px, 58%)', borderRadius: 11, background: '#0f0d0b', border: '1px solid ' + orch.ring, padding: '12px 15px', cursor: 'pointer', opacity: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: 999, background: orch.dot, animation: orch.anim, flex: 'none' }} />
                <div style={{ fontFamily: mono, fontSize: 12.5, color: '#f0f0f0' }}>◉ hermes</div>
                <div style={{ padding: '2px 7px', borderRadius: 4, background: '#161310', fontFamily: mono, fontSize: 8.5, color: '#c8b4a6', textTransform: 'uppercase', letterSpacing: '.1em' }}>command layer</div>
                <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 9.5, color: orch.stFg }}>{orch.st}</div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: '#8a8a8a', lineHeight: 1.55, marginTop: 7 }}>{AGM.hermes.purpose}</div>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: '#c8b4a6', marginTop: 6 }}>{orch.asg}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: '#4a4a4a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orch.metrics}</div>
                <div style={{ fontFamily: mono, fontSize: 9, color: '#5c5c5c', flex: 'none' }}>{orch.modelLine}</div>
                <button onClick={agDetail('hermes')} style={{ padding: '4px 10px', borderRadius: 5, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 9, color: '#c8c8c8', cursor: 'pointer', flex: 'none' }}>detail</button>
              </div>
            </div>
            {specs.map((a) => (
              <div key={a.id} onClick={agSelFn(a.id)} onKeyDown={agKeyFn(a.id)} tabIndex={0} role="button" style={{ position: 'absolute', left: a.left, top: '60%', width: '29%', borderRadius: 11, background: '#0d0d0d', border: '1px solid ' + a.ring, padding: '11px 13px', cursor: 'pointer', opacity: a.op }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 5, height: 5, borderRadius: 999, background: a.dot, animation: a.anim, flex: 'none' }} />
                  <div style={{ fontFamily: mono, fontSize: 11, color: '#e8e8e8' }}>{a.glyph} {a.id}</div>
                  <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 9, color: a.stFg }}>{a.st}</div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 8.5, color: '#5c5c5c', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 5 }}>{a.role}</div>
                <div style={{ fontFamily: mono, fontSize: 9.5, color: a.asgFg, marginTop: 6, lineHeight: 1.5 }}>{a.asg}</div>
                <div style={{ fontFamily: mono, fontSize: 8.5, color: '#4a4a4a', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.metrics}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                  <div style={{ fontFamily: mono, fontSize: 9, color: '#5c5c5c', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.modelLine}</div>
                  <button onClick={agDetail(a.id)} style={{ padding: '4px 10px', borderRadius: 5, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 9, color: '#c8c8c8', cursor: 'pointer', flex: 'none' }}>detail</button>
                </div>
              </div>
            ))}
            {chips.map((ch) => (
              <button key={ch.id} onClick={() => setAgRoute((s) => (s === ch.id ? null : ch.id))} aria-label="route detail" style={{ position: 'absolute', left: ch.left, top: '44%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 5, background: '#141414', border: '1px solid ' + ch.ring, cursor: 'pointer' }}>
                <div style={{ width: 4, height: 4, borderRadius: 999, background: ch.dot, animation: ch.anim, flex: 'none' }} />
                <div style={{ fontFamily: mono, fontSize: 8.5, color: ch.fg, whiteSpace: 'nowrap' }}>{ch.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {agView === 'list' && (
        <div style={{ flex: 'none', borderRadius: 14, background: '#0d0d0d', border: '1px solid #191919', overflow: 'hidden' }}>
          {listRows.map((a) => (
            <div key={a.id} onClick={agSelFn(a.id)} tabIndex={0} role="button" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderBottom: '1px solid #131313', cursor: 'pointer', background: a.bg }}>
              <div style={{ width: 5, height: 5, borderRadius: 999, background: a.dot, flex: 'none' }} />
              <div style={{ width: 120, flex: 'none' }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: '#e8e8e8' }}>{a.glyph} {a.id}</div>
                <div style={{ fontFamily: mono, fontSize: 8.5, color: '#5c5c5c', textTransform: 'uppercase', marginTop: 3 }}>{a.role}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: mono, fontSize: 9.5, color: '#a8a8a8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.asg}</div>
                <div style={{ fontFamily: mono, fontSize: 8.5, color: '#4a4a4a', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.route}</div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 9, color: a.stFg, flex: 'none' }}>{a.st}</div>
              <div style={{ fontFamily: mono, fontSize: 9, color: '#5c5c5c', flex: 'none' }}>{a.modelLine}</div>
              <button onClick={agDetail(a.id)} style={{ padding: '4px 10px', borderRadius: 5, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 9, color: '#c8c8c8', cursor: 'pointer', flex: 'none' }}>detail</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 'none', minHeight: 280, maxHeight: '44vh', borderRadius: 14, background: '#0d0d0d', border: '1px solid #191919', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 'none', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid #191919' }}>
          <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#5c5c5c' }}>agent log · latest 50 · simulated</div>
          {['all', 'hermes', 'nezu', 'scout', 'failed', 'done'].map((f) => (
            <button key={f} onClick={() => setAgLogF(f)} style={{ padding: '4px 10px', borderRadius: 5, background: agLogF === f ? '#2a2a2a' : '#141414', border: 'none', fontFamily: mono, fontSize: 9, color: agLogF === f ? '#f0f0f0' : '#6a6a6a', cursor: 'pointer' }}>{f}</button>
          ))}
          <input value={agQ} onChange={(e) => setAgQ(e.target.value)} placeholder="search log…" aria-label="search agent log" style={{ marginLeft: 'auto', width: 150, padding: '6px 10px', borderRadius: 6, background: '#0a0a0a', border: '1px solid #232323', color: '#c8c8c8', fontFamily: mono, fontSize: 9.5, outline: 'none' }} />
        </div>
        <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: '48px 56px minmax(0,1fr) 72px 92px 52px 52px', gap: 8, padding: '9px 18px', fontFamily: mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#4a4a4a', borderBottom: '1px solid #171717', whiteSpace: 'nowrap' }}>
          <div>run</div><div>agent</div><div>task</div><div>model</div><div>state</div><div>cost</div><div>when</div>
        </div>
        <div className="ark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {logRows.map((r) => {
            const open = selRun === r.key;
            return (
              <div key={r.key} onClick={() => setSelRun((s) => (s === r.key ? null : r.key))} style={{ cursor: 'pointer', borderBottom: '1px solid #131313', background: open ? '#111111' : agSel && r.agentKey === agSel ? '#12100d' : 'transparent' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '48px 56px minmax(0,1fr) 72px 92px 52px 52px', gap: 8, padding: '9px 18px', alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: '#8a8a8a' }}>{r.key}</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: '#a8a8a8' }}>{r.agentKey}</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: '#c8c8c8', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.task}</div>
                  <div style={{ fontFamily: mono, fontSize: 9.5, color: '#5c5c5c', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(model[r.agentKey] || 'haiku') + (r.key === '#405' ? ' (opus trial)' : '')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 5, height: 5, borderRadius: 999, background: r.state === 'waiting' || r.state === 'running' ? O : r.state === 'done' ? '#3a7a4a' : r.state === 'failed' ? '#cf4a3a' : '#4a4a4a' }} />
                    <div style={{ fontFamily: mono, fontSize: 10, color: r.state === 'waiting' || r.state === 'running' ? O : r.state === 'done' ? '#a8a8a8' : r.state === 'failed' ? '#cf4a3a' : '#6a6a6a' }}>{r.state}</div>
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: '#5c5c5c' }}>{fmtCost(r.cost)}</div>
                  <div style={{ fontFamily: mono, fontSize: 9.5, color: '#4a4a4a' }}>{WHEN[r.key] || (r.taskId ? 'now' : 'earlier')}</div>
                </div>
                {open && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 18px 12px 18px', animation: 'arkRise .14s ease-out' }}>
                    <div style={{ borderRadius: 8, background: '#0a0a0a', border: '1px solid #171717', padding: '10px 12px' }}>
                      <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#5c5c5c' }}>what it saw</div>
                      <div style={{ fontFamily: mono, fontSize: 9.5, color: '#a8a8a8', lineHeight: 1.8, marginTop: 6 }}>{r.sawText}</div>
                    </div>
                    <div style={{ borderRadius: 8, background: '#0a0a0a', border: '1px solid #171717', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#5c5c5c' }}>what it did</div>
                        {r.state === 'failed' && (
                          <button onClick={(e) => { e.stopPropagation(); retryRun(r.key); }} style={{ marginLeft: 'auto', padding: '3px 9px', borderRadius: 5, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 9, color: '#ff5a1f', cursor: 'pointer' }}>retry from pinned context</button>
                        )}
                      </div>
                      <div style={{ fontFamily: mono, fontSize: 9.5, color: '#a8a8a8', lineHeight: 1.8, marginTop: 6 }}>{r.did}</div>
                      <div style={{ fontFamily: mono, fontSize: 8.5, color: '#4a4a4a', marginTop: 7 }}>{'audit evt-' + r.key.replace('#', '') + ' · grant manifest-8ea201 (per-run, expired on completion) · citations: fleet-uptime.md ×2 · ' + (r.key === '#413' ? 'approval: operator' : 'no approval required')}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderTop: '1px solid #171717' }}>
          <div style={{ fontFamily: mono, fontSize: 9, color: '#4a4a4a' }}>every run pins its instructions version, manifest and grant · 0 out-of-scope reads across all runs · full weekly trail lives in audit</div>
        </div>
      </div>

      {agRoute && (
        <div onClick={() => setAgRoute(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,4,.55)', backdropFilter: 'blur(3px)', zIndex: 8, display: 'grid', placeItems: 'center', animation: 'arkFade .14s ease-out' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 92%)', borderRadius: 12, background: '#111', border: '1px solid #232323', padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 5, height: 5, borderRadius: 999, background: routeDot }} />
              <div style={{ fontFamily: mono, fontSize: 11, color: '#e8e8e8' }}>{'hermes → ' + agRoute}</div>
              <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 9, color: routeStFg }}>{routeSt}</div>
            </div>
            <div style={{ whiteSpace: 'pre-line', fontFamily: mono, fontSize: 9.5, color: '#a8a8a8', lineHeight: 1.9, marginTop: 10 }}>{ROUTE_BODY[agRoute] || ''}</div>
            <div style={{ display: 'flex', gap: 7, marginTop: 13 }}>
              <button onClick={() => setAgRoute(null)} style={{ padding: '7px 13px', borderRadius: 6, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 9.5, color: '#c8c8c8', cursor: 'pointer' }}>close</button>
              <button onClick={agDelegToggle(agRoute)} style={{ marginLeft: 'auto', padding: '7px 13px', borderRadius: 6, background: agDeleg[agRoute] ? O : '#111', border: 'none', fontFamily: mono, fontSize: 9.5, color: agDeleg[agRoute] ? '#0a0a0a' : '#cf4a3a', cursor: 'pointer' }}>{agDeleg[agRoute] ? 'restore delegation' : 'revoke delegation'}</button>
            </div>
          </div>
        </div>
      )}

      {agDrawer && dM && (
        <div onClick={() => setAgDrawer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,4,4,.55)', backdropFilter: 'blur(3px)', zIndex: 40, display: 'flex', justifyContent: 'flex-end', animation: 'arkFade .14s ease-out' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ height: '100%', width: 'min(430px, 92%)', background: '#0f0f0f', borderLeft: '1px solid #232323', boxShadow: '-24px 0 60px rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'arkRise .16s ease-out' }}>
            <div style={{ flex: 'none', padding: '14px 16px', borderBottom: '1px solid #191919', display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 6, height: 6, borderRadius: 999, background: dSt !== 'idle' && dSt !== 'paused' ? O : '#4a4a4a' }} />
              <div style={{ fontFamily: mono, fontSize: 12, color: '#f0f0f0' }}>{dM.glyph + ' ' + agDrawer}</div>
              <div style={{ padding: '2px 7px', borderRadius: 4, background: '#161310', fontFamily: mono, fontSize: 8.5, color: '#c8b4a6', textTransform: 'uppercase' }}>{dM.role}</div>
              <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 9.5, color: agStFg(dSt) }}>{dSt}</div>
              <button onClick={() => setAgDrawer(null)} aria-label="close detail" style={{ padding: '4px 10px', borderRadius: 5, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 9.5, color: '#c8c8c8', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', gap: 2, padding: '8px 12px', borderBottom: '1px solid #191919' }}>
              {D_TABS.map((t) => (
                <button key={t} onClick={() => setAgDTab(t)} role="tab" style={{ padding: '5px 10px', borderRadius: 5, fontFamily: mono, fontSize: 9, cursor: 'pointer', border: 'none', background: agDTab === t ? '#231610' : '#161616', color: agDTab === t ? O : '#8a8a8a' }}>{t}</button>
              ))}
            </div>
            <div className="ark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {dRows.map((r, i) => (
                <div key={r.k + i} style={{ display: 'flex', gap: 11, padding: '10px 16px', borderBottom: '1px solid #151515' }}>
                  <div style={{ width: 110, flex: 'none', fontFamily: mono, fontSize: 9, color: '#5c5c5c' }}>{r.k}</div>
                  <div style={{ flex: 1, minWidth: 0, fontFamily: mono, fontSize: 10, color: r.fg, lineHeight: 1.7 }}>{r.v}</div>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '12px 16px' }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: '#5c5c5c', marginRight: 4 }}>model</div>
                {['haiku', 'sonnet', 'opus'].map((mm) => {
                  const on = (model[agDrawer] || 'haiku') === mm;
                  return (
                    <button key={mm} onClick={() => void setModel({ key: agDrawer, model: mm })} style={{ padding: '4px 10px', borderRadius: 5, fontFamily: mono, fontSize: 9.5, cursor: 'pointer', border: 'none', background: on ? '#2a2a2a' : '#161616', color: on ? '#e8e8e8' : '#5c5c5c' }}>{mm}</button>
                  );
                })}
                <div style={{ fontFamily: mono, fontSize: 8.5, color: '#4a4a4a', marginLeft: 6 }}>identity, memory + grants survive the swap</div>
              </div>
            </div>
            <div style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 16px', borderTop: '1px solid #191919' }}>
              {dActs.map((a) => (
                <button key={a.label} onClick={a.onClick} style={{ padding: '7px 12px', borderRadius: 6, background: a.bg, border: 'none', fontFamily: mono, fontSize: 9.5, color: a.fg, cursor: 'pointer', whiteSpace: 'nowrap' }}>{a.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
