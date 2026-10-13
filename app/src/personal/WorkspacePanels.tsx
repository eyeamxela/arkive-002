import { useDeferredValue, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import type { Brain, BrainObject, PersonalNodeClient, Provider, Room } from './api';
import { AccessManagement } from './RoomGovernance';
import { AgentActivity } from './AgentActivity';
import { PlannerWorkspace, localPlannerDate } from './PlannerWorkspace';
import { folderMaterial } from './fileCabinetModel.mjs';
import './FileCabinet.css';
import './WorkspacePanels.css';

export type WorkspacePanel = 'work' | 'agents' | 'library' | 'manifests' | 'policies' | 'shared' | 'audit';
export type WorkspacePanelsProps = {
  panel: WorkspacePanel;
  brain: Brain;
  providers: Provider[];
  roomProviders?: Record<string, Provider[]>;
  busy: boolean;
  act: (label: string, action: (client: PersonalNodeClient) => Promise<unknown>, success?: string) => Promise<boolean>;
  activeRoomId: string | null;
  onOpenRoom: (roomId: string, providerId?: string) => void;
  onOpenBrain: (id?: string) => void;
  onNavigate: (panel: string) => void;
};
type Props = WorkspacePanelsProps;
type Task = NonNullable<Brain['workspace']>['tasks'][number];
type Agent = NonNullable<Brain['workspace']>['agents'][number];
type Preset = NonNullable<Brain['workspace']>['manifests'][number];
type TaskDraft = Pick<Task, 'title' | 'description' | 'status' | 'sourceIds'> & { id?: string; agentId: string; dueDate: string; section: string };
type AgentDraft = Pick<Agent, 'name' | 'description' | 'providerId' | 'sourceIds'> & { id?: string };
type PresetDraft = Pick<Preset, 'name' | 'description' | 'sourceIds'> & { id?: string };
const TASK_STATES = ['todo', 'doing', 'review', 'done'] as const;
const TASK_LABELS: Record<Task['status'], string> = { todo: 'To do', doing: 'In progress', review: 'Review', done: 'Done' };
const TASK_COLORS = { todo: '#f4bc59', doing: '#f2f3ee', review: '#999d7e', done: '#a3b7a8' };
const TASK_TAB_OFFSETS = [2, 29, 57, 15];
const TASK_MOBILE_OFFSETS = [2, 31, 9, 30];

function time(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return 'No timestamp recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid recorded timestamp' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function validateDraft(name: string, description: string, sourceIds: string[]) {
  const encoder = new TextEncoder();
  if (encoder.encode(name).byteLength > 160) throw new Error('Use a shorter name or title (up to 160 UTF-8 bytes).');
  if (encoder.encode(description).byteLength > 8000) throw new Error('Use a shorter description (up to 8,000 UTF-8 bytes).');
  if (sourceIds.length > 1000) throw new Error('Choose at most 1,000 supporting sources.');
}

/** Block repeat submissions synchronously; the shell owns error and success reporting. */
function useAction(props: Props) {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const run: Props['act'] = async (label, action, success) => {
    if (props.busy || lock.current) return false;
    lock.current = true;
    setPending(true);
    try { return await props.act(label, action, success); }
    finally { lock.current = false; setPending(false); }
  };
  return { run, busy: props.busy || pending };
}

function Frame({ eyebrow, title, count, actions, children }: { eyebrow: string; title: string; count?: number; actions?: ReactNode; children: ReactNode }) {
  return <section className="pn-wp" aria-label={title}>
    <header className="pn-wp-heading"><div><p className="pn-eyebrow">{eyebrow}</p><h1>{title}</h1></div><div className="pn-wp-heading-actions">{count !== undefined && <span className="pn-count">{count}</span>}{actions}</div></header>
    <div className="pn-wp-scroll">{children}</div>
  </section>;
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="pn-wp-empty"><span aria-hidden="true">◇</span><h2>{title}</h2><p>{children}</p></div>;
}
function Note({ children }: { children: ReactNode }) { return <p className="pn-wp-note">{children}</p>; }

function SourcePicker({ objects, selected, onChange, busy }: { objects: BrainObject[]; selected: string[]; onChange: (ids: string[]) => void; busy: boolean }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(100);
  const filtered = objects.filter(object => `${object.title} ${object.sourcePath || ''} ${object.kind}`.toLowerCase().includes(query.trim().toLowerCase()));
  const availableIds = new Set(objects.map(object => object.id));
  const missing = selected.filter(id => !availableIds.has(id));
  return <fieldset className="pn-wp-sources" disabled={busy}>
    <legend>Supporting sources <span>{selected.length} selected</span></legend>
    <label className="pn-wp-source-search"><span className="pn-sr">Filter supporting sources</span><input type="search" value={query} placeholder="Find a source…" onChange={event => { setQuery(event.target.value); setLimit(100); }} /></label>
    <div className="pn-wp-source-list">{filtered.slice(0, limit).map(object => <label className="pn-check" key={object.id}>
      <input type="checkbox" disabled={selected.length >= 1000 && !selected.includes(object.id)} checked={selected.includes(object.id)} onChange={event => onChange(event.target.checked ? [...new Set([...selected, object.id])] : selected.filter(id => id !== object.id))} />
      <span>{object.title}<small>{object.kind}{object.sourcePath ? ` · ${object.sourcePath}` : ''}</small></span>
    </label>)}{!filtered.length && <p className="pn-fine">{objects.length ? 'No sources match this search.' : 'No sources yet. Save a note or connect a source in your Brain.'}</p>}</div>
    {filtered.length > limit && <button type="button" onClick={() => setLimit(value => value + 100)}>Show more sources ({filtered.length - limit} remaining)</button>}
    {missing.map(id => <label className="pn-check pn-wp-warning" key={id}><input type="checkbox" checked onChange={() => onChange(selected.filter(value => value !== id))} /><span>Unavailable source: {id}<small>Uncheck to remove this reference before saving.</small></span></label>)}
    <p className="pn-fine">Up to 1,000 sources. Selection is context metadata, not an access grant. Nothing is sent to a model when you save.</p>
  </fieldset>;
}
function SourceLinks({ ids, props }: { ids: string[]; props: Props }) {
  const byId = new Map(props.brain.objects.map(object => [object.id, object]));
  return <details className="pn-wp-source-links"><summary>{ids.length} source{ids.length === 1 ? '' : 's'}</summary>
    <div>{ids.map(id => { const object = byId.get(id); return object ? <button key={id} onClick={() => props.onOpenBrain(id)}>{object.title}</button> : <span className="pn-fine" key={id}>Unavailable reference: {id}</span>; })}{!ids.length && <p className="pn-fine">No sources selected.</p>}</div>
  </details>;
}

export function WorkspacePanels(props: Props) {
  if (props.brain.access?.kind === 'member' && props.panel === 'agents') return <Frame eyebrow="ROOM ACTIVITY / PERMITTED RESULTS" title="Agents"><AgentActivity brain={props.brain} providers={props.providers} busy={props.busy} act={props.act} onOpenRoom={props.onOpenRoom} onOpenBrain={props.onOpenBrain} /></Frame>;
  if (props.brain.access?.kind === 'member' && !['agents', 'shared', 'policies'].includes(props.panel)) return <Frame eyebrow="OWNER AREA" title="Restricted"><Note>Your member credential does not grant access to this area.</Note></Frame>;
  switch (props.panel) {
    case 'work': return <WorkPanel {...props} />;
    case 'agents': return <AgentsPanel {...props} />;
    case 'library': return <PresetsPanel key="collections" {...props} kind="collections" />;
    case 'manifests': return <PresetsPanel key="manifests" {...props} kind="manifests" />;
    case 'policies': return <PoliciesPanel {...props} />;
    case 'shared': return <SharedPanel {...props} />;
    case 'audit': return <AuditPanel {...props} />;
  }
}

function WorkPanel(props: Props) {
  const tasks = props.brain.workspace?.tasks ?? [];
  const agents = props.brain.workspace?.agents ?? [];
  const [view, setView] = useState<'planner' | 'calendar' | 'templates' | 'folders' | 'board' | 'list'>('planner');
  const [plannerDate, setPlannerDate] = useState(localPlannerDate);
  const [activeStatus, setActiveStatus] = useState<Task['status']>('todo');
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const { run, busy } = useAction(props);
  const edit = (task?: Task) => setDraft(task ? { id: task.id, title: task.title, description: task.description, status: task.status, sourceIds: [...task.sourceIds], agentId: task.agentId || '', dueDate: task.dueDate || '', section: task.section || 'Personal' } : { title: '', description: '', status: 'todo', sourceIds: [], agentId: '', dueDate: ['planner', 'calendar'].includes(view) ? plannerDate : '', section: 'Personal' });
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft?.title.trim()) return;
    if (await run('Saving task', client => { validateDraft(draft.title.trim(), draft.description, draft.sourceIds); return client.request('/v1/workspace/tasks', 'POST', { ...draft, title: draft.title.trim() }); }, 'Task saved on your node. Assignment is metadata; no agent was started.')) { setActiveStatus(draft.status); setDraft(null); }
  };
  const setStatus = async (task: Task, status: Task['status']) => {
    if (await run('Updating task status', client => client.request('/v1/workspace/tasks', 'POST', { id: task.id, title: task.title, description: task.description, sourceIds: task.sourceIds, agentId: task.agentId || '', status }), 'Task status saved. No execution or approval is implied.')) setActiveStatus(status);
  };
  const grouped = TASK_STATES.map(status => ({ status, tasks: tasks.filter(task => task.status === status) }));
  const visibleTasks = grouped.find(group => group.status === activeStatus)!.tasks;
  const stackOrder = [...TASK_STATES.filter(status => status !== activeStatus), activeStatus];
  const linkedIds = new Set(visibleTasks.flatMap(task => task.sourceIds));
  const linkedSources = props.brain.objects.filter(object => linkedIds.has(object.id));
  const doneCount = grouped.find(group => group.status === 'done')!.tasks.length;
  const card = (task: Task) => <article className="pn-wp-task" key={task.id}>
    <div className="pn-wp-card-heading"><span className={`pn-wp-status is-${task.status}`}>{TASK_LABELS[task.status]}</span><button disabled={busy || !!draft} onClick={() => edit(task)} aria-label={`Edit task ${task.title}`}>Edit</button></div>
    <div className="pn-work-task-title"><input type="checkbox" aria-label={`Complete task ${task.title}`} checked={task.status === 'done'} disabled={busy || !!draft} onChange={event => void setStatus(task, event.target.checked ? 'done' : 'todo')} /><h3>{task.title}</h3></div>{task.description && <p className="pn-wp-description">{task.description}</p>}
    <p className="pn-fine">{task.agentId ? `Assigned profile: ${agents.find(agent => agent.id === task.agentId)?.name || 'unavailable profile'}` : 'Unassigned'} · not executing</p>
    <SourceLinks ids={task.sourceIds} props={props} />
    <p className="pn-fine">{task.section || 'Personal'} · {task.dueDate || 'Unscheduled'}{task.templateId ? ' · From template' : ''}{task.completedAt ? ` · Completed ${time(task.completedAt)}` : ''}</p>
    <label className="pn-wp-status-select">Status<select value={task.status} disabled={busy || !!draft} onChange={event => void setStatus(task, event.target.value as Task['status'])}>{TASK_STATES.map(status => <option value={status} key={status}>{TASK_LABELS[status]}</option>)}</select></label>
    <p className="pn-fine">Updated {time(task.updatedAt)}</p>
  </article>;
  return <section className="pn-wp pn-file-cabinet pn-work-cabinet" aria-label="Work">
    <div className="pn-wp-scroll">
    <header className="fc-toolbar"><div><p className="fc-eyebrow">YOUR BRAIN / WORKSPACE</p><h1>A place for your next step.</h1></div><button className="pn-primary" disabled={busy || !!draft} onClick={() => edit()}>＋ New task</button></header>
    <div className="fc-organization-bar"><div className="fc-modes" aria-label="Task view">{(['planner', 'calendar', 'templates', 'folders', 'board', 'list'] as const).map(mode => <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === 'folders' ? 'Stacked' : mode[0].toUpperCase() + mode.slice(1)}</button>)}</div><p>{doneCount} of {tasks.length} complete · Saved on your node</p></div>
    {draft && <form className="pn-wp-editor" onSubmit={event => void save(event)}><h2>{draft.id ? 'Edit task' : 'New task'}</h2><fieldset disabled={busy}>
      <label>Task title<input autoFocus value={draft.title} maxLength={160} required onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Description<textarea aria-label="Description" value={draft.description} maxLength={8000} rows={3} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <div className="pn-wp-form-row"><label>Scheduled date<input type="date" min="1900-01-01" max="2199-12-31" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label><label>Section / project<input required maxLength={80} list="work-section-names" value={draft.section} onChange={event => setDraft({ ...draft, section: event.target.value })} /></label></div>
      <datalist id="work-section-names">{[...new Set(['Personal', ...tasks.map(task => task.section || 'Personal')])].map(section => <option key={section} value={section} />)}</datalist>
      <p className="pn-fine">Leave the date empty for Unscheduled. Sections organize tasks; they do not move files or grant access.</p>
      <div className="pn-wp-form-row"><label>Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Task['status'] })}>{TASK_STATES.map(status => <option key={status} value={status}>{TASK_LABELS[status]}</option>)}</select></label>
      <label>Assigned profile<select value={draft.agentId} onChange={event => setDraft({ ...draft, agentId: event.target.value })}><option value="">Unassigned</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}{draft.agentId && !agents.some(agent => agent.id === draft.agentId) && <option value={draft.agentId}>Unavailable profile</option>}</select></label></div>
      <SourcePicker objects={props.brain.objects} selected={draft.sourceIds} onChange={sourceIds => setDraft({ ...draft, sourceIds })} busy={busy} />
      <div className="pn-wp-actions"><button className="pn-primary" disabled={!draft.title.trim()}>Save task</button><button type="button" onClick={() => setDraft(null)}>Cancel</button></div>
    </fieldset></form>}
    {view === 'planner' || view === 'calendar' || view === 'templates' ? <PlannerWorkspace brain={props.brain} mode={view} date={plannerDate} onDate={setPlannerDate} busy={busy || !!draft} run={run} card={card} onPlanner={() => setView('planner')} /> : view === 'folders' ? <div className="fc-cabinet">
      <div className="fc-deck" role="group" aria-label="Task folders" style={{ '--fc-layers': 4 } as CSSProperties}>
        {grouped.map(({ status, tasks: items }, index) => <div key={status} className="fc-layer" style={{ ...folderMaterial(TASK_COLORS[status]), '--fc-order': stackOrder.indexOf(status), '--fc-offset': `${TASK_TAB_OFFSETS[index]}%`, '--fc-mobile-offset': `${TASK_MOBILE_OFFSETS[index]}%` } as CSSProperties}>
          <div className="fc-rail" aria-hidden="true" /><button className="fc-tab" aria-label={`${TASK_LABELS[status]} task folder`} aria-pressed={activeStatus === status} aria-controls="work-task-sheet" onClick={() => setActiveStatus(status)}><span className="fc-tab-count">{String(items.length).padStart(2, '0')}</span><span className="fc-tab-name">{TASK_LABELS[status]}</span></button>
        </div>)}
      </div>
      <section id="work-task-sheet" className="fc-sheet" aria-label={`${TASK_LABELS[activeStatus]} tasks`} style={folderMaterial(TASK_COLORS[activeStatus]) as CSSProperties}>
        <header className="fc-sheet-heading"><div><p className="fc-location">workspace / {activeStatus}</p><h2>{TASK_LABELS[activeStatus]}</h2><p className="fc-folder-description">Your tasks and their supporting notes, together.</p></div><span className="fc-scope">Private workspace · Owner only</span></header>
        <div className="fc-groups" aria-label="Workspace counts">{[{ label: 'In this folder', count: visibleTasks.length }, { label: 'Open tasks', count: tasks.length - doneCount }, { label: 'Complete', count: doneCount }].map(item => <div className="fc-group" key={item.label}><span className="fc-disc"><span>{String(item.count).padStart(2, '0')}</span></span><span className="fc-group-label">{item.label}</span></div>)}</div>
        <div className="fc-list-bar"><span>Tasks / {TASK_LABELS[activeStatus]}</span><span>{visibleTasks.length} records</span></div>
        <div className="fc-content"><div className="pn-work-task-list">{visibleTasks.map(card)}{!visibleTasks.length && <div className="fc-empty"><h3>{tasks.length ? 'A little breathing room.' : 'Make the next step explicit.'}</h3><p>{tasks.length ? 'No tasks in this folder. Choose another tab or add your next task.' : 'Create a task and connect its supporting notes. Your real work appears here—no sample tasks.'}</p></div>}</div>
          <aside className="fc-inspector pn-work-notes" aria-label="Linked notes"><p className="fc-preview-kicker">CONNECTED TO THIS FOLDER</p><h3>On your mind</h3><p>Supporting sources attached to these tasks.</p><div>{linkedSources.map(object => <button key={object.id} onClick={() => props.onOpenBrain(object.id)}><strong>{object.title}</strong><small>{object.kind} · Open in Brain ↗</small></button>)}</div>{!linkedSources.length && <p>No linked notes yet. Add supporting sources when you create or edit a task.</p>}<button className="fc-primary" onClick={() => props.onOpenBrain()}>Open Brain ↗</button></aside>
        </div>
        <footer className="pn-work-sheet-footer"><span><strong>{String(visibleTasks.length).padStart(2, '0')}</strong> tasks</span><p>Task folders organize work, not your files.</p></footer>
      </section>
    </div> : !tasks.length ? <Empty title="Make the next step explicit.">Create a task, attach its supporting sources and optionally assign a saved agent profile.</Empty> : view === 'board' ? <div className="pn-wp-board">{grouped.map(({ status, tasks: items }) => <section className="pn-wp-column" key={status} aria-label={`${TASK_LABELS[status]} tasks`} style={folderMaterial(TASK_COLORS[status]) as CSSProperties}><header><h2>{TASK_LABELS[status]}</h2><span className="pn-count">{items.length}</span></header>{items.map(card)}{!items.length && <p className="pn-fine">No tasks in this column.</p>}</section>)}</div> : <div className="pn-wp-grid">{tasks.map(card)}</div>}
    <p className="pn-work-boundary">Local planner · No external calendar sync or reminders. Status and assignments are saved metadata—not agent execution or approval. Original vault files stay unchanged.</p>
    </div>
  </section>;
}

function AgentsPanel(props: Props) {
  const agents = props.brain.workspace?.agents ?? [];
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const { run, busy } = useAction(props);
  const pendingRooms = useRef(new Map<string, Room>());
  const edit = (agent?: Agent) => setDraft(agent ? { id: agent.id, name: agent.name, description: agent.description, providerId: agent.providerId, sourceIds: [...agent.sourceIds] } : { name: '', description: '', providerId: props.providers[0]?.id || '', sourceIds: [] });
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft?.name.trim() || !props.providers.some(provider => provider.id === draft.providerId)) return;
    if (await run('Saving agent profile', client => { validateDraft(draft.name.trim(), draft.description, draft.sourceIds); return client.request('/v1/workspace/agents', 'POST', { ...draft, name: draft.name.trim() }); }, 'Agent profile saved. No process or background agent was started.')) setDraft(null);
  };
  const openChat = async (agent: Agent) => {
    let roomId: string | null = null;
    const succeeded = await run('Opening profile chat', async client => {
      let room = pendingRooms.current.get(agent.id);
      if (!room) { room = await client.request<Room>('/v1/rooms', 'POST', { title: agent.name.slice(0, 120) }); pendingRooms.current.set(agent.id, room); }
      await client.request(`/v1/rooms/${encodeURIComponent(room.id)}/sources`, 'PUT', { objectIds: agent.sourceIds });
      await client.request(`/v1/rooms/${encodeURIComponent(room.id)}/policy`, 'PUT', {
        agentId: agent.id, layerIds: [], memberGrants: [],
      });
      roomId = room.id;
    }, 'Chat prepared with this profile’s sources. Review the context and send when ready.');
    if (succeeded && roomId) { pendingRooms.current.delete(agent.id); props.onOpenRoom(roomId, agent.providerId); }
  };
  const messages = useMemo(() => props.brain.rooms.flatMap(room => room.messages.filter(message => message.role === 'assistant').map(message => ({ room, message }))).sort((a, b) => (Date.parse(b.message.createdAt || '') || 0) - (Date.parse(a.message.createdAt || '') || 0)).slice(0, 30), [props.brain.rooms]);
  return <Frame eyebrow="SAVED PROFILES / EXPLICIT CONTEXT" title="Agents" count={agents.length} actions={<button className="pn-primary" disabled={busy || !!draft || !props.providers.length} onClick={() => edit()}>＋ New profile</button>}>
    <Note>Rooms link a saved agent profile to real requests, pinned inputs and results. Profiles do not start autonomous workers or grant tools. Descriptions remain organizational metadata, not model instructions.</Note>
    <AgentActivity brain={props.brain} providers={props.providers} roomProviders={props.roomProviders} busy={busy} act={props.act} onOpenRoom={props.onOpenRoom} onOpenBrain={props.onOpenBrain} />
    <div className="pn-wp-provider-strip">{props.providers.map(provider => <div key={provider.id}><span className={`pn-wp-dot${provider.configured ? ' is-ready' : ''}`} /><strong>{provider.name || provider.id}</strong><span>{provider.configured ? 'configured' : 'not configured'} · {provider.model || 'no model'}{provider.external ? ' · external' : ''}</span></div>)}{!props.providers.length && <p className="pn-fine">The node reports no providers. Configure a supported adapter in Personal node.</p>}</div>
    {draft && <form className="pn-wp-editor" onSubmit={event => void save(event)}><h2>{draft.id ? 'Edit profile' : 'New profile'}</h2><fieldset disabled={busy}>
      <label>Profile name<input autoFocus required value={draft.name} maxLength={120} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Purpose / description<textarea value={draft.description} rows={3} maxLength={8000} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>Provider<select required value={draft.providerId} onChange={event => setDraft({ ...draft, providerId: event.target.value })}><option value="" disabled>Select a provider</option>{props.providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name || provider.id}{provider.configured ? '' : ' · not configured'}</option>)}{draft.providerId && !props.providers.some(provider => provider.id === draft.providerId) && <option value={draft.providerId}>Unavailable provider</option>}</select></label>
      <SourcePicker objects={props.brain.objects} selected={draft.sourceIds} onChange={sourceIds => setDraft({ ...draft, sourceIds })} busy={busy} />
      <div className="pn-wp-actions"><button className="pn-primary" disabled={!draft.name.trim() || !props.providers.some(provider => provider.id === draft.providerId)}>Save profile</button><button type="button" onClick={() => setDraft(null)}>Cancel</button></div>
    </fieldset></form>}
    {!agents.length ? <Empty title="Give a recurring conversation a starting point.">Save a provider and source set as a profile. Opening it prepares a chat; it never sends automatically.</Empty> : <div className="pn-wp-grid">{agents.map(agent => { const provider = props.providers.find(item => item.id === agent.providerId); return <article className="pn-wp-card" key={agent.id}><div className="pn-wp-card-heading"><span className="pn-eyebrow">AGENT PROFILE</span><span className="pn-count">{provider?.configured ? 'configured' : 'unavailable'}</span></div><h2>{agent.name}</h2><p className="pn-wp-description">{agent.description || 'No description recorded.'}</p><p className="pn-fine">{provider?.name || agent.providerId} · {provider?.model || 'no model configured'}</p><SourceLinks ids={agent.sourceIds} props={props} /><div className="pn-wp-actions"><button className="pn-primary" disabled={busy} onClick={() => void openChat(agent)}>Open chat</button><button disabled={busy} onClick={() => edit(agent)}>Edit profile</button></div><p className="pn-fine">Updated {time(agent.updatedAt)} · no automatic execution</p></article>; })}</div>}
    <section className="pn-wp-section"><div className="pn-wp-section-heading"><h2>Recorded assistant responses</h2><span className="pn-count">latest {messages.length}</span></div><p className="pn-fine">Actual room messages, not a background-run monitor. Older responses may have no run receipt. New requests are attributed in the run inspector above; these transcripts remain available for continuity.</p>{!messages.length ? <p className="pn-wp-inline-empty">No assistant responses have been recorded.</p> : <div className="pn-wp-history">{messages.map(({ room, message }) => <article key={`${room.id}:${message.id}`}><div><button onClick={() => props.onOpenRoom(room.id)}>{room.title}</button><time>{time(message.createdAt)}</time></div><p>{message.text}</p><span className="pn-fine">{message.sourceIds?.length || 0} context references{typeof record(message).status === 'string' ? ` · ${text(record(message).status)}` : ''}</span></article>)}</div>}</section>
    <button onClick={() => props.onNavigate('node')}>Inspect provider configuration →</button>
  </Frame>;
}

function PresetsPanel(props: Props & { kind: 'manifests' | 'collections' }) {
  const isManifest = props.kind === 'manifests';
  const records = props.brain.workspace?.[props.kind] ?? [];
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const { run, busy } = useAction(props);
  const pendingRooms = useRef(new Map<string, Room>());
  const activeRoom = props.brain.rooms.find(room => room.id === props.activeRoomId);
  const label = isManifest ? 'context preset' : 'collection';
  const edit = (preset?: Preset) => setDraft(preset ? { id: preset.id, name: preset.name, description: preset.description, sourceIds: [...preset.sourceIds] } : { name: '', description: '', sourceIds: [] });
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft?.name.trim()) return;
    if (await run(`Saving ${label}`, client => { validateDraft(draft.name.trim(), draft.description, draft.sourceIds); return client.request(`/v1/workspace/${props.kind}`, 'POST', { ...draft, name: draft.name.trim() }); }, `${isManifest ? 'Context preset' : 'Collection'} saved in this Brain. No package was published or access granted.`)) setDraft(null);
  };
  const apply = async (preset: Preset, create: boolean) => {
    let roomId: string | null = null;
    const succeeded = await run('Applying selected sources', async client => {
      let room = create ? pendingRooms.current.get(preset.id) : activeRoom;
      if (!room && create) { room = await client.request<Room>('/v1/rooms', 'POST', { title: preset.name.slice(0, 120) }); pendingRooms.current.set(preset.id, room); }
      if (!room) throw new Error('Select a room first, or open a new chat.');
      await client.request(`/v1/rooms/${encodeURIComponent(room.id)}/sources`, 'PUT', { objectIds: preset.sourceIds });
      roomId = room.id;
    }, 'Room sources replaced with this exact selection. Current source revisions will be used; no message was sent.');
    if (succeeded && roomId) { if (create) pendingRooms.current.delete(preset.id); props.onOpenRoom(roomId); }
  };
  return <Frame eyebrow={isManifest ? 'NAMED CONTEXT / EXPLICIT SELECTION' : 'SOURCE COLLECTIONS / ONE BRAIN'} title={isManifest ? 'Manifests' : 'Library'} count={records.length} actions={<button className="pn-primary" disabled={busy || !!draft} onClick={() => edit()}>＋ New {label}</button>}>
    <Note>{isManifest ? 'These manifests are named context presets, not signed snapshots or permission grants. They follow the current revisions of their sources. Applying a preset replaces a room’s selection; it does not send a message.' : 'Collections organize references to sources already in this Brain. They do not duplicate files, install behavior, publish content or grant another person access.'}</Note>
    {draft && <form className="pn-wp-editor" onSubmit={event => void save(event)}><h2>{draft.id ? `Edit ${label}` : `New ${label}`}</h2><fieldset disabled={busy}>
      <label>Name<input autoFocus required value={draft.name} maxLength={120} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Description<textarea value={draft.description} rows={3} maxLength={8000} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <SourcePicker objects={props.brain.objects} selected={draft.sourceIds} onChange={sourceIds => setDraft({ ...draft, sourceIds })} busy={busy} />
      <div className="pn-wp-actions"><button className="pn-primary" disabled={!draft.name.trim()}>Save {label}</button><button type="button" onClick={() => setDraft(null)}>Cancel</button></div>
    </fieldset></form>}
    {!records.length ? <Empty title={isManifest ? 'Save a context you want to return to.' : 'Keep related sources together.'}>{isManifest ? 'Give a source selection a name, then apply it explicitly to a chat.' : 'Create your first collection from the files, notes and approved memories in this Brain.'}</Empty> : <div className="pn-wp-grid">{records.map(preset => <article className="pn-wp-card" key={preset.id}><div className="pn-wp-card-heading"><span className="pn-eyebrow">{isManifest ? 'UNSIGNED CONTEXT PRESET' : 'LOCAL COLLECTION'}</span><button disabled={busy} onClick={() => edit(preset)} aria-label={`Edit ${preset.name}`}>Edit</button></div><h2>{preset.name}</h2><p className="pn-wp-description">{preset.description || 'No description recorded.'}</p><SourceLinks ids={preset.sourceIds} props={props} /><p className="pn-fine">Updated {time(preset.updatedAt)}</p>
      <details className="pn-wp-apply"><summary>Use these sources in a chat</summary><p className="pn-fine">{activeRoom ? `Replace all selected sources in “${activeRoom.title}” with these ${preset.sourceIds.length} references, or create a new room.` : 'Create a new chat with this source set.'}{!preset.sourceIds.length && ' This selection is empty.'}</p><div className="pn-wp-actions">{activeRoom && <button disabled={busy} onClick={() => void apply(preset, false)}>Replace active room sources</button>}<button disabled={busy} onClick={() => void apply(preset, true)}>Open new chat</button></div></details>
    </article>)}</div>}
    {!isManifest && <section className="pn-wp-roadmap"><span className="pn-eyebrow">CARTRIDGES / LATER PHASE</span><h2>Portable packages remain a separate capability.</h2><p className="pn-muted">Knowledge, Memory, Data, Skill and Agent cartridges need versioned packaging, provenance checks and separate behavior consent. Mount, subscribe, fork, promote and public distribution are not enabled by these collections.</p><div className="pn-wp-actions"><button onClick={() => props.onOpenBrain()}>Browse Brain sources</button><button onClick={() => props.onNavigate('node')}>Encrypted Brain export</button></div></section>}
  </Frame>;
}

function PoliciesPanel(props: Props) {
  const selected = props.brain.rooms.reduce((count, room) => count + room.selectedSourceIds.length, 0);
  return <Frame eyebrow="ENFORCED BOUNDARIES / EXPLICIT ROOM GRANTS" title="Policies"><Note>Manage room scopes and member grants in the room inspector. These rules describe what the node enforces; UI visibility never substitutes for authorization.</Note>
    <div className="pn-wp-grid"><Policy title="Owner and scoped members" label="IDENTITY">The owner controls the Brain. Members receive only granted rooms and sources through server-filtered responses. Reader access cannot submit requests; participant requests need owner approval. Member credentials cannot unlock, export, sync or edit the Brain.</Policy><Policy title="Explicit source selection" label="RETRIEVAL">Selected sources are filtered through room layers and the assigned profile scope. A shared request must be readable by all current room members. Ask layers require explicit approval; excluded layers are blocked. Pinned manifests expire or become stale when their scope changes. {props.brain.rooms.length} rooms currently contain {selected} selections in total.</Policy><Policy title="External requests require consent" label="MODEL BOUNDARY">Owner sends and approved member requests use exact source revisions and produce durable run receipts. Review the provider, prompt and context before sending. Saving a profile or granting a room never makes a model call. A configured adapter is not a health check.</Policy><Policy title="Memory changes need review" label="APPROVAL">Memory proposals stay separate from approved knowledge. A source-backed proposal needs explicit approval in the Memory Inbox. Task status is not an approval for writing files or calling services.</Policy><Policy title="Changes outside the Brain" label="SOURCE WRITEBACK">Connected-source writes require an exact preview and approval. A source connection does not grant agents blanket write access. Review source-specific limitations in Sources & sync.</Policy><Policy title="Encryption has a trust boundary" label="OWNERSHIP">Encrypted storage protects data at rest. An unlocked node processes plaintext, and an external provider receives the context you authorize. Keep recovery copies and their passphrase separately; replication is not a backup strategy.</Policy></div>
    {props.brain.access?.kind !== 'member' && <div className="pn-wp-actions"><button onClick={() => props.onNavigate('inbox')}>Review memory proposals</button><button onClick={() => props.onNavigate('sources')}>Inspect Sources & sync</button><button onClick={() => props.onNavigate('node')}>Node and recovery settings</button></div>}
  </Frame>;
}
function Policy({ title, label, children }: { title: string; label: string; children: ReactNode }) { return <article className="pn-wp-card"><span className="pn-eyebrow">{label}</span><h2>{title}</h2><p className="pn-muted">{children}</p></article>; }
function SharedPanel(props: Props) {
  return <Frame eyebrow="PRIVATE BY DEFAULT / EXPLICIT ROOM ACCESS" title="Shared"><AccessManagement brain={props.brain} busy={props.busy} act={props.act} onOpenBrain={props.onOpenBrain} /><section className="pn-wp-roadmap"><h2>A credential is access, not an invitation service.</h2><p className="pn-muted">This beta uses separate member credentials with explicit room and source grants. Email invitations, SSO, public links and marketplace publishing remain unavailable. A remote member needs an already configured HTTPS node; this screen does not provision or expose one.</p><p className="pn-muted">Revocation stops future node access. It cannot recall content someone already read, copied or downloaded. Recovery bundles contain private data and must never be used as share links.</p><button onClick={() => props.onNavigate('policies')}>Review current boundaries</button></section></Frame>;
}

function AuditPanel(props: Props) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(200);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const rows = useMemo(() => props.brain.audit.map((value, index) => ({ value, row: record(value), index, search: JSON.stringify(value).toLowerCase() })).sort((a, b) => {
    const aTime = Date.parse(text(a.row.createdAt)); const bTime = Date.parse(text(b.row.createdAt));
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0) || b.index - a.index;
  }), [props.brain.audit]);
  const filtered = useMemo(() => rows.filter(row => row.search.includes(deferredQuery)), [rows, deferredQuery]);
  const objectIds = new Set(props.brain.objects.map(object => object.id));
  const roomIds = new Set(props.brain.rooms.map(room => room.id));
  return <Frame eyebrow="RECORDED EVENTS / NO SYNTHETIC ACTIVITY" title="Audit" count={rows.length}>
    <Note>Events reported by this Brain, newest first. This is a local event history, not a cryptographically signed or independently witnessed transparency log. No events are fabricated to fill this view.</Note>
    <label className="pn-wp-audit-search">Search event type, target or metadata<input type="search" value={query} placeholder="e.g. memory.accepted or a source ID" onChange={event => { setQuery(event.target.value); setLimit(200); }} /></label>
    <p className="pn-fine pn-wp-audit-count">Showing {Math.min(limit, filtered.length)} of {filtered.length} matching events · {rows.length} total</p>
    {!filtered.length ? <Empty title={rows.length ? 'No matching events.' : 'No events recorded yet.'}>{rows.length ? 'Try a different event type or identifier.' : 'Recorded changes and approvals will appear here.'}</Empty> : <ol className="pn-wp-audit-list">{filtered.slice(0, limit).map(({ row, value, index }) => { const target = text(row.targetId); return <li key={`${text(row.id)}:${index}`}><article><div className="pn-wp-audit-heading"><h2>{text(row.type) || 'Unrecognized recorded event'}</h2><time dateTime={text(row.createdAt) || undefined}>{time(row.createdAt)}</time></div><p className="pn-wp-audit-target">{objectIds.has(target) ? <button onClick={() => props.onOpenBrain(target)}>{props.brain.objects.find(object => object.id === target)?.title || target}</button> : roomIds.has(target) ? <button onClick={() => props.onOpenRoom(target)}>{props.brain.rooms.find(room => room.id === target)?.title || target}</button> : <span>{target || 'No target recorded'}</span>}</p><details><summary>Recorded metadata</summary><pre>{JSON.stringify(value, null, 2)}</pre></details></article></li>; })}</ol>}
    {filtered.length > limit && <button className="pn-wp-load-more" onClick={() => setLimit(value => value + 200)}>Load next {Math.min(200, filtered.length - limit)} events</button>}
  </Frame>;
}
