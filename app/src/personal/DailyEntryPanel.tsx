import { useEffect, useState, type CSSProperties } from 'react';
import type { WorkspaceTask } from './api';
import type { PlannerDay, PlannerEntry } from './plannerTypes';
import type { WorkspacePanelsProps } from './WorkspacePanels';
import { folderMaterial, CABINET_PALETTE } from './fileCabinetModel.mjs';

type Props = { day: PlannerDay; tasks: WorkspaceTask[]; busy: boolean; run: WorkspacePanelsProps['act']; stacked: boolean };
export function DailyEntryPanel({ day, tasks, busy, run, stacked }: Props) {
  const [selected, setSelected] = useState('');
  const entry = day.entries.find(e => e.id === selected) ?? day.entries[0];
  if (!entry) return null;
  return <>
    {day.entries.length > 1 && <label className="pn-planner-section-select">Daily template<select aria-label="Daily template" value={entry.id} disabled={busy} onChange={e => setSelected(e.target.value)}>{day.entries.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>}
    <Entry key={`${day.date}:${entry.id}`} {...{ day, entry, tasks, busy, run, stacked }} />
  </>;
}
function Entry({ day, entry, tasks, busy, run, stacked }: Props & { entry: PlannerEntry }) {
  const [journal, setJournal] = useState(entry.journal), [color, setColor] = useState(entry.color);
  const [base, setBase] = useState(day.updatedAt), [dirty, setDirty] = useState(false), [selected, setSelected] = useState('');
  useEffect(() => { if (!dirty) { setJournal(entry.journal); setColor(entry.color); setBase(day.updatedAt); } }, [entry.journal, entry.color, day.updatedAt, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const guard = (e: MouseEvent) => { const target = e.target as HTMLElement; if (target.closest('.fc-modes, nav, .pn-sidebar, .pn-planner-date-actions, .pn-planner-section-select') && !window.confirm('Discard unsaved daily journal and color changes?')) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener('beforeunload', warn); document.addEventListener('click', guard, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guard, true); };
  }, [dirty]);
  const taskSections = entry.sections.filter(s => s.kind === 'tasks');
  const section = taskSections.find(s => s.id === selected) ?? taskSections[0];
  const visible = stacked && section ? [section] : taskSections;
  const entryTasks = tasks.filter(t => t.dueDate === day.date && entry.sections.some(s => s.id === t.plannerSectionId));
  const done = entryTasks.filter(t => t.status === 'done').length;
  const editJournal = (value: string) => { if (!dirty) setBase(day.updatedAt); setJournal(value); setDirty(true); };
  const save = async () => {
    const ok = await run('Saving daily entry', client => client.request('/v1/workspace/planner/day', 'POST', { date: day.date, expectedUpdatedAt: dirty ? base : day.updatedAt, entryId: entry.id, journal, color }), 'Daily entry saved in your encrypted Brain.');
    if (ok) setDirty(false);
  };
  const tabs = stacked && taskSections.length ? taskSections.slice(Math.floor(taskSections.indexOf(section) / 5) * 5, Math.floor(taskSections.indexOf(section) / 5) * 5 + 5) : [];
  const order = [...tabs.filter(s => s.id !== section?.id), ...tabs.filter(s => s.id === section?.id)];
  return <div className="pn-daily-entry">
    {dirty && <p className="pn-planner-hint" role="status">Unsaved daily entry. Save before switching dates or views. {base !== day.updatedAt && <>This day changed elsewhere. <button onClick={() => { setJournal(entry.journal); setColor(entry.color); setBase(day.updatedAt); setDirty(false); }}>Discard draft and reload</button></>}</p>}
    {stacked && taskSections.length > 5 && <label className="pn-planner-section-select">Section<select value={section.id} onChange={e => setSelected(e.target.value)}>{taskSections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>}
    <div className="fc-cabinet"><div className="fc-deck" role="group" aria-label="Daily template folders" style={{ '--fc-layers': tabs.length || 1 } as CSSProperties}>
      {(tabs.length ? tabs : [{ id: entry.id, title: entry.name }]).map((s, i) => <div className="fc-layer" key={s.id} style={{ ...folderMaterial(s.id === section?.id || !tabs.length ? color : CABINET_PALETTE[i % CABINET_PALETTE.length].color), '--fc-order': tabs.length ? order.findIndex(t => t.id === s.id) : 0, '--fc-offset': `${[2, 29, 57, 40, 12][i]}%`, '--fc-mobile-offset': `${[2, 31, 9, 30, 4][i]}%` } as CSSProperties}><div className="fc-rail" aria-hidden="true" /><button className="fc-tab" aria-pressed={!tabs.length || section?.id === s.id} onClick={() => setSelected(s.id)}><span className="fc-tab-count">{tabs.length ? entryTasks.filter(t => t.plannerSectionId === s.id).length : entryTasks.length}</span><span className="fc-tab-name">{s.title}</span></button></div>)}
    </div><section className="fc-sheet pn-planner-sheet pn-daily-sheet" style={folderMaterial(color) as CSSProperties} aria-label={`${entry.name} daily entry`}>
      <header className="fc-sheet-heading"><div><p className="fc-location">{day.date} / {entry.name}</p><h2>{stacked ? section?.title ?? entry.name : entry.name}</h2><p className="fc-folder-description">{done} of {entryTasks.length} complete</p></div><label className="pn-daily-color">Folder color<input type="color" aria-label="Daily folder color" value={color} disabled={busy} onChange={e => { if (!dirty) setBase(day.updatedAt); setColor(e.target.value); setDirty(true); }} /></label></header>
      <div className={`pn-daily-sections ${stacked ? 'is-stacked' : ''}`}>{visible.map((s, index) => <section key={s.id} className="pn-daily-section" style={!stacked ? { gridColumn: index < 3 ? 1 : 2, gridRow: index < 3 ? index + 1 : index - 2 } : undefined}>
        <h3>{s.title}</h3>{entryTasks.filter(t => t.plannerSectionId === s.id).map(task => <label className="pn-daily-task" key={task.id}><input type="checkbox" aria-label={`Complete task ${task.title}`} disabled={busy} checked={task.status === 'done'} onChange={e => void run('Updating daily task', client => client.request('/v1/workspace/tasks', 'POST', { id: task.id, status: e.target.checked ? 'done' : 'todo' }))} /><span data-done={task.status === 'done'}>{task.title}</span></label>)}
        <form className="pn-daily-add" onSubmit={e => { e.preventDefault(); const form = e.currentTarget, title = String(new FormData(form).get('title') ?? '').trim(); if (title) void run('Adding daily task', client => client.request('/v1/workspace/tasks', 'POST', { title, status: 'todo', dueDate: day.date, section: s.title, plannerSectionId: s.id })).then(ok => { if (ok) form.reset(); }); }}><input name="title" required maxLength={160} aria-label={`Add task to ${s.title}`} placeholder="＋ Add a to-do…" disabled={busy} /><button disabled={busy} aria-label={`Add to ${s.title}`}>↵</button></form>
      </section>)}</div>
      {entry.sections.filter(s => s.kind === 'journal').map(s => <label className="pn-daily-journal" key={s.id}><h3>{s.title}</h3><textarea aria-label={s.title} value={journal} maxLength={12000} disabled={busy} onChange={e => editJournal(e.target.value)} placeholder="Write your day here…" /></label>)}
      <footer className="pn-daily-footer"><span>{entry.name} · {dirty ? 'Unsaved entry' : 'Saved daily entry'}</span><button disabled={busy} onClick={() => void save()}>Save day</button></footer>
    </section></div>
  </div>;
}
