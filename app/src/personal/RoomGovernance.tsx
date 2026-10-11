import { useRef, useState, type ReactNode } from 'react';
import type { Brain, BrainMember, BrainObject, MemoryLayer, PersonalNodeClient, Room, RoomMemberGrant, RoomPolicy } from './api';
import './RoomGovernance.css';

type GovernanceAction = (label: string, action: (client: PersonalNodeClient) => Promise<unknown>, success?: string) => Promise<boolean>;
type BaseProps = { brain: Brain; busy: boolean; act: GovernanceAction };
export type RoomGovernanceProps = BaseProps & { roomId: string | null; onOpenBrain: (id?: string) => void };
export type AccessManagementProps = BaseProps & { onOpenBrain?: (id?: string) => void };

function useGovernanceAction(props: BaseProps) {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const run: GovernanceAction = async (label, action, success) => {
    if (props.busy || locked.current) return false;
    locked.current = true; setPending(true);
    try { return await props.act(label, action, success); }
    finally { locked.current = false; setPending(false); }
  };
  return { run, busy: props.busy || pending };
}

function timestamp(value?: string) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid timestamp' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function validateText(value: string, limit: number, label: string) {
  if (new TextEncoder().encode(value).byteLength > limit) throw new Error(`${label} must fit within ${limit.toLocaleString()} UTF-8 bytes.`);
}
function validateSources(ids: string[]) {
  if (ids.length > 1000) throw new Error('Choose at most 1,000 sources. No sources were silently removed.');
}

function GovernanceSection({ title, count, open = false, children }: { title: string; count?: number; open?: boolean; children: ReactNode }) {
  return <details className="pn-rg-section" open={open}>
    <summary><span>{title}</span>{count !== undefined && <span className="pn-rg-count">{count}</span>}</summary>
    <div className="pn-rg-section-body">{children}</div>
  </details>;
}

function GovernanceSourcePicker({ objects, selected, onChange, busy, label }: { objects: BrainObject[]; selected: string[]; onChange: (ids: string[]) => void; busy: boolean; label: string }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(80);
  const ids = new Set(selected);
  const present = new Set(objects.map(object => object.id));
  const filtered = objects.filter(object => `${object.title} ${object.kind} ${object.sourcePath || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <fieldset className="pn-rg-source-picker" disabled={busy}>
    <legend>{label} <span>{selected.length} selected</span></legend>
    <label><span className="pn-sr">Filter {label.toLowerCase()}</span><input type="search" placeholder="Find a source…" value={query} onChange={event => { setQuery(event.target.value); setLimit(80); }} /></label>
    <div className="pn-rg-source-options">{filtered.slice(0, limit).map(object => <label className="pn-check" key={object.id}>
      <input type="checkbox" checked={ids.has(object.id)} disabled={selected.length >= 1000 && !ids.has(object.id)} onChange={event => onChange(event.target.checked ? [...new Set([...selected, object.id])] : selected.filter(id => id !== object.id))} />
      <span>{object.title}<small>{object.kind}</small></span>
    </label>)}{!filtered.length && <p className="pn-fine">{objects.length ? 'No matching sources.' : 'No sources available.'}</p>}</div>
    {filtered.length > limit && <button type="button" onClick={() => setLimit(value => value + 80)}>Show more sources</button>}
    {selected.filter(id => !present.has(id)).map(id => <label key={id} className="pn-check pn-rg-warning"><input type="checkbox" checked onChange={() => onChange(selected.filter(value => value !== id))} /><span>Unavailable reference<small>{id}</small></span></label>)}
    <p className="pn-fine">Explicit selection · at most 1,000 sources.</p>
  </fieldset>;
}

function SourceReferences({ sourceIds, brain, onOpenBrain }: { sourceIds: string[]; brain: Brain; onOpenBrain?: (id?: string) => void }) {
  const byId = new Map(brain.objects.map(object => [object.id, object]));
  return <details className="pn-rg-references"><summary>{sourceIds.length} source{sourceIds.length === 1 ? '' : 's'}</summary><div>{sourceIds.map(id => {
    const object = byId.get(id);
    return object && onOpenBrain ? <button type="button" key={id} onClick={() => onOpenBrain(id)}>{object.title} ↗</button> : <span key={id}>{object?.title || 'Unavailable source'}</span>;
  })}{!sourceIds.length && <p className="pn-fine">No source access is implied.</p>}</div></details>;
}

const isOwner = (brain: Brain) => brain.access?.kind !== 'member' && brain.access?.owner !== false;
const roomPath = (roomId: string) => `/v1/rooms/${encodeURIComponent(roomId)}`;
const BLOCK_REASONS: Record<string, string> = {
  'excluded-layer': 'An attached layer excludes this source.',
  'outside-agent-profile': 'This source is outside the assigned agent profile’s source boundary.',
  'excluded-evidence': 'Required supporting evidence is outside the permitted selection.',
  'not-allowed-to-all-room-members': 'Not every active room member is permitted to see this source. Shared execution is blocked.',
};
function policyBody(policy: RoomPolicy | undefined) {
  return { agentId: policy?.agentId || null, taskId: policy?.taskId || null, layerIds: policy?.layerIds || [],
    memberGrants: policy?.memberGrants || [], activeManifestId: policy?.activeManifestId || null };
}

/** Key the inspector by identity and room so privileged drafts cannot cross sessions. */
export function RoomGovernance(props: RoomGovernanceProps) {
  const room = props.brain.rooms.find(item => item.id === props.roomId);
  if (!room) return <aside className="pn-rg" aria-label="Room governance"><p className="pn-rg-empty">Choose a room to inspect its context and access.</p></aside>;
  return <RoomGovernanceContent key={`${props.brain.brainId}:${props.brain.access?.memberId || 'owner'}:${room.id}`} {...props} room={room} />;
}

function RoomGovernanceContent(props: RoomGovernanceProps & { room: Room }) {
  const { brain, room, onOpenBrain } = props;
  const owner = isOwner(brain);
  const { run, busy } = useGovernanceAction(props);
  const layers = brain.governance?.layers || [];
  const policy = brain.governance?.roomPolicies.find(item => item.roomId === room.id);
  const scope = brain.governance?.scopes?.find(item => item.roomId === room.id);
  const attached = layers.filter(layer => policy?.layerIds.includes(layer.id));
  const ownGrant = policy?.memberGrants.find(grant => grant.memberId === brain.access?.memberId);
  const role = scope?.role || ownGrant?.role;
  const [layerDraft, setLayerDraft] = useState<Pick<MemoryLayer, 'name' | 'description' | 'mode' | 'sourceIds'> & { id?: string; expectedLayerKey?: string } | null>(null);
  const [grantDraft, setGrantDraft] = useState<(RoomMemberGrant & { expectedContextKey?: string }) | null>(null);
  const [removeMember, setRemoveMember] = useState<string | null>(null);
  const layerDraftChanged = Boolean(layerDraft?.id && (layerDraft.expectedLayerKey !== layers.find(layer => layer.id === layerDraft.id)?.versionKey || !layers.some(layer => layer.id === layerDraft.id)));
  const grantDraftChanged = Boolean(grantDraft && grantDraft.expectedContextKey !== scope?.contextKey);
  const byId = new Map(brain.objects.map(object => [object.id, object]));
  const selectedIds = [...new Set([...room.selectedSourceIds, ...(scope?.sourceIds || []), ...(scope?.blocked.map(item => item.sourceId) || [])])];
  const savePolicy = (patch: Partial<ReturnType<typeof policyBody>>, label: string, expectedContextKey = scope?.contextKey) => run(label,
    client => { const body = { ...policyBody(policy), ...patch }; return client.request(`${roomPath(room.id)}/policy`, 'PUT', {
      ...body, expectedContextKey, memberGrants: body.memberGrants.map(({ memberId, role, sourceIds }) => ({ memberId, role, sourceIds })),
    }); },
    'Room policy saved. No agent was started; review context before sending.');
  async function saveLayer() {
    if (!layerDraft || !layerDraft.name.trim() || layerDraftChanged) return;
    if (await run('Saving memory layer', client => {
      validateText(layerDraft.name.trim(), 160, 'Layer name'); validateText(layerDraft.description, 8000, 'Description'); validateSources(layerDraft.sourceIds);
      return client.request('/v1/layers', 'POST', { id: layerDraft.id, name: layerDraft.name.trim(), description: layerDraft.description,
        mode: layerDraft.mode, sourceIds: layerDraft.sourceIds, expectedLayerKey: layerDraft.expectedLayerKey });
    }, 'Layer saved. Its policy applies wherever this layer is attached. No sources were selected automatically.')) setLayerDraft(null);
  }
  async function saveGrant() {
    if (!grantDraft || grantDraftChanged) return;
    const next = [...(policy?.memberGrants || []).filter(grant => grant.memberId !== grantDraft.memberId), grantDraft];
    if (await savePolicy({ memberGrants: next }, 'Saving room member access', grantDraft.expectedContextKey)) setGrantDraft(null);
  }
  const agent = brain.workspace?.agents.find(item => item.id === policy?.agentId);
  const task = brain.workspace?.tasks.find(item => item.id === policy?.taskId);
  const manifests = (brain.governance?.manifests || []).filter(item => item.roomId === room.id);
  const activeManifest = manifests.find(item => item.id === policy?.activeManifestId);
  const sealKey = JSON.stringify([scope?.contextKey, room.selectedSourceIds, selectedIds.map(id => [id, byId.get(id)?.revisionId]), policy, attached.map(layer => [layer.id, layer.updatedAt])]);
  return <aside className="pn-rg" aria-label={`Governance for ${room.title}`}>
    <header className="pn-rg-heading"><div><p className="pn-eyebrow">ROOM / CONTEXT + ACCESS</p><h2>What this room can use</h2></div><span className="pn-rg-badge">{owner ? 'Owner' : role || 'Member'}</span></header>
    <p className="pn-rg-intro">{owner ? 'Layers gate selected sources. Member access is a separate, explicit grant. Nothing here sends a message.' : `You are viewing your own ${role || 'member'} access. The owner manages sources, policies and credentials.`}</p>
    <GovernanceSection title="Effective context" count={scope?.sourceIds.length} open>
      {scope ? <><div className="pn-rg-actions"><span className={`pn-rg-badge ${scope.canSend ? 'is-good' : 'is-blocked'}`}>{scope.canSend ? owner ? 'Ready for an explicit request' : 'May request a run' : 'Sending blocked'}</span><span className="pn-rg-badge">Manifest: {scope.manifestStatus}</span></div>
        <p className="pn-fine">Server-computed scope. {owner ? 'Ask layers need request-specific approval; excluded sources stay out.' : role === 'reader' ? 'Readers cannot send requests.' : 'Your request waits for owner approval before a provider runs.'}</p></>
        : <p className="pn-rg-warning">No server context assessment is available yet. Refresh the Brain before relying on these source choices.</p>}
      <div className="pn-rg-scope-list">{selectedIds.map(id => {
        const object = byId.get(id); const blocked = scope?.blocked.find(item => item.sourceId === id); const included = scope?.sourceIds.includes(id);
        const memberships = attached.filter(layer => layer.sourceIds.includes(id));
        const needsApproval = included && memberships.some(layer => layer.mode === 'ask' && !(scope?.manifestStatus === 'active' && activeManifest?.approvedLayerIds.includes(layer.id)));
        return <article key={id} className="pn-rg-scope-item"><button type="button" disabled={!object} onClick={() => onOpenBrain(id)}>{object?.title || 'Unavailable source'}{object ? ' ↗' : ''}</button>
          <span className={`pn-rg-badge ${blocked || needsApproval ? 'is-blocked' : included ? 'is-good' : ''}`}>{blocked ? 'Blocked' : needsApproval ? 'Approval required' : included ? 'Included' : 'Not assessed'}</span>
          <p>{blocked ? BLOCK_REASONS[blocked.reason] || blocked.reason : needsApproval ? 'An ask layer requires explicit approval before this context can run or be pinned.' : included ? 'Selected and permitted by the current room scope.' : 'Not included in the latest server assessment.'}</p>
          {owner && memberships.length > 0 && <p>Layers: {memberships.map(layer => `${layer.name} · ${layer.mode}`).join(', ')}</p>}
        </article>;
      })}{!selectedIds.length && <p className="pn-rg-empty">No selected sources. A conversation is not automatically given access to the whole Brain.</p>}</div>
    </GovernanceSection>
    {owner ? <GovernanceSection title="Memory layers" count={attached.length}>
      <p className="pn-fine">Attach named source sets as policy gates. Include allows already-selected sources; ask requires explicit approval; exclude blocks them. Attaching a layer never adds sources to a prompt.</p>
      {layers.map(layer => <article className="pn-rg-card" key={layer.id}><div className="pn-rg-card-heading"><label className="pn-check"><input type="checkbox" checked={!!policy?.layerIds.includes(layer.id)} disabled={busy} onChange={event => void savePolicy({ layerIds: event.target.checked ? [...new Set([...(policy?.layerIds || []), layer.id])] : (policy?.layerIds || []).filter(id => id !== layer.id) }, 'Updating room layers')} /><span>{layer.name}</span></label><button type="button" disabled={busy} onClick={() => setLayerDraft({ id: layer.id, name: layer.name, description: layer.description, mode: layer.mode, sourceIds: [...layer.sourceIds], expectedLayerKey: layer.versionKey })}>Edit</button></div>
        <span className={`pn-rg-badge ${layer.mode === 'exclude' ? 'is-blocked' : ''}`}>{layer.mode}</span>{layer.description && <p>{layer.description}</p>}<SourceReferences sourceIds={layer.sourceIds} brain={brain} onOpenBrain={onOpenBrain} />
      </article>)}
      {!layers.length && <p className="pn-rg-empty">No memory layers yet. Create a set such as Canon, project knowledge or restricted research.</p>}
      {!layerDraft ? <button type="button" disabled={busy} onClick={() => setLayerDraft({ name: '', description: '', mode: 'include', sourceIds: [] })}>＋ Create memory layer</button> : <form className="pn-rg-form" onSubmit={event => { event.preventDefault(); void saveLayer(); }}><h3>{layerDraft.id ? 'Edit memory layer' : 'Create memory layer'}</h3><fieldset disabled={busy}>
        <label>Layer name<input value={layerDraft.name} maxLength={160} required onChange={event => setLayerDraft({ ...layerDraft, name: event.target.value })} /></label>
        <label>Layer description<textarea rows={2} maxLength={8000} value={layerDraft.description} onChange={event => setLayerDraft({ ...layerDraft, description: event.target.value })} /></label>
        <label>Layer policy<select value={layerDraft.mode} onChange={event => setLayerDraft({ ...layerDraft, mode: event.target.value as MemoryLayer['mode'] })}><option value="include">Include selected sources</option><option value="ask">Ask before each authorized request</option><option value="exclude">Exclude from context</option></select></label>
        <GovernanceSourcePicker objects={brain.objects} selected={layerDraft.sourceIds} busy={busy} label="Layer sources" onChange={sourceIds => setLayerDraft({ ...layerDraft, sourceIds })} />
        <p className="pn-rg-warning">Editing this shared layer affects every room that attaches it. This is a retrieval policy, not a member permission grant.</p>
        {layerDraftChanged && <p className="pn-rg-warning" role="alert">Layer access changed in another view. Cancel and reopen this layer before saving. Your draft has not replaced the newer policy.</p>}
        <div className="pn-rg-actions"><button type="submit" className="pn-primary" disabled={!layerDraft.name.trim() || layerDraftChanged}>Save layer</button><button type="button" onClick={() => setLayerDraft(null)}>Cancel</button></div>
      </fieldset></form>}
    </GovernanceSection> : null}
    {owner ? <GovernanceSection title="Agent + work assignment">
      <p className="pn-fine">Tie future requests to a saved profile and task. Assignment is not a background process and does not grant extra source access.</p>
      <label>Assigned agent profile<select value={policy?.agentId || ''} disabled={busy} onChange={event => void savePolicy({ agentId: event.target.value || null }, 'Assigning room agent')}><option value="">No profile assigned</option>{brain.workspace?.agents.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {agent && <p className="pn-fine">Profile provider: {agent.providerId}. Agent sources are a further context boundary.</p>}
      <label>Linked task<select value={policy?.taskId || ''} disabled={busy} onChange={event => void savePolicy({ taskId: event.target.value || null }, 'Linking room task')}><option value="">No task linked</option>{brain.workspace?.tasks.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {task && <p className="pn-fine">Current task status: {task.status}. Sending does not mark the task complete.</p>}
    </GovernanceSection> : null}
    <GovernanceSection title={owner ? 'Pinned context manifests' : 'Context boundary'} count={owner ? manifests.length : undefined}>
      {!owner ? <p className="pn-fine">Manifest status: {scope?.manifestStatus || 'Not available'}. Your owner controls the room’s pinned source revisions; private manifests are not disclosed.</p> : <>
        <p className="pn-fine">A manifest pins exact source revisions for this room. It is not a signature or an access grant. Expired, revoked or changed context must be explicitly re-pinned; it never silently widens.</p>
        {activeManifest ? <article className="pn-rg-card"><div className="pn-rg-card-heading"><h3>Current pinned context</h3><span className={`pn-rg-badge ${scope?.manifestStatus === 'active' ? 'is-good' : 'is-blocked'}`}>{scope?.manifestStatus || 'Not assessed'}</span></div><dl className="pn-rg-definitions"><dt>Created</dt><dd>{timestamp(activeManifest.createdAt)}</dd><dt>Expires</dt><dd>{timestamp(activeManifest.expiresAt)}</dd><dt>Bindings</dt><dd>{activeManifest.bindings.length} exact revisions</dd></dl><ManifestBindings bindings={activeManifest.bindings} brain={brain} onOpenBrain={onOpenBrain} />
          {!activeManifest.revokedAt && <button type="button" disabled={busy} onClick={() => void run('Revoking context manifest', client => client.request(`/v1/manifests/${encodeURIComponent(activeManifest.id)}/revoke`, 'POST', {}), 'Manifest revoked. The room will not fall back to broader context.')}>Revoke pinned context</button>}
        </article> : <p className="pn-rg-empty">No pinned context is active. Source selections otherwise follow current revisions.</p>}
        <SealManifestForm key={sealKey} {...props} busy={busy} act={run} attached={attached} hasManifest={!!activeManifest} />
        {manifests.length > 1 && <details className="pn-rg-references"><summary>Earlier manifests · {manifests.length - (activeManifest ? 1 : 0)}</summary><div>{manifests.filter(item => item.id !== activeManifest?.id).map(item => <article className="pn-rg-card" key={item.id}><p>{timestamp(item.createdAt)} · {item.bindings.length} revisions</p><p>{item.revokedAt ? `Revoked ${timestamp(item.revokedAt)}` : `Expires ${timestamp(item.expiresAt)}`}</p><ManifestBindings bindings={item.bindings} brain={brain} onOpenBrain={onOpenBrain} />{!item.revokedAt && <button type="button" disabled={busy} onClick={() => void run('Revoking earlier manifest', client => client.request(`/v1/manifests/${encodeURIComponent(item.id)}/revoke`, 'POST', {}))}>Revoke this manifest</button>}</article>)}</div></details>}
      </>}
    </GovernanceSection>
    <GovernanceSection title={owner ? 'Room participants' : 'Your access'} count={owner ? policy?.memberGrants.length || 0 : undefined}>
      {!owner ? <><p className="pn-fine">{brain.access?.name || 'Member'} · {role || 'No room role'}. {role === 'reader' ? 'Read permitted room content; cannot send.' : 'Submit requests for owner approval. No direct provider execution.'}</p><SourceReferences sourceIds={ownGrant?.sourceIds || []} brain={brain} onOpenBrain={onOpenBrain} /></> : <>
        <p className="pn-fine">Readers can view permitted content. Participants can submit requests that wait for owner approval. Each person needs an explicit source grant; layer attachment does not grant access.</p>
        {(policy?.memberGrants || []).map(grant => {
          const member = brain.governance?.members.find(item => item.id === grant.memberId);
          return <article className="pn-rg-card" key={grant.memberId}><div className="pn-rg-card-heading"><h3>{member?.name || 'Unavailable member'}</h3><span className="pn-rg-badge">{grant.role}</span></div>{member?.revokedAt && <p className="pn-rg-warning">Credential revoked · no current access</p>}<SourceReferences sourceIds={grant.sourceIds} brain={brain} onOpenBrain={onOpenBrain} /><div className="pn-rg-actions"><button type="button" disabled={busy || !!member?.revokedAt} onClick={() => setGrantDraft({ ...grant, sourceIds: [...grant.sourceIds], expectedContextKey: scope?.contextKey })}>Edit room access</button><button type="button" disabled={busy} onClick={() => setRemoveMember(grant.memberId)}>Remove from room</button></div>
            {removeMember === grant.memberId && <div className="pn-rg-confirm"><p>Remove this member’s room grant? Previously read or downloaded content cannot be recalled.</p><div className="pn-rg-actions"><button type="button" disabled={busy} onClick={() => void savePolicy({ memberGrants: (policy?.memberGrants || []).filter(item => item.memberId !== grant.memberId) }, 'Removing room member').then(ok => { if (ok) setRemoveMember(null); })}>Confirm removal</button><button type="button" disabled={busy} onClick={() => setRemoveMember(null)}>Keep member</button></div></div>}
          </article>;
        })}
        {!grantDraft ? <button type="button" disabled={busy || !(brain.governance?.members || []).some(member => !member.revokedAt)} onClick={() => setGrantDraft({ memberId: '', role: 'reader', sourceIds: [], expectedContextKey: scope?.contextKey })}>＋ Add room participant</button> : <form className="pn-rg-form" onSubmit={event => { event.preventDefault(); void saveGrant(); }}><h3>Set explicit room access</h3><fieldset disabled={busy}>
          <label>Member<select required value={grantDraft.memberId} onChange={event => setGrantDraft({ ...grantDraft, memberId: event.target.value, role: 'reader', sourceIds: [] })}><option value="">Choose a member</option>{brain.governance?.members.filter(member => !member.revokedAt).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label>Room role<select value={grantDraft.role} onChange={event => setGrantDraft({ ...grantDraft, role: event.target.value as RoomMemberGrant['role'] })}><option value="reader">Reader · view permitted content</option><option value="participant">Participant · request owner-approved runs</option></select></label>
          <GovernanceSourcePicker objects={brain.objects} selected={grantDraft.sourceIds} busy={busy} label="Permitted member sources" onChange={sourceIds => setGrantDraft({ ...grantDraft, sourceIds })} />
          <p className="pn-rg-warning">This grants access to the selected sources in this room. It is not an email invitation. An empty selection grants no source content.</p>
          {grantDraftChanged && <p className="pn-rg-warning" role="alert">Access changed in another view. Cancel and reopen this editor before saving. Your draft has not restored any older permissions.</p>}
          <div className="pn-rg-actions"><button className="pn-primary" type="submit" disabled={!grantDraft.memberId || grantDraftChanged}>Save room access</button><button type="button" onClick={() => setGrantDraft(null)}>Cancel</button></div>
        </fieldset></form>}
        <p className="pn-fine">Create or revoke a person’s separate node credential in Shared → Member access. Never share the owner token.</p>
      </>}
    </GovernanceSection>
  </aside>;
}

function ManifestBindings({ bindings, brain, onOpenBrain }: { bindings: { sourceId: string; revisionId: string }[]; brain: Brain; onOpenBrain: (id?: string) => void }) {
  const byId = new Map(brain.objects.map(object => [object.id, object]));
  return <details className="pn-rg-references"><summary>Inspect exact revisions</summary><div>{bindings.map(binding => <div className="pn-rg-scope-item" key={binding.sourceId}><button type="button" disabled={!byId.has(binding.sourceId)} onClick={() => onOpenBrain(binding.sourceId)}>{byId.get(binding.sourceId)?.title || 'Unavailable source'} ↗</button><p className="pn-fine">Pinned: {binding.revisionId}</p>{byId.get(binding.sourceId)?.revisionId !== binding.revisionId && <p className="pn-rg-warning">Current source revision differs or is unavailable.</p>}</div>)}{!bindings.length && <p className="pn-fine">This manifest pins no sources.</p>}</div></details>;
}

function SealManifestForm(props: RoomGovernanceProps & { room: Room; attached: MemoryLayer[]; hasManifest: boolean }) {
  const [ttl, setTtl] = useState('86400');
  const [approvals, setApprovals] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const expectedContextKey = props.brain.governance?.scopes?.find(scope => scope.roomId === props.room.id)?.contextKey;
  const ask = props.attached.filter(layer => layer.mode === 'ask' && layer.sourceIds.some(id => props.room.selectedSourceIds.includes(id)));
  return <form className="pn-rg-form" onSubmit={event => { event.preventDefault(); if (!confirmed || !expectedContextKey) return; void props.act('Pinning exact room context', client => client.request(`${roomPath(props.room.id)}/manifests`, 'POST', { ttlSeconds: Number(ttl), approvedLayerIds: approvals, expectedContextKey }), 'Context pinned to exact source revisions. No provider was called.'); }}>
    <h3>{props.hasManifest ? 'Review and re-pin context' : 'Pin current context'}</h3><fieldset disabled={props.busy}>
      <label>Manifest expires in<select value={ttl} onChange={event => { setTtl(event.target.value); setConfirmed(false); }}><option value="3600">1 hour</option><option value="86400">24 hours</option><option value="604800">7 days</option></select></label>
      {ask.map(layer => <label key={layer.id} className="pn-check"><input type="checkbox" checked={approvals.includes(layer.id)} onChange={event => { setApprovals(event.target.checked ? [...approvals, layer.id] : approvals.filter(id => id !== layer.id)); setConfirmed(false); }} /><span>Approve “{layer.name}” for this manifest<span className="pn-fine"> · applies only to its selected, otherwise-permitted sources</span></span></label>)}
      <p className="pn-fine">The server checks selected sources against layers, agent scope and room policy before sealing. Ask-layer approval never overrides an exclusion.</p>
      <label className="pn-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I reviewed the selected sources and layer rules. {props.hasManifest ? 'Create and activate a new exact context instead of the earlier manifest.' : 'Pin the permitted context at its current revisions.'}</span></label>
      {!expectedContextKey && <p className="pn-rg-warning">Refresh to obtain a current server context assessment before pinning.</p>}
      <button type="submit" className="pn-primary" disabled={!confirmed || !expectedContextKey}>{props.hasManifest ? 'Create replacement manifest' : 'Pin exact context'}</button>
    </fieldset>
  </form>;
}

export function AccessManagement(props: AccessManagementProps) {
  return <AccessManagementContent key={`${props.brain.brainId}:${props.brain.access?.memberId || 'owner'}`} {...props} />;
}

function AccessManagementContent(props: AccessManagementProps) {
  const { brain } = props;
  const owner = isOwner(brain);
  const { run, busy } = useGovernanceAction(props);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<{ member: BrainMember; token: string } | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const members = brain.governance?.members || [];
  async function createMember() {
    if (!name.trim() || secret) return;
    await run('Creating member credential', async client => {
      validateText(name.trim(), 160, 'Member name');
      const created = await client.request<{ member: BrainMember; token: string }>('/v1/members', 'POST', { name: name.trim() });
      setSecret(created); setName('');
    }, 'Member created without room grants. The credential is shown once below; no invitation was sent.');
  }
  if (!owner) return <section className="pn-rg pn-rg-access" aria-label="Your member access"><header className="pn-rg-heading"><div><p className="pn-eyebrow">MEMBER / YOUR ACCESS</p><h2>{brain.access?.name || 'Your room access'}</h2></div><span className="pn-rg-badge">Member</span></header><p className="pn-rg-intro">Your credential opens only the rooms and sources permitted by the owner. It cannot manage members, export the Brain or execute providers directly.</p><div className="pn-rg-access-grid">{brain.rooms.map(room => {
    const policy = brain.governance?.roomPolicies.find(item => item.roomId === room.id); const grant = policy?.memberGrants.find(item => item.memberId === brain.access?.memberId);
    return <article className="pn-rg-card" key={room.id}><h3>{room.title}</h3><span className="pn-rg-badge">{grant?.role || 'Member'}</span><SourceReferences sourceIds={grant?.sourceIds || []} brain={brain} onOpenBrain={props.onOpenBrain} /></article>;
  })}</div>{!brain.rooms.length && <p className="pn-rg-empty">No room grants are currently available. Ask your owner to grant access.</p>}</section>;
  return <section className="pn-rg pn-rg-access" aria-label="Member access management"><header className="pn-rg-heading"><div><p className="pn-eyebrow">SEPARATE CREDENTIALS / EXPLICIT ROOM GRANTS</p><h2>Member access</h2></div><span className="pn-rg-badge">{members.filter(member => !member.revokedAt).length} active</span></header>
    <p className="pn-rg-intro">Create a separate, revocable bearer credential for each person. Then grant that person a room role and exact sources from the room inspector. Never send your owner token or Brain passphrase.</p>
    <p className="pn-rg-warning">Anyone holding a member credential can act as that member. This is not verified identity or an email invitation. Share it through a trusted channel; remote node access requires HTTPS.</p>
    {secret ? <section className="pn-rg-secret" aria-label="One-time member credential"><h3>Save {secret.member.name}’s credential now</h3><p className="pn-fine">Shown only in this session. It is not stored by this UI and cannot be read back later. Losing it means revoking this member and creating a new credential.</p><label>One-time member credential<textarea value={secret.token} readOnly autoComplete="off" spellCheck={false} /></label><p className="pn-fine">No room or source access is granted yet. No email or message was sent.</p><button type="button" onClick={() => setSecret(null)}>I saved it securely · dismiss credential</button></section>
      : <form className="pn-rg-form" onSubmit={event => { event.preventDefault(); void createMember(); }}><fieldset disabled={busy}><label>Member display name<input value={name} required maxLength={160} autoComplete="off" onChange={event => setName(event.target.value)} /></label><button type="submit" className="pn-primary" disabled={!name.trim()}>Create separate member credential</button></fieldset></form>}
    <div className="pn-rg-access-grid">{members.map(member => {
      const grants = (brain.governance?.roomPolicies || []).flatMap(policy => policy.memberGrants.filter(grant => grant.memberId === member.id).map(grant => ({ ...grant, room: brain.rooms.find(room => room.id === policy.roomId) })));
      return <article className="pn-rg-card" key={member.id}><div className="pn-rg-card-heading"><h3>{member.name}</h3><span className={`pn-rg-badge ${member.revokedAt ? 'is-blocked' : 'is-good'}`}>{member.revokedAt ? 'Revoked' : 'Active credential'}</span></div><p>Created {timestamp(member.createdAt)}</p>{member.revokedAt ? <p>Revoked {timestamp(member.revokedAt)}</p> : <p>{grants.length} room grant{grants.length === 1 ? '' : 's'} · {grants.reduce((sum, grant) => sum + grant.sourceIds.length, 0)} source permissions</p>}
        {grants.map((grant, index) => <div key={grant.room?.id || index}><p>{grant.room?.title || 'Unavailable room'} · {grant.role}</p><SourceReferences sourceIds={grant.sourceIds} brain={brain} onOpenBrain={props.onOpenBrain} /></div>)}
        {!member.revokedAt && <button type="button" disabled={busy} onClick={() => setRevokeId(member.id)}>Revoke member credential</button>}
        {revokeId === member.id && <div className="pn-rg-confirm"><p>Revoke this person’s credential across all rooms? They lose future node access. Previously read or copied content cannot be recalled.</p><div className="pn-rg-actions"><button type="button" disabled={busy} onClick={() => void run('Revoking member credential', client => client.request(`/v1/members/${encodeURIComponent(member.id)}/revoke`, 'POST', {}), 'Member credential revoked. Previously disclosed content cannot be recalled.').then(ok => { if (ok) { setRevokeId(null); if (secret?.member.id === member.id) setSecret(null); } })}>Confirm credential revocation</button><button type="button" disabled={busy} onClick={() => setRevokeId(null)}>Keep access</button></div></div>}
      </article>;
    })}</div>{!members.length && <p className="pn-rg-empty">No members yet. Your Brain is private to its owner.</p>}
  </section>;
}
