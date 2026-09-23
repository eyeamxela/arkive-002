import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Doc, Id } from '../convex/_generated/dataModel';
import { VaultTree } from './VaultTree';
import { ReadingView } from './ReadingView';
import { useRoomField } from './RoomSession';
import { useWorkspace } from './hooks';

// port target: design/arkive-v2.html [data-screen-label='vault'] (lines 677–891):
// sync strip · main panel (header + tree + reading view) · right rail (always-on guidance,
// instructions, memory, scheduled). bindings: renderVals ~4084–4278 + 5039–5042.
// Shared room scope is functional. Mac toggle/reindex and instruction cards are labeled previews.

const O = '#ff5a1f';
const mono = "'IBM Plex Mono', monospace";
const TIER_TOK: Record<string, number> = { canon: 4.6, curated: 3.1, dashboards: 1.4, legal: 5.2, inbox: 0.7 };

type BrainDoc = Doc<'brainObjects'>;

const btnReset: CSSProperties = { background: 'transparent', border: 'none', margin: 0, padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' };

const ago = (ts: number) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
};

export function VaultFiles({ room, openPath }: { room: string; openPath?: string | null }) {
  const docs = useQuery(api.documents.list);
  const folders = useQuery(api.panels.watchedFolders);
  const sync = useQuery(api.panels.syncState);
  const tierPolicy = useQuery(api.panels.tierPolicy);
  const ctxVersions = useQuery(api.panels.contextSummaries, { room });
  const starToggle = useMutation(api.ops.starToggle);
  const alwaysToggle = useMutation(api.ops.alwaysToggle);
  const proposalsAdd = useMutation(api.ops.proposalsAdd);

  const [selDoc, setSelDoc] = useState<Id<'brainObjects'> | null>(null);
  const [vaultQ, setVaultQ] = useState('');
  const [vaultFilter, setVaultFilter] = useState('all');
  const [treeClosed, setTreeClosed] = useState<Record<string, boolean>>({ dashboards: true, legal: true, inbox: true });
  const [selection, setSelection] = useRoomField<ReadonlySet<string> | null>(room, 'selection', null);
  const [manifest, setManifest] = useRoomField<string | null>(room, 'manifest', null);
  const [deny] = useRoomField(room, 'deny', true);
  const workspace = useWorkspace(room, deny, selection, manifest);
  const scopeIds = new Set((workspace?.context.documents ?? []).map((doc) => String(doc._id)));
  const [promoted, setPromoted] = useState<Record<string, boolean>>({});  // local flag; the proposal itself writes via ops.proposalsAdd
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const actionLock = useRef(false);
  const [addingInstr, setAddingInstr] = useState(false);
  const [instrDraft, setInstrDraft] = useState('');
  const [instrs, setInstrs] = useState<{ id: string; path: string }[]>([]); // simulated — no doc-create mutation exists
  const handledPath = useRef<string | null>(null);

  // openPath prop — open that doc's reading view on mount / prop change
  useEffect(() => {
    if (!openPath || !docs) return;
    if (handledPath.current === openPath) return;
    const d = docs.find((x) => x.path === openPath);
    if (d) { handledPath.current = openPath; setSelDoc(d._id); }
  }, [openPath, docs]);

  const policy = useMemo(() => (tierPolicy ?? {}) as unknown as Record<string, string>, [tierPolicy]);
  // allNodes() — policy 'exclude' removes a tier from the vault immediately
  const all = useMemo(() => (docs ?? []).filter((d) => (policy[d.tier] ?? 'index') !== 'exclude'), [docs, policy]);
  const curDoc: BrainDoc | null = selDoc ? all.find((d) => d._id === selDoc) ?? null : null;

  // Seeded status preview only. No desktop control, scan, or filesystem watcher is connected.
  const macOnline = sync?.macOnline ?? false;
  const pending = sync?.pending ?? 0;
  const queued = sync?.queued ?? 0;
  const head = sync?.head ?? '—';
  const lastScan = sync ? ago(sync.lastScanAt) : '—';

  const macDot = macOnline ? '#3a7a4a' : '#4a4a4a';
  const macFg = macOnline ? '#e8e8e8' : '#8a8a8a';
  const macChip = (folders?.length ?? 0) > 1 ? 'mini.local · ' + (folders?.length ?? 0) + ' folders' : 'mini.local · ~/vault-xela';
  const arrowGlyph = macOnline ? '⇄' : '←';
  const arrowFg = queued && !macOnline ? O : '#5c5c5c';
  const syncBg = (pending || queued) ? '#12100e' : '#0d0d0d';
  const syncBorder = (pending || queued) ? '#2a1a12' : '#191919';
  const syncLine = 'demo scan timestamp ' + lastScan + ' · no actual scan, sync, or watcher is running';
  const syncLineFg = '#8a8a8a';

  // — main panel header —
  const vaultStatLine = all.length + ' references · ' + room + ' · ' + scopeIds.size + ' in room scope · demo sync @' + head;
  const vaultSeg: [string, string][] = [['all', 'all'], ['starred', '★'], ['always', 'always']];
  const watcherDot = macOnline ? O : '#4a4a4a';
  const watcherAnim = macOnline ? 'arkPulse 2s ease-in-out infinite' : 'none';
  const watcherFg = macOnline ? '#a8a8a8' : '#6a6a6a';
  const watcherLabel = 'watcher not connected · demo';

  // — doc actions —
  const toggleDocScope = () => {
    const d = curDoc; if (!d) return;
    setManifest(null);
    setSelection((prev) => { const next = new Set(prev ?? scopeIds); if (next.has(d._id)) next.delete(d._id); else next.add(d._id); return next; });
  };
  const performDocAction = async (action: () => Promise<unknown>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setActionPending(true);
    setActionError(null);
    try { await action(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Could not update this document. Please retry.'); }
    finally { actionLock.current = false; setActionPending(false); }
  };
  const docPromote = async () => {
    const d = curDoc;
    if (!d || d.tier === 'canon' || promoted[d._id]) return;
    const p = d.path ?? '';
    const base = p.split('/').slice(-1)[0];
    await performDocAction(async () => { await proposalsAdd({
      items: [{
        kind: 'promote', conf: 1, sourceRef: 'from vault · your request',
        brief: 'promote ' + p + ' to canon — authority review. the ' + d.tier + ' original is superseded, not erased.',
        diff: ['creates canon/' + base, 'supersedes ' + p, 'authority: reviewed → canonical'],
        targetPath: 'canon/' + base, targetTier: 'canon'
      }]
    }); setPromoted((prev) => ({ ...prev, [d._id]: true })); });
  };

  // — right rail: always-on guidance (server alwaysLoad docs + local instruction docs) —
  const alwaysDocs = all.filter((d) => d.alwaysLoad);
  const guidTok = alwaysDocs.reduce((a, d) => a + (TIER_TOK[d.tier] ?? 0.7), 0) + instrs.length * 0.8;
  const guidCount = (alwaysDocs.length + instrs.length) + ' docs';
  const guidPct = Math.min(100, Math.round((guidTok / 180) * 1000) / 10) + '%';
  const guidTokLine = 'preload ~' + (Math.round(guidTok * 10) / 10) + 'k · ' + Math.max(1, Math.round((guidTok / 180) * 100)) + '% of window';
  const guidCards: { key: string; name: string; tok: string; onRemove: () => void }[] = alwaysDocs.map((d) => ({
    key: d._id as string, name: (d.path ?? '').split('/').slice(-1)[0], tok: (TIER_TOK[d.tier] ?? 0.7) + 'k',
    onRemove: () => { void performDocAction(() => alwaysToggle({ id: d._id })); }
  })).concat(instrs.map((i) => ({
    key: i.id, name: i.path.split('/').slice(-1)[0], tok: '0.8k',
    onRemove: () => setInstrs((prev) => prev.filter((x) => x.id !== i.id))
  })));

  // — right rail: instructions —
  const confirmInstr = () => {
    const raw = instrDraft.trim();
    if (!raw) return;
    const slug = raw.toLowerCase().replace(/\.md$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'instruction';
    setInstrs((prev) => prev.concat([{ id: 'instr:' + Date.now(), path: 'canon/ops/' + slug + '.md' }]));
    setAddingInstr(false);
    setInstrDraft('');
  };
  const instrNote = instrs.length
    ? 'local instruction preview only · not saved to Canon or agent context'
    : 'instruction preview only — naming an item here does not create a Brain document.';

  // — right rail: memory —
  const ctxOn = (ctxVersions ?? []).filter((v) => v.on);
  const memLine = !ctxOn.length
    ? 'ctx off — no rolling summary loaded'
    : 'ctx ' + ctxOn.map((v) => v.version).join('+') + ' · ' + ctxOn[ctxOn.length - 1].note + ' · ' + (Math.round(ctxOn.reduce((a, v) => a + v.tokens, 0) * 10) / 10) + 'k';

  return (
    <div data-screen-label="vault" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: '0 18px 18px 18px', position: 'relative' }}>
      {actionError && <div role="alert" style={{ color: '#ff9670', fontSize: 12 }}>{actionError}</div>}
      {actionPending && <div role="status" style={{ color: '#8a8a8a', fontSize: 11 }}>saving document change…</div>}
      {workspace?.contextError && <div role="alert" style={{ color: '#ff9670', fontSize: 12 }}>{room} context unavailable: {workspace.contextError}. Choose a source to create an explicit room selection.</div>}

      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 14px', borderRadius: 11, background: syncBg, border: '1px solid ' + syncBorder, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 'none' }}>
            <div style={{ width: 7, height: 7, borderRadius: 999, background: O, animation: 'arkPulse 2.4s ease-in-out infinite', flex: 'none' }} />
            <div style={{ fontFamily: mono, fontSize: 11, color: '#e8e8e8' }}>relay.xela · nyc3</div>
          </div>
          <div style={{ fontFamily: mono, fontSize: 12, color: arrowFg, flex: 'none' }}>{arrowGlyph}</div>
          <button disabled title="Desktop control is not connected" style={{ ...btnReset, cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: 7, flex: 'none', padding: '3px 7px', borderRadius: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: 999, background: macDot, flex: 'none' }} />
            <div style={{ fontFamily: mono, fontSize: 11, color: macFg }}>{macChip}</div>
          </button>
          <div style={{ flex: 1, minWidth: 0 }} />
          <button disabled title="No scan or watcher handler is connected" style={{ ...btnReset, cursor: 'not-allowed', padding: '6px 12px', borderRadius: 6, background: '#1c1c1c', fontFamily: mono, fontSize: 10, lineHeight: 1.2, color: '#777', flex: 'none' }}>reindex · unavailable</button>
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden', fontFamily: mono, fontSize: 10.5, color: syncLineFg, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>sync simulation · {syncLine}</div>
      </div>

      <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', gap: 10 }}>
        <div style={{ flex: '1 1 auto', minWidth: 376, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 14, background: '#0d0d0d', border: '1px solid #191919', overflow: 'hidden' }}>
          <div style={{ flex: 'none', padding: '14px 18px 12px 18px', display: 'flex', alignItems: 'flex-end', flexWrap: 'nowrap', gap: 22, borderBottom: '1px solid #191919' }}>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: '#5c5c5c', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{vaultStatLine}</div>
              <div style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-.02em', marginTop: 7, lineHeight: 1, whiteSpace: 'nowrap' }}>~/vault-xela</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flex: '0 1 300px', minWidth: 110, height: 30, padding: '0 10px', borderRadius: 7, background: '#141414' }}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="#5c5c5c" strokeWidth="1.2" style={{ flex: 'none' }}><circle cx="6" cy="6" r="4" /><path d="M9.2 9.2 12.5 12.5" /></svg>
              <input value={vaultQ} onChange={(e) => setVaultQ(e.target.value)} placeholder="search paths" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#f2f2f2', fontSize: 11, fontFamily: mono }} />
            </div>
            <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 7, background: '#141414', flex: 'none' }}>
              {vaultSeg.map(([id, label]) => (
                <button key={id} onClick={() => setVaultFilter(id)} style={{ ...btnReset, padding: '4px 9px', borderRadius: 5, background: vaultFilter === id ? '#2a2a2a' : 'transparent', fontFamily: mono, fontSize: 9.5, color: vaultFilter === id ? '#f0f0f0' : '#5c5c5c', whiteSpace: 'nowrap' }}>{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 6, background: '#141414', flex: 'none' }}>
              <div style={{ width: 5, height: 5, borderRadius: 999, background: watcherDot, animation: watcherAnim }} />
              <div style={{ fontFamily: mono, fontSize: 9.5, color: watcherFg, whiteSpace: 'nowrap' }}>{watcherLabel}</div>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <VaultTree
              docs={all} vaultQ={vaultQ} vaultFilter={vaultFilter} treeClosed={treeClosed}
              selDocId={curDoc ? curDoc._id : null} scopeIds={scopeIds} policy={policy}
              onToggleFolder={(dir) => setTreeClosed((t) => ({ ...t, [dir]: !t[dir] }))}
              onPickDoc={(d) => setSelDoc(d._id)}
            />
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {curDoc ? (
                <ReadingView
                  doc={curDoc} docs={all}
                  inScope={scopeIds.has(curDoc._id)} promoted={!!promoted[curDoc._id]}
                  onStar={() => void performDocAction(() => starToggle({ id: curDoc._id }))}
                  onAlways={() => void performDocAction(() => alwaysToggle({ id: curDoc._id }))}
                  onPromote={docPromote} onToggleScope={toggleDocScope}
                  onClose={() => setSelDoc(null)} onOpenDoc={(d) => setSelDoc(d._id)}
                />
              ) : (
                <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, color: '#2e2e2e' }}>⌘</div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: '#4a4a4a', marginTop: 10 }}>select a file from the tree to read it</div>
                    <div style={{ fontFamily: mono, fontSize: 9, color: '#555', marginTop: 5 }}>database references · original-file registration is not connected</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="ark-scroll" style={{ flex: '0 1 272px', minWidth: 176, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ flex: 'none', borderRadius: 14, background: '#0d0d0d', border: '1px solid #191919', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: '#5c5c5c' }}>always-on guidance</div>
              <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 9, color: '#4a4a4a' }}>{guidCount}</div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ height: 3, borderRadius: 2, background: '#1c1c1c', overflow: 'hidden' }}>
                <div style={{ height: 3, width: guidPct, background: O }} />
              </div>
              <div style={{ fontFamily: mono, fontSize: 9, color: '#5c5c5c', marginTop: 6 }}>{guidTokLine}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
              {guidCards.map((g) => (
                <button key={g.key} onClick={g.onRemove} title="click to remove from every-session preload" style={{ ...btnReset, borderRadius: 8, background: '#141414', padding: '9px 10px', minWidth: 0 }}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <div style={{ padding: '1px 5px', borderRadius: 3, background: '#1e1e1e', fontFamily: mono, fontSize: 8, color: '#6a6a6a' }}>MD</div>
                    <div style={{ fontFamily: mono, fontSize: 9, color: '#4a4a4a' }}>{g.tok}</div>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ fontFamily: mono, fontSize: 9, color: '#4a4a4a', lineHeight: 1.5, marginTop: 10 }}>included in the default room scope. Explicit selections and saved manifests do not automatically expand to these references.</div>
          </div>

          <div style={{ flex: 'none', borderRadius: 14, background: '#0d0d0d', border: '1px solid #191919', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: '#5c5c5c' }}>instructions</div>
              <button onClick={() => { setAddingInstr(true); setInstrDraft(''); }} title="new instruction doc" style={{ ...btnReset, marginLeft: 'auto', width: 20, height: 20, borderRadius: 5, background: '#1a1a1a', display: 'grid', placeItems: 'center', color: '#c8c8c8', fontSize: 12, lineHeight: 1 }}>+</button>
            </div>
            {addingInstr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '7px 9px', borderRadius: 7, background: '#141414' }}>
                <div style={{ fontFamily: mono, fontSize: 10, color: '#4a4a4a', flex: 'none' }}>›</div>
                <input
                  value={instrDraft} onChange={(e) => setInstrDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmInstr(); if (e.key === 'Escape') { e.stopPropagation(); setAddingInstr(false); setInstrDraft(''); } }}
                  placeholder="name — e.g. weekly-report-format" autoFocus
                  style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#f2f2f0', fontSize: 10.5, fontFamily: mono }}
                />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
              {instrs.map((i) => (
                <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 6 }}>
                  <div style={{ width: 4, height: 4, borderRadius: 999, background: O, flex: 'none' }} />
                  <div style={{ fontFamily: mono, fontSize: 10, color: '#c8c8c8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.path.split('/').slice(-1)[0]}</div>
                  <button onClick={() => setInstrs((prev) => prev.filter((x) => x.id !== i.id))} aria-label="remove instruction" style={{ ...btnReset, width: 16, height: 16, borderRadius: 4, display: 'grid', placeItems: 'center', color: '#5c5c58', flex: 'none' }}>
                    <svg width="8" height="8" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2"><path d="M1.5 1.5 10.5 10.5M10.5 1.5 1.5 10.5" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: mono, fontSize: 9, color: '#4a4a4a', lineHeight: 1.5, marginTop: 8 }}>{instrNote}</div>
          </div>

          <div style={{ flex: 'none', borderRadius: 14, background: '#0d0d0d', border: '1px solid #191919', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: '#5c5c5c' }}>memory</div>
              <div style={{ marginLeft: 'auto', padding: '2px 7px', borderRadius: 4, background: '#1a1a1a', fontFamily: mono, fontSize: 8.5, color: '#6a6a6a' }}>prototype summary</div>
            </div>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: '#a8a8a8', lineHeight: 1.55, marginTop: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{memLine}</div>
            <div style={{ fontFamily: mono, fontSize: 9, color: '#4a4a4a', marginTop: 6 }}>{room} · manage in chat › ctx ▾</div>
          </div>

          <div style={{ flex: 'none', borderRadius: 14, background: '#0d0d0d', border: '1px solid #191919', padding: 14 }}>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: '#5c5c5c' }}>schedule previews · not connected</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 4, height: 4, borderRadius: 999, background: O, flex: 'none' }} />
                <div style={{ fontFamily: mono, fontSize: 10, color: '#c8c8c8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>nightly brief → #xela</div>
                <div style={{ fontFamily: mono, fontSize: 9, color: '#4a4a4a', flex: 'none' }}>21:30</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 4, height: 4, borderRadius: 999, background: '#3a3a3a', flex: 'none' }} />
                <div style={{ fontFamily: mono, fontSize: 10, color: '#c8c8c8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>reindex → git post-commit</div>
                <div style={{ fontFamily: mono, fontSize: 9, color: '#4a4a4a', flex: 'none' }}>on commit</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
