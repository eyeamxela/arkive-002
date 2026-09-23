import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useChatMessages, useWorkspace } from './hooks';
import { CtxOverlay, ScopePicker, Tray, useScopeMetrics } from './Tray';
import type { CtxVersionRow, ManifestSet, MetricId } from './Tray';
import { MetricSheet } from './MetricSheet';
import { useRoomField } from './RoomSession';
import type { Id } from '../convex/_generated/dataModel';

// port target: design/arkive-v2.html [data-screen-label='chat'] — header, message list, typing, scope bar, composer.
// slice 03 adds: scope picker (~524–550), ctx memory overlay (~551–585), four-card tray (~2239–2321), metric sheets (~2154–2178).

const O = '#ff5a1f';
const mono = "'IBM Plex Mono', monospace";
const TIER_INK: Record<string, string> = { canon: O, curated: '#8a8a8a', dashboards: '#5c5c5c', legal: '#454545', inbox: '#2e2e2e' };
const TIER_ORDER = ['canon', 'curated', 'dashboards', 'legal', 'inbox'];

const fmtTs = (at: number) => {
  const d = new Date(at);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
};

export function ChatPanel({ room, onOpenCapture, onOpenDoc, compact = false, onExitCompact, contextOpenRequest = 0 }: { room: string; onOpenCapture: () => void; onOpenDoc: (path: string) => void; compact?: boolean; onExitCompact?: () => void; contextOpenRequest?: number }) {
  const [draft, setDraft] = useRoomField(room, 'draft', '');
  const [deny, setDeny] = useRoomField(room, 'deny', true);
  const [ttl, setTtl] = useRoomField(room, 'ttl', 'session');
  const [typing, setTyping] = useRoomField(room, 'typing', false);
  const [sending, setSending] = useRoomField(room, 'sending', false);
  const [sendError, setSendError] = useRoomField(room, 'sendError', '');
  const sendLock = useRef(false);
  // session scope adds (STATE-SCHEMA: sel[] + extra[] are react state) — the picker toggles doc ids here
  const [sel, setSel] = useRoomField<ReadonlySet<string> | null>(room, 'selection', null);
  const [mid, setMid] = useRoomField<string | null>(room, 'manifest', null);
  const [picker, setPicker] = useState(false);
  const [ctxOpen, setCtxOpen] = useRoomField(room, 'ctxOpen', false);
  const [consumedContext, setConsumedContext] = useRoomField(room, 'contextConsumed', 0);
  const [metric, setMetric] = useState<MetricId | null>(null);
  // ctx memory sim (gap: no contextSummaries write mutation) — check/uncheck + summarize live in local state
  const [ctxOverrides, setCtxOverrides] = useRoomField<Record<string, boolean>>(room, 'ctxOverrides', {});
  const [ctxLocal, setCtxLocal] = useRoomField<CtxVersionRow[]>(room, 'ctxLocal', []);
  const [lastSumAt, setLastSumAt] = useRoomField(room, 'lastSumAt', 4);
  const msgs = useChatMessages(room);
  const ws = useWorkspace(room, deny, sel, mid);
  const ctxSummaries = useQuery(api.panels.contextSummaries, { room });
  const sendMessage = useMutation(api.chat.sendMessage);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    if (contextOpenRequest > consumedContext) { setCtxOpen(true); setPicker(false); setConsumedContext(contextOpenRequest); }
  }, [contextOpenRequest]);

  // effective ctx versions = db rows (on overridden locally) + locally summarized versions
  const ctxVersions: CtxVersionRow[] = (ctxSummaries ?? [])
    .map((c) => ({ version: c.version, tokens: c.tokens, on: ctxOverrides[c.version] ?? c.on, note: c.note, at: c.at }))
    .concat(ctxLocal);
  const sm = useScopeMetrics(room, deny, sel, ctxVersions, mid, compact);

  // prototype pin() — keep the newest message in view
  useEffect(() => {
    const go = () => { const el = scrollRef.current; if (el && pinned.current) el.scrollTop = el.scrollHeight; };
    requestAnimationFrame(go);
    const t = setTimeout(go, 60);
    return () => clearTimeout(t);
  }, [msgs?.length, typing]);

  // typing clears when the agent reply lands
  useEffect(() => {
    if (msgs && msgs.length && msgs[msgs.length - 1].role === 'ag') setTyping(false);
  }, [msgs?.length]);

  // prototype esc cascade: picker → ctx → metric
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (picker) setPicker(false);
      else if (ctxOpen) setCtxOpen(false);
      else if (metric) setMetric(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picker, ctxOpen, metric]);

  const send = async () => {
    const t = draft.trim();
    if (!t || sending || sendLock.current || !ws?.contextFingerprint || ws.contextError) return;
    sendLock.current = true;
    setSending(true);
    setSendError('');
    setTyping(true);
    try {
      await sendMessage({ room, text: t, deny, selectionIds: sel == null ? undefined : [...sel] as Id<'brainObjects'>[], manifestId: mid ? mid as Id<'manifests'> : undefined, ttl, expectedContextFingerprint: ws.contextFingerprint });
      setDraft((current) => current.trim() === t ? '' : current);
    } catch (error) {
      setTyping(false);
      setSendError(error instanceof Error ? error.message : 'Message failed. Your draft is retained.');
    } finally { sendLock.current = false; setSending(false); }
  };

  const openPicker = () => { setPicker(true); setCtxOpen(false); };
  const openCtx = () => { setCtxOpen(true); setPicker(false); };
  const effectiveSelection = new Set((ws?.context.documents ?? []).map((doc) => String(doc._id)));
  const toggleSel = (id: string) => { setMid(null); setSel((s) => { const n = new Set(s ?? effectiveSelection); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const addAllShown = (ids: string[]) => { setMid(null); setSel((s) => new Set([...(s ?? effectiveSelection), ...ids])); };
  const clearSel = () => { setMid(null); setSel(new Set()); };
  const toggleCtxV = (version: string) => {
    const db = (ctxSummaries ?? []).find((c) => c.version === version);
    if (db) setCtxOverrides((o) => ({ ...o, [version]: !(o[version] ?? db.on) }));
    else setCtxLocal((l) => l.map((v) => (v.version === version ? { ...v, on: !v.on } : v)));
  };
  // prototype summarizeNow() — simulated: no contextSummaries/messages write exists, version lands locally
  const summarizeNow = () => {
    const fresh = (msgs?.length ?? 0) - lastSumAt;
    if (fresh <= 0) return;
    const vn = 'v' + (ctxVersions.length + 1);
    const last = ctxVersions[ctxVersions.length - 1];
    const tok = Math.round(((last?.tokens ?? 0) + fresh * 0.06) * 10) / 10;
    setCtxOverrides(Object.fromEntries((ctxSummaries ?? []).map((c) => [c.version, false])));
    setCtxLocal((l) => l.map((v) => ({ ...v, on: false })).concat([
      { version: vn, tokens: tok, on: true, note: 'sessions 1–' + (18 + Math.ceil(fresh / 2)) + ' · rolling', at: Date.now() }
    ]));
    setLastSumAt(msgs?.length ?? 0);
  };
  // Preview an exact saved manifest in this room; backend validates room, state and expiry.
  const loadSet = (m: ManifestSet) => {
    if (!m._id || m.state === 'revoked') return;
    setSel(null);
    setMid(m._id);
    setTtl(['session', '1h', '24h', '7d', '30d'].includes(m.ttl) ? m.ttl : 'session');
    setCtxOpen(false);
  };

  const manifestIdLabel = ws?.manifestKey ? 'manifest-' + ws.manifestKey : 'manifest —';
  const vaultHead = ws?.vaultHead ?? '—';
  const ctxOn = ctxVersions.filter((c) => c.on);
  const ctxChip = ctxOn.length ? 'ctx ' + ctxOn.map((c) => c.version).join('+') + ' · ' + Math.round(ctxOn.reduce((a, c) => a + c.tokens, 0) * 10) / 10 + 'k' : 'ctx off';
  const ctxChipFg = ctxOn.length ? '#c8b4a6' : '#5c5c5c';
  const inScopeCount = sm.scope.length;
  const tokenLabel = '~' + sm.ctxTok + 'k ctx';
  const selActive = sel !== null;
  const barTitle = ws?.context.scopeLabel ?? 'resolving effective scope…';
  const barDot = selActive ? O : '#5c5c5c';
  const barBorder = selActive ? '#2a1a12' : '#1a1a1a';
  const counts = sm.counts;
  const barTiers = TIER_ORDER.filter((id) => counts[id]).map((id) => ({
    id, n: counts[id], color: TIER_INK[id],
    pct: ((counts[id] / Math.max(1, inScopeCount)) * 100).toFixed(2) + '%'
  }));

  return (
    <div data-chat-mode={compact ? 'compact' : 'full'} style={{ flex: 1, minHeight: 0, minWidth: 0, height: compact ? '100%' : undefined, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {compact ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 12px', borderBottom: '1px solid #191919', flex: 'none' }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: '#8a8a8a' }} />
            <span style={{ fontFamily: mono, fontSize: 10.5, color: '#e8e8e8' }}>{room}</span>
            <span style={{ fontFamily: mono, fontSize: 8, color: '#5c5c5c' }}>{inScopeCount} docs · simulated</span>
            <button onClick={onExitCompact} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', padding: 0, fontFamily: mono, fontSize: 8, color: '#8a8a8a', cursor: 'pointer' }}>⤢ open in chat</button>
          </div>
        ) : <div style={{ padding: '0 18px 12px 18px', flex: 'none', display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>graph brain</div>
          <div style={{ display: 'flex', gap: 12, fontFamily: mono, fontSize: 10, color: '#5c5c5c', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
            <div style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{room} · simulated</div>
            <div style={{ color: '#2e2e2e', flex: 'none' }}>/</div>
            <div style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{manifestIdLabel}</div>
            <div style={{ color: '#2e2e2e', flex: 'none' }}>/</div>
            <div style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>vault @ {vaultHead}</div>
            <div style={{ color: '#2e2e2e', flex: 'none' }}>/</div>
            <button onClick={openCtx} style={{ cursor: 'pointer', color: ctxChipFg, flex: 'none', background: 'transparent', border: 'none', padding: 0, fontFamily: mono, fontSize: 10 }}>{ctxChip} ▾</button>
          </div>
          <button onClick={onOpenCapture} title="capture — voice, note, task, file" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 6, background: '#141414', border: 'none', fontFamily: mono, fontSize: 9.5, color: '#c8c8c8', cursor: 'pointer', flex: 'none' }}>
            <div style={{ width: 6, height: 6, borderRadius: 999, background: O }} />capture
          </button>
        </div>}

        <div ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64; }} data-chat-scroll="1" className="ark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: compact ? '10px 12px' : '6px 18px 18px 18px', display: 'flex', flexDirection: 'column', gap: compact ? 8 : 18 }}>
          {(compact ? (msgs ?? []).slice(-3) : (msgs ?? [])).map((m) => {
            const op = m.role === 'op';
            return (
              <div key={m._id} style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 7, maxWidth: compact ? '92%' : 720, alignSelf: op ? 'flex-end' : 'flex-start', animation: 'arkRise .22s ease-out' }}>
                {!compact && <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: op ? '#6a6a6a' : O }}>{op ? 'operator' : room.startsWith('dm:') ? room.slice(3) : 'agent'}</div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: '#3e3e3e' }}>{fmtTs(m.at)}</div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: '#3e3e3e' }}>{m.snap ? '· ' + m.snap + ' in scope' : ''}</div>
                </div>}
                <div style={{ fontSize: compact ? 11 : 15, lineHeight: 1.55, color: op && !compact ? '#0d0d0d' : '#e8e8e8', background: op ? (compact ? '#1c1c1c' : '#efefec') : '#111111', padding: compact ? '7px 10px' : '11px 15px', borderRadius: compact ? 9 : 11, border: '1px solid ' + (op && !compact ? '#efefec' : '#1c1c1c'), textWrap: 'pretty' }}>{m.text}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {m.cites.map((c) => (
                    <button key={c} onClick={() => onOpenDoc(c)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 5, background: '#111', border: '1px solid #1c1c1c', fontFamily: mono, fontSize: compact ? 8 : 9.5, color: '#7a7a7a', cursor: 'pointer', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <div style={{ width: 3, height: 3, borderRadius: 999, background: O }} />{c}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {typing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: mono, fontSize: 10, color: '#5c5c5c' }}>
              <div style={{ width: 5, height: 5, borderRadius: 999, background: O, animation: 'arkPulse 1s ease-in-out infinite' }} />
              simulated reply · {inScopeCount} docs in scope
            </div>
          )}
        </div>

        <div className="ark-chat-composer" style={{ flex: 'none', padding: compact ? '0 12px 12px' : '0 18px 18px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sendError && <div role="alert" style={{ color: '#ff9670', fontSize: 11, overflowWrap: 'anywhere' }}>{sendError} <button onClick={() => void send()} disabled={sending}>retry</button></div>}
          {ws?.contextError && <div role="alert" style={{ color: '#ff9670', fontSize: 11 }}>Context unavailable: {ws.contextError}. Choose a valid manifest or an explicit source selection.</div>}
          {!compact && picker && (
            <ScopePicker docs={sm.all} sel={sel ?? effectiveSelection} onToggle={toggleSel} onAddAll={addAllShown} onClear={clearSel} onClose={() => setPicker(false)} />
          )}
          {!compact && ctxOpen && (
            <CtxOverlay
              room={room}
              versions={ctxVersions}
              sets={sm.manifests.filter((manifest) => manifest.room === room && manifest.state !== 'revoked')}
              freshCount={(msgs?.length ?? 0) - lastSumAt}
              onToggle={toggleCtxV}
              onSummarize={summarizeNow}
              onLoadSet={loadSet}
              onClose={() => setCtxOpen(false)}
            />
          )}
          {!compact && <div className="ark-effective-scope-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 44, padding: '8px 12px', borderRadius: 10, background: '#101010', border: '1px solid ' + barBorder }}>
            <button onClick={() => setDeny((d) => !d)} title="Default-scope toggle only — explicit selections and saved manifests keep their exact sources." style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <div style={{ width: 6, height: 6, borderRadius: 999, background: barDot, flex: 'none' }} />
              <div style={{ fontFamily: mono, fontSize: 10, color: '#c8c8c8', textAlign: 'left', overflowWrap: 'anywhere' }}>{barTitle}</div>
            </button>
            <div style={{ width: 1, height: 16, background: '#232323', flex: 'none' }} />
            <button onClick={openPicker} title="pick files — or type @ in the composer" style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 'none', cursor: 'pointer', padding: '3px 7px', margin: '-3px -7px', borderRadius: 5, background: 'transparent', border: 'none', color: 'inherit', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 17, fontWeight: 500, lineHeight: 1 }}>{inScopeCount}</div>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: '#5c5c5c' }}>docs ▾</div>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', height: 5, flex: 1, minWidth: 0, borderRadius: 3, background: '#1c1c1c', overflow: 'hidden' }}>
              {barTiers.map((b) => (
                <div key={b.id} title={b.id + ' ' + b.n} style={{ width: b.pct, height: 5, background: b.color, flex: 'none' }} />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {['session', '1h', '24h', '7d', '30d'].map((id) => (
                <button key={id} onClick={() => setTtl(id)} style={{ padding: '4px 9px', borderRadius: 5, fontFamily: mono, fontSize: 9.5, cursor: 'pointer', border: 'none', background: ttl === id ? '#2a2a2a' : 'transparent', color: ttl === id ? '#e8e8e8' : '#5c5c5c', whiteSpace: 'nowrap' }}>{id}</button>
              ))}
              <button onClick={openPicker} style={{ padding: '5px 11px', borderRadius: 5, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 9.5, color: '#d8d8d8', cursor: 'pointer', whiteSpace: 'nowrap' }}>inspect</button>
              {(sel !== null || mid) && <button onClick={() => { setSel(null); setMid(null); }} style={{ padding: '5px 8px', borderRadius: 5, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 9, color: '#b4a292', cursor: 'pointer' }}>follow room scope</button>}
            </div>
          </div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 10, padding: compact ? '0 4px 0 9px' : '0 4px 0 14px', height: compact ? 34 : 52, borderRadius: compact ? 8 : 11, background: '#111', border: '1px solid #1e1e1e' }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: '#4a4a4a', flex: 'none' }}>›</div>
            <input
              value={draft}
              onChange={(e) => {
                // prototype onDraft — typing '@' opens the scope picker and swallows the character
                const v = e.target.value;
                if (!compact && v.endsWith('@') && !picker) { setDraft(v.slice(0, -1)); setPicker(true); }
                else setDraft(v);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder={compact ? 'ask within this room…' : 'message ' + room + ' — or `x note:` to capture'}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#f2f2f2', fontSize: compact ? 10 : 14, fontFamily: mono }}
            />
            {!compact && <div style={{ fontFamily: mono, fontSize: 9, color: '#3a3a3a', flex: 'none' }}>{tokenLabel}</div>}
            <button onClick={send} disabled={sending || !!ws?.contextError || !ws?.contextFingerprint} aria-label="send" style={{ width: compact ? 24 : 40, height: compact ? 24 : 40, flex: 'none', borderRadius: compact ? 5 : 8, background: draft.trim() ? O : '#1a1a1a', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', color: draft.trim() ? '#0a0a0a' : '#5c5c5c' }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 8h9.5M8.6 4 12.8 8l-4.2 4" /></svg>
            </button>
          </div>
        </div>
      </div>

      {!compact && <Tray sm={sm} onOpenMetric={setMetric} />}

      {!compact && metric && <MetricSheet data={sm.met[metric]} manifestIdLabel={manifestIdLabel} onClose={() => setMetric(null)} />}
    </div>
  );
}
