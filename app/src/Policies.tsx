import type { CSSProperties } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useMutationFeedback } from './useMutationFeedback';

// port target: design/arkive-v2.html [data-screen-label='brain-policies'] (lines 1630–1652)
// Tier toggles affect prototype context filtering, not principal authorization.

const mono = "'IBM Plex Mono', monospace";
const TIERS = ['canon', 'curated', 'dashboards', 'legal', 'inbox'];

const btnReset: CSSProperties = { background: 'transparent', border: 'none', margin: 0, padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' };

export function Policies() {
  const tierPolicy = useQuery(api.panels.tierPolicy);
  const policySet = useMutation(api.ops.policySet);
  const feedback = useMutationFeedback();
  const policy = (tierPolicy ?? {}) as unknown as Record<string, string>;

  const brPolicyRows = TIERS.map((t) => {
    const ex = policy[t] === 'exclude' || policy[t] === 'ask';
    return {
      tier: t, open: true, locked: false,
      note: t === 'canon' ? 'default context tier' : t === 'legal' ? 'sensitive tier — per-user access enforcement is not implemented' : t === 'inbox' ? 'unreviewed material — explicitly select when needed' : 'working knowledge',
      mode: ex ? 'excluded from retrieval' : 'allowed in retrieval',
      pillBg: ex ? '#111' : '#1c1c1c', pillFg: ex ? '#f0f0f0' : '#6ec48a',
      onToggle: () => void feedback.run(() => policySet({ tier: t, mode: ex ? 'include' : 'exclude' }))
    };
  }).concat([{ tier: 'dreams', open: false, locked: true, note: 'excluded from prototype context — not an encryption or storage guarantee', mode: '', pillBg: '', pillFg: '', onToggle: () => {} }]);

  return (
    <div data-screen-label="brain-policies" style={{ flex: 1, minHeight: 0, padding: '0 18px 18px 18px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, borderRadius: 14, background: '#0d0d0d', border: '1px solid #191919', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 'none', padding: '14px 18px', borderBottom: '1px solid #191919' }}>
          <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#5c5c5c' }}>brain · policies — four dimensions, never conflated</div>
          <div style={{ fontFamily: mono, fontSize: 10, color: '#8a8a8a', marginTop: 6, lineHeight: 1.7 }}>Tier filters apply to context preview and simulated sends. These are not user permissions. Use sample data until identity and retrieval access enforcement are implemented.</div>
          {feedback.error && <div role="alert" style={{ color: '#ff8b6a', marginTop: 8 }}>{feedback.error}</div>}
          {feedback.pending && <div role="status">saving policy…</div>}
        </div>
        <div className="ark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {brPolicyRows.map((r) => (
            <div key={r.tier} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid #131313' }}>
              <div style={{ width: 120, flex: 'none', fontFamily: mono, fontSize: 10.5, color: '#c8c8c8' }}>{r.tier}</div>
              <div style={{ flex: 1, minWidth: 0, fontFamily: mono, fontSize: 9.5, color: '#5c5c5c' }}>{r.note}</div>
              {r.locked ? (
                <div style={{ padding: '4px 11px', borderRadius: 5, background: '#111', border: '1px solid #232323', fontFamily: mono, fontSize: 9.5, color: '#5c5c5c', flex: 'none' }}>excluded</div>
              ) : (
                <button onClick={r.onToggle} disabled={feedback.pending || !tierPolicy} aria-label={r.tier + ' retrieval'} role="switch" aria-checked={r.mode === 'allowed in retrieval'} style={{ ...btnReset, padding: '4px 11px', borderRadius: 5, background: r.pillBg, fontFamily: mono, fontSize: 9.5, color: r.pillFg, flex: 'none' }}>{r.mode}</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
