import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Brain, BrainObject, MemoryLayer, PersonalNodeClient, Provider, Room } from './api';
import { SpatialCanvas } from './SpatialCanvas';
import type { SpatialCanvasItem, SpatialCanvasState, SpatialEdge } from './SpatialCanvas';
import { RoomGovernance } from './RoomGovernance';
import { AgentActivity } from './AgentActivity';
import { activityRuns, roomAskLayers, roomAuthorizationScope, runTone } from './agentActivityModel.mjs';
import { MAX_CANVAS_ROOMS, messagePage, preferredProvider, requestConsentScope, visibleRoomIds } from './chatWorkspaceModel.mjs';
import './ChatWorkspace.css';
import { useRunFeed } from './useRunFeed';
import type { RunProgress } from './api';

export type ChatWorkspaceProps = {
  client: PersonalNodeClient;
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
type RoomDraft = { text: string; providerId?: string; consentScope: string | null; askScope?: string | null; approvedLayerIds?: string[]; includeHistory?: boolean };
type Presentation = 'infinite' | 'radial' | 'multi';
type ChatRouting = {
  revision: string; activeId: string;
  connections: { id: string; name: string; model: string; enabled: boolean }[];
  rooms: { roomId: string; connectionId: string | null; providers: Provider[] }[];
};
const EMPTY_DRAFT: RoomDraft = { text: '', consentScope: null };
const EMPTY_SPATIAL: SpatialCanvasState = { camera: null, positions: {} };
type RoomControls = {
  routing: ChatRouting | null; connectionId: string | null; routingError: string;
  onConnection: (id: string) => void; onReloadRouting: () => void;
  liveRun?: RunProgress; liveConnected: boolean; onHistory: (value: boolean) => void;
  room: Room; objects: BrainObject[]; byId: Map<string, BrainObject>; selected: BrainObject[];
  providers: Provider[]; provider?: Provider; draft: RoomDraft; consent: boolean; busy: boolean; active: boolean;
  owner: boolean; canSend: boolean; blockedReason: string; effectiveCount: number; askLayers: MemoryLayer[]; approvedLayerIds: string[];
  onActivate: () => void; onText: (text: string) => void; onProvider: (id: string) => void;
  onConsent: (value: boolean) => void; onSource: (id: string, checked: boolean) => void;
  onAsk: (id: string, checked: boolean) => void;
  onSend: () => Promise<void>; onOpenBrain: (id?: string) => void; onNavigate: (panel: string) => void;
};

export function ChatWorkspace({ client, brain, providers, busy, act, activeRoomId, onActiveRoom, onOpenBrain,
  onNavigate, mode, visible = true, preferredProviders = {} }: ChatWorkspaceProps) {
  const [drafts, setDrafts] = useState<Record<string, RoomDraft>>({});
  const feed = useRunFeed(client, visible);
  const [roomTitle, setRoomTitle] = useState('');
  const [requestedRooms, setRequestedRooms] = useState<string[] | null>(null);
  const [presentation, setPresentation] = useState<Presentation>('infinite');
  const [layoutGeneration, setLayoutGeneration] = useState(0);
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
  const owner = brain.access?.kind !== 'member' && brain.access?.owner !== false;
  const [routing, setRouting] = useState<ChatRouting | null>(null);
  const [routingError, setRoutingError] = useState('');
  const [routingRefresh, setRoutingRefresh] = useState(0);
  const providerStateKey = JSON.stringify(providers);
  const roomIdsKey = JSON.stringify(brain.rooms.map(room => room.id));
  useEffect(() => {
    const controller = new AbortController();
    setRouting(null); setRoutingError('');
    if (owner && visible) void client.request<ChatRouting>('/v1/settings/chat-routing', 'GET', undefined, controller.signal)
      .then(value => { if (!controller.signal.aborted) setRouting(value); })
      .catch(error => { if (!controller.signal.aborted) setRoutingError(error instanceof Error ? error.message : 'Cannot verify chat connections'); });
    return () => controller.abort();
  }, [client, owner, visible, routingRefresh, providerStateKey, roomIdsKey]);
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
    setLayoutGeneration(previous => previous + 1);
    setDrafts(previous => {
      if (!Object.values(previous).some(draft => draft.consentScope !== null || draft.askScope)) return previous;
      return Object.fromEntries(Object.entries(previous).map(([id, draft]) => [id, { ...draft, consentScope: null, askScope: null, approvedLayerIds: [] }]));
    });
  }
  function controlsFor(room: Room): RoomControls {
    const draft = drafts[room.id] || EMPTY_DRAFT;
    const policy = brain.governance?.roomPolicies.find(policy => policy.roomId === room.id);
    const profile = brain.workspace?.agents.find(agent => agent.id === policy?.agentId);
    const route = routing?.rooms.find(item => item.roomId === room.id);
    // Keep adapter identity visible during refresh, but never allow a send using stale/default metadata.
    const roomProviders = owner ? route?.providers || providers.map(item => ({ ...item, configured: false, configurationKey: null })) : providers;
    const provider = preferredProvider(roomProviders, draft.providerId || preferredProviders[room.id] || profile?.providerId);
    const selected = room.selectedSourceIds.map(id => byId.get(id)).filter((object): object is BrainObject => Boolean(object));
    const resolved = brain.governance?.scopes?.find(scope => scope.roomId === room.id);
    const expectedContextKey = (resolved as { contextKey?: string } | undefined)?.contextKey;
    const askLayers = owner ? roomAskLayers(brain, room.id) : [];
    const baseScope = requestConsentScope({ room, objects: selected, provider, text: draft.text,
      presentation: `${presentationScope}:${roomAuthorizationScope(brain, room.id)}` });
    const approvedLayerIds = draft.askScope === baseScope ? draft.approvedLayerIds || [] : [];
    const scope = JSON.stringify([baseScope, approvedLayerIds, Boolean(draft.includeHistory)]);
    const memberGrant = policy?.memberGrants.find(grant => grant.memberId === brain.access?.memberId);
    const scopeReady = brain.governance ? Boolean(resolved?.canSend) : true;
    const asksReady = askLayers.every(layer => approvedLayerIds.includes(layer.id));
    const canSend = owner ? scopeReady && asksReady && Boolean(route)
      : Boolean(resolved?.canSend && (resolved.role || memberGrant?.role) === 'participant');
    const blockedReason = owner && !scopeReady
      ? `Sending blocked by the current room policy${resolved && !['none', 'active'].includes(resolved.manifestStatus) ? `: pinned context is ${resolved.manifestStatus}` : ''}. Review the context, member grants and assigned provider in room governance.`
      : owner && !asksReady ? 'Approve each ask layer for this request before sending.' : '';
    const clearConsent = { consentScope: null, askScope: null, approvedLayerIds: [] };
    return { room, objects: brain.objects, byId, selected, providers: roomProviders, provider, draft,
      routing, connectionId: route?.connectionId || null, routingError,
      onReloadRouting: () => setRoutingRefresh(value => value + 1),
      onConnection: id => {
        if (!owner || busy || !routing) return;
        const expectedRevision = routing.revision;
        updateDraft(room.id, { ...clearConsent, includeHistory: false }); setRouting(null);
        void act('Changing chat connection', current => current.request(`/v1/rooms/${encodeURIComponent(room.id)}/execution`, 'PUT', { connectionId: id || null, expectedRevision }),
          'Chat connection saved on this node. No model request was sent.').finally(() => setRoutingRefresh(value => value + 1));
      },
      liveRun: feed.runs.filter(run => run.roomId === room.id).slice(-1)[0], liveConnected: feed.connected,
      onHistory: includeHistory => updateDraft(room.id, { includeHistory, ...clearConsent }),
      consent: draft.consentScope === scope, busy, active: room.id === active?.id, owner, canSend, blockedReason,
      effectiveCount: resolved?.sourceIds.length ?? selected.length, askLayers, approvedLayerIds,
      onActivate: () => { if (activeRoomId !== room.id) activateRoom(room.id); },
      onText: text => updateDraft(room.id, { text, ...clearConsent }),
      onProvider: providerId => updateDraft(room.id, { providerId, ...clearConsent }),
      onConsent: value => updateDraft(room.id, { consentScope: value ? scope : null }),
      onAsk: (id, checked) => updateDraft(room.id, { askScope: baseScope,
        approvedLayerIds: checked ? [...approvedLayerIds, id] : approvedLayerIds.filter(value => value !== id), consentScope: null }),
      onSource: (id, checked) => {
        if (!owner) return;
        updateDraft(room.id, clearConsent);
        void act('Updating chat context', client => client.request(`/v1/rooms/${encodeURIComponent(room.id)}/sources`, 'PUT', {
          objectIds: checked ? [...new Set([...room.selectedSourceIds, id])] : room.selectedSourceIds.filter(source => source !== id),
        }));
      },
      onSend: async () => {
        if (busy || !draft.text.trim() || !canSend || (owner && (!provider?.configured || (provider.external && draft.consentScope !== scope)))) return;
        const text = draft.text;
        const allowExternal = Boolean(provider?.external && draft.consentScope === scope);
        updateDraft(room.id, clearConsent);
        const succeeded = await act(owner ? 'Running agent' : 'Requesting owner approval', client => client.request(`/v1/rooms/${encodeURIComponent(room.id)}/messages`, 'POST', owner ? {
          text, provider: provider!.id, model: provider!.model || undefined, allowExternal, approvedLayerIds, expectedContextKey, expectedProviderKey: provider!.configurationKey || undefined, includeHistory: Boolean(draft.includeHistory),
        } : { text, includeHistory: Boolean(draft.includeHistory) }));
        if (succeeded) setDrafts(previous => ({ ...previous, [room.id]: {
          ...(previous[room.id] || EMPTY_DRAFT), text: previous[room.id]?.text === text ? '' : previous[room.id]?.text || '', ...clearConsent, includeHistory: false,
        } }));
        else if (owner) setRoutingRefresh(value => value + 1);
      }, onOpenBrain, onNavigate,
    };
  }
  async function createRoom(event: FormEvent) {
    event.preventDefault();
    const title = roomTitle.trim(); if (!title || busy || !owner) return;
    await act('Creating chat', async client => {
      const room = await client.request<Room>('/v1/rooms', 'POST', { title });
      onActiveRoom(room.id); setRoomTitle('');
      setRequestedRooms(previous => visibleRoomIds([...brain.rooms, room], previous, room.id));
    });
  }
  const visibleControls = selectedRooms.map(controlsFor);
  const activeControls = active ? controlsFor(active) : null;
  const governanceFor = (roomId: string) => <div className="pn-cw-governance-card" data-chat-scroll><RoomGovernance brain={brain} roomId={roomId} busy={busy} act={act} onOpenBrain={onOpenBrain} /></div>;
  const activityFor = (roomId: string) => <AgentActivity brain={brain} providers={owner ? routing?.rooms.find(item => item.roomId === roomId)?.providers || [] : providers} roomId={roomId} compact busy={busy} act={act}
    scopeKey={`${presentationScope}:${layoutGeneration}`} onOpenBrain={onOpenBrain} onOpenRoom={activateRoom} />;
  const connectionsFor = (roomId: string, roomNode = roomId): SpatialEdge[] => {
    const run = activityRuns(brain, roomId)[0];
    const scope = brain.governance?.scopes?.find(scope => scope.roomId === roomId);
    const count = scope?.sourceIds.length ?? brain.rooms.find(room => room.id === roomId)?.selectedSourceIds.length ?? 0;
    return [{ source: `${roomId}:governance`, target: roomNode, label: `effective reads · ${count}`,
      detail: `Server-resolved room context. ${scope?.blocked.length || 0} selected sources currently blocked. Inspect governance for layer, member and manifest boundaries.`, status: 'neutral' },
    { source: roomNode, target: `${roomId}:activity`, label: run ? run.state === 'awaiting-approval' ? 'awaiting owner' : `request · ${run.state}` : 'recorded request history',
      detail: run ? `Latest recorded request: ${run.id}. This connection is derived from the stored roomId, not a delegation or permission.` : 'No request has been recorded for this room. This line only locates its activity inspector.', status: runTone(run?.state || '') }];
  };
  const infiniteItems: SpatialCanvasItem[] = visibleControls.flatMap((controls, index) => [
    { id: controls.room.id, title: controls.room.title, width: 500, initialPosition: { x: index * 1620, y: 0 }, content: <RoomChat controls={controls} /> },
    { id: `${controls.room.id}:governance`, title: 'Memory / context / access', width: 360, initialPosition: { x: index * 1620 - 490, y: 20 }, content: governanceFor(controls.room.id) },
    { id: `${controls.room.id}:activity`, title: 'Agent activity / recorded evidence', width: 380, initialPosition: { x: index * 1620 + 630, y: 0 }, content: activityFor(controls.room.id) },
  ]);
  const radialItems: SpatialCanvasItem[] = activeControls ? [
    { id: `${active.id}:chat`, title: active.title, width: 500, initialPosition: { x: 0, y: 0 }, content: <RoomChat controls={activeControls} /> },
    { id: `${active.id}:governance`, title: 'Memory / context / access', width: 360, initialPosition: { x: -470, y: 20 }, content: governanceFor(active.id) },
    { id: `${active.id}:activity`, title: 'Agent activity / recorded evidence', width: 380, initialPosition: { x: 620, y: 0 }, content: activityFor(active.id) },
    { id: `${active.id}:provider`, title: 'Next request provider', width: 310, initialPosition: { x: 620, y: 810 }, content: <ProviderPanel controls={activeControls} /> },
    ...(owner ? [{ id: `${active.id}:review`, title: 'Memory review · separate approval', width: 310, initialPosition: { x: -420, y: 680 }, content: <ReviewPanel pending={pending} onNavigate={onNavigate} /> }] : []),
  ] : [];

  return <section className={`pn-chat-workspace pn-chat-workspace-${mode}`} aria-label={mode === 'chat' ? 'Chat workspace' : 'Canvas workspace'}>
    <header className="pn-cw-heading"><div><p className="pn-eyebrow">{mode === 'chat' ? 'ONE CONVERSATION, CHOSEN CONTEXT' : 'ONE BRAIN, DIFFERENT PERSPECTIVES'}</p><h1>{mode === 'chat' ? 'Chat' : 'Canvas'}</h1></div>
      {owner ? <nav aria-label="Workspace shortcuts"><button type="button" onClick={() => onNavigate('library')}>Library</button><button type="button" onClick={() => onNavigate('inbox')}>Review{pending.length ? ` · ${pending.length}` : ''}</button><button type="button" onClick={() => onNavigate('audit')}>Audit</button></nav> : null}
    </header>
    <div className="pn-cw-room-bar">
      {brain.rooms.length ? <label className="pn-cw-active-room"><span className="pn-sr">Active chat room</span><select aria-label="Active chat room" value={active?.id || ''} onChange={event => activateRoom(event.target.value)}>
        {brain.rooms.map(room => <option key={room.id} value={room.id}>{room.title}</option>)}
      </select></label> : <span className="pn-cw-room-count">No rooms yet</span>}
      {owner ? <form onSubmit={event => void createRoom(event)} className="pn-cw-new-room"><label className="pn-sr" htmlFor={roomInputId}>New chat name</label><input id={roomInputId} value={roomTitle} maxLength={120} placeholder="Name a new chat…" onChange={event => setRoomTitle(event.target.value)} disabled={busy} required /><button type="submit" disabled={busy || !roomTitle.trim()}>＋ New</button></form> : <span className="pn-cw-room-count">Member view · room grants set by owner</span>}
      {mode === 'canvas' && brain.rooms.length ? <details className="pn-cw-picker"><summary>Rooms · {ids.length}</summary><div><p>Choose up to {MAX_CANVAS_ROOMS} live rooms. The active room stays visible.</p>{brain.rooms.map(room => <label key={room.id}><input type="checkbox" checked={idSet.has(room.id)} disabled={room.id === active?.id || (!idSet.has(room.id) && ids.length >= MAX_CANVAS_ROOMS)}
        onChange={event => setRequestedRooms(event.target.checked ? [...ids, room.id] : ids.filter(id => id !== room.id))} /><span>{room.title}{room.id === active?.id ? <small className="pn-cw-active-label">Active</small> : null}</span><button type="button" aria-label={`Activate ${room.title}`} onClick={() => activateRoom(room.id)}>Open</button></label>)}</div></details> : null}
    </div>
    {mode === 'canvas' ? <div className="pn-cw-view-bar"><div role="group" aria-label="Canvas presentation">
      <button type="button" aria-pressed={presentation === 'infinite'} onClick={() => setPresentation('infinite')}>Infinite</button>
      <button type="button" aria-pressed={presentation === 'radial'} onClick={() => setPresentation('radial')}>Radial</button>
      <button type="button" aria-pressed={presentation === 'multi'} onClick={() => setPresentation('multi')}>Multi-room</button>
    </div><span>{compact ? 'Compact screen · focused room' : 'Live rooms. Layout never changes their context.'}</span></div> : null}

    {!brain.rooms.length ? <div className="pn-cw-empty"><span aria-hidden="true">↗</span><h2>{owner ? 'Start with a conversation.' : 'No room access yet.'}</h2><p>{owner ? 'Create a room above, choose the sources it can use, then send your first message. A new room starts with no selected sources.' : 'Ask the owner to grant this membership access to a room. A member credential alone grants no room or source access.'}</p>{owner ? <div><button type="button" onClick={() => onOpenBrain()}>Open your Brain</button><button type="button" onClick={() => onNavigate('agents')}>Check providers</button></div> : null}</div>
      : mode === 'chat' || compact ? <div className="pn-cw-focused">{activeControls ? <div className="pn-cw-focused-room"><RoomChat key={activeControls.room.id} controls={activeControls} focused /><details className="pn-cw-mobile-inspector"><summary>Inspect room context, access and activity</summary>{governanceFor(activeControls.room.id)}{activityFor(activeControls.room.id)}</details></div> : null}<aside className="pn-cw-focused-context">{activeControls ? <>{governanceFor(activeControls.room.id)}{activityFor(activeControls.room.id)}</> : null}{owner ? <ReviewPanel pending={pending} onNavigate={onNavigate} /> : null}</aside></div>
      : presentation === 'radial' ? <SpatialCanvas key="radial" items={radialItems} state={spatial.radial}
        edges={active ? connectionsFor(active.id, `${active.id}:chat`) : []} onChange={next => saveSpatial('radial', next)} ariaLabel="Radial chat canvas" />
      : !visibleControls.length ? <div className="pn-cw-empty"><h2>Choose rooms to see them here.</h2><p>Open the room picker above. Your conversations and drafts are still saved in this session.</p><button type="button" onClick={() => setRequestedRooms(null)}>Show available rooms</button></div>
      : presentation === 'multi' ? <div className="pn-cw-multi" data-chat-scroll>{visibleControls.map(controls => <section key={controls.room.id} className="pn-cw-multi-row" aria-label={`${controls.room.title} workspace`}>
        <div className="pn-cw-flow-column"><p className="pn-cw-flow-label">Memory / policy <span>effective reads →</span></p>{governanceFor(controls.room.id)}</div><div className="pn-cw-flow-column"><p className="pn-cw-flow-label">{controls.room.title} <span>recorded requests →</span></p><RoomChat controls={controls} /></div><div className="pn-cw-flow-column"><p className="pn-cw-flow-label">Agent activity / evidence</p>{activityFor(controls.room.id)}<ProviderPanel controls={controls} /></div>
      </section>)}</div>
      : <SpatialCanvas key="infinite" items={infiniteItems} state={spatial.infinite}
        edges={visibleControls.flatMap(controls => connectionsFor(controls.room.id))} onChange={next => saveSpatial('infinite', next)} ariaLabel="Infinite chat canvas" />}
    <footer className="pn-cw-footer"><span>{busy ? '● Working on your request…' : 'Drafts and layout stay in this unlocked session.'}</span><button type="button" onClick={() => onOpenBrain()}>Open Brain ↗</button></footer>
  </section>;
}

function SourceChooser({ controls }: { controls: RoomControls }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => controls.objects.filter(object => `${object.title} ${object.kind} ${object.sourcePath || ''}`.toLowerCase().includes(query.toLowerCase())), [controls.objects, query]);
  const selected = useMemo(() => new Set(controls.room.selectedSourceIds), [controls.room.selectedSourceIds]);
  return <div className="pn-cw-source-chooser" data-chat-scroll>
    <label><span className="pn-sr">Filter sources for {controls.room.title}</span><input type="search" value={query} placeholder="Find a source…" onChange={event => setQuery(event.target.value)} /></label>
    <div>{matches.slice(0, 200).map(object => <label key={object.id}><input type="checkbox" checked={selected.has(object.id)} disabled={controls.busy || !controls.owner}
      onChange={event => controls.onSource(object.id, event.target.checked)} /><span>{object.title}<small>{object.kind}</small></span></label>)}</div>
    {!controls.objects.length ? <p>No sources yet. Capture a note or connect a folder in your Brain.</p> : !matches.length ? <p>No matching sources.</p> : null}
    {matches.length > 200 ? <p>Showing 200 matching sources. Narrow your search.</p> : null}
    {!controls.owner ? <p>Source selection and grants are managed by the owner. Only permitted sources are shown.</p> : null}
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
    <label htmlFor={id}>Room provider</label><select id={id} value={controls.provider?.id || ''} disabled={controls.busy || !controls.owner} onChange={event => controls.onProvider(event.target.value)}>
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

function ChatConnectionPicker({ controls }: { controls: RoomControls }) {
  const inputId = useId();
  if (!controls.owner) return null;
  if (controls.routingError) return <div role="alert"><p>{controls.routingError}</p><button type="button" onClick={controls.onReloadRouting}>Reload chat connections</button></div>;
  if (!controls.routing) return <p role="status">Verifying chat connection…</p>;
  const current = controls.routing.connections.find(item => item.id === (controls.connectionId || controls.routing?.activeId));
  return <div className="pn-cw-connection"><label htmlFor={inputId}>Model connection for {controls.room.title}</label>
    <select id={inputId} value={controls.connectionId || ''} disabled={controls.busy} onChange={event => controls.onConnection(event.target.value)}>
      <option value="">Follow node default</option>
      {controls.routing.revision !== 'environment' ? controls.routing.connections.map(item => <option key={item.id} value={item.id} disabled={!item.enabled}>{item.name} · {item.model}{item.enabled ? '' : ' · disabled'}</option>) : null}
    </select>
    <p className="pn-cw-request-note">{controls.connectionId ? 'Pinned to this chat on this node' : 'Follows node default'} · {current?.name} · {current?.model || 'No model'}. Selection sends nothing; source permissions stay unchanged.</p>
  </div>;
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
    <details className="pn-cw-inline-context"><summary>{selected.length} selected sources · {controls.effectiveCount} effective <span>{controls.owner ? 'Choose context' : 'Permitted context'}</span></summary><SourceChooser controls={controls} /></details>
    <div className="pn-cw-context-chips">{selected.length ? selected.slice(0, 10).map(object => <button type="button" key={object.id} title={object.sourcePath || object.title} onClick={() => controls.onOpenBrain(object.id)}>{object.title} ↗</button>) : <span>No sources selected</span>}{selected.length > 10 ? <span>+{selected.length - 10} more</span> : null}</div>
    {page.olderOffset !== null || page.newerOffset !== null ? <div className="pn-cw-message-paging"><button type="button" disabled={page.olderOffset === null} onClick={() => setMessageOffset(page.olderOffset || 0)}>Earlier</button><span>{page.start + 1}–{page.end} of {page.total}</span><button type="button" disabled={page.newerOffset === null} onClick={() => setMessageOffset(page.newerOffset || 0)}>Newer</button><button type="button" disabled={messageOffset === 0} onClick={() => setMessageOffset(0)}>Latest</button></div> : null}
    <div ref={transcript} className="pn-cw-transcript" aria-label={`${room.title} messages`} aria-live="polite" data-chat-scroll>
      {page.messages.length ? page.messages.map(message => <div key={message.id} className={`pn-cw-message pn-cw-message-${message.role}`}>
        <span>{message.role === 'user' ? 'YOU' : message.role.toUpperCase()}</span><p>{message.text}</p>
        {message.sourceIds?.length ? <div className="pn-cw-message-sources"><small>Context references</small>{message.sourceIds.map(id => <button type="button" key={id} onClick={() => controls.onOpenBrain(id)}>{controls.byId.get(id)?.title || id} ↗</button>)}</div> : null}
      </div>) : <div className="pn-cw-conversation-empty"><span aria-hidden="true">↗</span><h2>What are you working on?</h2><p>Bring a question, choose your sources, and begin. This room has its own context.</p></div>}
    </div>
    <div className="pn-cw-run-progress" role="status" aria-label={`Live run status for ${room.title}`}>
      <span>{controls.liveConnected ? '● Live activity' : '○ Activity reconnecting'}</span>
      <span>{controls.liveConnected && controls.liveRun ? `${controls.liveRun.state.replace(/-/g, ' ')} · ${controls.liveRun.events.slice(-1)[0]?.type || 'recorded'}` : controls.liveConnected ? 'No recent request in this room' : 'No verified live status'}</span>
    </div>
    <form className="pn-cw-composer" onSubmit={event => { event.preventDefault(); void controls.onSend(); }}>
      <ChatConnectionPicker controls={controls} />
      {controls.owner ? <><label className="pn-sr" htmlFor={providerInputId}>Agent provider for {room.title}</label><select id={providerInputId} value={provider?.id || ''} onChange={event => controls.onProvider(event.target.value)} disabled={busy}>
        {!controls.providers.length ? <option value="">No adapters available</option> : null}{controls.providers.map(item => <option key={item.id} value={item.id}>{item.name || item.id}{item.configured ? '' : ' · unavailable'}</option>)}
      </select></> : <p className="pn-cw-request-note">{controls.canSend ? 'Participant · your request must be approved by the owner before any provider runs.' : 'Requests are unavailable for this grant or current room context. Ask the owner to review your access.'}</p>}
      {controls.blockedReason ? <p className="pn-cw-unavailable">{controls.blockedReason}</p> : null}
      {controls.owner && !provider?.configured ? <p className="pn-cw-unavailable">{provider?.id === 'hermes' ? 'Hermes is unavailable in this beta.' : 'No configured adapter for this selection.'} Configure a supported provider to send.</p> : null}
      <label className="pn-sr" htmlFor={messageInputId}>Message {room.title}</label><textarea id={messageInputId} rows={3} maxLength={32000} value={draft.text} disabled={busy}
        placeholder="Ask about your selected sources…" onChange={event => controls.onText(event.target.value)} />
      <label className="pn-cw-consent"><input type="checkbox" checked={Boolean(draft.includeHistory)} disabled={busy} onChange={event => controls.onHistory(event.target.checked)} /><span>Include eligible conversation history for this request. Up to 8 of your completed turns in this room (32,000 characters), only with matching permissions, source revisions and connection.</span></label>
      {controls.askLayers.length ? <div className="pn-cw-ask-layers">{controls.askLayers.map(layer => <label key={layer.id} className="pn-cw-consent"><input type="checkbox" checked={controls.approvedLayerIds.includes(layer.id)} disabled={busy} onChange={event => controls.onAsk(layer.id, event.target.checked)} /><span>Allow ask layer “{layer.name}” for this request only.</span></label>)}</div> : null}
      {controls.owner && provider?.external ? <label className="pn-cw-consent"><input type="checkbox" checked={controls.consent} disabled={busy || !provider.configured || !controls.canSend} onChange={event => controls.onConsent(event.target.checked)} />
        <span>For this request, send my current message and permitted selected sources to this provider. {selected.length} selected; layer and manifest checks still apply. {draft.includeHistory ? 'Eligible conversation history will also be sent; the receipt records the exact turns.' : 'Chat history is not sent.'}</span></label>
        : controls.owner ? <p className="pn-cw-request-note">This request uses your current message and permitted selected sources, not chat history.</p> : null}
      <div className="pn-cw-send"><small>{controls.owner ? provider?.model || 'No model configured' : 'No provider call until owner approval'}</small><button type="submit" className="pn-primary" disabled={busy || !draft.text.trim() || !controls.canSend || (controls.owner && (!provider?.configured || (provider.external && !controls.consent)))}>{controls.owner ? 'Send ↗' : 'Request owner approval'}</button></div>
    </form>
  </article>;
}

export default ChatWorkspace;
