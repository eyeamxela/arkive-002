import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { BoardBlock, PlannerDay } from './plannerTypes';
import type { WorkspaceTask } from './api';
import type { WorkspacePanelsProps } from './WorkspacePanels';
import { useWorkMaterial } from './WorkAppearance';

type Props = { date: string; onDate: (date: string) => void; day?: PlannerDay; tasks: WorkspaceTask[]; busy: boolean; run: WorkspacePanelsProps['act']; card: (task: WorkspaceTask) => ReactNode; setStatus: (task: WorkspaceTask, status: WorkspaceTask['status']) => Promise<void> };
const states = { todo: 'To-do', doing: 'In progress', review: 'Review', done: 'Done' } as const;
const safeLink = (url?: string) => { try { return url && ['http:', 'https:'].includes(new URL(url).protocol) ? url : undefined; } catch { return undefined; } };
export function WorkBoardCanvas(props: Props) {
  return <Board key={props.date} {...props} />;
}
function Board({ date, onDate, day, tasks, busy, run, card, setStatus }: Props) {
  const folderMaterial = useWorkMaterial();
  const [blocks, setBlocks] = useState<BoardBlock[]>(day?.blocks ?? []), [base, setBase] = useState(day?.updatedAt ?? null);
  const [dirty, setDirty] = useState(false), [chosen, setChosen] = useState(''), [tool, setTool] = useState('select');
  const [camera, setCamera] = useState({ x: 40, y: 40, zoom: 1 }), [showAll, setShowAll] = useState(false);
  const surface = useRef<HTMLDivElement>(null), gesture = useRef<{ x: number; y: number; bx: number; by: number; id?: string; drawing?: number[][] } | null>(null);
  const pending = useRef(false);
  useEffect(() => { if (!dirty) { setBlocks(day?.blocks ?? []); setBase(day?.updatedAt ?? null); } }, [day?.updatedAt, dirty]);
  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); }; const nav = (e: MouseEvent) => { const target = e.target as HTMLElement; if (target.closest('.fc-modes, nav, .pn-sidebar') && !window.confirm('Discard unsaved Board changes?')) { e.preventDefault(); e.stopPropagation(); } }; window.addEventListener('beforeunload', warn); document.addEventListener('click', nav, true); return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', nav, true); }; }, [dirty]);
  const change = (next: BoardBlock[]) => { setBlocks(next); setDirty(true); };
  const selected = blocks.find(b => b.id === chosen);
  const add = (kind: BoardBlock['kind']) => {
    if (blocks.length >= 200) return;
    if (kind === 'task' && !tasks.length) return;
    const block: BoardBlock = { id: `block_${crypto.randomUUID()}`, kind, text: kind === 'column' ? 'New column' : '', x: Math.round((80 - camera.x) / camera.zoom), y: Math.round((80 - camera.y) / camera.zoom), ...(kind === 'task' ? { taskId: tasks[0].id } : {}) };
    change([...blocks, block]); setChosen(block.id); setTool('select');
  };
  const patch = (values: Partial<BoardBlock>) => { if (selected) change(blocks.map(b => b.id === selected.id ? { ...b, ...values } : b)); };
  const remove = () => { if (selected) { change(blocks.filter(b => b.id !== selected.id).map(b => b.parentId === selected.id ? { ...b, parentId: undefined, x: b.x + selected.x, y: b.y + selected.y } : b)); setChosen(''); } };
  const save = async () => { if (pending.current) return; pending.current = true; try { const ok = await run('Saving board', client => client.request('/v1/workspace/planner/day', 'POST', { date, expectedUpdatedAt: base, blocks }), 'Board saved in your encrypted Brain.'); if (ok) setDirty(false); } finally { pending.current = false; } };
  const point = (e: React.PointerEvent) => { const r = surface.current!.getBoundingClientRect(); return [(e.clientX - r.left - camera.x) / camera.zoom, (e.clientY - r.top - camera.y) / camera.zoom]; };
  const renderBlock = (block: BoardBlock): ReactNode => {
    const task = tasks.find(t => t.id === block.taskId);
    if (block.kind === 'drawing') return <svg key={block.id} className="pn-board-drawing" style={{ left: block.x, top: block.y }} width="1" height="1" aria-label="Saved drawing"><polyline points={block.points?.map(p => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="3" onClick={() => setChosen(block.id)} /></svg>;
    return <article key={block.id} className={`pn-board-block is-${block.kind}`} style={{ left: block.x, top: block.y }} data-selected={chosen === block.id}>
      <button disabled={busy} className="pn-board-handle" onClick={() => setChosen(block.id)} onPointerDown={e => { if (tool !== 'select' || busy) return; e.stopPropagation(); setChosen(block.id); gesture.current = { x: e.clientX, y: e.clientY, bx: block.x, by: block.y, id: block.id }; surface.current?.setPointerCapture(e.pointerId); }} aria-label={`Move ${block.kind} block`}>⠿ {block.kind}</button>
      {block.kind === 'task' && task ? <label><input type="checkbox" checked={task.status === 'done'} disabled={busy} onChange={e => void setStatus(task, e.target.checked ? 'done' : 'todo')} />{task.title}</label> : <p>{block.text || (block.kind === 'column' ? 'New column' : `Select to edit ${block.kind}`)}</p>}
      {safeLink(block.url) && <a href={safeLink(block.url)} target="_blank" rel="noreferrer noopener">Open link ↗</a>}
      {block.kind === 'column' && <div className="pn-board-children">{blocks.filter(b => b.parentId === block.id).map(renderBlock)}</div>}
    </article>;
  };
  const shown = showAll ? tasks : tasks.filter(t => t.dueDate === date || !t.dueDate);
  return <div className="pn-work-board-canvas">
    <header className="pn-planner-datebar"><div><p className="fc-eyebrow">BOARD / WORKSPACE</p><h2>Your work, with room to think.</h2><label className="pn-check"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />Show tasks from every date</label><p>{showAll ? 'All saved tasks' : 'Selected date and unscheduled tasks'} · Canvas saved separately for each date</p></div><label>Board date<input type="date" min="1900-01-01" max="2199-12-31" value={date} disabled={busy} onChange={e => { if (e.target.value && (!dirty || window.confirm('Discard unsaved Board changes?'))) onDate(e.target.value); }} /></label></header>
    <div className="fc-cabinet"><div className="fc-deck" style={{ '--fc-layers': 1 } as CSSProperties}><div className="fc-layer" style={{ ...folderMaterial('#f4bc59'), '--fc-order': 0, '--fc-offset': '2%', '--fc-mobile-offset': '2%' } as CSSProperties}><div className="fc-rail" /><span className="fc-tab"><span className="fc-tab-name">Board</span></span></div></div>
    <section className="fc-sheet pn-board-sheet" style={folderMaterial('#f4bc59') as CSSProperties}>
      <div className="pn-wp-board">{Object.entries(states).map(([status, label]) => <section className="pn-wp-column" key={status} aria-label={`${label} tasks`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const task = tasks.find(t => t.id === e.dataTransfer.getData('text/arkive-task')); if (task && !busy) void setStatus(task, status as WorkspaceTask['status']); }}><h3>{label}</h3>{shown.filter(t => t.status === status).map(task => <div draggable={!busy} key={task.id} onDragStart={e => e.dataTransfer.setData('text/arkive-task', task.id)}>{card(task)}</div>)}</section>)}</div>
      <div className="pn-board-tools"><strong>Thinking space</strong><button onClick={() => setTool(tool === 'pan' ? 'select' : 'pan')} aria-pressed={tool === 'pan'}>Pan</button><button aria-label="Zoom out" onClick={() => setCamera(c => ({ ...c, zoom: Math.max(.3, c.zoom - .1) }))}>−</button><span>{Math.round(camera.zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => setCamera(c => ({ ...c, zoom: Math.min(2, c.zoom + .1) }))}>＋</button><button onClick={() => setCamera({ x: 40, y: 40, zoom: 1 })}>Reset view</button></div>
      <div className="pn-board-surface" ref={surface} aria-label="Freeform board canvas" onPointerDown={e => { if (busy || (e.target !== e.currentTarget && tool !== 'draw' && tool !== 'pan')) return; if (tool === 'draw') { const p = point(e); gesture.current = { x: e.clientX, y: e.clientY, bx: 0, by: 0, drawing: [p] }; } else gesture.current = { x: e.clientX, y: e.clientY, bx: camera.x, by: camera.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => {
        const g = gesture.current; if (!g) return;
        if (g.drawing) { if (g.drawing.length < 500) g.drawing.push(point(e)); const line = surface.current?.querySelector('.pn-board-live'); line?.setAttribute('points', g.drawing.map(p => p.join(',')).join(' ')); }
        else if (g.id) change(blocks.map(b => b.id === g.id ? { ...b, x: Math.round(g.bx + (e.clientX - g.x) / camera.zoom), y: Math.round(g.by + (e.clientY - g.y) / camera.zoom) } : b));
        else setCamera(c => ({ ...c, x: g.bx + e.clientX - g.x, y: g.by + e.clientY - g.y }));
      }} onPointerUp={() => { const g = gesture.current; if (g?.drawing?.length && blocks.length < 200) { change([...blocks, { id: `block_${crypto.randomUUID()}`, kind: 'drawing', text: '', x: 0, y: 0, points: g.drawing.map(p => p.map(Math.round)) }]); surface.current?.querySelector('.pn-board-live')?.setAttribute('points', ''); } gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}>
        <div className="pn-board-world" style={{ transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})` }}>{blocks.filter(b => !b.parentId).map(renderBlock)}<svg className="pn-board-drawing" width="1" height="1" aria-hidden="true"><polyline className="pn-board-live" fill="none" stroke="currentColor" strokeWidth="3" /></svg></div>
        {!blocks.length && <span className="pn-board-empty">Add a block below. Drag headers to arrange your workspace.</span>}
      </div>
      <div className="pn-board-palette">{(['task', 'note', 'link', 'column', 'comment'] as const).map(kind => <button key={kind} disabled={busy || blocks.length >= 200 || (kind === 'task' && !tasks.length)} onClick={() => add(kind)}>＋ {kind === 'task' ? 'To-do' : kind[0].toUpperCase() + kind.slice(1)}</button>)}<button disabled={busy || blocks.length >= 200} aria-pressed={tool === 'draw'} onClick={() => setTool(tool === 'draw' ? 'select' : 'draw')}>Draw</button></div>
      {selected && <fieldset className="pn-board-editor" disabled={busy}><legend>Edit {selected.kind}</legend>{selected.kind !== 'drawing' && <label>{selected.kind === 'column' ? 'Column name' : 'Block text'}<textarea maxLength={4000} value={selected.text} onChange={e => patch({ text: e.target.value })} /></label>}{selected.kind === 'link' && <label>Link URL<input type="url" value={selected.url ?? ''} placeholder="https://" onChange={e => patch({ url: e.target.value || undefined })} /></label>}{selected.kind === 'task' && <label>Linked task<select value={selected.taskId} onChange={e => patch({ taskId: e.target.value })}>{tasks.map(t => <option value={t.id} key={t.id}>{t.title}</option>)}</select></label>}{selected.kind !== 'column' && selected.kind !== 'drawing' && <label>Column<select value={selected.parentId ?? ''} onChange={e => patch({ parentId: e.target.value || undefined, x: 12, y: 12 })}><option value="">Free on canvas</option>{blocks.filter(b => b.kind === 'column').map(b => <option value={b.id} key={b.id}>{b.text || 'New column'}</option>)}</select></label>}<div className="pn-board-tools"><button onClick={() => patch({ x: selected.x - 20 })}>Move left</button><button onClick={() => patch({ x: selected.x + 20 })}>Move right</button><button onClick={() => patch({ y: selected.y - 20 })}>Move up</button><button onClick={() => patch({ y: selected.y + 20 })}>Move down</button><button onClick={remove}>Remove block</button></div></fieldset>}
      <footer className="pn-daily-footer"><span role="status">{dirty ? 'Unsaved board' : 'Saved board'} · {blocks.length}/200 blocks</span><button disabled={busy || !dirty} onClick={() => void save()}>Save board</button></footer>
      {dirty && base !== (day?.updatedAt ?? null) && <p role="alert">This day changed. Your draft is kept. <button onClick={() => { setBlocks(day?.blocks ?? []); setBase(day?.updatedAt ?? null); setDirty(false); setChosen(''); }}>Discard draft and reload</button></p>}
    </section></div>
  </div>;
}
