import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Brain, BrainObject, PersonalNodeClient, Provider, Room } from './api';
import { SpatialCanvas } from './SpatialCanvas';
import type { SpatialCanvasItem, SpatialCanvasState } from './SpatialCanvas';
import { MAX_CANVAS_ROOMS, messagePage, preferredProvider, requestConsentScope, visibleRoomIds } from './chatWorkspaceModel.mjs';
import './ChatWorkspace.css';

export type ChatWorkspaceProps = {
  brain: Brain;
  providers: Provider[];
  busy: boolean;
  act: (label: string, work: (client: PersonalNodeClient) => Promise<unknown>, success?: string) => Promise<boolean>;
  activeRoomId: string | null;
  onActiveRoom: (id: string) => void;
  onOpenBrain: (sourceId?: string) => void;
  onNavigate: (panel: string) => void;
  mode: 'chat' | 'canvas';
  visible?: boolean;
  preferredProviders?: Record<string, string>;
};
type RoomDraft = { text: string; providerId?: string; consentScope: string | null };
type Presentation = 'infinite' | 'radial' | 'multi';
const EMPTY_DRAFT: RoomDraft = { text: '', consentScope: null };
const EMPTY_SPATIAL: SpatialCanvasState = { camera: null, positions: {} };
type RoomControls = {
  room: Room; objects: BrainObject[]; byId: Map<string, BrainObject>; selected: BrainObject[];
  providers: Provider[]; provider?: Provider; draft: RoomDraft; consent: boolean; busy: boolean; active: boolean;
  onActivate: () => void; onText: (text: string) => void; onProvider: (id: string) => void;
  onConsent: (value: boolean) => void; onSource: (id: string, checked: boolean) => void;
  onSend: () => Promise<void>; onOpenBrain: (id?: string) => void; onNavigate: (panel: string) => void;
};

export function ChatWorkspace({ brain, providers, busy, act, activeRoomId, onActiveRoom, onOpenBrain,
  onNavigate, mode, visible = true, preferredProviders = {} }: ChatWorkspaceProps) {
  const [drafts, setDrafts] = useState<Record<string, RoomDraft>>({});
  const [roomTitle, setRoomTitle] = useState('');
  const [requestedRooms, setRequestedRooms] = useState<string[] | null>(null);
  const [presentation, setPresentation] = useState<Presentation>('infinite');
  const [spatial, setSpatial] = useState<Record<'infinite' | 'radial', SpatialCanvasState>>({ infinite: EMPTY_SPATIAL, radial: EMPTY_SPATIAL });
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const presentationVersion = useRef({ key: '', version: 0 });
  const active = brain.rooms.find(room => room.id === activeRoomId)
    || brain.rooms.find(room => requestedRooms?.includes(room.id)) || brain.rooms[0];
  const ids = useMemo(() => visibleRoomIds(brain.rooms, requestedRooms, active?.id), [brain.rooms, requestedRooms, active?.id]);
  const idSet = useMemo(() => new Set(ids), [ids]);
  const selectedRooms = brain.rooms.filter(room => idSet.has(room.id));
  const byId = useMemo(() => new Map(brain.objects.map(object => [object.id, object])), [brain.objects]);
  const pending = brain.proposals.filter(proposal => proposal.status === 'pending');
  const focusedRoom = mode === 'chat' || presentation === 'radial' || compact ? active?.id || null : null;
  const key = JSON.stringify([mode, presentation, compact, ids, visible, focusedRoom]);
  // A mode round-trip cannot resurrect an earlier grant, even if all its fields match again.
  if (presentationVersion.current.key !== key) presentationVersion.current = { key, version: presentationVersion.current.version + 1 };
  const presentationScope = `${key}:${presentationVersion.current.version}`;
  const roomInputId = useId();

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => setCompact(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  function updateDraft(id: string, next: Partial<RoomDraft>) {
    setDrafts(previous => ({ ...previous, [id]: { ...(previous[id] || EMPTY_DRAFT), ...next } }));
  }
  function activateRoom(id: string) {
    setRequestedRooms(previous => visibleRoomIds(brain.rooms, previous, id));
    onActiveRoom(id);
  }
  function saveSpatial(layout: 'infinite' | 'radial', next: SpatialCanvasState) {
    setSpatial(previous => ({ ...previous, [layout]: next }));
    setDrafts(previous => {
      if (!Object.values(previous).some(draft => draft.consentScope !== null)) return previous;
      return Object.fromEntries(Object.entries(previous).map(([id, draft]) => [id, { ...draft, consentScope: null }]));
    });
  }
  function controlsFor(room: Room): RoomControls {
    const draft = drafts[room.id] || EMPTY_DRAFT;
    const provider = preferredProvider(providers, draft.providerId || preferredProviders[room.id]);
    const selected = room.selectedSourceIds.map(id => byId.get(id)).filter((object): object is BrainObject => Boolean(object));
    const scope = requestConsentScope({ room, objects: selected, provider, text: draft.text, presentation: presentationScope });
    return { room, objects: brain.objects, byId, selected, providers, provider, draft,
      consent: draft.consentScope === scope, busy, active: room.id === active?.id,
      onActivate: () => { if (activeRoomId !== room.id) activateRoom(room.id); },
      onText: text => updateDraft(room.id, { text, consentScope: null }),
      onProvider: providerId => updateDraft(room.id, { providerId, consentScope: null }),
      onConsent: value => updateDraft(room.id, { consentScope: value ? scope : null }),
      onSource: (id, checked) => {
        updateDraft(room.id, { consentScope: null });
        void act('Updating chat context', client => client.request(`/v1/rooms/${encodeURIComponent(room.id)}/sources`, 'PUT', {
          objectIds: checked ? [...new Set([...room.selectedSourceIds, id])] : room.selectedSourceIds.filter(source => source !== id),
        }));
      },
      onSend: async () => {
        if (busy || !draft.text.trim() || !provider?.configured || (provider.external && draft.consentScope !== scope)) return;
        const text = draft.text;
        const allowExternal = provider.external && draft.consentScope === scope;
        updateDraft(room.id, { consentScope: null });
        const succeeded = await act('Running agent', client => client.request(`/v1/rooms/${encodeURIComponent(room.id)}/messages`, 'POST', {
          text, provider: provider.id, model: provider.model || undefined, allowExternal,
        }));
        if (succeeded) setDrafts(previous => ({ ...previous, [room.id]: {
          ...(previous[room.id] || EMPTY_DRAFT), text: previous[room.id]?.text === text ? '' : previous[room.id]?.text || '', consentScope: null,
        } }));
      }, onOpenBrain, onNavigate,
    };
  }
  async function createRoom(event: FormEvent) {
    event.preventDefault();
    const title = roomTitle.trim(); if (!title || busy) return;
    await act('Creating chat', async client => {
      const room = await client.request<Room>('/v1/rooms', 'POST', { title });
      onActiveRoom(room.id); setRoomTitle('');
      setRequestedRooms(previous => visibleRoomIds([...brain.rooms, room], previous, room.id));
    });
  }
  const visibleControls = selectedRooms.map(controlsFor);
  const activeControls = active ? controlsFor(active) : null;
  const infiniteItems: SpatialCanvasItem[] = visibleControls.map(controls => ({ id: controls.room.id,
    title: controls.room.title, width: 500, content: <RoomChat controls={controls} /> }));
  const radialItems: SpatialCanvasItem[] = activeControls ? [
    { id: `${active.id}:chat`, title: active.title, width: 500, initialPosition: { x: 0, y: 0 }, content: <RoomChat controls={activeControls} /> },
    { id: `${active.id}:context`, title: 'Context', width: 310, initialPosition: { x: -355, y: 85 }, content: <ContextPanel controls={activeControls} /> },
    { id: `${active.id}:provider`, title: 'Provider', width: 310, initialPosition: { x: 550, y: 215 }, content: <ProviderPanel controls={activeControls} /> },
    { id: `${active.id}:review`, title: 'Review queue', width: 310, initialPosition: { x: 550, y: -25 }, content: <ReviewPanel pending={pending} onNavigate={onNavigate} /> },
  ] : [];

  return <section className={`pn-chat-workspace pn-chat-workspace-${mode}`} aria-label={mode === 'chat' ? 'Chat workspace' : 'Canvas workspace'}>
    <header className="pn-cw-heading"><div><p className="pn-eyebrow">{mode === 'chat' ? 'ONE CONVERSATION, CHOSEN CONTEXT' : 'ONE BRAIN, DIFFERENT PERSPECTIVES'}</p><h1>{mode === 'chat' ? 'Chat' : 'Canvas'}</h1></div>
      <nav aria-label="Workspace shortcuts"><button type="button" onClick={() => onNavigate('library')}>Library</button><button type="button" onClick={() => onNavigate('inbox')}>Review{pending.length ? ` · ${pending.length}` : ''}</button><button type="button" onClick={() => onNavigate('audit')}>Audit</button></nav>
    </header>
    <div className="pn-cw-room-bar">
      {brain.rooms.length ? <label className="pn-cw-active-room"><span className="pn-sr">Active chat room</span><select value={active?.id || ''} onChange={event => activateRoom(event.target.value)}>
        {brain.rooms.map(room => <option key={room.id} value={room.id}>{room.title}</option>)}
      </select></label> : <span className="pn-cw-room-count">No rooms yet</span>}
      <form onSubmit={event => void createRoom(event)} className="pn-cw-new-room"><label className="pn-sr" htmlFor={roomInputId}>New chat name</label><input id={roomInputId} value={roomTitle} maxLength={120} placeholder="Name a new chat…" onChange={event => setRoomTitle(event.target.value)} disabled={busy} required /><button type="submit" disabled={busy || !roomTitle.trim()}>＋ New</button></form>
      {mode === 'canvas' && brain.rooms.length ? <details className="pn-cw-picker"><summary>Rooms · {ids.length}</summary><div><p>Choose up to {MAX_CANVAS_ROOMS} live rooms. The active room stays visible.</p>{brain.rooms.map(room => <label key={room.id}><input type="checkbox" checked={idSet.has(room.id)} disabled={room.id === active?.id || (!idSet.has(room.id) && ids.length >= MAX_CANVAS_ROOMS)}
        onChange={event => setRequestedRooms(event.target.checked ? [...ids, room.id] : ids.filter(id => id !== room.id))} /><span>{room.title}{room.id === active?.id ? <small className="pn-cw-active-label">Active</small> : null}</span><button type="button" aria-label={`Activate ${room.title}`} onClick={() => activateRoom(room.id)}>Open</button></label>)}</div></details> : null}
    </div>
    {mode === 'canvas' ? <div className="pn-cw-view-bar"><div role="group" aria-label="Canvas presentation">
      <button type="button" aria-pressed={presentation === 'infinite'} onClick={() => setPresentation('infinite')}>Infinite</button>
      <button type="button" aria-pressed={presentation === 'radial'} onClick={() => setPresentation('radial')}>Radial</button>
      <button type="button" aria-pressed={presentation === 'multi'} onClick={() => setPresentation('multi')}>Multi-room</button>
    </div><span>{compact ? 'Compact screen · focused room' : 'Live rooms. Layout never changes their context.'}</span></div> : null}

    {!brain.rooms.length ? <div className="pn-cw-empty"><span aria-hidden="true">↗</span><h2>Start with a conversation.</h2><p>Create a room above, choose the sources it can use, then send your first message. A new room starts with no selected sources.</p><div><button type="button" onClick={() => onOpenBrain()}>Open your Brain</button><button type="button" onClick={() => onNavigate('agents')}>Check providers</button></div></div>
      : mode === 'chat' || compact ? <div className="pn-cw-focused">{activeControls ? <RoomChat key={activeControls.room.id} controls={activeControls} focused /> : null}<aside className="pn-cw-focused-context">{activeControls ? <ContextPanel key={activeControls.room.id} controls={activeControls} /> : null}<ReviewPanel pending={pending} onNavigate={onNavigate} /></aside></div>
      : presentation === 'radial' ? <SpatialCanvas key="radial" items={radialItems} state={spatial.radial}
        onChange={next => saveSpatial('radial', next)} ariaLabel="Radial chat canvas" />
      : !visibleControls.length ? <div className="pn-cw-empty"><h2>Choose rooms to see them here.</h2><p>Open the room picker above. Your conversations and drafts are still saved in this session.</p><button type="button" onClick={() => setRequestedRooms(null)}>Show available rooms</button></div>
      : presentation === 'multi' ? <div className="pn-cw-multi" data-chat-scroll>{visibleControls.map(controls => <section key={controls.room.id} className="pn-cw-multi-row" aria-label={`${controls.room.title} workspace`}>
        <ContextPanel controls={controls} /><RoomChat controls={controls} /><ProviderPanel controls={controls} />
      </section>)}</div>
      : <SpatialCanvas key="infinite" items={infiniteItems} state={spatial.infinite}
        onChange={next => saveSpatial('infinite', next)} ariaLabel="Infinite chat canvas" />}
    <footer className="pn-cw-footer"><span>{busy ? '● Working on your request…' : 'Drafts and layout stay in this unlocked session.'}</span><button type="button" onClick={() => onOpenBrain()}>Open Brain ↗</button></footer>
  </section>;
}

function SourceChooser({ controls }: { controls: RoomControls }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => controls.objects.filter(object => `${object.title} ${object.kind} ${object.sourcePath || ''}`.toLowerCase().includes(query.toLowerCase())), [controls.objects, query]);
  const selected = useMemo(() => new Set(controls.room.selectedSourceIds), [controls.room.selectedSourceIds]);
  return <div className="pn-cw-source-chooser" data-chat-scroll>
    <label><span className="pn-sr">Filter sources for {controls.room.title}</span><input type="search" value={query} placeholder="Find a source…" onChange={event => setQuery(event.target.value)} /></label>
    <div>{matches.slice(0, 200).map(object => <label key={object.id}><input type="checkbox" checked={selected.has(object.id)} disabled={controls.busy}
      onChange={event => controls.onSource(object.id, event.target.checked)} /><span>{object.title}<small>{object.kind}</small></span></label>)}</div>
    {!controls.objects.length ? <p>No sources yet. Capture a note or connect a folder in your Brain.</p> : !matches.length ? <p>No matching sources.</p> : null}
    {matches.length > 200 ? <p>Showing 200 matching sources. Narrow your search.</p> : null}
  </div>;
}

function ContextPanel({ controls }: { controls: RoomControls }) {
  return <section className="pn-cw-companion pn-cw-context-panel" aria-label={`Context for ${controls.room.title}`}>
    <p className="pn-eyebrow">CONTEXT / {controls.selected.length} SELECTED</p><h2>Ground this conversation.</h2>
    <p>Only selected sources accompany a message. No source is selected automatically.</p>
    <div className="pn-cw-source-links">{controls.selected.slice(0, 8).map(object => <button type="button" key={object.id} onClick={() => controls.onOpenBrain(object.id)}>{object.title}<span>↗</span></button>)}</div>
    <SourceChooser controls={controls} /><button type="button" className="pn-cw-subtle" onClick={() => controls.onOpenBrain()}>Manage your Brain ↗</button>
  </section>;
}

function ProviderPanel({ controls }: { controls: RoomControls }) {
  const id = useId();
  return <section className="pn-cw-companion" aria-label={`Provider for ${controls.room.title}`}><p className="pn-eyebrow">EXECUTION / EXPLICIT REQUESTS</p><h2>{controls.provider?.name || controls.provider?.id || 'Choose a provider'}</h2>
    <label htmlFor={id}>Room provider</label><select id={id} value={controls.provider?.id || ''} disabled={controls.busy} onChange={event => controls.onProvider(event.target.value)}>
      {!controls.providers.length ? <option value="">No adapters</option> : null}{controls.providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name || provider.id}{provider.configured ? '' : ' · unavailable'}</option>)}
    </select><dl><dt>Model</dt><dd>{controls.provider?.model || 'Not configured'}</dd><dt>Adapter</dt><dd>{controls.provider?.configured ? 'Configured' : 'Unavailable'}</dd><dt>Boundary</dt><dd>{controls.provider?.external ? 'External · consent per send' : 'Local adapter'}</dd></dl>
    <p>Configured does not mean a model has run. Sending a message is a separate action; moving cards never calls a provider.</p><button type="button" onClick={() => controls.onNavigate('agents')}>Provider settings ↗</button>
  </section>;
}

function ReviewPanel({ pending, onNavigate }: { pending: Brain['proposals']; onNavigate: (panel: string) => void }) {
  return <section className="pn-cw-companion" aria-label="Memory review queue"><p className="pn-eyebrow">REVIEW / {pending.length} PENDING</p><h2>{pending.length ? 'Your approval is the gate.' : 'Nothing waiting for approval.'}</h2>
    <p>Conversation drafts do not become approved memory. Review proposals separately before promoting them.</p>
    {pending.slice(0, 3).map(proposal => <p className="pn-cw-review-title" key={proposal.id}>{proposal.title}</p>)}
    <button type="button" onClick={() => onNavigate('inbox')}>Open memory inbox ↗</button>
  </section>;
}

function RoomChat({ controls, focused = false }: { controls: RoomControls; focused?: boolean }) {
  const { room, selected, provider, draft, busy } = controls;
  const [messageOffset, setMessageOffset] = useState(0);
  const page = messagePage(room.messages, messageOffset);
  const transcript = useRef<HTMLDivElement>(null);
  const providerInputId = useId(); const messageInputId = useId();
  useEffect(() => { if (transcript.current && messageOffset === 0) transcript.current.scrollTop = transcript.current.scrollHeight; }, [room.messages.length, messageOffset]);
  return <article className={`pn-live-room${focused ? ' is-focused' : ''}${controls.active ? ' is-active' : ''}`}
    aria-label={`${room.title} chat`} onFocus={controls.onActivate} data-chat-scroll>
    <header><button type="button" onClick={controls.onActivate} aria-pressed={controls.active}><span aria-hidden="true">◌</span>{room.title}</button><small>{room.messages.length} messages</small></header>
    <details className="pn-cw-inline-context"><summary>{selected.length} selected sources <span>Choose context</span></summary><SourceChooser controls={controls} /></details>
    <div className="pn-cw-context-chips">{selected.length ? selected.slice(0, 10).map(object => <button type="button" key={object.id} title={object.sourcePath || object.title} onClick={() => controls.onOpenBrain(object.id)}>{object.title} ↗</button>) : <span>No sources selected</span>}{selected.length > 10 ? <span>+{selected.length - 10} more</span> : null}</div>
    {page.olderOffset !== null || page.newerOffset !== null ? <div className="pn-cw-message-paging"><button type="button" disabled={page.olderOffset === null} onClick={() => setMessageOffset(page.olderOffset || 0)}>Earlier</button><span>{page.start + 1}–{page.end} of {page.total}</span><button type="button" disabled={page.newerOffset === null} onClick={() => setMessageOffset(page.newerOffset || 0)}>Newer</button><button type="button" disabled={messageOffset === 0} onClick={() => setMessageOffset(0)}>Latest</button></div> : null}
    <div ref={transcript} className="pn-cw-transcript" aria-label={`${room.title} messages`} aria-live="polite" data-chat-scroll>
      {page.messages.length ? page.messages.map(message => <div key={message.id} className={`pn-cw-message pn-cw-message-${message.role}`}>
        <span>{message.role === 'user' ? 'YOU' : message.role.toUpperCase()}</span><p>{message.text}</p>
        {message.sourceIds?.length ? <div className="pn-cw-message-sources"><small>Context references</small>{message.sourceIds.map(id => <button type="button" key={id} onClick={() => controls.onOpenBrain(id)}>{controls.byId.get(id)?.title || id} ↗</button>)}</div> : null}
      </div>) : <div className="pn-cw-conversation-empty"><span aria-hidden="true">↗</span><h2>What are you working on?</h2><p>Bring a question, choose your sources, and begin. This room has its own context.</p></div>}
    </div>
    <form className="pn-cw-composer" onSubmit={event => { event.preventDefault(); void controls.onSend(); }}>
      <label className="pn-sr" htmlFor={providerInputId}>Agent provider for {room.title}</label><select id={providerInputId} value={provider?.id || ''} onChange={event => controls.onProvider(event.target.value)} disabled={busy}>
        {!controls.providers.length ? <option value="">No adapters available</option> : null}{controls.providers.map(item => <option key={item.id} value={item.id}>{item.name || item.id}{item.configured ? '' : ' · unavailable'}</option>)}
      </select>
      {!provider?.configured ? <p className="pn-cw-unavailable">{provider?.id === 'hermes' ? 'Hermes is unavailable in this beta.' : 'No configured adapter for this selection.'} Configure a supported provider to send.</p> : null}
      <label className="pn-sr" htmlFor={messageInputId}>Message {room.title}</label><textarea id={messageInputId} rows={3} maxLength={32000} value={draft.text} disabled={busy}
        placeholder="Ask about your selected sources…" onChange={event => controls.onText(event.target.value)} />
      {provider?.external ? <label className="pn-cw-consent"><input type="checkbox" checked={controls.consent} disabled={busy || !provider.configured} onChange={event => controls.onConsent(event.target.checked)} />
        <span>For this request, send only my current message and the {selected.length} selected sources to this provider. Chat history is not sent.</span></label>
        : <p className="pn-cw-request-note">This request uses your current message and selected sources, not chat history.</p>}
      <div className="pn-cw-send"><small>{provider?.model || 'No model configured'}</small><button type="submit" className="pn-primary" disabled={busy || !draft.text.trim() || !provider?.configured || (provider.external && !controls.consent)}>Send ↗</button></div>
    </form>
  </article>;
}

export default ChatWorkspace;
