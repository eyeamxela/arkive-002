import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useDocuments, useWorkspace } from './hooks';
import { useRoomField, useRoomScopeReset } from './RoomSession';

// port target: design/arkive-v2.html [data-screen-label='graph'] — LOCKED renderer.
// markup lines 1944–1966 + 2068–2114 (overlay shell, nodes, edges, labels, sealed node, lasso,
// mode seg, clear, sign, close, scope bar) and inspect sheet 2117–2152.
// logic verbatim from class Component: CENTERS/SIM (2327–2328), TIERS/NAMES (2329–2342),
// rng (2482–2490), graph() (2492–2538), tick/reheat/stopSim (2582–2625), onCanvasDown (3219–3244),
// toggleNode (3246–3276), renderVals graph slice (3612–3672, 3748, 3780–3784, 4021–4039).
// nodes come from useDocuments() in creation order (tier blocks canon→curated→dashboards→legal→inbox),
// so db row i maps to graph() node i: tier/path/hash from the row, x/y/op/dia/tok from the layout.

const O = '#ff5a1f';
const mono = "'IBM Plex Mono', monospace";

// Component.CENTERS + SIM — physics constants, port verbatim (locked)
const CENTERS: Record<string, [number, number]> = { canon: [50, 47], curated: [30, 30], dashboards: [72, 27], legal: [79, 65], inbox: [50, 68] };
const SIM = { rep: 20, spring: 0.02, rest: 9, grav: 0.006, damp: 0.8, vmax: 1.2, decay: 0.99, min: 0.02 };
const TIERS = [
  { id: 'canon', n: 9, op: 1.0, d: 9, tok: 4.6 },
  { id: 'curated', n: 20, op: 0.66, d: 6.5, tok: 3.1 },
  { id: 'dashboards', n: 14, op: 0.46, d: 5.5, tok: 1.4 },
  { id: 'legal', n: 8, op: 0.4, d: 5.5, tok: 5.2 },
  { id: 'inbox', n: 58, op: 0.26, d: 4.5, tok: 0.7 }
];
const NAMES: Record<string, string[] | null> = {
  canon: ['xela.md', 'brands.md', 'voice.md', 'operator.md', 'standing-rules.md', 'hermes-brain-canon.md', 'three-brains.md', 'relay-posture.md', 'sovereignty.md'],
  curated: ['arkive-product-blueprint.md', 'graph-brain-architecture.md', 'frtl-ops-build-plan.md', 'xela-system-audit.md', 'buzz-pilot-verdict.md', 'manifest-primitive.md', 'vault-indexer-notes.md', 'exo-dos-stack.md', 'tailscale-posture.md', 'kind-number-table.md', 'listener-transport.md', 'glob-semantics.md', 'jrny-proposal-brief.md', 'zbmd-scope.md', 'per-customer-platform.md', 'night-desk-spec.md', 'capture-loop.md', 'embedding-local.md', 'phase-gates.md', 'divergence-is-debt.md'],
  dashboards: ['night-desk-2026-w31.md', 'night-desk-2026-w30.md', 'fleet-uptime.md', 'relay-health.md', 'vault-growth.md', 'token-spend.md', 'capture-rate.md', 'manifest-log.md', 'brief-archive.md', 'okf-memory-map.md', 'cron-matrix.md', 'skill-inventory.md', 'pilot-verdict-tracker.md', 'audit-window.md'],
  legal: ['msa-jrny.md', 'nda-template.md', 'ip-assignment.md', 'contractor-frtl.md', 'terms-arkive.md', 'dpa-eu.md', 'retention-policy.md', 'sovereignty-clause.md'],
  inbox: null
};
const SPREAD: Record<string, number> = { canon: 11, curated: 15, dashboards: 12, legal: 11, inbox: 34 };
const TIER_ROWS = ['canon', 'curated', 'dashboards', 'legal', 'inbox'];

type SimNode = {
  id: string; tier: string; path: string; x: number; y: number;
  op: number; dia: number; tok: number; hash: string; drift: boolean;
  fresh?: boolean; alwaysLoad?: boolean; vx: number; vy: number;
};
type G = { nodes: SimNode[]; edges: [number, number][] };

// Component.rng — seeded, verbatim
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Component.graph() — seed 20260805, verbatim (nodeCount prop fixed at the 109-doc default)
function buildGraph(): G {
  const want = Math.max(20, Math.min(400, 109));
  const scale = want / 109;
  const r = rng(20260805);
  const centers = CENTERS;
  const spread = SPREAD;
  const nodes: SimNode[] = [];
  TIERS.forEach((T) => {
    const count = Math.max(3, Math.round(T.n * scale));
    for (let i = 0; i < count; i++) {
      const c = centers[T.id], s = spread[T.id];
      let x = 0, y = 0, tries = 0;
      do {
        const ang = r() * Math.PI * 2, rad = Math.sqrt(r()) * s;
        x = c[0] + Math.cos(ang) * rad * 1.25;
        y = c[1] + Math.sin(ang) * rad * 0.92;
        tries++;
      } while (tries < 14 && nodes.some((n) => Math.hypot(n.x - x, (n.y - y) * 0.7) < 2.4));
      const list = NAMES[T.id];
      const name = list ? list[i % list.length] : 'hermes/2026-0' + (6 + (i % 2)) + '-' + String(1 + (i * 7) % 28).padStart(2, '0') + '-' + String(1 + (i * 13) % 23).padStart(2, '0') + '30.md';
      nodes.push({
        id: T.id + ':' + i, tier: T.id, path: T.id + '/' + name,
        x: Math.max(5, Math.min(95, x)), y: Math.max(7, Math.min(92, y)),
        op: T.op, dia: T.d, tok: T.tok,
        hash: 'sha256:' + Math.floor(r() * 0xfffff).toString(16).padStart(5, '0'),
        drift: r() < 0.04, vx: 0, vy: 0
      });
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

const tierCounts = (list: SimNode[]) => {
  const o: Record<string, number> = {};
  list.forEach((n) => { o[n.tier] = (o[n.tier] || 0) + 1; });
  return o;
};

// Component.title() — hash-titles tier policy not wired in this slice; base name only
const title = (n: SimNode) => n.path.split('/').slice(-1)[0].replace('.md', '');

export function GraphOverlay({ room, mode, setMode, onClose, canvas }: { room: string; mode: 'graph' | 'canvas'; setMode: (m: 'graph' | 'canvas') => void; onClose: () => void; canvas?: React.ReactNode }) {
  const docs = useDocuments();
  const [roomSelection] = useRoomField<ReadonlySet<string> | null>(room, 'selection', null);
  const [roomManifest] = useRoomField<string | null>(room, 'manifest', null);
  const [deny] = useRoomField(room, 'deny', true);
  const resetRoomScope = useRoomScopeReset();
  const ws = useWorkspace(room, deny, roomSelection, roomManifest);
  const manifestSign = useMutation(api.ops.manifestSign);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // STATE-SCHEMA: sel[], ttl, revoked, lasso, filters{} — R (graph selection = candidate manifest)
  const [sel, setSel] = useState<string[]>([]);
  const [revoked, setRevoked] = useState(false);
  const [ttl] = useState('session'); // prototype default — the graph overlay has no ttl control
  const [filters, setFilters] = useState<Record<string, boolean>>({ canon: true, curated: true, dashboards: true, legal: true, inbox: true });
  const [lasso, setLasso] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [labelMode, setLabelMode] = useState<'canon' | 'selected' | 'all'>('canon');
  const [inspect, setInspect] = useState(false);
  const [, setFrame] = useState(0); // forceUpdate for the sim loop

  const canvasRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<G | null>(null);
  const extraRef = useRef<SimNode[]>([]);
  const alphaRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const openRef = useRef(true);
  const dragNRef = useRef<SimNode | null>(null);
  const dragRef = useRef<{ r: DOMRect; x0: number; y0: number; add: boolean } | null>(null);
  const lassoRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const filtersRef = useRef(filters); filtersRef.current = filters;
  const moveRef = useRef<((ev: MouseEvent) => void) | null>(null);
  const upRef = useRef<(() => void) | null>(null);
  const tickRef = useRef<() => void>(() => {});

  const graph = () => { if (!gRef.current) gRef.current = buildGraph(); return gRef.current; };

  // bind live rows onto the layout — node i ↔ graph() node i; surplus rows land like accepted
  // proposals do in the prototype (near their tier center — inboxAccept, lines 2712–2719)
  const g = graph();
  if (docs) {
    docs.forEach((d, i) => {
      if (i < g.nodes.length) {
        const n = g.nodes[i];
        n.tier = d.tier; n.path = d.path ?? n.path; n.hash = d.hash; n.alwaysLoad = d.alwaysLoad;
      } else if (!extraRef.current.some((x) => x.id === 'db:' + d._id)) {
        const c = CENTERS[d.tier] || [50, 55];
        extraRef.current.push({
          id: 'db:' + d._id, tier: d.tier, path: d.path ?? d.title,
          x: c[0] + Math.random() * 8 - 4, y: c[1] + Math.random() * 8 - 4,
          op: d.tier === 'canon' ? 1 : (d.tier === 'inbox' ? 0.26 : 0.66),
          dia: d.tier === 'canon' ? 9 : (d.tier === 'inbox' ? 4.5 : 6.5),
          tok: 0.9, hash: d.hash, drift: false, fresh: true, alwaysLoad: d.alwaysLoad, vx: 0, vy: 0
        });
      }
    });
  }

  const allNodes = () => graph().nodes.concat(extraRef.current);
  const visible = () => { const f = filtersRef.current; return allNodes().filter((n) => f[n.tier]); };
  const activeSel = () => (revoked ? [] : sel);
  const scopeNodes = () => {
    const s = activeSel();
    const always = new Set(allNodes().filter((n) => n.alwaysLoad).map((n) => n.id));
    // deny-by-tier default lives in chat (deny=true) — with no selection the agent sees canon + always
    if (s.length) { const set = new Set(s); return allNodes().filter((n) => set.has(n.id) || always.has(n.id)); }
    return allNodes().filter((n) => n.tier === 'canon' || always.has(n.id));
  };

  // Component reheat / stopSim / _tick — verbatim physics (locked)
  const reheat = (a: number) => {
    alphaRef.current = Math.max(alphaRef.current || 0, a);
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(() => tickRef.current());
  };
  const stopSim = () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
  tickRef.current = () => {
    rafRef.current = null;
    if (!openRef.current) return;
    if (dragNRef.current) alphaRef.current = Math.max(alphaRef.current || 0, 0.3);
    const a = alphaRef.current || 0;
    if (a < SIM.min) return;
    const S = SIM, nodes = allNodes();
    nodes.forEach((n) => { n.vx = n.vx || 0; n.vy = n.vy || 0; });
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const A = nodes[i], B = nodes[j];
      let dx = A.x - B.x, dy = A.y - B.y, d2 = dx * dx + dy * dy;
      if (d2 > 900) continue;
      if (d2 < 0.02) { dx = (Math.random() - .5) * .2; dy = (Math.random() - .5) * .2; d2 = 0.04; }
      const d = Math.sqrt(d2), f = (S.rep * a) / d2, fx = (dx / d) * f, fy = (dy / d) * f;
      A.vx += fx; A.vy += fy; B.vx -= fx; B.vy -= fy;
    }
    const gn = graph().nodes;
    graph().edges.forEach(([i, j]) => {
      const A = gn[i], B = gn[j];
      if (!A || !B) return;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.max(0.1, Math.hypot(dx, dy));
      const f = S.spring * a * (d - S.rest), fx = (dx / d) * f, fy = (dy / d) * f;
      A.vx += fx; A.vy += fy; B.vx -= fx; B.vy -= fy;
    });
    nodes.forEach((n) => {
      if (dragNRef.current === n) { n.vx = 0; n.vy = 0; return; }
      const c = CENTERS[n.tier] || [50, 55];
      n.vx += (c[0] - n.x) * S.grav * a;
      n.vy += (c[1] - n.y) * S.grav * a;
      n.vx *= S.damp; n.vy *= S.damp;
      const vm = Math.hypot(n.vx, n.vy);
      if (vm > S.vmax) { n.vx *= S.vmax / vm; n.vy *= S.vmax / vm; }
      n.x = Math.min(97, Math.max(3, n.x + n.vx));
      n.y = Math.min(93, Math.max(6, n.y + n.vy));
    });
    alphaRef.current = a * S.decay;
    setFrame((f) => f + 1);
    rafRef.current = requestAnimationFrame(() => tickRef.current());
  };

  useEffect(() => {
    openRef.current = true;
    reheat(0.6); // toggleGraph — open reheats to .6
    return () => {
      openRef.current = false;
      stopSim();
      if (moveRef.current) window.removeEventListener('mousemove', moveRef.current);
      if (upRef.current) window.removeEventListener('mouseup', upRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fresh nodes (surplus db rows) reheat the sim like inboxAccept does
  useEffect(() => { if (docs && docs.length > graph().nodes.length) reheat(0.4); }, [docs?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Component.onCanvasDown — drag = replace, shift-drag = add, verbatim
  const onCanvasDown = (e: React.MouseEvent) => {
    const el = canvasRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { r, x0: ((e.clientX - r.left) / r.width) * 100, y0: ((e.clientY - r.top) / r.height) * 100, add: e.shiftKey };
    const move = (ev: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      const x = ((ev.clientX - d.r.left) / d.r.width) * 100, y = ((ev.clientY - d.r.top) / d.r.height) * 100;
      const l = { x: Math.min(x, d.x0), y: Math.min(y, d.y0), w: Math.abs(x - d.x0), h: Math.abs(y - d.y0) };
      lassoRef.current = l; setLasso(l);
    };
    const up = () => {
      const l = lassoRef.current, d = dragRef.current;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      moveRef.current = null; upRef.current = null;
      dragRef.current = null;
      if (!l || (l.w < 1 && l.h < 1)) { lassoRef.current = null; setLasso(null); return; }
      const hit = visible().filter((n) => n.x >= l.x && n.x <= l.x + l.w && n.y >= l.y && n.y <= l.y + l.h).map((n) => n.id);
      lassoRef.current = null; setLasso(null); setRevoked(false);
      setSel((s) => (d && d.add ? Array.from(new Set(s.concat(hit))) : hit));
    };
    moveRef.current = move; upRef.current = up;
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    const l0 = { x: dragRef.current.x0, y: dragRef.current.y0, w: 0, h: 0 };
    lassoRef.current = l0; setLasso(l0);
  };

  // Component.toggleNode — click toggles, drag moves the node, verbatim
  const toggleNode = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const n = allNodes().find((x) => x.id === id);
    if (!n) return;
    const el = canvasRef.current;
    const r = el ? el.getBoundingClientRect() : null;
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    const move = (ev: MouseEvent) => {
      if (!r) return;
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      dragNRef.current = n;
      n.x = Math.min(97, Math.max(3, ((ev.clientX - r.left) / r.width) * 100));
      n.y = Math.min(93, Math.max(6, ((ev.clientY - r.top) / r.height) * 100));
      reheat(0.35);
      setFrame((f) => f + 1);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      dragNRef.current = null;
      if (!moved) { setRevoked(false); setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.concat([id]))); }
      else reheat(0.25);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const clearSel = () => setSel([]);

  // Component.signManifest → ops.manifestSign — the mutation inserts the manifest row and
  // moves rooms.activeManifestId; overlay closes like the prototype (graphOpen: false)
  const signManifest = async () => {
    if (saveLock.current || !docs) return;
    const scope = scopeNodes();
    const counts = tierCounts(scope);
    const matches = scope.map((node) => docs.filter((doc) => doc.path === node.path && doc.hash === node.hash));
    if (matches.some((rows) => rows.length !== 1)) {
      setSaveError('This demo graph includes an unmapped or ambiguous reference. Use Chat or Vault to choose exact room sources instead.');
      return;
    }
    setSaving(true);
    saveLock.current = true;
    setSaveError(null);
    try {
      await manifestSign({
        room,
        objectIds: matches.map((rows) => rows[0]._id),
        docPaths: scope.map((n) => n.path),
        tiers: Object.keys(counts).join('+') || 'canon',
        ttl,
        brief: 'saved from demo graph · ' + scope.length + ' source references'
      });
      resetRoomScope(room);
      setRevoked(false);
      onClose();
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Could not save scope. Your selection is retained.'); }
    finally { saveLock.current = false; setSaving(false); }
  };

  // Component.revoke — local pointer state only in this slice; manifest rows are untouched
  const revoke = () => { setRevoked(true); setSel([]); setInspect(false); };

  // ── renderVals graph slice, verbatim ──────────────────────────────────────
  const all = allNodes();
  const vis = visible();
  const selIds = new Set(activeSel());
  const scope = scopeNodes();
  const counts = tierCounts(scope);
  const allCounts = tierCounts(all);

  let ep = '', hp = '';
  graph().edges.forEach(([a, b]) => {
    const A = graph().nodes[a], B = graph().nodes[b];
    if (!A || !B) return;
    if (!filters[A.tier] || !filters[B.tier]) return;
    const seg = 'M' + (A.x * 10).toFixed(1) + ' ' + (A.y * 10).toFixed(1) + 'L' + (B.x * 10).toFixed(1) + ' ' + (B.y * 10).toFixed(1);
    if (selIds.has(A.id) || selIds.has(B.id)) hp += seg; else ep += seg;
  });

  const nodeVals = vis.map((n) => {
    const on = selIds.has(n.id);
    const gray = Math.round(200 + n.op * 55);
    return {
      id: n.id, left: n.x + '%', top: n.y + '%',
      d: (on ? n.dia + 2.5 : n.dia).toFixed(1) + 'px',
      bg: on ? O : 'rgba(' + gray + ',' + gray + ',' + gray + ',' + n.op + ')',
      glow: on ? '0 0 0 3px rgba(255,90,31,.18)' : (n.tier === 'canon' ? '0 0 14px rgba(255,255,255,.14)' : 'none'),
      anim: n.fresh ? 'arkFlash .55s ease-out' : 'none',
      tip: n.path + ' · ' + n.tier + ' · ' + n.hash,
      onDown: toggleNode(n.id)
    };
  });

  const cand = vis
    .filter((n) => labelMode === 'all' || (labelMode === 'canon' && n.tier === 'canon') || selIds.has(n.id))
    .map((n) => ({ n, text: title(n) }))
    .sort((a, b) => {
      const pa = (selIds.has(a.n.id) ? 0 : 1) + (a.n.tier === 'canon' ? 0 : 2);
      const pb = (selIds.has(b.n.id) ? 0 : 1) + (b.n.tier === 'canon' ? 0 : 2);
      return pa - pb || b.n.op - a.n.op;
    });
  const placed: { c: { n: SimNode; text: string }; box: { x0: number; x1: number; y0: number; y1: number } }[] = [];
  cand.forEach((c) => {
    if (placed.length >= 18) return;
    const hw = Math.max(1.4, c.text.length * 0.42), hh = 1.5;
    const box = { x0: c.n.x - hw, x1: c.n.x + hw, y0: c.n.y + 0.4, y1: c.n.y + 0.4 + hh * 2 };
    const clash = placed.some((p) => !(box.x1 < p.box.x0 || box.x0 > p.box.x1 || box.y1 < p.box.y0 || box.y0 > p.box.y1));
    if (!clash) placed.push({ c, box });
  });
  const labelVals = placed.map(({ c }) => ({
    id: c.n.id, left: c.n.x + '%', top: 'calc(' + c.n.y + '% + ' + (c.n.dia / 2 + 7) + 'px)',
    text: c.text,
    fg: selIds.has(c.n.id) ? O : 'rgba(255,255,255,' + Math.max(0.28, c.n.op * 0.65) + ')'
  }));

  const tokens = scope.reduce((a, n) => a + n.tok, 0);
  const selCount = activeSel().length || 0;
  const selTiers = TIER_ROWS.filter((id) => counts[id]).map((id) => ({ id, n: counts[id], color: id === 'canon' ? O : '#333' }));
  const selTokens = '~' + Math.round(tokens) + 'k';
  const signBg = activeSel().length ? O : 'rgba(20,20,20,.9)';
  const signFg = activeSel().length ? '#0a0a0a' : '#5c5c5c';
  const isGraph = mode !== 'canvas';
  const graphKicker = mode === 'canvas' ? 'legacy canvas demo · sample objects' : 'demo graph · illustrative links · ' + all.length + ' refs';
  const graphTitle = mode === 'canvas' ? 'think spatially' : 'lasso to scope';
  const graphHint = mode === 'canvas' ? 'sample cards · select → use matched sources in chat temporarily' : room + ' · drag to select · topology is not your business graph';
  const tierChips = TIER_ROWS.map((id) => ({
    id, n: allCounts[id] || 0,
    bg: filters[id] ? '#151515' : 'transparent',
    ring: filters[id] ? O : '#3a3a3a',
    fill: filters[id] ? O : 'transparent',
    fg: filters[id] ? '#d8d8d8' : '#5c5c5c',
    onClick: () => setFilters((f) => ({ ...f, [id]: !f[id] }))
  }));
  const manifestIdLabel = revoked ? 'candidate cleared' : 'room manifest-' + (ws?.manifestKey ?? '—');
  const manifestBrief = activeSel().length && !revoked
    ? 'scoped selection — ' + scope.length + ' docs across ' + Object.keys(counts).length + ' tiers, dreams excluded'
    : 'candidate preview · saving resolves exact database references';
  const manifestMeta = [
    { k: 'scope', v: room, color: '#111' },
    { k: 'ttl', v: ttl, color: '#111' },
    { k: 'state', v: revoked ? 'cleared' : 'unsaved candidate', color: revoked ? '#8a8a86' : O },
    { k: 'docs', v: String(scope.length), color: '#111' },
    { k: 'drift', v: String(scope.filter((n) => n.drift).length), color: scope.some((n) => n.drift) ? O : '#111' }
  ];
  const inspectRows = scope.slice(0, 60).map((n) => ({
    kind: 'include', path: n.path, tier: n.tier,
    hash: n.drift ? n.hash + ' ↯' : n.hash,
    hashFg: n.drift ? O : '#a0a09c'
  })).concat([{ kind: 'exclude', path: 'inbox/dreams/**', tier: 'sealed', hash: 'never indexed', hashFg: '#a0a09c' }]);

  return (
    <div data-screen-label="graph" style={{ position: 'absolute', top: 66, left: 0, right: 0, bottom: 0, background: '#070707', animation: 'arkFade .18s ease-out', zIndex: 20 }}>
      <div ref={canvasRef} onMouseDown={onCanvasDown} style={{ position: 'absolute', inset: 0, cursor: 'crosshair', overflow: 'hidden', visibility: mode === 'canvas' ? 'hidden' : 'visible' }}>
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <path d={ep || 'M0 0'} fill="none" stroke="#2b2b2b" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={hp || 'M0 0'} fill="none" stroke="#ff5a1f" strokeWidth={1} strokeOpacity={.55} vectorEffect="non-scaling-stroke" />
        </svg>
        {nodeVals.map((n) => (
          <div key={n.id} data-node="1" onMouseDown={n.onDown} title={n.tip} style={{ position: 'absolute', left: n.left, top: n.top, width: n.d, height: n.d, transform: 'translate(-50%,-50%)', borderRadius: 999, background: n.bg, boxShadow: n.glow, cursor: 'pointer', transition: 'background .12s, box-shadow .12s', animation: n.anim }} />
        ))}
        {labelVals.map((l) => (
          <div key={l.id} style={{ position: 'absolute', left: l.left, top: l.top, transform: 'translate(-50%,0)', fontFamily: mono, fontSize: 9.5, color: l.fg, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{l.text}</div>
        ))}
        <div onMouseDown={(e) => e.stopPropagation()} title="inbox/dreams/** · sealed · excluded from relay index" style={{ position: 'absolute', left: '12%', top: '78%', transform: 'translate(-50%,-50%)', width: 54, height: 54, borderRadius: 999, border: '1px dashed #4a4a4a', display: 'grid', placeItems: 'center', cursor: 'not-allowed' }}>
          <div style={{ width: 26, height: 26, borderRadius: 999, background: '#151515', border: '1px solid #2a2a2a', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: -4, top: 12, width: 34, height: 1, background: '#4a4a4a', transform: 'rotate(-45deg)' }} />
          </div>
          <div style={{ position: 'absolute', top: 60, fontFamily: mono, fontSize: 9, color: '#4a4a4a', whiteSpace: 'nowrap' }}>dreams · sealed</div>
        </div>
        {lasso && (
          <div style={{ position: 'absolute', left: lasso.x + '%', top: lasso.y + '%', width: lasso.w + '%', height: lasso.h + '%', border: '1px solid #ff5a1f', background: 'rgba(255,90,31,.07)', pointerEvents: 'none' }} />
        )}
      </div>

      {mode === 'canvas' && canvas}

      <div style={{ position: 'absolute', left: 22, top: 20, display: 'flex', flexDirection: 'column', gap: 5, pointerEvents: 'none' }}>
        <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#6a6a6a' }}>{graphKicker}</div>
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-.01em' }}>{graphTitle}</div>
        {isGraph && <div style={{ fontFamily: mono, fontSize: 9.5, color: '#4a4a4a' }}>{graphHint}</div>}
      </div>

      {/* tier filter chips + label seg — the prototype binds these in the shell sidebar (lines 228–241,
          3928–3935) and settings 'graph labels' seg (3441); neither surface exists in this port, so the
          graph controls live on the overlay, styled verbatim. */}
      {isGraph && (
        <div style={{ position: 'absolute', left: 22, top: 104, display: 'flex', flexDirection: 'column', gap: 7, zIndex: 3, width: 150 }}>
          {tierChips.map((t) => (
            <button key={t.id} onClick={t.onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 24, padding: '0 8px', borderRadius: 5, cursor: 'pointer', background: t.bg, border: 'none', width: '100%' }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, border: '1px solid ' + t.ring, background: t.fill, flex: 'none' }} />
              <div style={{ fontFamily: mono, fontSize: 11, color: t.fg }}>{t.id}</div>
              <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 9, color: '#4a4a4a' }}>{t.n}</div>
            </button>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 24, padding: '0 8px', opacity: .5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, border: '1px dashed #6a6a6a', position: 'relative', flex: 'none' }} />
            <div style={{ fontFamily: mono, fontSize: 11, color: '#5c5c5c', textDecoration: 'line-through' }}>dreams</div>
            <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 9, color: '#4a4a4a' }}>seal</div>
          </div>
          <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: 'rgba(20,20,20,.9)', marginTop: 5, alignSelf: 'flex-start' }}>
            {(['canon', 'selected', 'all'] as const).map((m) => (
              <button key={m} onClick={() => setLabelMode(m)} style={{ padding: '5px 11px', borderRadius: 6, fontFamily: mono, fontSize: 10, cursor: 'pointer', border: 'none', background: labelMode === m ? '#2a2a2a' : 'transparent', color: labelMode === m ? '#f6f6f6' : '#7a7a7a' }}>{m}</button>
            ))}
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', right: 22, top: 20, display: 'flex', gap: 7, zIndex: 3, whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: 'rgba(20,20,20,.9)' }}>
          {(['graph', 'canvas'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{ padding: '5px 11px', borderRadius: 6, fontFamily: mono, fontSize: 10, cursor: 'pointer', border: 'none', background: mode === m ? '#2a2a2a' : 'transparent', color: mode === m ? '#f6f6f6' : '#7a7a7a' }}>{m}</button>
          ))}
        </div>
        {isGraph && (
          <>
            <button onClick={clearSel} style={{ padding: '8px 13px', borderRadius: 8, background: 'rgba(20,20,20,.9)', border: 'none', fontFamily: mono, fontSize: 10, color: '#b8b8b8', cursor: 'pointer' }}>clear</button>
            <button disabled={saving || !docs} onClick={() => void signManifest()} style={{ padding: '8px 14px', borderRadius: 8, background: signBg, border: 'none', fontFamily: mono, fontSize: 10, color: signFg, cursor: 'pointer' }}>{saving ? 'saving…' : 'save room scope'}</button>
          </>
        )}
        <button onClick={onClose} aria-label="close graph" style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(20,20,20,.9)', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#b8b8b8' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2"><path d="M1.5 1.5 10.5 10.5M10.5 1.5 1.5 10.5" /></svg>
        </button>
      </div>

      {saveError && <div role="alert" style={{ position: 'absolute', left: 22, right: 22, top: 82, zIndex: 8, padding: 10, color: '#ffb390', background: '#28170f', borderRadius: 8, fontSize: 12 }}>{saveError}</div>}
      {isGraph && (
        <div style={{ position: 'absolute', left: '50%', bottom: 22, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 0, borderRadius: 12, background: 'rgba(238,238,236,.94)', color: '#111', padding: '12px 8px 12px 16px', boxShadow: '0 18px 50px rgba(0,0,0,.5)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, paddingRight: 16 }}>
            <div style={{ fontSize: 26, fontWeight: 500, lineHeight: 1 }}>{selCount}</div>
            <div style={{ fontFamily: mono, fontSize: 9.5, color: '#8a8a86' }}>selected</div>
          </div>
          <div style={{ width: 1, height: 26, background: '#d8d8d5' }} />
          <div style={{ display: 'flex', gap: 14, padding: '0 16px' }}>
            {selTiers.map((s) => (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontFamily: mono, fontSize: 8.5, color: '#8a8a86' }}>{s.id}</div>
                <div style={{ fontFamily: mono, fontSize: 12, color: s.color }}>{s.n}</div>
              </div>
            ))}
          </div>
          <div style={{ width: 1, height: 26, background: '#d8d8d5' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 16px' }}>
            <div style={{ fontFamily: mono, fontSize: 8.5, color: '#8a8a86' }}>est. context</div>
            <div style={{ fontFamily: mono, fontSize: 12 }}>{selTokens}</div>
          </div>
          <button onClick={() => setInspect(true)} style={{ padding: '8px 13px', borderRadius: 7, background: '#e0e0dc', border: 'none', fontFamily: mono, fontSize: 10, cursor: 'pointer', color: '#333' }}>inspect</button>
        </div>
      )}

      {inspect && (
        <div onClick={() => setInspect(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,4,.7)', backdropFilter: 'blur(4px)', zIndex: 30, display: 'grid', placeItems: 'center', animation: 'arkFade .16s ease-out' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 640, maxHeight: '78%', display: 'flex', flexDirection: 'column', borderRadius: 14, background: '#f1f1ef', color: '#111', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
            <div style={{ flex: 'none', padding: '20px 22px 16px 22px', borderBottom: '1px solid #e0e0dd' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8a8a86' }}>context manifest</div>
                <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 10, color: '#8a8a86' }}>{manifestIdLabel}</div>
              </div>
              <div style={{ fontSize: 19, fontWeight: 500, marginTop: 9, lineHeight: 1.35, textWrap: 'pretty' }}>{manifestBrief}</div>
              <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
                {manifestMeta.map((m) => (
                  <div key={m.k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontFamily: mono, fontSize: 8.5, color: '#8a8a86' }}>{m.k}</div>
                    <div style={{ fontFamily: mono, fontSize: 11, color: m.color }}>{m.v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="ark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {inspectRows.map((r, i) => (
                <div key={r.path + i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 22px', borderBottom: '1px solid #e8e8e5' }}>
                  <div style={{ fontFamily: mono, fontSize: 9, color: '#a0a09c', width: 52, flex: 'none' }}>{r.kind}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: '#111', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.path}</div>
                  <div style={{ fontFamily: mono, fontSize: 9.5, color: '#8a8a86', flex: 'none' }}>{r.tier}</div>
                  <div style={{ fontFamily: mono, fontSize: 9.5, color: r.hashFg, flex: 'none' }}>{r.hash}</div>
                </div>
              ))}
            </div>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', background: '#eaeae7' }}>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: '#8a8a86' }}>unsaved scope preview · no cryptographic signature</div>
              <button onClick={revoke} style={{ marginLeft: 'auto', padding: '8px 13px', borderRadius: 7, background: '#111', color: '#f2f2f2', border: 'none', fontFamily: mono, fontSize: 10, cursor: 'pointer' }}>discard candidate</button>
              <button onClick={() => setInspect(false)} style={{ padding: '8px 13px', borderRadius: 7, background: '#dedeDA', border: 'none', fontFamily: mono, fontSize: 10, cursor: 'pointer', color: '#333' }}>close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
