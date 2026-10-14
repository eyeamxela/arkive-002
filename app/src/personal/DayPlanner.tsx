import { useEffect, useState, type CSSProperties } from 'react';
import type { WorkspaceTask } from './api';
import type { PlannerDay } from './plannerTypes';
import type { WorkspacePanelsProps } from './WorkspacePanels';
import { WORK_PALETTE as CABINET_PALETTE } from './workAppearanceModel.mjs';
import { useWorkMaterial } from './WorkAppearance';
import { dayPlannerGroups } from './dayPlannerModel.mjs';
import { orderedFolders } from './folderOrder.mjs';
import { FolderPosition } from './FolderPosition';
import { useUnsavedNavigation } from './useUnsavedNavigation';

type Props = { date: string; day?: PlannerDay; tasks: WorkspaceTask[]; busy: boolean; run: WorkspacePanelsProps['act']; onEdit: (task: WorkspaceTask) => void; onDirty: (dirty: boolean) => void; savedOrder?: string[] };
export function DayPlanner({ date, day, tasks, busy, run, onEdit, onDirty, savedOrder }: Props) {
  const folderMaterial = useWorkMaterial();
  const groups = orderedFolders(dayPlannerGroups(date, day, tasks), savedOrder, group => group.title);
  const [project, setProject] = useState('');
  const [journal, setJournal] = useState(day?.journal ?? '');
  const [color, setColor] = useState(day?.color ?? day?.entries[0]?.color ?? '#f4bc59');
  const [dirty, setDirty] = useState(false), [base, setBase] = useState<string | null>(day?.updatedAt ?? null);
  useEffect(() => { if (!dirty) { setJournal(day?.journal ?? ''); setColor(day?.color ?? day?.entries[0]?.color ?? '#f4bc59'); setBase(day?.updatedAt ?? null); } }, [day, dirty]);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useUnsavedNavigation(dirty, 'Your daily journal or folder color has not been saved.', () => setDirty(false));
  const current = groups.find(group => group.title === project);
  const visible = current ? [current] : groups;
  const dayTasks = groups.flatMap(group => group.tasks);
  const tabGroups = groups.slice(0, 4);
  if (current && !tabGroups.includes(current)) tabGroups.splice(3, 1, current);
  const tabs = [{ title: 'Day', id: '' }, ...tabGroups.map(group => ({ title: group.title, id: group.title }))];
  const selected = current?.title ?? '';
  const order = [...tabs.filter(tab => tab.id !== selected), ...tabs.filter(tab => tab.id === selected)];
  const markDirty = () => { if (!dirty) setBase(day?.updatedAt ?? null); setDirty(true); };
  const save = async () => {
    if (await run('Saving day', client => client.request('/v1/workspace/planner/day', 'POST', { date, expectedUpdatedAt: dirty ? base : day?.updatedAt ?? null, journal, color }), 'Daily journal saved. Tasks and earlier dates are unchanged.')) setDirty(false);
  };
  const dateTitle = new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
  return <div className="pn-day-planner">
    <div className="pn-day-filter"><span>One day · all your projects</span><label>Project / section<select aria-label="Project / section" value={selected} onChange={event => setProject(event.target.value)}><option value="">All projects · Day</option>{groups.map(group => <option key={group.title}>{group.title}</option>)}</select></label></div>
    {dirty && <p role="status" className="pn-planner-hint">Unsaved daily journal or color. {base !== (day?.updatedAt ?? null) && <>This day changed elsewhere. <button onClick={() => setDirty(false)}>Discard draft and reload</button></>}</p>}
    <div className="fc-cabinet"><div className="fc-deck" role="group" aria-label="Day and project folders" style={{ '--fc-layers': tabs.length } as CSSProperties}>
      {tabs.map((tab, index) => <div key={tab.id} className="fc-layer" style={{ ...folderMaterial(tab.id === selected ? color : CABINET_PALETTE[index % CABINET_PALETTE.length].color), '--fc-order': order.findIndex(item => item.id === tab.id), '--fc-offset': `${[2, 29, 57, 40, 12][index]}%`, '--fc-mobile-offset': `${[2, 31, 9, 30, 4][index]}%` } as CSSProperties}><div className="fc-rail" aria-hidden="true" /><button className="fc-tab" aria-pressed={tab.id === selected} onClick={() => setProject(tab.id)}><span className="fc-tab-count">{tab.id ? groups.find(group => group.title === tab.id)?.tasks.length : dayTasks.length}</span><span className="fc-tab-name">{tab.title}</span></button>{tab.id && <FolderPosition id={tab.id} title={tab.title} keys={groups.map(group => group.title)} saved={savedOrder} scope="sections" busy={busy} run={run} />}</div>)}
    </div><section className="fc-sheet pn-daily-sheet pn-day-sheet" aria-label="Day planner" style={folderMaterial(color) as CSSProperties}>
      <header className="fc-sheet-heading"><div><p className="fc-location">{date} / {selected || 'Your day'}</p><h2>{current ? current.title : dateTitle}</h2><p className="fc-folder-description">{dayTasks.filter(task => task.status === 'done').length} of {dayTasks.length} complete today</p></div><label className="pn-daily-color">Folder color<input type="color" aria-label="Daily folder color" value={folderMaterial(color)['--fc-fill']} disabled={busy} onChange={event => { markDirty(); setColor(event.target.value); }} /></label></header>
      <div className={`pn-daily-sections ${current ? 'is-stacked' : ''}`}>{visible.map((group, index) => <section className="pn-daily-section" key={group.title} aria-label={`${group.title} checklist`} style={!current ? { gridColumn: index < 3 ? 1 : 2, gridRow: index < 3 ? index + 1 : index - 2 } : undefined}>
        <h3 className="pn-day-section-title"><span>{group.title}</span><small>{group.tasks.filter(task => task.status === 'done').length} / {group.tasks.length}</small></h3>
        {group.tasks.map(task => <div className="pn-day-task" key={task.id}><label className="pn-daily-task"><input type="checkbox" aria-label={`Complete task ${task.title}`} checked={task.status === 'done'} disabled={busy} onChange={event => void run('Updating daily task', client => client.request('/v1/workspace/tasks', 'POST', { id: task.id, status: event.target.checked ? 'done' : 'todo' }))} /><span data-done={task.status === 'done'}>{task.title}</span></label><span className="pn-day-task-status">{task.status === 'doing' ? 'In progress' : task.status === 'review' ? 'Review' : ''}</span><button aria-label={`Edit task ${task.title}`} disabled={busy} onClick={() => onEdit(task)}>↗</button></div>)}
        <form className="pn-daily-add" onSubmit={event => { event.preventDefault(); const form = event.currentTarget, title = String(new FormData(form).get('title') ?? '').trim(); if (title) void run('Adding daily task', client => client.request('/v1/workspace/tasks', 'POST', { title, status: 'todo', dueDate: date, section: group.title, ...(group.sectionId ? { plannerSectionId: group.sectionId } : {}) })).then(ok => { if (ok) form.reset(); }); }}><input name="title" required maxLength={160} aria-label={`Add task to ${group.title}`} placeholder="＋ Add a to-do…" disabled={busy} /><button disabled={busy} aria-label={`Add to ${group.title}`}>↵</button></form>
      </section>)}</div>
      <label className="pn-daily-journal"><h3>Daily Journal</h3><textarea aria-label="Daily Journal" value={journal} maxLength={12000} disabled={busy} placeholder="Write your day here…" onChange={event => { markDirty(); setJournal(event.target.value); }} /></label>
      {day?.entries.filter(entry => entry.journal.trim()).map(entry => <details className="pn-day-earlier-journal" key={entry.id}><summary>{entry.name} · saved template journal</summary><p>{entry.journal}</p><small>Preserved from the previous planner. Edit this entry in Stacked.</small></details>)}
      <footer className="pn-daily-footer"><span>{dirty ? 'Unsaved daily journal' : 'Tasks save as you go · journal saves below'}</span><button disabled={busy} onClick={() => void save()}>Save day</button></footer>
    </section></div>
  </div>;
}
