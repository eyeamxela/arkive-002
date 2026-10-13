import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Brain, TaskTemplate, WorkspaceTask } from './api';
import type { WorkspacePanelsProps } from './WorkspacePanels';
import { plannerMonth, shiftPlannerDate, templateDue, validPlannerDate } from '../../../personal-node/planner-dates.mjs';
import { folderMaterial, CABINET_PALETTE } from './fileCabinetModel.mjs';
import './PlannerWorkspace.css';

export function localPlannerDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const pretty = (date: string, month = false) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...(month ? { month: 'long', year: 'numeric' } as const : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' } as const) });
type Draft = Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; expectedUpdatedAt?: string };
type Props = {
  brain: Brain; mode: 'planner' | 'calendar' | 'templates'; date: string; onDate: (date: string) => void;
  busy: boolean; run: WorkspacePanelsProps['act']; card: (task: WorkspaceTask) => ReactNode; onPlanner: () => void;
};

export function PlannerWorkspace({ brain, mode, date, onDate, busy, run, card, onPlanner }: Props) {
  const tasks = brain.workspace?.tasks ?? [];
  const templates = brain.workspace?.taskTemplates ?? [];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [chosenSection, setChosenSection] = useState('');
  const [retry, setRetry] = useState(0);
  const attempted = useRef('');
  const dayTasks = tasks.filter(task => task.dueDate === date);
  const applied = new Set(tasks.filter(task => task.templateDate === date).map(task => task.templateId));
  const missing = templates.filter(template => templateDue(template, date) && !applied.has(template.id));
  const key = `${brain.brainId}:${date}:${missing.map(template => `${template.id}:${template.updatedAt}`).join(',')}:${retry}`;
  // Recurrence is on-demand, owner-authorized by enabling the template. The server
  // serializes and deduplicates date snapshots, including concurrent clients.
  useEffect(() => {
    if (mode === 'templates' || busy || !missing.length || attempted.current === key) return;
    attempted.current = key;
    void run('Preparing daily templates', client => client.request('/v1/workspace/planner/day', 'POST', { date }), 'Daily tasks ready. Existing completion history is unchanged.');
  }, [key, mode, busy, date, missing.length, run]);
  const sections = [...new Set(dayTasks.map(task => task.section || 'Personal'))];
  if (!sections.length) sections.push('Personal');
  const section = sections.includes(chosenSection) ? chosenSection : sections[0];
  const sectionIndex = sections.indexOf(section);
  const pageSections = sections.slice(Math.floor(sectionIndex / 5) * 5, Math.floor(sectionIndex / 5) * 5 + 5);
  const order = [...pageSections.filter(name => name !== section), section];
  const fill = (name: string) => CABINET_PALETTE[sections.indexOf(name) % CABINET_PALETTE.length].color;
  const selected = dayTasks.filter(task => (task.section || 'Personal') === section);
  const completed = dayTasks.filter(task => task.status === 'done').length;
  const unscheduled = tasks.filter(task => !task.dueDate);
  const choose = (next: string) => { if (validPlannerDate(next)) onDate(next); };
  const editTemplate = (template?: TaskTemplate) => setDraft(template ? {
    id: template.id, expectedUpdatedAt: template.updatedAt, name: template.name, repeat: template.repeat, enabled: template.enabled,
    startsOn: template.startsOn, items: template.items.map(item => ({ ...item })),
  } : { name: '', repeat: 'manual', enabled: true, startsOn: date, items: [{ title: '', section: 'Personal' }] });
  const apply = async (template: TaskTemplate) => {
    if (await run('Applying task template', client => client.request('/v1/workspace/planner/day', 'POST', { date, templateId: template.id }), 'Template applied once for this date. Existing tasks were kept.')) onPlanner();
  };
  return <div className="pn-planner">
    <header className="pn-planner-datebar">
      <div><p className="fc-eyebrow">{mode === 'templates' ? 'REUSABLE ROUTINES' : 'YOUR DAY'}</p><h2>{mode === 'templates' ? 'Make room for a routine.' : pretty(date)}</h2><p>{completed} of {dayTasks.length} saved tasks complete</p></div>
      <div className="pn-planner-date-actions"><button aria-label="Previous day" disabled={busy || date === '1900-01-01'} onClick={() => choose(shiftPlannerDate(date, -1))}>←</button><label><span className="pn-sr">Planner date</span><input type="date" aria-label="Planner date" min="1900-01-01" max="2199-12-31" value={date} disabled={busy} onChange={event => choose(event.target.value)} /></label><button aria-label="Next day" disabled={busy || date === '2199-12-31'} onClick={() => choose(shiftPlannerDate(date, 1))}>→</button><button disabled={busy} onClick={() => choose(localPlannerDate())}>Today</button></div>
    </header>
    {mode !== 'templates' && missing.length > 0 && <p className="pn-planner-hint">{busy ? 'Preparing recurring tasks…' : <>Some recurring tasks are not saved yet. <button onClick={() => setRetry(value => value + 1)}>Retry daily templates</button></>}</p>}
    {mode === 'calendar' && <section className="pn-calendar" aria-label="Task calendar">
      <header><h3>{pretty(date, true)}</h3><div><button aria-label="Previous month" disabled={busy || date.startsWith('1900-01')} onClick={() => choose(`${shiftPlannerDate(`${date.slice(0, 7)}-01`, -1).slice(0, 7)}-01`)}>←</button><button aria-label="Next month" disabled={busy || date.startsWith('2199-12')} onClick={() => choose(`${shiftPlannerDate(`${date.slice(0, 7)}-28`, 4).slice(0, 7)}-01`)}>→</button></div></header>
      <div className="pn-calendar-week" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="pn-calendar-grid">{plannerMonth(date).map(day => {
        const saved = tasks.filter(task => task.dueDate === day), done = saved.filter(task => task.status === 'done').length;
        const instantiated = new Set(tasks.filter(task => task.templateDate === day).map(task => task.templateId));
        const planned = templates.filter(template => templateDue(template, day) && !instantiated.has(template.id)).reduce((sum, template) => sum + template.items.length, 0);
        return <button key={day} disabled={busy || !validPlannerDate(day)} aria-label={`${pretty(day)}: ${done} of ${saved.length} complete, ${planned} planned`} aria-pressed={day === date} aria-current={day === localPlannerDate() ? 'date' : undefined} data-other-month={day.slice(0, 7) !== date.slice(0, 7)} onClick={() => choose(day)}><strong>{Number(day.slice(-2))}</strong><small>{saved.length ? `${done}/${saved.length} done` : '—'}</small>{planned > 0 && <small>+{planned} planned</small>}</button>;
      })}</div><p>Solid counts are saved tasks. “Planned” tasks populate when you open that date; they are not completed history.</p>
    </section>}
    {mode === 'templates' ? <section className="pn-template-library" aria-label="Task templates">
      <header><p>A template creates a separate checklist for each date, grouped by Personal or your project names.</p><button disabled={busy || !!draft} onClick={() => editTemplate()}>＋ New template</button></header>
      {draft && <form className="pn-wp-editor" onSubmit={event => { event.preventDefault(); void (async () => {
        if (await run('Saving task template', client => client.request('/v1/workspace/templates', 'POST', { ...draft, name: draft.name.trim(), items: draft.items.map(item => ({ title: item.title.trim(), section: item.section.trim() })) }), 'Template saved. Previously created days will not be rewritten.')) setDraft(null);
      })(); }}><h3>{draft.id ? 'Edit template' : 'New template'}</h3><fieldset disabled={busy}>
        <label>Template name<input required maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <div className="pn-wp-form-row"><label>Repeat<select aria-label="Template repeat" value={draft.repeat} onChange={event => setDraft({ ...draft, repeat: event.target.value as Draft['repeat'] })}><option value="manual">Only when I apply it</option><option value="daily">Every day</option><option value="weekdays">Weekdays (Mon–Fri)</option></select></label><label>Starts on<input type="date" required min="1900-01-01" max="2199-12-31" value={draft.startsOn} onChange={event => setDraft({ ...draft, startsOn: event.target.value })} /></label></div>
        <label className="pn-check"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />Enable automatic recurrence</label>
        <div className="pn-template-items">{draft.items.map((item, index) => <div key={index}><label>Section / project {index + 1}<input required maxLength={80} value={item.section} onChange={event => setDraft({ ...draft, items: draft.items.map((row, i) => i === index ? { ...row, section: event.target.value } : row) })} /></label><label>Task {index + 1}<input required maxLength={160} value={item.title} onChange={event => setDraft({ ...draft, items: draft.items.map((row, i) => i === index ? { ...row, title: event.target.value } : row) })} /></label><button type="button" aria-label={`Remove template task ${index + 1}`} disabled={draft.items.length === 1} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}>×</button></div>)}</div>
        <button type="button" disabled={draft.items.length >= 50} onClick={() => setDraft({ ...draft, items: [...draft.items, { title: '', section: draft.items[draft.items.length - 1]?.section || 'Personal' }] })}>＋ Add template task</button>
        <p className="pn-planner-hint">Up to 50 tasks. Enabling daily/weekday recurrence authorizes creating tasks when eligible dates are opened, including future or past dates after the start. No background agent, notifications or external calendar sync. Existing days are snapshots and are never rewritten.</p>
        <div className="pn-wp-actions"><button className="pn-primary" disabled={!draft.name.trim() || draft.items.some(item => !item.title.trim() || !item.section.trim())}>Save template</button><button type="button" onClick={() => setDraft(null)}>Cancel</button></div>
      </fieldset></form>}
      <div className="pn-template-cards">{templates.map(template => <article key={template.id}><p className="fc-eyebrow">{template.repeat === 'manual' ? 'MANUAL' : template.enabled ? template.repeat.toUpperCase() : 'PAUSED'} · FROM {template.startsOn}</p><h3>{template.name}</h3><p>{template.items.length} tasks · {[...new Set(template.items.map(item => item.section))].join(' / ')}</p><div><button disabled={busy || !!draft || applied.has(template.id)} onClick={() => void apply(template)}>{applied.has(template.id) ? 'Already on this date' : `Use on ${date}`}</button><button aria-label={`Edit template ${template.name}`} disabled={busy || !!draft} onClick={() => editTemplate(template)}>Edit</button></div></article>)}</div>
      {!templates.length && !draft && <div className="pn-wp-empty"><h3>Your day, without starting from scratch.</h3><p>Create a daily or weekday routine, or a reusable project checklist. Nothing is added until you save a template.</p></div>}
    </section> : <>
      {sections.length > 5 && <label className="pn-planner-section-select">Section / project<select value={section} onChange={event => setChosenSection(event.target.value)}>{sections.map(name => <option key={name}>{name}</option>)}</select></label>}
      <div className="fc-cabinet"><div className="fc-deck" role="group" aria-label="Daily sections" style={{ '--fc-layers': pageSections.length } as CSSProperties}>{pageSections.map((name, index) => <div className="fc-layer" key={name} style={{ ...folderMaterial(fill(name)), '--fc-order': order.indexOf(name), '--fc-offset': `${[2, 29, 57, 40, 12][index]}%`, '--fc-mobile-offset': `${[2, 31, 9, 30, 4][index]}%` } as CSSProperties}><div className="fc-rail" aria-hidden="true" /><button className="fc-tab" aria-pressed={name === section} onClick={() => setChosenSection(name)}><span className="fc-tab-count">{dayTasks.filter(task => (task.section || 'Personal') === name).length}</span><span className="fc-tab-name">{name}</span></button></div>)}</div>
        <section className="fc-sheet pn-planner-sheet" aria-label={`${section} daily tasks`} style={folderMaterial(fill(section)) as CSSProperties}><header className="fc-sheet-heading"><div><p className="fc-location">{date} / {section}</p><h2>{section}</h2><p className="fc-folder-description">{selected.filter(task => task.status === 'done').length} of {selected.length} complete</p></div></header><div className="pn-planner-tasks">{selected.map(card)}{!selected.length && <div className="fc-empty"><h3>A fresh page.</h3><p>Add a dated task or create a repeating template. Your existing undated tasks are below.</p></div>}</div></section>
      </div>
      <details className="pn-planner-unscheduled"><summary>Unscheduled · {unscheduled.length}</summary><p>Existing tasks stay here until you give them a date. Edit a task to schedule it.</p><div className="pn-wp-grid">{unscheduled.map(card)}</div></details>
    </>}
  </div>;
}
