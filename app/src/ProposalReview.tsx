import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

// port target: design/arkive-v2.html [data-screen-label='inbox'] (lines 1036–1112) — header + stats,
// proposal cards (pill / conf / source / brief / quote / diff chips / save-to routing / actions), empty row, footer.
// bindings: renderVals inboxStats·inboxCards·inboxEmpty (~4938–4971); handlers inboxAccept·inboxRouteSet·
// traceToggle (~2703–2728) and inboxAct (~2848–2851). kind filter follows the Component kindFilter chip
// pattern (~4309–4312) applied to proposal kinds. accept is ONE mutation (HANDOFF §5.1); the diff chips ARE
// the event body. inboxRoute stays local until accept (HANDOFF §5.7).
// defer + merge only mutate local state in the prototype — simulated locally here; server rows stay pending.

const O = '#ff5a1f';
const mono = "'IBM Plex Mono', monospace";
const KIND_FILTERS = ['all', 'note', 'task', 'person', 'memory', 'relation'];
const ROUTE_TIERS = ['inbox', 'curated', 'canon', 'dashboards'];
const DISMISS_DEFAULT = 'not durable — operator';

const actBtn: CSSProperties = { padding: '7px 12px', borderRadius: 6, background: '#e2e2de', border: 'none', fontFamily: mono, fontSize: 10, lineHeight: 1.2, cursor: 'pointer', color: '#333', flex: 'none' };

// prototype clockStr — HH:MM stamp on the resolved card's meta line
const clockStr = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

type LocalMark = { state?: string; at?: string; reason?: string };

export function ProposalReview() {
  const proposals = useQuery(api.panels.proposals);
  const acceptMut = useMutation(api.proposals.accept);
  const dismissMut = useMutation(api.proposals.dismiss);

  const [kindFilter, setKindFilter] = useState('all');
  const [inboxRoute, setInboxRoute] = useState<Record<string, string>>({}); // save-to override — local until accept
  const [traceOpen, setTraceOpen] = useState<string | null>(null);
  const [consented, setConsented] = useState<Record<string, boolean>>({}); // memory kinds — explicit consent before accept
  const [accepting, setAccepting] = useState<Record<string, boolean>>({});
  const [acceptErrors, setAcceptErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [dismissDraft, setDismissDraft] = useState('');
  const [local, setLocal] = useState<Record<string, LocalMark>>({}); // simulated defer/merge + at/reason stamps

  const all = proposals ?? [];
  const effState = (p: { _id: string; state: string }) => (p.state === 'pending' ? local[p._id]?.state ?? 'pending' : p.state);

  const inboxStats = [
    { k: 'pending', v: all.filter((p) => effState(p) === 'pending').length, color: O },
    { k: 'accepted', v: all.filter((p) => ['accepted', 'edited', 'merged'].includes(effState(p))).length, color: '#111' },
    { k: 'set aside', v: all.filter((p) => ['dismissed', 'deferred'].includes(effState(p))).length, color: '#111' }
  ];
  const inboxEmpty = proposals !== undefined && all.every((p) => effState(p) !== 'pending');
  const cards = all.filter((p) => kindFilter === 'all' || p.kind === kindFilter);

  const mark = (id: string, m: LocalMark) => setLocal((l) => ({ ...l, [id]: { ...l[id], ...m } }));

  const doAccept = async (p: (typeof all)[number]) => {
    if (effState(p) !== 'pending' || accepting[p._id]) return;
    if ((p.consent || p.kind === 'memory') && !consented[p._id]) return;
    if (p.dup) { mark(p._id, { state: 'merged', at: clockStr() }); return; } // simulated — no server merge mutation
    const draft = editDraft.trim();
    const editedBrief = editing === p._id && draft && draft !== p.brief ? draft : undefined;
    setAccepting((current) => ({ ...current, [p._id]: true }));
    setAcceptErrors((current) => ({ ...current, [p._id]: '' }));
    try {
      await acceptMut({ id: p._id, saveToTier: inboxRoute[p._id], editedBrief, consent: consented[p._id] === true });
      mark(p._id, { at: clockStr() });
      if (editing === p._id) { setEditing(null); setEditDraft(''); }
    } catch (error) { setAcceptErrors((current) => ({ ...current, [p._id]: error instanceof Error ? error.message : 'Accept failed. Please retry.' })); }
    finally { setAccepting((current) => ({ ...current, [p._id]: false })); }
  };

  const doDismiss = (p: (typeof all)[number]) => {
    if (effState(p) !== 'pending') return;
    if (dismissing !== p._id) { setDismissing(p._id); setDismissDraft(DISMISS_DEFAULT); return; }
    const reason = dismissDraft.trim() || DISMISS_DEFAULT;
    mark(p._id, { at: clockStr(), reason });
    setDismissing(null);
    setDismissDraft('');
    void dismissMut({ id: p._id, reason });
  };

  // prototype inboxAct(id,'deferred') — local state only; simulated (server row stays pending)
  const doDefer = (p: (typeof all)[number]) => { if (effState(p) === 'pending') mark(p._id, { state: 'deferred', at: clockStr() }); };

  return (
    <div data-screen-label="inbox" style={{ flex: 1, minHeight: 0, padding: '0 18px 18px 18px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, borderRadius: 14, background: '#f1f1ef', color: '#111', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 'none', padding: '20px 24px 16px 24px', display: 'flex', alignItems: 'flex-end', gap: 26, borderBottom: '1px solid #e0e0dd' }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8a8a86' }}>brain inbox · derived, not yet durable</div>
            <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-.02em', marginTop: 7, lineHeight: 1 }}>proposals, not writes</div>
          </div>
          <div style={{ display: 'flex', gap: 26, marginLeft: 'auto' }}>
            {inboxStats.map((s) => (
              <div key={s.k} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: '#8a8a86' }}>{s.k}</div>
                <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1, color: s.color }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 'none', display: 'flex', gap: 6, padding: '12px 14px 0 14px', flexWrap: 'wrap' }}>
          {KIND_FILTERS.map((k) => (
            <button key={k} onClick={() => setKindFilter(k)} style={{ padding: '5px 10px', borderRadius: 6, background: kindFilter === k ? '#111' : '#e4e4e0', border: 'none', fontFamily: mono, fontSize: 9.5, color: kindFilter === k ? '#f2f2f2' : '#6a6a6a', cursor: 'pointer' }}>{k}</button>
          ))}
        </div>

        <div className="ark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cards.map((p) => {
            const id = p._id;
            const st = effState(p);
            const pending = st === 'pending';
            const lm = local[id];
            const conf = p.dup ? 'conf .41 · low' : 'conf .' + Math.round(p.conf * 100);
            const confFg = p.conf < 0.6 ? O : '#a0a09c';
            const dot = pending ? O : st === 'dismissed' ? '#111' : '#c0c0bc';
            const metaLine = pending
              ? (p.consent ? 'memory · explicit consent required · nothing writes silently' : 'accepting publishes a signed vault-ref · the diff above is the event body')
              : st + (lm?.at ? ' · ' + lm.at : '') + (lm?.reason ? ' · ' + lm.reason : '');
            const doneLabel = st === 'accepted' || st === 'edited' ? (p.rel ? 'edge on the graph' : 'on the graph · in the vault') : st;
            const hasQuote = !!p.quote;
            const showQuote = traceOpen === id && hasQuote;
            const canRoute = pending && !!p.targetPath && !p.dup;
            const rt = inboxRoute[id] ?? p.targetTier ?? 'inbox';
            const routePath = (rt === p.targetTier ? p.targetPath : rt + '/' + (p.targetPath ?? '').split('/').pop())
              + (rt === 'canon' && !p.consent ? ' · canon needs authority review' : '');
            const requiresConsent = p.consent || p.kind === 'memory';
            const acceptLabel = accepting[id] ? 'accepting…' : requiresConsent ? 'consent + accept' : p.dup ? 'merge' : 'accept';
            const acceptReady = (!requiresConsent || !!consented[id]) && !accepting[id];
            const isEditing = editing === id;
            const isDismissing = dismissing === id;
            return (
              <div key={id} style={{ borderRadius: 11, background: pending ? '#f6f6f4' : '#eeeeeb', border: '1px solid ' + (pending ? '#e0d2c8' : '#e4e4e0'), padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: dot, flex: 'none' }} />
                  <div style={{ padding: '2px 8px', borderRadius: 4, background: pending ? O : '#e0e0dc', fontFamily: mono, fontSize: 9, color: pending ? '#0f0f0f' : '#7a7a76', textTransform: 'uppercase', letterSpacing: '.08em' }}>{p.kind}</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: '#8a8a86' }}>{p.sourceRef}</div>
                  <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 10, color: confFg }}>{conf}</div>
                </div>
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                    style={{ fontSize: 15, lineHeight: 1.45, color: '#333', fontFamily: 'inherit', background: '#fff', border: '1px solid #e0d2c8', borderRadius: 6, padding: '8px 10px', outline: 'none', resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                  />
                ) : (
                  <div style={{ fontSize: 15, lineHeight: 1.45, color: '#333', textWrap: 'pretty' }}>{p.brief}</div>
                )}
                {showQuote && (
                  <div style={{ borderLeft: '2px solid #d8d8d4', padding: '2px 0 2px 12px', fontSize: 13.5, lineHeight: 1.5, color: '#5a5a56', fontStyle: 'italic' }}>{p.quote}</div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {p.diff.map((d) => (
                    <div key={d} style={{ padding: '3px 8px', borderRadius: 4, background: '#e4e4e0', fontFamily: mono, fontSize: 9.5, color: '#4a4a46' }}>{d}</div>
                  ))}
                </div>
                {canRoute && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: mono, fontSize: 9, color: '#a0a09c' }}>save to</div>
                    {ROUTE_TIERS.map((tr) => {
                      const on = rt === tr;
                      return (
                        <button key={tr} onClick={() => setInboxRoute((r) => ({ ...r, [id]: tr }))} style={{ padding: '3px 9px', borderRadius: 4, background: on ? '#111' : '#e4e4e0', border: 'none', fontFamily: mono, fontSize: 9, color: on ? '#f2f2f2' : '#5a5a56', cursor: 'pointer' }}>{tr}</button>
                      );
                    })}
                    <div style={{ fontFamily: mono, fontSize: 9, color: '#5a5a56' }}>→ {routePath}</div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 11, borderTop: '1px solid #e4e4e0', whiteSpace: 'nowrap' }}>
                  {isDismissing ? (
                    <input
                      autoFocus
                      value={dismissDraft}
                      onChange={(e) => setDismissDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') doDismiss(p);
                        if (e.key === 'Escape') { setDismissing(null); setDismissDraft(''); }
                      }}
                      placeholder="reason"
                      style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', borderBottom: '1px solid #d8d8d4', fontFamily: mono, fontSize: 10.5, color: '#333', padding: '0 0 2px 0' }}
                    />
                  ) : (
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', fontFamily: mono, fontSize: 10.5, color: '#5a5a56', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{metaLine}</div>
                  )}
                  {pending ? (
                    <div style={{ display: 'flex', gap: 7, flex: 'none' }}>
                      {hasQuote && (
                        <button onClick={() => setTraceOpen((t) => (t === id ? null : id))} style={actBtn}>trace ⏵</button>
                      )}
                      {!p.dup && (
                        <button onClick={() => { if (isEditing) { setEditing(null); setEditDraft(''); } else { setEditing(id); setEditDraft(p.brief); } }} style={actBtn}>{isEditing ? 'discard' : 'edit'}</button>
                      )}
                      <button onClick={() => doDefer(p)} style={actBtn}>defer</button>
                      <button onClick={() => doDismiss(p)} style={actBtn}>{isDismissing ? 'confirm dismiss' : 'dismiss'}</button>
                      {requiresConsent && (
                        <button onClick={() => setConsented((c) => ({ ...c, [id]: !c[id] }))} style={{ ...actBtn, display: 'flex', alignItems: 'center', gap: 6, background: consented[id] ? '#111' : '#e2e2de', color: consented[id] ? '#f2f2f2' : '#333' }}>
                          <div style={{ width: 9, height: 9, borderRadius: 2, border: '1px solid ' + (consented[id] ? O : '#a0a09c'), background: consented[id] ? O : 'transparent', flex: 'none' }} />
                          explicit consent
                        </button>
                      )}
                      <button disabled={!acceptReady} onClick={() => void doAccept(p)} style={{ ...actBtn, background: '#111', color: '#f2f2f2', opacity: acceptReady ? 1 : 0.35, cursor: acceptReady ? 'pointer' : 'default' }}>{acceptLabel}</button>
                    </div>
                  ) : (
                    <div style={{ padding: '7px 12px', borderRadius: 6, background: '#e8e8e4', fontFamily: mono, fontSize: 10, lineHeight: 1.2, color: '#a0a09c', flex: 'none' }}>{doneLabel}</div>
                  )}
                </div>
                {acceptErrors[id] && <div role="alert" style={{ color: '#ad3f17', fontSize: 11 }}>{acceptErrors[id]}</div>}
              </div>
            );
          })}
          {inboxEmpty && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderRadius: 11, background: '#eeeeeb' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, border: '1px dashed #a0a09c', flex: 'none' }} />
              <div style={{ fontFamily: mono, fontSize: 10.5, color: '#7a7a76' }}>nothing pending — new captures and agent output derive proposals here as they land.</div>
            </div>
          )}
        </div>

        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px', background: '#eaeae7' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, border: '1px dashed #a0a09c', flex: 'none' }} />
          <div style={{ fontFamily: mono, fontSize: 10.5, color: '#7a7a76' }}>nothing writes to the vault until you accept. accepting publishes a signed vault-ref — the node appears on the graph within seconds.</div>
        </div>
      </div>
    </div>
  );
}
