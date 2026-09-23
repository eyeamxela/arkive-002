import { useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useRoomScopeReset } from './RoomSession';
import type { Id } from '../convex/_generated/dataModel';

// port target: design/arkive-v2.html [data-screen-label='manifests'] — stats, manifest cards
// grouped active / superseded / revoked, cartridges section. rollback = pointer move on the room
// (ops.manifestRollback); revocation is a persisted, audited state transition.

const O = '#ff5a1f';
const mono = "'IBM Plex Mono', monospace";

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const fmtCreated = (at: number) => {
  const d = new Date(at);
  return String(d.getUTCDate()).padStart(2, '0') + ' ' + MONTHS[d.getUTCMonth()] + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
};

const btnReset: React.CSSProperties = { border: 'none', fontFamily: mono, cursor: 'pointer' };
const actBtn: React.CSSProperties = { ...btnReset, padding: '7px 12px', borderRadius: 6, fontSize: 10, lineHeight: 1.2, flex: 'none' };
const chip: React.CSSProperties = { padding: '3px 8px', borderRadius: 4, background: '#e4e4e0', fontFamily: mono, fontSize: 9.5, color: '#4a4a46' };

const STATE_ORDER = ['active', 'superseded', 'revoked'];

export function Manifests() {
  const manifests = useQuery(api.panels.manifests);
  const rooms = useQuery(api.panels.rooms);
  const carts = useQuery(api.panels.cartridges);
  const rollback = useMutation(api.ops.manifestRollback);
  const revoke = useMutation(api.ops.manifestRevoke);
  const resetRoomScope = useRoomScopeReset();
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const actionLock = useRef(false);
  // simulated: cartridge update review is a later slice — decisions here are local-only.
  const [cartUpdate, setCartUpdate] = useState<'pending' | 'done'>('pending');

  const rows = manifests ?? [];
  const actOnManifest = async (action: 'load' | 'revoke', id: Id<'manifests'>, room: string) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setPending(action + ':' + id);
    setActionError(null);
    setActionStatus(null);
    try {
      if (action === 'load') {
        await rollback({ id });
        resetRoomScope(room);
        setActionStatus('Loaded saved scope for ' + room + '. Chat and all canvas views now follow this manifest.');
      } else {
        await revoke({ id });
        setActionStatus('Revocation saved. Any room still using this manifest is blocked until a new scope is selected.');
      }
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not update manifest. No success was recorded.'); }
    finally { actionLock.current = false; setPending(null); }
  };
  const stats = [
    { k: 'total', v: rows.length, color: '#111' },
    { k: 'active', v: rows.filter((m) => m.state === 'active').length, color: O },
    { k: 'superseded', v: rows.filter((m) => m.state === 'superseded').length, color: '#111' },
    { k: 'revoked', v: rows.filter((m) => m.state === 'revoked').length, color: '#111' }
  ];
  const pointerRoom = (id: string) => (rooms ?? []).find((r) => r.activeManifestId === id)?.key;

  const cartCards = (carts ?? []).map((c) => {
    const owned = c.rel === 'owned', inst = c.rel === 'installed';
    return {
      key: c.key, name: c.name, brief: c.purpose, docs: c.docHashes, exec: !!c.exec,
      state: c.rel === 'temp' ? 'temp · session' : c.rel,
      metaLine: c.meta,
      bg: owned ? '#f6f6f4' : '#eeeeeb',
      border: owned ? '#e0d2c8' : '#e4e4e0',
      dot: owned ? O : (c.rel === 'temp' ? '#111' : '#c0c0bc'),
      pillBg: owned ? O : '#e0e0dc',
      pillFg: owned ? '#0f0f0f' : '#7a7a76',
      verbLine: owned ? 'yours — load it, fork it, or share it onward'
        : inst ? 'mounted behind nezu’s boundary — promote to adopt pieces into your vault'
        : 'this room only — never lands in the vault',
      acts: owned ? [['share…', false], ['fork', false], ['load into scope', true]] as [string, boolean][]
        : inst ? [['eject', false], ['promote → inbox', true]] as [string, boolean][]
        : [['discard now', false]] as [string, boolean][]
    };
  });
  const cartUpdateOn = cartUpdate === 'pending' && (carts ?? []).some((c) => c.updatePending);

  return (
    <div style={{ flex: 1, minHeight: 0, padding: '0 18px 18px 18px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, borderRadius: 14, background: '#f1f1ef', color: '#111', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 'none', padding: '20px 24px 16px 24px', display: 'flex', alignItems: 'flex-end', gap: 26, borderBottom: '1px solid #e0e0dd' }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8a8a86' }}>context manifests · saved scope records · signatures not connected</div>
            <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-.02em', marginTop: 7, lineHeight: 1 }}>scope, as an artifact</div>
          </div>
          <div style={{ display: 'flex', gap: 26, marginLeft: 'auto' }}>
            {stats.map((s) => (
              <div key={s.k} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: '#8a8a86' }}>{s.k}</div>
                <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1, color: s.color }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="ark-scroll-l" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {actionError && <div role="alert" style={{ padding: 10, color: '#973914', fontSize: 12 }}>{actionError}</div>}
          {actionStatus && <div role="status" style={{ padding: 10, color: '#3e5940', fontSize: 12 }}>{actionStatus}</div>}
          {STATE_ORDER.map((group) => {
            const inGroup = rows.filter((m) => m.state === group);
            if (!inGroup.length) return null;
            return (
              <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px 0 4px' }}>
                  <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8a8a86' }}>{group}</div>
                  <div style={{ flex: 1, height: 1, background: '#e0e0dd' }} />
                </div>
                {inGroup.map((m) => {
                  const active = m.state === 'active';
                  const revoked = m.state === 'revoked';
                  const room = pointerRoom(m._id);
                  return (
                    <div key={m._id} style={{ borderRadius: 11, background: active ? '#f6f6f4' : '#eeeeeb', border: '1px solid ' + (active ? '#e0d2c8' : '#e4e4e0'), padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 999, background: active ? O : (revoked ? '#111' : '#c0c0bc'), flex: 'none' }} />
                        <div style={{ fontFamily: mono, fontSize: 11.5, color: '#111' }}>manifest-{m.key}</div>
                        <div style={{ padding: '2px 8px', borderRadius: 4, background: active ? O : '#e0e0dc', fontFamily: mono, fontSize: 9, color: active ? '#0f0f0f' : '#7a7a76', textTransform: 'uppercase', letterSpacing: '.08em' }}>{m.state}</div>
                        <div style={{ fontFamily: mono, fontSize: 10, color: '#8a8a86' }}>{m.room}</div>
                        {room && <div style={{ fontFamily: mono, fontSize: 10, color: O }}>◂ {room} points here</div>}
                        <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 10, color: '#a0a09c' }}>{fmtCreated(m.createdAt)}</div>
                      </div>
                      <div style={{ fontSize: 15, lineHeight: 1.45, color: '#333', textWrap: 'pretty' }}>{m.brief}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {m.docHashes.map((d) => <div key={d} style={chip}>{d}</div>)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 11, borderTop: '1px solid #e4e4e0', whiteSpace: 'nowrap' }}>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', fontFamily: mono, fontSize: 10.5, color: '#5a5a56', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{m.n + ' docs · ' + m.tiers + ' · ttl ' + m.ttl + ' · unsigned prototype'}</div>
                        <div style={{ display: 'flex', gap: 7, flex: 'none' }}>
                          <button disabled={!!pending || revoked} onClick={() => void actOnManifest('load', m._id, m.room)} style={{ ...actBtn, background: '#e2e2de', color: revoked ? '#a0a09c' : '#333' }}>{pending === 'load:' + m._id ? 'loading…' : 'load into scope'}</button>
                          <button
                            disabled={!!pending || revoked}
                            onClick={() => void actOnManifest('revoke', m._id, m.room)}
                            style={{ ...actBtn, background: revoked ? '#e8e8e4' : '#111', cursor: revoked ? 'default' : 'pointer', color: revoked ? '#a0a09c' : '#f2f2f2' }}
                          >{revoked ? 'revoked' : pending === 'revoke:' + m._id ? 'revoking…' : 'revoke manifest'}</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px 0 4px' }}>
            <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8a8a86' }}>cartridges · portable scope</div>
            <div style={{ flex: 1, height: 1, background: '#e0e0dd' }} />
            <div style={{ fontFamily: mono, fontSize: 10, color: '#a0a09c' }}>cartridge preview · cross-Brain signing and installation not connected</div>
          </div>
          {cartCards.map((c) => (
            <div key={c.key} style={{ borderRadius: 11, background: c.bg, border: '1px solid ' + c.border, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 6, height: 6, borderRadius: 999, background: c.dot, flex: 'none' }} />
                <div style={{ fontFamily: mono, fontSize: 11.5, color: '#111' }}>{c.name}</div>
                <div style={{ padding: '2px 8px', borderRadius: 4, background: c.pillBg, fontFamily: mono, fontSize: 9, color: c.pillFg, textTransform: 'uppercase', letterSpacing: '.08em' }}>{c.state}</div>
                {c.exec && <div title="carries executable capability — separate consent, off by default" style={{ padding: '2px 8px', borderRadius: 4, background: '#e4e4e0', fontFamily: mono, fontSize: 9, color: '#4a4a46' }}>▣ can act</div>}
                <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 10, color: '#a0a09c' }}>{c.metaLine}</div>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.45, color: '#333', textWrap: 'pretty' }}>{c.brief}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {c.docs.map((d) => <div key={d} style={chip}>{d}</div>)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 11, borderTop: '1px solid #e4e4e0', whiteSpace: 'nowrap' }}>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', fontFamily: mono, fontSize: 10.5, color: '#5a5a56', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{c.verbLine}</div>
                <div style={{ display: 'flex', gap: 7, flex: 'none' }}>
                  {c.acts.map(([a, dark]) => (
                    <button disabled title="Preview only — use Library for implemented actions" key={a} style={{ ...actBtn, cursor: 'not-allowed', opacity: .55, background: dark ? '#111' : '#e2e2de', color: dark ? '#f2f2f2' : '#333' }}>{a} · preview</button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {cartUpdateOn && (
            <div style={{ borderRadius: 11, background: '#f6f6f4', border: '1px solid #e0d2c8', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 6, height: 6, borderRadius: 999, background: O, flex: 'none' }} />
                <div style={{ fontFamily: mono, fontSize: 11.5, color: '#111' }}>nezu-desk pack · update v2 → v3</div>
                <div style={{ padding: '2px 8px', borderRadius: 4, background: O, fontFamily: mono, fontSize: 9, color: '#0f0f0f', textTransform: 'uppercase', letterSpacing: '.08em' }}>review</div>
                <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 10, color: '#a0a09c' }}>update review simulation · nothing applies</div>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.45, color: '#333', textWrap: 'pretty' }}>v3 rewrites the tone guide and adds one executable capability. knowledge and behavior are separate consents — declining ▣ keeps the knowledge changes.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <div style={chip}>~ tone guide rewritten</div>
                <div style={chip}>+ press-voice.md</div>
                <div style={chip}>▣ NEW: watch for drift — off unless enabled</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 11, borderTop: '1px solid #e4e4e0', whiteSpace: 'nowrap' }}>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', fontFamily: mono, fontSize: 10.5, color: '#5a5a56', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>an update can never smuggle behavior — the ▣ consent is its own decision</div>
                <div style={{ display: 'flex', gap: 7, flex: 'none' }}>
                  <button onClick={() => setCartUpdate('done')} style={{ ...actBtn, background: '#e2e2de', color: '#333' }}>dismiss preview</button>
                  <button disabled style={{ ...actBtn, cursor: 'not-allowed', opacity: .55, background: '#e2e2de', color: '#333' }}>enable behavior · unavailable</button>
                  <button disabled style={{ ...actBtn, cursor: 'not-allowed', opacity: .55, background: '#111', color: '#f2f2f2' }}>apply knowledge · unavailable</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
