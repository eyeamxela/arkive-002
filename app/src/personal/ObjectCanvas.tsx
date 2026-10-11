import { useMemo, useState } from 'react';
import type { Brain, Room } from './api';
import { SpatialCanvas, type SpatialCanvasState } from './SpatialCanvas';
import { objectTimeline } from './objectCanvasModel.mjs';

type Props = {
  brain: Brain; query: string; mode: 'freeform' | 'timeline'; busy: boolean;
  activeRoom?: Room; onSelect: (id: string) => void;
  onUseSources: (ids: string[]) => Promise<boolean>; onOpenChat: () => void;
};

export function ObjectCanvas({ brain, query, mode, busy, activeRoom, onSelect, onUseSources, onOpenChat }: Props) {
  const [selection, setSelection] = useState<string[]>([]);
  const [spatial, setSpatial] = useState<SpatialCanvasState>({ camera: null, positions: {} });
  const rows = useMemo(() => objectTimeline(brain.objects, brain.revisions, query), [brain.objects, brain.revisions, query]);
  const existing = useMemo(() => new Set(brain.objects.map(object => object.id)), [brain.objects]);
  // Stable insertion slots keep a newly captured note from occupying an older
  // card's initial cell when the latest-revision timeline order changes.
  const slots = useMemo(() => new Map(brain.objects.filter(object => object.kind !== 'code_graph').map((object, index) => [object.id, index])), [brain.objects]);
  const selected = selection.filter(id => existing.has(id));
  const displayRows = rows.slice(0, 120);
  const card = ({ object }: typeof rows[number]) => <div className={`pn-object-card${selected.includes(object.id) ? ' is-selected' : ''}`} data-chat-scroll>
    <span className="pn-eyebrow">{object.kind} / {object.sourceIds.length} source links</span>
    <h3>{object.title}</h3><p>{object.text.slice(0, 420)}{object.text.length > 420 ? '…' : ''}</p>
    <footer><label className="pn-check"><input type="checkbox" aria-label={`Select ${object.title} for chat context`} checked={selected.includes(object.id)} onChange={event => setSelection(current => event.target.checked ? [...current, object.id] : current.filter(id => id !== object.id))} />Context</label><button onClick={() => onSelect(object.id)}>Inspect source</button></footer>
  </div>;

  return <section className="pn-object-workspace" aria-label={`Brain ${mode} view`}>
    <div className="pn-object-toolbar"><p className="pn-fine">{mode === 'freeform' ? 'Arrange your real notes and memories. Positions are session-only; moving a card does not change the graph.' : 'Latest stored revision for each object. Dates come from the encrypted revision history.'}</p><span className="pn-count">{selected.length} selected</span><button disabled={!selected.length || busy} onClick={() => setSelection([])}>Clear selection</button><button className="pn-primary" disabled={!selected.length || !activeRoom || busy} onClick={() => void onUseSources(selected)}>{activeRoom ? `Use in ${activeRoom.title}` : 'Create a chat first'}</button><button onClick={onOpenChat}>Open chat →</button></div>
    {rows.length > displayRows.length && <p className="pn-fine">Showing {displayRows.length} of {rows.length} objects. Search to narrow the canvas.</p>}
    {!rows.length ? <div className="pn-empty"><h3>No objects in this view yet.</h3><p>Capture a note, connect a source folder, or change your search. This view uses the same Brain as Files and the graph.</p></div> : mode === 'freeform' ? <div className="pn-object-spatial"><SpatialCanvas ariaLabel="Infinite Brain object canvas" items={displayRows.map(row => ({ id: row.object.id, title: row.object.title, width: 310, height: 275, initialPosition: { x: ((slots.get(row.object.id) ?? 0) % 4) * 355, y: Math.floor((slots.get(row.object.id) ?? 0) / 4) * 310 }, content: card(row) }))} state={spatial} onChange={setSpatial} /></div> : <div className="pn-object-timeline">{displayRows.map(row => <article key={row.object.id}><time dateTime={row.updatedAt ?? undefined}>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : 'No revision timestamp'}</time>{card(row)}</article>)}</div>}
  </section>;
}
