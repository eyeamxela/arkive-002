import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useMutationFeedback } from './useMutationFeedback';

// port target: design/arkive-v2.html [data-screen-label='shared'] — with you / waiting on you / shared out.
// simulate + revoke-impact preview ported from the team pane (simTitle/simSub/simRows/tmRevoke bindings).

const O = '#ff5a1f';
const mono = "'IBM Plex Mono', monospace";

const label: React.CSSProperties = { padding: '13px 24px 4px 24px', fontFamily: mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#a0a09c' };
const btnReset: React.CSSProperties = { border: 'none', fontFamily: mono, cursor: 'pointer' };
const lightBtn: React.CSSProperties = { ...btnReset, padding: '6px 11px', borderRadius: 6, background: '#e2e2de', fontSize: 10, color: '#333' };
const darkBtn: React.CSSProperties = { ...btnReset, padding: '6px 11px', borderRadius: 6, background: '#111', fontSize: 10, color: '#f2f2f2' };

// prototype simTitle / simSub / simRows / tmRawText — copy verbatim; kiln flips when the grant is revoked.
const simData = (revoked: boolean) => ({
  nezu: {
    title: 'nezu · steward', sub: 'member since jan · steward of print-specs + moodboard',
    rows: [
      ['projects/jrny — read, edit', 'inherited: member role includes team projects', 'inherited'],
      ['curated/print-specs.md — manage', 'direct: steward of this object', 'direct'],
      ['canon/** — no access', 'denied: personal canon is never workspace-visible', 'denied'],
      ['jrny-brief pack — install, no re-share', 'direct grant · license forbids redistribution', 'direct'],
      ['run hermes — no', '▣ capabilities are per-person consent; never granted', 'denied'],
      ['audit log — read', 'inherited: steward and above may read audit', 'inherited']
    ],
    raw: 'role(nezu)=steward · allow(read,edit) projects/** via member · allow(manage) obj:print-specs via steward · deny(*) canon/** rule:personal-canon · consent(run:hermes)=absent'
  },
  kiln: {
    title: revoked ? 'kiln · revoked guest' : 'kiln · guest (external)',
    sub: revoked ? 'link ended · citations survive, content sealed' : 'guest link created 02 aug · expires 01 sep',
    rows: revoked ? [
      ['moodboard canvas — no access', 'revoked just now · 4 citations sealed, content unreadable', 'denied'],
      ['everything else — no access', 'guests hold nothing by default', 'denied']
    ] : [
      ['moodboard canvas — view, comment', 'direct: guest link · downloads blocked', 'direct'],
      ['everything else — no access', 'guests hold nothing by default; no role inheritance', 'denied'],
      ['expiry — 14 days left', 'guest default 30d · renewable by a steward', 'expiring']
    ],
    raw: 'role(kiln)=guest · allow(view,comment) obj:moodboard-canvas expires:2026-09-01 download:false · deny(*) default' + (revoked ? ' · REVOKED sig:schnorr:8c2d…' : '')
  },
  hermes: {
    title: 'hermes · agent', sub: 'owned by you · no standing access — grants exist per run',
    rows: [
      ['canon via manifest — read, per run', 'direct: pinned hashes, grant dies on completion', 'per-run'],
      ['post to #xela — approval-gated', 'tool granted, but every send waits for you', 'gated'],
      ['workspace objects — no', 'agent grants never inherit from your roles', 'denied']
    ],
    raw: 'agent(hermes) owner:you · grant(read) manifest per-run · tool(post:#xela) gate:approval · tool(email)=off · inherit:none'
  },
  frtl: {
    title: 'frtl · admin', sub: 'admin since mar · runs the ops queue',
    rows: [
      ['workspace config, members — manage', 'inherited: admin role', 'inherited'],
      ['legal/** — no read', 'admin ≠ content access: sensitivity outranks role', 'denied'],
      ['operator queue — full', 'inherited: admin includes orchestration', 'inherited']
    ],
    raw: 'role(frtl)=admin · allow(manage) workspace/** · deny(read) sensitivity:restricted unless grant.direct'
  }
});

const VP: Record<string, [string, string]> = { inherited: ['#e4e4e0', '#5a5a56'], direct: [O, '#0f0f0f'], 'per-run': [O, '#0f0f0f'], gated: ['#e4e4e0', '#111'], expiring: ['#e4e4e0', O], denied: ['#111', '#f2f2f2'] };

export function Shared() {
  const feedback = useMutationFeedback();
  const grants = useQuery(api.panels.grants);
  const reqs = useQuery(api.panels.accessRequests);
  const carts = useQuery(api.panels.cartridges);
  const requestDecide = useMutation(api.ops.requestDecide);
  const grantRevoke = useMutation(api.ops.grantRevoke);

  const [sim, setSim] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const [revokeAsk, setRevokeAsk] = useState<string | null>(null);
  const [justRevoked, setJustRevoked] = useState<string | null>(null);

  const kilnGrant = (grants ?? []).find((g) => g.principal === 'kiln');
  const kilnRevoked = !!kilnGrant?.revokedAt;
  const SIM = simData(kilnRevoked) as Record<string, { title: string; sub: string; rows: string[][]; raw: string }>;
  const simD = (sim && SIM[sim]) || null;

  const shIn = (carts ?? []).filter((c) => c.rel !== 'owned').map((c) => ({
    name: c.name, meta: c.meta,
    pill: c.rel === 'temp' ? 'temp · session' : 'mounted',
    pillBg: c.rel === 'temp' ? '#e0e0dc' : '#111', pillFg: c.rel === 'temp' ? '#7a7a76' : '#f2f2f2',
    dot: c.rel === 'temp' ? '#c0c0bc' : O
  }));

  return (
    <div style={{ flex: 1, minHeight: 0, padding: '0 18px 18px 18px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, borderRadius: 14, background: '#f1f1ef', color: '#111', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 'none', padding: '20px 24px 16px 24px', borderBottom: '1px solid #e0e0dd' }}>
          <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8a8a86' }}>shared · in, out, and waiting</div>
          <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-.02em', marginTop: 7, lineHeight: 1 }}>grants, both directions</div>
          <div role="note" style={{ marginTop: 12, fontSize: 12 }}>Prototype metadata only · access simulations are examples, not enforced permissions or external sharing links.</div>
          {feedback.error && <div role="alert" style={{ marginTop: 8, color: '#a52e12' }}>{feedback.error}</div>}
          {feedback.pending && <div role="status">saving metadata…</div>}
        </div>
        <div className="ark-scroll-l" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={label}>shared with you</div>
          {shIn.map((r) => (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 24px', borderBottom: '1px solid #e6e6e3' }}>
              <div style={{ width: 6, height: 6, borderRadius: 999, background: r.dot, flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: '#111' }}>{r.name}</div>
                <div style={{ fontFamily: mono, fontSize: 10, color: '#8a8a86', marginTop: 3 }}>{r.meta}</div>
              </div>
              <div style={{ padding: '2px 8px', borderRadius: 4, background: r.pillBg, fontFamily: mono, fontSize: 9, color: r.pillFg, textTransform: 'uppercase', letterSpacing: '.08em', flex: 'none' }}>{r.pill}</div>
              <button style={{ ...btnReset, padding: '5px 11px', borderRadius: 6, background: '#e2e2de', fontSize: 10, color: '#333', flex: 'none' }}>open in library</button>
            </div>
          ))}

          <div style={label}>waiting on you</div>
          {(reqs ?? []).map((r) => {
            const pending = r.state === 'pending';
            return (
              <div key={r._id} style={{ padding: '11px 24px', borderBottom: '1px solid #e6e6e3', background: pending ? '#f6f6f4' : 'transparent' }}>
                <div style={{ fontSize: 13.5, color: '#111' }}>{r.what}</div>
                <div style={{ fontFamily: mono, fontSize: 10, color: '#8a8a86', marginTop: 3 }}>{r.why}</div>
                {pending ? (
                  <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
                    <button onClick={() => { setSim(r.who); setRaw(false); }} style={lightBtn}>simulate first</button>
                    <button disabled={feedback.pending} onClick={() => void feedback.run(() => requestDecide({ id: r._id, approve: false }))} style={lightBtn}>deny</button>
                    <button disabled={feedback.pending} onClick={() => void feedback.run(() => requestDecide({ id: r._id, approve: true }))} style={darkBtn}>grant metadata</button>
                  </div>
                ) : (
                  <div style={{ display: 'inline-block', marginTop: 9, padding: '3px 9px', borderRadius: 4, background: '#e0e0dc', fontFamily: mono, fontSize: 9, color: '#7a7a76', textTransform: 'uppercase', letterSpacing: '.08em' }}>{r.state}</div>
                )}
              </div>
            );
          })}

          {simD && (
            <div style={{ padding: '13px 24px', borderBottom: '1px solid #e6e6e3', animation: 'arkRise .16s ease-out' }}>
              <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#a0a09c' }}>simulate — what can they see and do?</div>
              <div style={{ fontSize: 17, fontWeight: 500, marginTop: 14 }}>{simD.title}</div>
              <div style={{ fontFamily: mono, fontSize: 10, color: '#8a8a86', marginTop: 4 }}>{simD.sub}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 12, borderRadius: 11, background: '#f6f6f4', border: '1px solid #e4e4e0', overflow: 'hidden' }}>
                {simD.rows.map(([t, why, v]) => (
                  <div key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: '1px solid #e8e8e5' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, color: v === 'denied' ? '#8a8a86' : '#111' }}>{t}</div>
                      <div style={{ fontFamily: mono, fontSize: 9.5, color: '#a0a09c', marginTop: 3, lineHeight: 1.5 }}>{why}</div>
                    </div>
                    <div style={{ padding: '2px 8px', borderRadius: 4, background: VP[v][0], fontFamily: mono, fontSize: 9, color: VP[v][1], flex: 'none', whiteSpace: 'nowrap' }}>{v}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setRaw((x) => !x)} style={{ ...btnReset, display: 'inline-block', marginTop: 10, padding: 0, background: 'transparent', fontSize: 9.5, color: '#a0a09c' }}>{raw ? 'hide raw policy' : 'advanced — raw policy expressions'}</button>
              {raw && (
                <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 9, background: '#eaeae7', fontFamily: mono, fontSize: 9.5, color: '#7a7a76', lineHeight: 1.8 }}>{simD.raw}</div>
              )}
            </div>
          )}

          <div style={label}>you've shared out</div>
          {(grants ?? []).map((g) => {
            const revoked = !!g.revokedAt;
            const kiln = g.principal === 'kiln';
            return (
              <div key={g._id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 24px', borderBottom: '1px solid #e6e6e3' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: revoked ? '#a0a09c' : '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: '#8a8a86', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{revoked ? 'grant metadata revoked' : g.meta}</div>
                  </div>
                  <button
                    disabled={feedback.pending || revoked}
                    onClick={() => { if (revoked) return; if (kiln) setRevokeAsk(g._id); else void feedback.run(() => grantRevoke({ id: g._id })); }}
                    style={{ ...btnReset, padding: '5px 11px', borderRadius: 6, background: revoked ? '#e8e8e4' : '#111', fontSize: 10, cursor: revoked ? 'default' : 'pointer', color: revoked ? '#a0a09c' : '#f2f2f2', flex: 'none' }}
                  >{revoked ? 'revoked' : 'revoke'}</button>
                </div>
                {kiln && revokeAsk === g._id && !revoked && (
                  <div style={{ margin: '12px 24px', padding: '13px 15px', borderRadius: 11, background: '#f6f6f4', border: '1px solid #e0d2c8', animation: 'arkRise .16s ease-out' }}>
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8a8a86' }}>revoking kiln will</div>
                    <div style={{ fontFamily: mono, fontSize: 10.5, color: '#5a5a56', lineHeight: 1.9, marginTop: 8 }}>mark this prototype grant revoked and append an audit event. External link delivery and citation access enforcement are not implemented.</div>
                    <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
                      <button onClick={() => setRevokeAsk(null)} style={{ ...lightBtn, padding: '6px 12px' }}>cancel</button>
                      <button disabled={feedback.pending} onClick={async () => { if (await feedback.run(() => grantRevoke({ id: g._id }))) { setRevokeAsk(null); setJustRevoked(g._id); } }} style={{ ...darkBtn, padding: '6px 12px' }}>revoke</button>
                    </div>
                  </div>
                )}
                {kiln && revoked && justRevoked === g._id && (
                  <div style={{ margin: '12px 24px', padding: '10px 13px', borderRadius: 9, background: '#eaeae7', fontFamily: mono, fontSize: 10, color: '#7a7a76' }}>grant metadata revoked · audit event recorded · no external link changed</div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px', background: '#eaeae7' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, border: '1px dashed #a0a09c', flex: 'none' }} />
          <div style={{ fontFamily: mono, fontSize: 10.5, color: '#7a7a76' }}>every grant here is explicit, expiring and revocable · simulate any principal from the team tab before granting</div>
        </div>
      </div>
    </div>
  );
}
