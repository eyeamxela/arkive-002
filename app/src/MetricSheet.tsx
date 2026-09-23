// port target: design/arkive-v2.html metric detail sheet overlay (lines ~2154–2178).
// content = the MET object (renderVals ~3701–3738), built in useScopeMetrics (Tray.tsx).

const mono = "'IBM Plex Mono', monospace";

export type MetricSheetData = {
  kicker: string;
  title: string;
  foot: string;
  rows: { k: string; v: string; c?: string | null }[];
};

export function MetricSheet({ data, manifestIdLabel, onClose }: { data: MetricSheetData; manifestIdLabel: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,4,.7)', backdropFilter: 'blur(4px)', zIndex: 30, display: 'grid', placeItems: 'center', animation: 'arkFade .16s ease-out' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, calc(100% - 24px))', maxHeight: '74%', display: 'flex', flexDirection: 'column', borderRadius: 14, background: '#f1f1ef', color: '#111', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
        <div style={{ flex: 'none', padding: '20px 22px 14px 22px', borderBottom: '1px solid #e0e0dd' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8a8a86' }}>{data.kicker}</div>
            <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 10, color: '#8a8a86' }}>{manifestIdLabel}</div>
          </div>
          <div style={{ fontSize: 19, fontWeight: 500, marginTop: 9, lineHeight: 1.35, textWrap: 'pretty' }}>{data.title}</div>
        </div>
        <div className="ark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 0' }}>
          {data.rows.map((r) => (
            <div key={r.k} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '9px 22px', borderBottom: '1px solid #e8e8e5' }}>
              <div style={{ width: '34%', flex: 'none', fontFamily: mono, fontSize: 10, color: '#73736f' }}>{r.k}</div>
              <div style={{ flex: 1, minWidth: 0, fontFamily: mono, fontSize: 11, color: r.c || '#111', overflowWrap:'anywhere' }}>{r.v}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', background: '#eaeae7' }}>
          <div style={{ fontFamily: mono, fontSize: 9.5, color: '#8a8a86' }}>{data.foot}</div>
          <button onClick={onClose} style={{ marginLeft: 'auto', padding: '8px 13px', borderRadius: 7, background: '#dedeDA', fontFamily: mono, fontSize: 10, cursor: 'pointer', color: '#333', border: 'none' }}>close</button>
        </div>
      </div>
    </div>
  );
}
