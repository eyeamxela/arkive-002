import { useMemo, useRef, useState } from 'react';
import type { AgentRun, Brain, PersonalNodeClient, Provider } from './api';
import { SpatialCanvas } from './SpatialCanvas';
import { ACTIVITY_RUN_LIMIT, activityNetwork, activityRuns, roomAskLayers, runApprovalScope, runTone } from './agentActivityModel.mjs';
import './AgentActivity.css';

export type AgentActivityProps = {
  brain: Brain; providers: Provider[]; busy: boolean;
  roomProviders?: Record<string, Provider[]>;
  act: (label: string, work: (client: PersonalNodeClient) => Promise<unknown>, success?: string) => Promise<boolean>;
  roomId?: string | null; compact?: boolean; scopeKey?: string;
  onOpenBrain?: (id?: string) => void; onOpenRoom?: (id: string) => void;
};
const when = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded';
const stateLabel = (state: string) => state.replace(/-/g, ' ');
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function AgentActivity(props: AgentActivityProps) {
  const { brain, roomId, compact = false, scopeKey = '' } = props;
  const [view, setView] = useState<'network' | 'list'>('network');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const runs = useMemo(() => activityRuns(brain, roomId, filter), [brain.governance?.runs, roomId, filter]);
  const network = useMemo(() => activityNetwork(brain, roomId, filter), [brain.rooms, brain.governance, brain.workspace, roomId, filter]);
  const selected = runs.find(run => run.id === selectedId);
  const needsAttention = (run: AgentRun) => run.state === 'awaiting-approval' || run.state === 'running';
  const shown = (compact ? [...runs.filter(needsAttention), ...runs.filter(run => !needsAttention(run))] : runs).slice(0, compact ? 4 : ACTIVITY_RUN_LIMIT);
  const roomTitle = (id: string) => brain.rooms.find(room => room.id === id)?.title || 'Visible room';
  return <section className={`pn-activity${compact ? ' is-compact' : ''}`} aria-label={roomId ? `Activity for ${roomTitle(roomId)}` : 'Agent activity'} data-chat-scroll>
    <header className="pn-activity-heading"><div><p className="pn-eyebrow">RECORDED REQUESTS / EVIDENCE</p><h2>{compact ? 'What this room is doing' : 'Agent activity'}</h2></div><span className="pn-count">{runs.length}</span></header>
    <p className="pn-activity-boundary">{brain.access?.kind === 'member' ? 'Only activity shared with your membership is shown. Requests wait for the owner; submitting one does not call a model.' : 'Real room requests and their recorded inputs and results. Assignments are not background workers; lines do not grant access.'}</p>
    {!compact ? <div className="pn-activity-tools"><div role="group" aria-label="Activity view"><button aria-pressed={view === 'network'} onClick={() => { setView('network'); setSelectedId(null); }}>Network</button><button aria-pressed={view === 'list'} onClick={() => { setView('list'); setSelectedId(null); }}>List</button></div>
      <label><span className="pn-sr">Filter activity state</span><select value={filter} onChange={event => { setFilter(event.target.value); setSelectedId(null); }}>{['all', 'awaiting-approval', 'running', 'completed', 'failed', 'rejected'].map(state => <option key={state} value={state}>{stateLabel(state)}</option>)}</select></label></div> : null}
    {!compact && view === 'network' ? <div className="pn-activity-network">
      <SpatialCanvas ariaLabel="Recorded agent activity network" showHandles={false} onChange={() => setLayoutVersion(version => version + 1)} edges={network.edges} items={network.nodes.map(node => ({
        id: node.id, title: node.title, width: node.width, initialPosition: { x: node.x, y: node.y },
        content: <article className={`pn-activity-node is-${node.status || 'neutral'}`}><span>{node.kind}</span><h3>{node.title}</h3><p>{node.detail}</p>
          {node.runId ? <button onClick={() => { setFilter('all'); setSelectedId(node.runId!); }}>Inspect request →</button> : props.onOpenRoom ? <button onClick={() => props.onOpenRoom?.(node.roomId)}>Open room →</button> : null}
        </article>,
      }))} />
      {network.omittedRooms ? <p className="pn-activity-boundary">Network shows six rooms and three latest requests per room. Use the list for more recorded requests.</p> : null}
    </div> : null}
    {!runs.length ? <p className="pn-activity-empty">{filter === 'all' ? 'No requests recorded yet. Choose context and send from this room to create an evidence trail.' : 'No requests in this state.'}</p> : <div className="pn-activity-log" aria-label="Recorded request list">{shown.map(run => <button type="button" key={run.id} aria-pressed={selected?.id === run.id} className={`pn-activity-row is-${runTone(run.state)}`} onClick={() => setSelectedId(previous => previous === run.id ? null : run.id)}>
      <span className="pn-activity-state">{stateLabel(run.state)}</span><strong>{run.prompt?.slice(0, compact ? 100 : 180) || 'Recorded request'}</strong><span>{roomTitle(run.roomId)} · {when(run.createdAt)}</span>
    </button>)}</div>}
    {runs.length > shown.length ? <p className="pn-activity-boundary">Showing {shown.length} of {runs.length} requests.{compact ? ' Open Agents for the full activity list.' : ' Filter by state to narrow the list.'}</p> : null}
    {selected ? <RunInspector key={`${selected.id}:${scopeKey}:${view}:${layoutVersion}`} {...props} run={selected} /> : null}
  </section>;
}

function RunInspector({ brain, providers, roomProviders, run, busy, act, onOpenBrain, onOpenRoom }: AgentActivityProps & { run: AgentRun }) {
  const provider = (roomProviders ? roomProviders[run.roomId] || [] : providers).find(item => item.id === run.providerId);
  const owner = brain.access?.kind !== 'member' && brain.access?.owner !== false;
  const baseScope = runApprovalScope(brain, run, provider);
  const [asks, setAsks] = useState<{ scope: string; ids: string[] }>({ scope: '', ids: [] });
  const [consent, setConsent] = useState<string | null>(null);
  const [pruneConfirmed, setPruneConfirmed] = useState(false);
  const [bindingPage, setBindingPage] = useState(0);
  const submitting = useRef(false);
  const approvedLayerIds = asks.scope === baseScope ? asks.ids : [];
  const scope = runApprovalScope(brain, run, provider, approvedLayerIds);
  const askLayers = roomAskLayers(brain, run.roomId, run.bindings);
  const asksReady = askLayers.every(layer => approvedLayerIds.includes(layer.id));
  const consented = consent === scope;
  const ready = owner && run.state === 'awaiting-approval' && provider?.configured && asksReady && (!provider.external || consented);
  const profile = brain.workspace?.agents.find(agent => agent.id === run.agentId);
  const task = brain.workspace?.tasks.find(task => task.id === run.taskId);
  const principal = run.principalId === 'owner' ? 'Owner' : brain.governance?.members.find(member => member.id === run.principalId)?.name || run.principalId || 'Redacted';
  const canPrune = owner && run.principalId && run.principalId !== 'owner' && ['completed', 'failed', 'rejected'].includes(run.state);
  const revisions = useMemo(() => new Map(brain.revisions.map(value => { const revision = record(value); return [String(revision.id || ''), revision]; })), [brain.revisions]);
  const bindings = run.bindings || [];
  const start = Math.min(bindingPage * 20, Math.max(0, bindings.length - 1));
  async function decide(approve: boolean) {
    if (busy || submitting.current || !owner || run.state !== 'awaiting-approval' || (approve && !ready)) return;
    submitting.current = true; setConsent(null); setAsks({ scope: '', ids: [] });
    try {
      await act(approve ? 'Approving this recorded request' : 'Rejecting this recorded request', client => client.request(`/v1/runs/${encodeURIComponent(run.id)}/${approve ? 'approve' : 'reject'}`, 'POST', approve ? {
        allowExternal: Boolean(provider?.external && consented), approvedLayerIds,
      } : {}), approve ? 'Request approved. Its recorded state reports the execution outcome.' : 'Request rejected. No model call authorized.');
    } finally { submitting.current = false; }
  }
  async function prune() {
    if (busy || submitting.current || !canPrune || !pruneConfirmed) return;
    submitting.current = true; setPruneConfirmed(false);
    try {
      await act('Removing this member request receipt', client => client.request('/v1/runs/prune', 'POST', { runIds: [run.id], confirm: true }), 'Receipt and associated messages removed. Audit evidence remains.');
    } finally { submitting.current = false; }
  }
  return <section className="pn-run-inspector" aria-label="Request evidence inspector">
    <header><h3>Inputs, result and events</h3><span className={`pn-activity-state is-${runTone(run.state)}`}>{stateLabel(run.state)}</span></header>
    <dl><dt>Request</dt><dd>{run.id}</dd><dt>Requested by</dt><dd>{principal}</dd><dt>Profile</dt><dd>{profile?.name || run.agentId || 'No profile recorded'}</dd><dt>Task</dt><dd>{task?.title || run.taskId || 'No task recorded'}</dd><dt>Provider</dt><dd>{run.providerId || 'Redacted'} · {run.model || 'Model not recorded'}</dd><dt>Manifest</dt><dd>{run.manifestId || 'No pinned manifest recorded'}</dd><dt>Created</dt><dd>{when(run.createdAt)}</dd><dt>Updated</dt><dd>{when(run.updatedAt)}</dd></dl>
    {onOpenRoom ? <button type="button" onClick={() => onOpenRoom(run.roomId)}>Open this room →</button> : null}
    <h4>What was requested</h4><p className="pn-run-text">{run.prompt || 'Request text is unavailable in this view.'}</p>
    <h4>Conversation context · {run.conversation?.runIds.length ?? run.conversationTurns ?? 0} prior turns</h4>
    <p className="pn-activity-boundary">History is never Canon. Only completed turns by the same requester, with identical room authority, source revisions and model connection, can be reused.</p>
    {owner && run.conversation ? <><p className="pn-activity-boundary">Session boundary: {run.conversation.sessionKey} · {run.conversation.characters} serialized characters</p>{run.conversation.runIds.map(id => { const prior = brain.governance?.runs.find(item => item.id === id); return <details className="pn-run-binding" key={id}><summary>Prior turn · {id}</summary>{prior ? <><h4>User</h4><pre>{prior.prompt}</pre><h4>Assistant · unverified</h4><pre>{prior.result}</pre></> : <p>Receipt unavailable. Pending approvals referencing it cannot run.</p>}</details>; })}</> : null}
    <h4>Exact source revisions · {bindings.length}</h4>
    {!run.bindings ? <p className="pn-activity-boundary">Source-revision details are redacted for this membership.</p> : !bindings.length ? <p className="pn-activity-boundary">No source inputs recorded for this request.</p> : bindings.slice(start, start + 20).map(binding => {
      const object = brain.objects.find(item => item.id === binding.sourceId);
      const revision = revisions.get(binding.revisionId);
      const snapshot = revision?.objectId === binding.sourceId && typeof revision.text === 'string' ? revision.text : null;
      return <details className="pn-run-binding" key={`${binding.sourceId}:${binding.revisionId}`}><summary>{object?.title || binding.sourceId}<small>{binding.revisionId}</small></summary>
        <p className="pn-activity-boundary">{object?.revisionId === binding.revisionId ? 'This is the current source revision.' : 'Pinned input; the source may now have a different revision.'}</p>
        {snapshot !== null ? <pre>{snapshot}</pre> : <p className="pn-activity-boundary">This view does not include the pinned source text.</p>}
        {onOpenBrain ? <button type="button" onClick={() => onOpenBrain(binding.sourceId)}>Open source · current revision →</button> : null}
      </details>;
    })}
    {bindings.length > 20 ? <div className="pn-run-paging"><button disabled={bindingPage === 0} onClick={() => setBindingPage(page => Math.max(0, page - 1))}>Previous inputs</button><span>{start + 1}–{Math.min(start + 20, bindings.length)} of {bindings.length}</span><button disabled={start + 20 >= bindings.length} onClick={() => setBindingPage(page => page + 1)}>Next inputs</button></div> : null}
    <h4>What happened</h4><p className="pn-run-text">{run.result || run.error || (run.state === 'awaiting-approval' ? 'Waiting for the owner. No provider execution authorized yet.' : run.state === 'running' ? 'The node recorded this request as running. No completion result is recorded yet.' : 'No result text is recorded.')}</p>
    <ol className="pn-run-events">{(run.events || []).slice(-40).map((event, index) => <li key={`${event.type}:${event.at}:${index}`}><strong>{event.type}</strong><time>{when(event.at)}</time></li>)}</ol>
    {canPrune ? <details className="pn-run-approval"><summary>Member request retention</summary><p>Pruning frees member-request capacity. It permanently removes this receipt, its result, and its associated chat messages from this Brain. Existing audit events and a pruning record remain; downloaded copies and earlier backups are unaffected.</p><label><input type="checkbox" checked={pruneConfirmed} disabled={busy} onChange={event => setPruneConfirmed(event.target.checked)} /><span>I reviewed this member request and want to remove its receipt and messages.</span></label><button type="button" disabled={busy || !pruneConfirmed} onClick={() => void prune()}>Prune member request</button></details> : null}
    {owner && run.state === 'awaiting-approval' ? <div className="pn-run-approval"><h4>Owner approval · this request only</h4><p>Review the stored prompt, pinned inputs and provider before authorizing execution. This is separate from approving memory.</p>
      {askLayers.map(layer => <label key={layer.id}><input type="checkbox" checked={approvedLayerIds.includes(layer.id)} disabled={busy} onChange={event => {
        setAsks({ scope: baseScope, ids: event.target.checked ? [...approvedLayerIds, layer.id] : approvedLayerIds.filter(id => id !== layer.id) }); setConsent(null);
      }} /><span>Allow ask layer “{layer.name}” for this request only.</span></label>)}
      {provider?.external ? <label><input type="checkbox" checked={consented} disabled={busy || !provider.configured || !asksReady} onChange={event => setConsent(event.target.checked ? scope : null)} /><span>For this stored request, send its prompt, {bindings.length} pinned source inputs and {run.conversation?.runIds.length ?? 0} pinned prior turns to {provider.name || provider.id}.</span></label> : null}
      {!provider?.configured ? <p className="pn-activity-boundary">The recorded provider is not configured. Approval cannot execute it.</p> : null}
      <div><button type="button" className="pn-primary" disabled={busy || !ready} onClick={() => void decide(true)}>Approve this request</button><button type="button" disabled={busy} onClick={() => void decide(false)}>Reject request</button></div>
    </div> : null}
  </section>;
}

export default AgentActivity;
