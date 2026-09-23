import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useMutationFeedback } from './useMutationFeedback';
import type { Id } from '../convex/_generated/dataModel';

// port target: design/arkive-v2.html [data-screen-label='team'] (inside settings) + the tmShare dialog.
// journey F: share dialog → grant · simulate → raw policy · revoke → impact panel → audit row.

const O = '#ff5a1f';
const mono = "'IBM Plex Mono', monospace";

const btnReset: React.CSSProperties = { border: 'none', margin: 0, font: 'inherit', color: 'inherit', textAlign: 'left', background: 'transparent', padding: 0 };
const secLabel: React.CSSProperties = { padding: '13px 24px 4px 24px', fontFamily: mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#a0a09c' };

type SimVerdict = 'inherited' | 'direct' | 'denied' | 'per-run' | 'gated' | 'expiring';
const VP: Record<SimVerdict, [string, string]> = { inherited: ['#e4e4e0', '#5a5a56'], direct: [O, '#0f0f0f'], 'per-run': [O, '#0f0f0f'], gated: ['#e4e4e0', '#111'], expiring: ['#e4e4e0', O], denied: ['#111', '#f2f2f2'] };

export function Team() {
  const feedback = useMutationFeedback();
  const grantsQ = useQuery(api.panels.grants);
  const reqsQ = useQuery(api.panels.accessRequests);
  const shareGrant = useMutation(api.ops.shareGrant);
  const grantRevoke = useMutation(api.ops.grantRevoke);
  const requestDecide = useMutation(api.ops.requestDecide);

  const [tmSim, setTmSim] = useState('nezu');
  const [tmRaw, setTmRaw] = useState(false);
  const [tmRevoke, setTmRevoke] = useState<null | 'ask' | 'done'>(null);
  const [revokeGrantId, setRevokeGrantId] = useState<Id<'grants'> | null>(null);
  const [tmShare, setTmShare] = useState(false);
  const [tmWho, setTmWho] = useState('nezu');
  const [tmPerms, setTmPerms] = useState<string[]>(['view', 'comment']);
  const [tmExp, setTmExp] = useState('30d');
  const [tmDl, setTmDl] = useState(true);
  const [tmSens, setTmSens] = useState(false);

  const simSet = (v: string) => () => { setTmSim(v); setTmRaw(false); setTmRevoke(null); };

  // per-run leases (runId set) live on the agents screens — this list is what you shared out
  const shareOut = (grantsQ ?? []).filter((g) => !g.runId);
  const outRows = [...shareOut].reverse();
  const kilnGrant = shareOut.find((g) => g.principal === 'kiln');
  const kilnDone = tmRevoke === 'done' || !!kilnGrant?.revokedAt;

  const reqs = reqsQ ?? [];
  const pendingReqs = reqs.filter((r) => r.state === 'pending').length;

  const teamStats = [
    { k: 'members', v: 6, color: '#111' },
    { k: 'requests', v: pendingReqs, color: pendingReqs ? O : '#111' },
    { k: 'shared out', v: shareOut.filter((o) => !o.revokedAt).length, color: '#111' }
  ];

  const members = [
    { name: 'xela', role: 'owner', meta: 'everything · 2 stewarded objects · signing key local', sim: 'frtl', dot: O, guest: false },
    { name: 'frtl', role: 'admin', meta: 'workspace + queues · no restricted content', sim: 'frtl', dot: '#c0c0bc', guest: false },
    { name: 'nezu', role: 'steward', meta: 'steward of print-specs + moodboard', sim: 'nezu', dot: '#c0c0bc', guest: false },
    { name: 'void', role: 'member', meta: 'projects + shared knowledge', sim: 'nezu', dot: '#c0c0bc', guest: false },
    { name: 'kiln', role: 'guest', meta: kilnDone ? 'revoked · citations sealed' : 'moodboard canvas only · expires 01 sep', sim: 'kiln', dot: '#c0c0bc', note: kilnDone ? 'revoked' : 'expiring · 14d', noteFg: kilnDone ? '#111' : O, guest: true },
    { name: 'hermes', role: 'agent', meta: 'per-run grants only · sends approval-gated', sim: 'hermes', dot: O, guest: false }
  ];

  const simTitle = ({ nezu: 'nezu · steward', kiln: kilnDone ? 'kiln · revoked guest' : 'kiln · guest (external)', hermes: 'hermes · agent', frtl: 'frtl · admin' } as Record<string, string>)[tmSim] ?? '';
  const simSub = ({ nezu: 'member since jan · steward of print-specs + moodboard', kiln: kilnDone ? 'link ended · citations survive, content sealed' : 'guest link created 02 aug · expires 01 sep', hermes: 'owned by you · no standing access — grants exist per run', frtl: 'admin since mar · runs the ops queue' } as Record<string, string>)[tmSim] ?? '';

  const D: Record<string, [string, string, SimVerdict][]> = {
    nezu: [
      ['projects/jrny — read, edit', 'inherited: member role includes team projects', 'inherited'],
      ['curated/print-specs.md — manage', 'direct: steward of this object', 'direct'],
      ['canon/** — no access', 'denied: personal canon is never workspace-visible', 'denied'],
      ['jrny-brief pack — install, no re-share', 'direct grant · license forbids redistribution', 'direct'],
      ['run hermes — no', '▣ capabilities are per-person consent; never granted', 'denied'],
      ['audit log — read', 'inherited: steward and above may read audit', 'inherited']
    ],
    kiln: kilnDone ? [
      ['moodboard canvas — no access', 'revoked just now · 4 citations sealed, content unreadable', 'denied'],
      ['everything else — no access', 'guests hold nothing by default', 'denied']
    ] : [
      ['moodboard canvas — view, comment', 'direct: guest link · downloads blocked', 'direct'],
      ['everything else — no access', 'guests hold nothing by default; no role inheritance', 'denied'],
      ['expiry — 14 days left', 'guest default 30d · renewable by a steward', 'expiring']
    ],
    hermes: [
      ['canon via manifest — read, per run', 'direct: pinned hashes, grant dies on completion', 'per-run'],
      ['post to #xela — approval-gated', 'tool granted, but every send waits for you', 'gated'],
      ['workspace objects — no', 'agent grants never inherit from your roles', 'denied']
    ],
    frtl: [
      ['workspace config, members — manage', 'inherited: admin role', 'inherited'],
      ['legal/** — no read', 'admin ≠ content access: sensitivity outranks role', 'denied'],
      ['operator queue — full', 'inherited: admin includes orchestration', 'inherited']
    ]
  };
  const simRows = (D[tmSim] ?? []).map(([t, why, v]) => ({ t, why, v, fg: v === 'denied' ? '#8a8a86' : '#111', vBg: VP[v][0], vFg: VP[v][1] }));

  const tmRawText = ({
    nezu: 'role(nezu)=steward · allow(read,edit) projects/** via member · allow(manage) obj:print-specs via steward · deny(*) canon/** rule:personal-canon · consent(run:hermes)=absent',
    kiln: 'role(kiln)=guest · allow(view,comment) obj:moodboard-canvas expires:2026-09-01 download:false · deny(*) default' + (kilnDone ? ' · REVOKED sig:schnorr:8c2d…' : ''),
    hermes: 'agent(hermes) owner:you · grant(read) manifest per-run · tool(post:#xela) gate:approval · tool(email)=off · inherit:none',
    frtl: 'role(frtl)=admin · allow(manage) workspace/** · deny(read) sensitivity:restricted unless grant.direct'
  } as Record<string, string>)[tmSim] ?? '';

  const permToggle = (p: string) => () => {
    if (p === 'redistribute') return;
    setTmPerms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : prev.concat([p])));
  };

  const revokeGo = async () => {
    const ok = await feedback.run(async () => {
      const selectedGrant = shareOut.find(grant => grant._id === (revokeGrantId ?? kilnGrant?._id));
      if (!selectedGrant) throw new Error('No matching grant exists. Refresh and select an existing grant.');
      await grantRevoke({ id: selectedGrant._id });
    });
    if (ok) setTmRevoke('done');
  };

  const shareGo = async () => {
    const expiresAt = tmExp === 'never' ? undefined : Date.now() + (tmExp === '30d' ? 30 : 90) * 86400000;
    const ok = await feedback.run(() => shareGrant({
      principal: tmWho,
      title: 'jrny working set → ' + tmWho,
      meta: 'prototype metadata · ' + tmPerms.join(' + ') + ' · requested expiry ' + tmExp + (tmDl ? ' · no-download preference' : '') + (tmSens ? ' · restricted requested' : ''),
      perms: tmPerms, expiresAt, noDownload: tmDl
    }));
    if (ok) setTmShare(false);
  };

  const tmPreview = (() => {
    const words: Record<string, string> = { view: 'read the docs', comment: 'comment on them', edit: 'change them', manage: 'manage sharing', run: 'run hermes (with their own ▣ consent)' };
    const does = tmPerms.map((p) => words[p]).filter(Boolean).join(', ') || 'do nothing yet';
    return 'Proposed metadata for ' + tmWho + ': ' + does + '. ' +
      (tmSens ? 'restricted content requested. ' : 'restricted content not requested. ') +
      (tmDl ? 'no-download preference requested. ' : 'download preference allowed. ') +
      (tmExp === 'never' ? 'no expiry requested. ' : 'requested expiry ' + tmExp + '. ') +
      'This saves a prototype record only. No link is sent, and user access, download blocking and content sealing are not enforced.';
  })();

  return (
    <>
      <div data-screen-label="team" style={{ height: 'min(720px, calc(100vh - 220px))', minHeight: 420, display: 'flex', flexDirection: 'column' }}>
        <div role="note" style={{ padding: 10, color: '#efb58a', fontSize: 12 }}>Permission design preview · members and access explanations are examples. Grants are metadata only; no external sharing link or enforced user access is created.</div>
        {feedback.error && <div role="alert" style={{ padding: 10, color: '#ff8b6a' }}>{feedback.error}</div>}
        {feedback.pending && <div role="status">saving metadata…</div>}
        <div style={{ flex: 1, minHeight: 0, borderRadius: 14, background: '#f1f1ef', color: '#111', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 'none', padding: '20px 24px 16px 24px', display: 'flex', alignItems: 'flex-end', gap: 26, borderBottom: '1px solid #e0e0dd' }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8a8a86' }}>team · roles, grants + simulation</div>
              <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-.02em', marginTop: 7, lineHeight: 1 }}>who sees what — and why</div>
            </div>
            <div style={{ display: 'flex', gap: 26, marginLeft: 'auto' }}>
              {teamStats.map((s) => (
                <div key={s.k} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontFamily: mono, fontSize: 9, color: '#8a8a86' }}>{s.k}</div>
                  <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1, color: s.color }}>{s.v}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setTmShare(true)} style={{ ...btnReset, padding: '8px 14px', borderRadius: 7, background: '#111', color: '#f2f2f2', fontFamily: mono, fontSize: 10, cursor: 'pointer', flex: 'none' }}>share…</button>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
            <div className="ark-scroll" style={{ flex: 1.2, minWidth: 0, overflowY: 'auto', borderRight: '1px solid #e0e0dd' }}>
              {reqs.length > 0 && (
                <>
                  <div style={secLabel}>access requests</div>
                  {reqs.map((r) => {
                    const pending = r.state === 'pending';
                    return (
                      <div key={r._id} style={{ padding: '11px 24px', borderBottom: '1px solid #e6e6e3', background: pending ? '#f6f6f4' : 'transparent' }}>
                        <div style={{ fontSize: 13.5, color: '#111' }}>{r.what}</div>
                        <div style={{ fontFamily: mono, fontSize: 10, color: '#8a8a86', marginTop: 3 }}>{r.why}</div>
                        {pending ? (
                          <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
                            <button onClick={simSet(r.who)} style={{ ...btnReset, padding: '6px 11px', borderRadius: 6, background: '#e2e2de', fontFamily: mono, fontSize: 10, lineHeight: 1.2, cursor: 'pointer', color: '#333' }}>simulate first</button>
                            <button disabled={feedback.pending} onClick={() => { void feedback.run(() => requestDecide({ id: r._id, approve: false })); }} style={{ ...btnReset, padding: '6px 11px', borderRadius: 6, background: '#e2e2de', fontFamily: mono, fontSize: 10, lineHeight: 1.2, cursor: 'pointer', color: '#333' }}>deny</button>
                            <button disabled={feedback.pending} onClick={() => { void feedback.run(() => requestDecide({ id: r._id, approve: true })); }} style={{ ...btnReset, padding: '6px 11px', borderRadius: 6, background: '#111', fontFamily: mono, fontSize: 10, lineHeight: 1.2, cursor: 'pointer', color: '#f2f2f2' }}>grant metadata</button>
                          </div>
                        ) : (
                          <div style={{ display: 'inline-block', marginTop: 9, padding: '3px 9px', borderRadius: 4, background: '#e0e0dc', fontFamily: mono, fontSize: 9, color: '#7a7a76', textTransform: 'uppercase', letterSpacing: '.08em' }}>{r.state}</div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              <div style={secLabel}>members</div>
              {members.map((m) => (
                <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 24px', borderBottom: '1px solid #e6e6e3', opacity: m.guest && kilnDone ? 0.55 : 1 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: m.dot, flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 13.5, color: '#111' }}>{m.name}</div>
                      <div style={{ padding: '2px 8px', borderRadius: 4, background: m.role === 'owner' || m.role === 'agent' ? O : '#e0e0dc', fontFamily: mono, fontSize: 9, color: m.role === 'owner' || m.role === 'agent' ? '#0f0f0f' : '#7a7a76', textTransform: 'uppercase', letterSpacing: '.08em' }}>{m.role}</div>
                      <div style={{ fontFamily: mono, fontSize: 9, color: m.noteFg ?? '#a0a09c' }}>{m.note ?? ''}</div>
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: '#8a8a86', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.meta}</div>
                  </div>
                  <button onClick={simSet(m.sim)} style={{ ...btnReset, padding: '5px 11px', borderRadius: 6, background: tmSim === m.sim ? '#d8d8d4' : '#e2e2de', fontFamily: mono, fontSize: 10, cursor: 'pointer', color: '#333', flex: 'none' }}>simulate</button>
                </div>
              ))}

              <div style={secLabel}>you've shared out</div>
              {outRows.map((o) => {
                const revoked = !!o.revokedAt;
                return (
                  <div key={o._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 24px', borderBottom: '1px solid #e6e6e3' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: revoked ? '#a0a09c' : '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</div>
                      <div style={{ fontFamily: mono, fontSize: 10, color: '#8a8a86', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{revoked ? 'grant metadata revoked' : o.meta}</div>
                    </div>
                    <button
                      disabled={revoked || feedback.pending}
                      onClick={revoked ? undefined : (o.principal === 'kiln' ? () => { setTmSim('kiln'); setRevokeGrantId(o._id); setTmRevoke('ask'); } : () => { void feedback.run(() => grantRevoke({ id: o._id })); })}
                      style={{ ...btnReset, padding: '5px 11px', borderRadius: 6, background: revoked ? '#e8e8e4' : '#111', fontFamily: mono, fontSize: 10, cursor: revoked ? 'default' : 'pointer', color: revoked ? '#a0a09c' : '#f2f2f2', flex: 'none' }}
                    >{revoked ? 'revoked' : 'revoke'}</button>
                  </div>
                );
              })}
            </div>

            <div className="ark-scroll" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 20px' }}>
              <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#a0a09c' }}>simulate — what can they see and do?</div>
              <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
                {([['nezu', 'nezu (steward)'], ['kiln', 'kiln (guest)'], ['hermes', 'hermes (agent)'], ['frtl', 'frtl (admin)']] as [string, string][]).map(([id, label]) => (
                  <button key={id} onClick={simSet(id)} style={{ ...btnReset, padding: '5px 11px', borderRadius: 6, background: tmSim === id ? '#111' : '#e2e2de', fontFamily: mono, fontSize: 10, color: tmSim === id ? '#f2f2f2' : '#5a5a56', cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
              <div style={{ fontSize: 17, fontWeight: 500, marginTop: 14 }}>{simTitle}</div>
              <div style={{ fontFamily: mono, fontSize: 10, color: '#8a8a86', marginTop: 4 }}>{simSub}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 12, borderRadius: 11, background: '#f6f6f4', border: '1px solid #e4e4e0', overflow: 'hidden' }}>
                {simRows.map((r) => (
                  <div key={r.t} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: '1px solid #e8e8e5' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, color: r.fg }}>{r.t}</div>
                      <div style={{ fontFamily: mono, fontSize: 9.5, color: '#a0a09c', marginTop: 3, lineHeight: 1.5 }}>{r.why}</div>
                    </div>
                    <div style={{ padding: '2px 8px', borderRadius: 4, background: r.vBg, fontFamily: mono, fontSize: 9, color: r.vFg, flex: 'none', whiteSpace: 'nowrap' }}>{r.v}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setTmRaw((v) => !v)} style={{ ...btnReset, display: 'inline-block', marginTop: 10, fontFamily: mono, fontSize: 9.5, color: '#a0a09c', cursor: 'pointer' }}>{tmRaw ? 'hide raw policy' : 'advanced — raw policy expressions'}</button>
              {tmRaw && (
                <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 9, background: '#eaeae7', fontFamily: mono, fontSize: 9.5, color: '#7a7a76', lineHeight: 1.8 }}>{tmRawText}</div>
              )}
              {tmSim === 'kiln' && !tmRevoke && !kilnDone && (
                <button disabled={feedback.pending || !kilnGrant} onClick={() => { setRevokeGrantId(kilnGrant?._id ?? null); setTmRevoke('ask'); }} style={{ ...btnReset, display: 'inline-block', marginTop: 14, padding: '7px 13px', borderRadius: 6, background: '#111', fontFamily: mono, fontSize: 10, color: '#f2f2f2', cursor: 'pointer' }}>revoke kiln's grant metadata…</button>
              )}
              {tmRevoke === 'ask' && (
                <div style={{ marginTop: 12, padding: '13px 15px', borderRadius: 11, background: '#f6f6f4', border: '1px solid #e0d2c8', animation: 'arkRise .16s ease-out' }}>
                  <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8a8a86' }}>revoking kiln will</div>
                  <div style={{ fontFamily: mono, fontSize: 10.5, color: '#5a5a56', lineHeight: 1.9, marginTop: 8 }}>mark the selected prototype grant revoked and record an audit event. External links, cryptographic signatures and citation access enforcement are not implemented.</div>
                  <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
                    <button onClick={() => setTmRevoke(null)} style={{ ...btnReset, padding: '6px 12px', borderRadius: 6, background: '#e2e2de', fontFamily: mono, fontSize: 10, cursor: 'pointer', color: '#333' }}>cancel</button>
                    <button disabled={feedback.pending} onClick={() => void revokeGo()} style={{ ...btnReset, padding: '6px 12px', borderRadius: 6, background: '#111', fontFamily: mono, fontSize: 10, cursor: 'pointer', color: '#f2f2f2' }}>revoke</button>
                  </div>
                </div>
              )}
              {tmRevoke === 'done' && (
                <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: 9, background: '#eaeae7', fontFamily: mono, fontSize: 10, color: '#7a7a76' }}>grant metadata revoked · recorded in audit history · no external link changed</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {tmShare && (
        <div onClick={() => setTmShare(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,4,.7)', backdropFilter: 'blur(4px)', zIndex: 31, display: 'grid', placeItems: 'center', animation: 'arkFade .16s ease-out' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, calc(100vw - 24px))', maxHeight: '82%', display: 'flex', flexDirection: 'column', borderRadius: 14, background: '#f1f1ef', color: '#111', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
            {feedback.error && <div role="alert" style={{ padding: 12, color: '#a52e12' }}>{feedback.error}</div>}
            <div style={{ flex: 'none', padding: '20px 22px 14px 22px', borderBottom: '1px solid #e0e0dd' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8a8a86' }}>share · revocable grant</div>
                <div style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, background: '#111', fontFamily: mono, fontSize: 9, color: '#f2f2f2', textTransform: 'uppercase', letterSpacing: '.08em' }}>1 restricted</div>
              </div>
              <div style={{ fontSize: 19, fontWeight: 500, marginTop: 9, lineHeight: 1.35 }}>jrny working set — 7 docs</div>
            </div>
            <div className="ark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#a0a09c' }}>with</div>
                <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                  {['nezu', 'kiln (guest)', 'external link'].map((w) => {
                    const id = w.split(' ')[0];
                    return (
                      <button key={w} onClick={() => setTmWho(id)} style={{ ...btnReset, padding: '6px 12px', borderRadius: 6, background: tmWho === id ? '#111' : '#e2e2de', fontFamily: mono, fontSize: 10, color: tmWho === id ? '#f2f2f2' : '#5a5a56', cursor: 'pointer' }}>{w}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#a0a09c' }}>they may</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {['view', 'comment', 'edit', 'manage', 'run ▣', 'redistribute'].map((label) => {
                    const key = label.replace(' ▣', '');
                    const on = tmPerms.includes(key);
                    const locked = key === 'redistribute';
                    return (
                      <button key={label} onClick={permToggle(key)} style={{ ...btnReset, padding: '6px 12px', borderRadius: 6, background: on ? O : '#e4e4e0', fontFamily: mono, fontSize: 10, color: on ? '#0f0f0f' : (locked ? '#c0c0bc' : '#5a5a56'), cursor: locked ? 'not-allowed' : 'pointer' }}>{label}</button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontFamily: mono, fontSize: 9, color: '#a0a09c' }}>expires</div>
                  {['30d', '90d', 'never'].map((v) => (
                    <button key={v} onClick={() => setTmExp(v)} style={{ ...btnReset, padding: '4px 10px', borderRadius: 5, background: tmExp === v ? '#111' : '#e4e4e0', fontFamily: mono, fontSize: 9.5, color: tmExp === v ? '#f2f2f2' : '#5a5a56', cursor: 'pointer' }}>{v}</button>
                  ))}
                </div>
                <button onClick={() => setTmDl((v) => !v)} style={{ ...btnReset, display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                  <div style={{ width: 11, height: 11, borderRadius: 3, border: '1px solid ' + (tmDl ? '#111' : '#c4c4c0'), background: tmDl ? '#111' : 'transparent' }} />
                  <div style={{ fontFamily: mono, fontSize: 9.5, color: '#5a5a56' }}>block downloads</div>
                </button>
                <button onClick={() => setTmSens((v) => !v)} style={{ ...btnReset, display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                  <div style={{ width: 11, height: 11, borderRadius: 3, border: '1px solid ' + (tmSens ? O : '#c4c4c0'), background: tmSens ? O : 'transparent' }} />
                  <div style={{ fontFamily: mono, fontSize: 9.5, color: '#5a5a56' }}>include the restricted legal doc</div>
                </button>
              </div>
              <div style={{ borderRadius: 11, background: '#f6f6f4', border: '1px solid #e4e4e0', padding: '13px 15px' }}>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#a0a09c' }}>effective access — plain language</div>
                <div style={{ fontSize: 14, lineHeight: 1.55, color: '#333', marginTop: 7, textWrap: 'pretty' }}>{tmPreview}</div>
              </div>
            </div>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', background: '#eaeae7' }}>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: '#8a8a86' }}>revocable · audited · ▣ capabilities never ride along silently</div>
              <button onClick={() => setTmShare(false)} style={{ ...btnReset, marginLeft: 'auto', padding: '8px 13px', borderRadius: 7, background: '#dedeDA', fontFamily: mono, fontSize: 10, cursor: 'pointer', color: '#333' }}>cancel</button>
              <button disabled={feedback.pending || !tmPerms.length} onClick={() => void shareGo()} style={{ ...btnReset, padding: '8px 13px', borderRadius: 7, background: '#111', color: '#f2f2f2', fontFamily: mono, fontSize: 10, cursor: 'pointer' }}>{feedback.pending ? 'saving…' : 'save grant metadata'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
