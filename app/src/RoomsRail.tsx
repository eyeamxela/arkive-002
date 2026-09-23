import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { CanvasLayers, RoomView } from './roomCanvas';
import { useRoomField } from './RoomSession';
import { useWorkspace } from './hooks';
import type { CtxVersionRow } from './Tray';

const O = '#ff5a1f';
const mono = "'IBM Plex Mono', monospace";
const WAIT = '#d9a13a';

type RailProps = {
  room: string;
  roomView: RoomView;
  open: boolean;
  layers: CanvasLayers;
  onToggleOpen: () => void;
  onSelectRoom: (room: string) => void;
  onSetRoomView: (view: RoomView) => void;
  onToggleLayer: (layer: keyof CanvasLayers) => void;
  onOpenVault: () => void;
  onOpenContext: () => void;
  onOpenAudit: () => void;
  onOpenRun: (key: string) => void;
  pinnedRoom: string | null;
  onPinRoom: (room: string) => void;
};

const reset: React.CSSProperties = { border: 'none', padding: 0, margin: 0, background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left' };

export function RoomsRail(props: RailProps) {
  const [deny] = useRoomField(props.room, 'deny', true);
  const [selection] = useRoomField<ReadonlySet<string> | null>(props.room, 'selection', null);
  const [manifestId] = useRoomField<string | null>(props.room, 'manifest', null);
  const workspace = useWorkspace(props.room, deny, selection, manifestId);
  const [ctxOverrides] = useRoomField<Record<string, boolean>>(props.room, 'ctxOverrides', {});
  const [ctxLocal] = useRoomField<CtxVersionRow[]>(props.room, 'ctxLocal', []);
  const roomsQ = useQuery(api.panels.rooms, {});
  const manifestsQ = useQuery(api.panels.manifests, {});
  const runsQ = useQuery(api.panels.runs, {});
  const ctxQ = useQuery(api.panels.contextSummaries, { room: props.room });
  const policyQ = useQuery(api.panels.tierPolicy, {});
  const auditQ = useQuery(api.panels.auditEvents, { limit: 100 });

  const rooms = roomsQ ?? [];
  const manifests = manifestsQ ?? [];
  const runs = runsQ ?? [];
  const activeManifest = manifests.find((m) => workspace?.context.manifestId && String(m._id) === String(workspace.context.manifestId));
  const manifestDocs = workspace?.context.documents ?? [];
  const canonAlways = (workspace?.context.documents ?? []).filter((d) => d.tier === 'canon' && d.alwaysLoad).length;
  const manifestCount = activeManifest ? manifestDocs.length + '/' + activeManifest.n : '0';
  const ctxOn: CtxVersionRow[] = (ctxQ ?? []).map((c) => ({ ...c, on: ctxOverrides[c.version] ?? c.on })).concat(ctxLocal as NonNullable<typeof ctxQ>).filter((c) => c.on);
  const denied = (auditQ ?? []).filter((e) => e.kind === 'deny').length;
  const inboxExcluded = policyQ?.inbox === 'exclude';

  const roomForRun = (run: (typeof runs)[number]) => {
    const manifest = run.saw.manifestId ? manifests.find((m) => String(m._id) === String(run.saw.manifestId)) : undefined;
    // Unknown manifest references are unassigned, never attributed to the first room.
    return run.saw.manifestId ? manifest?.room : 'dm:' + run.agentKey;
  };
  const activeRuns = runs.filter((r) => (r.state === 'running' || r.state === 'waiting') && roomForRun(r) === props.room);
  const summaryByRoom = useMemo(() => {
    const result: Record<string, { waiting: number; running: number; latest?: string }> = {};
    rooms.forEach((r) => { result[r.key] = { waiting: 0, running: 0 }; });
    runs.forEach((run) => {
      const key = roomForRun(run);
      if (!key) return;
      const row = result[key] ?? (result[key] = { waiting: 0, running: 0 });
      if (run.state === 'waiting') row.waiting += 1;
      if (run.state === 'running') row.running += 1;
      if (!row.latest) row.latest = run.key;
    });
    return result;
  // roomForRun is a pure projection of these query results.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, runs, manifests]);

  if (!props.open) {
    return (
      <aside className="ark-room-rail ark-room-rail--collapsed" aria-label="rooms rail collapsed">
        <button onClick={props.onToggleOpen} aria-label="open rooms rail" title="open rooms rail · ⌘\\" style={{ ...reset, width: 32, height: 32, borderRadius: 7, background: '#171717', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#8a8a8a' }}>◧</button>
        {rooms.map((r) => {
          const s = summaryByRoom[r.key];
          return <button key={r._id} onClick={() => props.onSelectRoom(r.key)} aria-label={r.key} title={r.key} style={{ ...reset, width: 32, height: 32, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><span style={{ width: 6, height: 6, borderRadius: 999, background: s?.running ? O : s?.waiting ? WAIT : r.key === props.room ? '#8a8a8a' : '#4a4a4a' }} /></button>;
        })}
      </aside>
    );
  }

  const tierRow = (label: string, value: string, onClick: () => void, color = '#8a8a8a') => (
    <button onClick={onClick} style={{ ...reset, display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: color, flex: 'none' }} />
      <span style={{ fontFamily: mono, fontSize: 9.5, color: '#c8c8c8' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 8.5, color: '#5c5c5c', textAlign: 'right' }}>{value}</span>
    </button>
  );

  return (
    <aside className="ark-room-rail ark-room-rail--open" aria-label="rooms and room context">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderBottom: '1px solid #191919' }}>
        <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5c5c5c' }}>rooms</div>
        <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 8, color: '#4a4a4a' }}>prototype data</div>
        <button onClick={props.onToggleOpen} title="collapse · ⌘\\" aria-label="collapse rooms rail" style={{ ...reset, width: 24, height: 24, borderRadius: 5, background: '#171717', color: '#8a8a8a', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>›</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: 6 }}>
        {(rooms.length ? rooms : [{ _id: props.room, key: props.room }]).map((r) => {
          const selected = r.key === props.room;
          const s = summaryByRoom[r.key];
          const dot = s?.running ? O : s?.waiting ? WAIT : selected ? '#8a8a8a' : '#4a4a4a';
          const status = selected && props.roomView === 'canvas' ? 'on canvas' : s?.running ? 'simulated run' : s?.waiting ? 'waiting' : 'idle';
          return (
            <div key={String(r._id)} style={{ display: 'flex', alignItems: 'center' }}><button onClick={() => props.onSelectRoom(r.key)} style={{ ...reset, display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: 9, borderRadius: 8, background: selected ? '#161616' : 'transparent', cursor: 'pointer' }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: dot, flex: 'none' }} />
              <span style={{ fontFamily: mono, fontSize: 10.5, color: selected ? '#f2f2f2' : '#c8c8c8', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.key}</span>
              {s?.waiting ? <span style={{ marginLeft: 'auto', padding: '2px 6px', borderRadius: 4, background: '#2a2216', fontFamily: mono, fontSize: 8.5, color: WAIT }}>{s.waiting}</span> : <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 8.5, color: '#5c5c5c' }}>{status}</span>}
            </button><button aria-label={(props.pinnedRoom === r.key ? 'unpin ' : 'pin ') + r.key + ' on canvas'} onClick={() => props.onPinRoom(r.key)} style={{ ...reset, padding: 8, color: props.pinnedRoom === r.key ? O : '#666', cursor: 'pointer' }}>{props.pinnedRoom === r.key ? '−' : '+'}</button></div>
          );
        })}
      </div>

      <RailHeading>this room pulls from</RailHeading>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '3px 6px 7px' }}>
        {workspace?.contextError && <div role="alert" style={{ padding: '7px 8px', fontFamily: mono, fontSize: 9, color: '#ff9670' }}>context unavailable · {workspace.contextError}</div>}
        {tierRow('canon', canonAlways + ' always', props.onOpenVault, O)}
        {tierRow('effective scope', (workspace?.context.documents.length ?? 0) + ' docs', props.onOpenVault)}
        {tierRow('manifest reference', manifestCount + ' · ' + (activeManifest ? 'm-' + activeManifest.key.slice(0, 4) : 'no manifest'), props.onOpenVault)}
        {tierRow('context summary', ctxOn.length ? ctxOn.map((c) => c.version).join('+') + ' · ' + ctxOn.reduce((n, c) => n + c.tokens, 0).toFixed(1) + 'k' : 'off', props.onOpenContext, '#c8b4a6')}
        {tierRow('inbox', (inboxExcluded ? 'sealed' : 'policy on') + ' · ' + denied + ' refusals', props.onOpenAudit, '#3a3a3a')}
      </div>

      <RailHeading>running</RailHeading>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '3px 6px 7px' }}>
        {activeRuns.length ? activeRuns.map((run) => <div key={String(run._id)}>{tierRow(run.agentKey, run.key + ' · ' + (run.state === 'running' ? 'simulated' : 'waiting on you'), () => props.onOpenRun(run.key), run.state === 'running' ? O : WAIT)}</div>) : (
          <div style={{ padding: '7px 8px', fontFamily: mono, fontSize: 9, color: '#4a4a4a', lineHeight: 1.55 }}>no live runtime connected<br />seeded activity only</div>
        )}
      </div>

      {props.roomView === 'canvas' && (
        <>
          <RailHeading>canvas layers</RailHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '3px 7px 7px' }}>
            {(Object.keys(props.layers) as (keyof CanvasLayers)[]).map((layer) => (
              <button key={layer} onClick={() => props.onToggleLayer(layer)} style={{ ...reset, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 7px', borderRadius: 6, cursor: 'pointer', fontFamily: mono, fontSize: 9.5, color: props.layers[layer] ? '#e8e8e8' : '#8a8a8a' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: props.layers[layer] ? O : 'transparent', border: '1px solid ' + (props.layers[layer] ? O : '#3a3a3a') }} />
                {layer === 'graphFloor' ? 'graph floor' : layer === 'audit' ? 'audit trail' : layer}
              </button>
            ))}
          </div>
        </>
      )}

      <button onClick={() => props.onSetRoomView(props.roomView === 'chat' ? 'canvas' : 'chat')} style={{ ...reset, margin: 'auto 9px 9px', padding: '9px 11px', borderRadius: 8, background: '#171717', fontFamily: mono, fontSize: 9.5, color: '#c8c8c8', textAlign: 'center', cursor: 'pointer' }}>
        {props.roomView === 'chat' ? 'open canvas view →' : '← back to chat'}
      </button>
    </aside>
  );
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '9px 12px 4px', borderTop: '1px solid #191919', fontFamily: mono, fontSize: 8.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5c5c5c' }}>{children}</div>;
}
