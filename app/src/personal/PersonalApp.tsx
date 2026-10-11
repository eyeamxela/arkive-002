import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { PersonalNodeClient, chooseDesktopFolder, desktopConnection, isNativeDesktop } from './api';
import type { Brain, BrainObject, NodeStatus, Provider, Room } from './api';

type Panel = 'brain' | 'inbox' | 'node';
type Action = (client: PersonalNodeClient) => Promise<unknown>;
const TEMPLATE_NOTES = {
  personal: 'Notes, projects and decisions. Your own working memory.',
  creator: 'References, ideas and creative projects. One connected archive.',
  business: 'Company context, research and approved decisions. Single-owner beta.',
};

function errorText(error: unknown) { return error instanceof Error ? error.message : 'The operation could not be completed.'; }
function Brand() { return <div className="pn-brand"><span className="pn-mark" aria-hidden="true">a<span>◦</span></span><strong>arkive<span> / personal</span></strong></div>; }
function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="pn-empty"><div className="pn-empty-mark" aria-hidden="true">＋</div><h3>{title}</h3><p>{children}</p></div>;
}

export function PersonalApp() {
  const [client, setClient] = useState<PersonalNodeClient | null>(null);
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [brain, setBrain] = useState<Brain | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [url, setUrl] = useState(() => isNativeDesktop() || ['1420', '1421'].includes(window.location.port)
    ? 'http://127.0.0.1:4317' : window.location.origin);
  const [token, setToken] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [name, setName] = useState('My Brain');
  const [template, setTemplate] = useState<keyof typeof TEMPLATE_NOTES>('personal');
  const [panel, setPanel] = useState<Panel>('brain');
  const [view, setView] = useState<'files' | 'graph'>('graph');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [roomTitle, setRoomTitle] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalText, setProposalText] = useState('');
  const [proposalSource, setProposalSource] = useState('');
  const [syncUrl, setSyncUrl] = useState('');
  const [syncToken, setSyncToken] = useState('');
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const connecting = useRef(false);

  async function connect(nextUrl: string, nextToken: string) {
    setBusy('Connecting to personal node'); setError('');
    try {
      const next = new PersonalNodeClient(nextUrl, nextToken);
      const nextStatus = await next.status();
      const nextBrain = nextStatus.locked ? null : await next.brain();
      setClient(next); setStatus(nextStatus); setBrain(nextBrain); setToken('');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(''); }
  }

  useEffect(() => {
    if (!isNativeDesktop() || connecting.current) return;
    connecting.current = true;
    setBusy('Starting personal node');
    desktopConnection().then(connection => connect(`http://127.0.0.1:${connection.port}`, connection.token))
      .catch(e => { setError(errorText(e)); setBusy(''); });
  }, []);

  async function refresh(current: PersonalNodeClient) {
    const nextStatus = await current.status();
    setStatus(nextStatus);
    if (nextStatus.locked) { setBrain(null); return; }
    setBrain(await current.brain());
  }

  async function act(label: string, action: Action, success?: string) {
    if (!client || busy) return false;
    setBusy(label); setError(''); setNotice('');
    try {
      await action(client);
      await refresh(client);
      if (success) setNotice(success);
      return true;
    } catch (e) {
      setError(errorText(e));
      // A remote lock must also remove readable data from this view.
      try { const current = await client.status(); setStatus(current); if (current.locked) setBrain(null); } catch { /* Preserve useful original error. */ }
      return false;
    } finally { setBusy(''); }
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!client) return;
    const secret = passphrase;
    setPassphrase('');
    await act(status?.initialized ? 'Unlocking Brain' : 'Creating encrypted Brain', current => current.request('/v1/unlock', 'POST', {
      passphrase: secret, create: !status?.initialized, template, name,
    }));
  }

  async function lock() {
    if (!client || busy) return;
    setBusy('Locking Brain'); setError('');
    try {
      await client.request('/v1/lock', 'POST');
      setBrain(null); setPassphrase(''); setProposalText(''); setProposalTitle(''); setProposalSource('');
      setSelectedId(null); setActiveRoomId(null); setFolderPath(''); setSearch(''); setRoomTitle(''); setSyncToken('');
      setNoteTitle(''); setNoteText('');
      setStatus(await client.status()); setNotice('Brain locked. The connection token remains only in this app session.');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(''); }
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    if (!noteTitle.trim() || !noteText.trim()) return;
    await act('Saving note', async current => {
      const note = await current.request<BrainObject>('/v1/objects', 'POST', {
        title: noteTitle.trim(), text: noteText.trim(), kind: 'note',
      });
      setSelectedId(note.id); setNoteTitle(''); setNoteText(''); setSearch('');
    }, 'Note saved to your Brain. Select it as chat context or use it to support a memory proposal.');
  }

  async function addFolder(native = false) {
    let path = folderPath.trim();
    if (native) {
      try { path = (await chooseDesktopFolder()) || ''; }
      catch (e) { setError(errorText(e)); return; }
    }
    if (!path) return;
    await act('Connecting folder', async current => {
      const folder = await current.request<{ id: string }>('/v1/folders', 'POST', { path });
      await current.request(`/v1/folders/${encodeURIComponent(folder.id)}/refresh`, 'POST');
      setFolderPath('');
    }, 'Folder connected and scanned. Originals were not modified.');
  }

  async function exportBrain() {
    await act('Exporting encrypted Brain', async current => {
      const bundle = await current.request<unknown>('/v1/export');
      const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = blobUrl;
      anchor.download = `arkive-brain-${new Date().toISOString().slice(0, 10)}.encrypted.json`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }, 'Encrypted recovery bundle downloaded. Keep the original passphrase separately and verify a restore.');
  }

  async function restore(event: FormEvent) {
    event.preventDefault();
    if (!restoreFile || !restoreConfirmed || !passphrase) return;
    const file = restoreFile; const secret = passphrase; setPassphrase('');
    await act('Restoring encrypted Brain', async current => {
      if (file.size > 64 * 1024 * 1024) throw new Error('Recovery bundle exceeds the 64 MiB browser import limit.');
      const bundle = JSON.parse(await file.text());
      await current.request('/v1/restore', 'POST', { passphrase: secret, bundle });
      setRestoreFile(null); setRestoreConfirmed(false);
    }, 'Recovery bundle restored. Unlock with its original passphrase if prompted.');
  }

  const objects = brain?.objects || [];
  const folders = brain?.folders || [];
  const rooms = brain?.rooms || [];
  const activeRoom = rooms.find(room => room.id === activeRoomId) || rooms[0];
  const selected = objects.find(object => object.id === selectedId);
  const visibleObjects = objects.filter(object => `${object.title} ${object.kind} ${object.sourcePath || ''}`.toLowerCase().includes(search.toLowerCase()));
  const pending = (brain?.proposals || []).filter(proposal => proposal.status === 'pending');
  const feedback = <><div className="pn-sr" role="status" aria-live="polite">{busy || notice}</div>{busy && <div className="pn-progress" aria-hidden="true"><span className="pn-spinner" />{busy}…</div>}{error && <div className="pn-alert" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}{notice && !error && !busy && <div className="pn-notice">{notice}</div>}</>;

  if (!client || !status) return <main className="pn-gate"><section className="pn-setup"><Brand /><p className="pn-eyebrow">YOUR MEMORY. YOUR NODE.</p><h1>Connect your personal Brain.</h1><p>A local-first workspace for your files, conversations and approved knowledge. No cloud account is required for this mode.</p>{feedback}<form onSubmit={event => { event.preventDefault(); void connect(url, token); }}>
    <label>Personal node URL<input type="url" required value={url} onChange={event => setUrl(event.target.value)} spellCheck={false} /></label>
    <label>Owner token<input type="password" required value={token} onChange={event => setToken(event.target.value)} autoComplete="off" spellCheck={false} /></label>
    <button className="pn-primary" disabled={!!busy}>{busy || 'Connect node →'}</button>
  </form><p className="pn-fine">The desktop app connects to its local service automatically. In browser mode, start the personal-node service and enter its owner token. Tokens stay in memory; this is not a sign-in bypass. Remote nodes require HTTPS and an explicitly allowed browser origin.</p><p className="pn-fine">The existing cloud workspace is a separate app mode.</p></section></main>;

  if (!brain || status.locked) return <main className="pn-gate"><section className="pn-setup"><Brand /><p className="pn-eyebrow">{status.initialized ? 'ENCRYPTED BRAIN · LOCKED' : 'A NEW SPACE FOR YOUR KNOWLEDGE'}</p><h1>{status.initialized ? 'Welcome back.' : 'Start with your world.'}</h1><p>{status.initialized ? 'Unlock this node to read its Brain. Your passphrase is not saved in the interface.' : 'Choose a starting label and configuration, not a user role. Every template is the same single-owner beta.'}</p>{feedback}<form onSubmit={unlock}>
    {!status.initialized && <><label>Brain name<input value={name} maxLength={120} required onChange={event => setName(event.target.value)} /></label><div className="pn-templates">{(Object.keys(TEMPLATE_NOTES) as Array<keyof typeof TEMPLATE_NOTES>).map(key => <button type="button" key={key} aria-pressed={template === key} onClick={() => setTemplate(key)}><strong>{key}</strong><span>{TEMPLATE_NOTES[key]}</span></button>)}</div></>}
    <label>{status.initialized ? 'Passphrase' : 'Create a passphrase · at least 12 characters'}<input type="password" value={passphrase} required minLength={status.initialized ? 1 : 12} onChange={event => setPassphrase(event.target.value)} autoComplete="off" /></label>
    <button className="pn-primary" disabled={!!busy}>{busy || (status.initialized ? 'Unlock Brain →' : 'Create encrypted Brain →')}</button>
  </form><p className="pn-fine">Encryption protects stored data. An unlocked node can read it to serve your requests. There is no passphrase reset; keep a recovery copy and your passphrase safely.</p>
  {!status.initialized && <details><summary>Restore an existing Brain instead</summary><form onSubmit={restore}><label>Encrypted recovery bundle<input type="file" accept="application/json,.json" onChange={event => setRestoreFile(event.target.files?.[0] || null)} /></label><label>Original bundle passphrase<input type="password" required value={passphrase} onChange={event => setPassphrase(event.target.value)} autoComplete="off" /></label><label className="pn-check"><input type="checkbox" checked={restoreConfirmed} onChange={event => setRestoreConfirmed(event.target.checked)} />Restore into this empty node only.</label><button disabled={!!busy || !restoreFile || !restoreConfirmed}>Restore encrypted bundle</button></form></details>}
  <button className="pn-text" disabled={!!busy} onClick={() => { setClient(null); setStatus(null); setBrain(null); setPassphrase(''); }}>Disconnect this session</button></section></main>;

  return <div className="pn-app">
    <header className="pn-header"><Brand /><div className="pn-breadcrumb">{brain.name}<span>/ {brain.template}</span></div><span className="pn-node-pill"><i />personal node</span><button disabled={!!busy} onClick={() => void act('Refreshing Brain', async () => {})}>Refresh</button><button disabled={!!busy} onClick={() => void lock()}>Lock Brain</button></header>
    {feedback}
    <div className="pn-workspace">
      <aside className="pn-sidebar"><div className="pn-sidebar-title">WORKSPACE <span>01</span></div><nav aria-label="Personal workspace"><button aria-current={panel === 'brain' ? 'page' : undefined} onClick={() => setPanel('brain')}><span>◈</span> Brain <small>{objects.length}</small></button><button aria-current={panel === 'inbox' ? 'page' : undefined} onClick={() => setPanel('inbox')}><span>⌑</span> Memory inbox <small>{pending.length}</small></button><button aria-current={panel === 'node' ? 'page' : undefined} onClick={() => setPanel('node')}><span>⌘</span> Personal node</button></nav>
        <div className="pn-sidebar-title">CONNECTED FOLDERS <span>{folders.length}</span></div>
        <div className="pn-folders">{folders.map(folder => <div className="pn-folder" key={folder.id}><span title={folder.path}>▱ {folder.path.split('/').filter(Boolean).pop()}</span><button aria-label={`Refresh ${folder.path}`} title={folder.path} disabled={!!busy} onClick={() => void act('Scanning connected folder', current => current.request(`/v1/folders/${encodeURIComponent(folder.id)}/refresh`, 'POST'), 'Folder refreshed. Conflicting changes stay available for review.')}>↻</button></div>)}{!folders.length && <p>No folders connected.</p>}</div>
        {isNativeDesktop() ? <button className="pn-add" disabled={!!busy} onClick={() => void addFolder(true)}>＋ Connect folder</button> : <form className="pn-folder-form" onSubmit={event => { event.preventDefault(); void addFolder(); }}><label>Folder on this node<input value={folderPath} placeholder="/absolute/path/to/notes" onChange={event => setFolderPath(event.target.value)} required /></label><button disabled={!!busy}>＋ Connect folder</button></form>}
        <p className="pn-fine">Read-only source access. Markdown and text files are imported; hidden, secret and unsupported files are excluded. Refresh is manual.</p>
        <div className="pn-sidebar-bottom"><span className="pn-eyebrow">OWNERSHIP FIRST</span><p>One Brain. Many views.<br />No automatic cloud upload.</p><button disabled={!!busy} onClick={() => void exportBrain()}>↓ Encrypted export</button><p className="pn-fine">Single-owner beta. Multi-user access and automatic background sync are not enabled.</p></div>
      </aside>

      <main className="pn-main">
        {panel === 'brain' && <><div className="pn-panel-heading"><div><p className="pn-eyebrow">CONNECTED KNOWLEDGE</p><h1>Your Brain</h1></div><div className="pn-segment" aria-label="Brain view"><button aria-pressed={view === 'graph'} onClick={() => setView('graph')}>Graph</button><button aria-pressed={view === 'files'} onClick={() => setView('files')}>Files</button></div></div><label className="pn-search"><span className="pn-sr">Search Brain objects</span><input type="search" placeholder="Search files and memory…" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <details className="pn-capture" open={!objects.length || undefined}>
            <summary><span>＋ Capture a note</span><small>No folder needed</small></summary>
            <form className="pn-note-form" onSubmit={saveNote}>
              <label>Title<input value={noteTitle} onChange={event => setNoteTitle(event.target.value)} maxLength={200} placeholder="An idea worth keeping" required disabled={!!busy} /></label>
              <label>Note<textarea value={noteText} onChange={event => setNoteText(event.target.value)} rows={3} placeholder="Add your own words. Notes become sources, not automatically approved memories." required disabled={!!busy} /></label>
              <div className="pn-capture-actions"><p className="pn-fine">Saved on this node. Nothing is sent to a model.</p><button className="pn-primary" disabled={!!busy || !noteTitle.trim() || !noteText.trim()}>{busy === 'Saving note' ? 'Saving…' : 'Save note →'}</button></div>
            </form>
          </details>
          <div className="pn-brain-view">{!objects.length ? <Empty title="Start with something worth keeping.">Save a note above, or connect a folder of Markdown and text files. Then select sources for a chat or propose a memory. Your Brain starts empty, with no demo content.</Empty> : visibleObjects.length === 0 ? <Empty title="No matching objects">Try another title, type or source path.</Empty> : view === 'graph' ? <BrainGraph objects={visibleObjects} selectedId={selectedId} onSelect={setSelectedId} /> : <div className="pn-file-list">{visibleObjects.map(object => <button className="pn-file" key={object.id} aria-pressed={selectedId === object.id} onClick={() => setSelectedId(object.id)}><span className="pn-file-icon">{object.kind === 'memory' ? '◇' : '▤'}</span><span><strong>{object.title}</strong><small>{object.sourcePath || `${object.kind} · ${object.sourceIds?.length || 0} source links`}</small></span><span>↗</span></button>)}</div>}</div>
          <section className="pn-detail" aria-label="Source details">{selected ? <><div className="pn-detail-heading"><span className="pn-eyebrow">{selected.kind} / SOURCE DETAIL</span><button aria-label="Close source details" onClick={() => setSelectedId(null)}>×</button></div><h2>{selected.title}</h2><p className="pn-source-path">{selected.sourcePath || selected.id}</p><pre>{selected.text}</pre><div className="pn-detail-actions"><button disabled={!activeRoom || !!busy} onClick={() => activeRoom && void act('Updating room context', current => current.request(`/v1/rooms/${encodeURIComponent(activeRoom.id)}/sources`, 'PUT', { objectIds: Array.from(new Set([...activeRoom.selectedSourceIds, selected.id])) }), `Source selected for ${activeRoom.title}.`)}>＋ Use in {activeRoom?.title || 'a chat'}</button><button onClick={() => { setProposalSource(selected.id); setPanel('inbox'); }}>Propose memory</button></div><p className="pn-fine">Revision {selected.revisionId}. Selecting a source does not send it to a model.</p></> : <div className="pn-detail-hint">Select a node or file to inspect its content and provenance.</div>}</section>
        </>}

        {panel === 'inbox' && <><div className="pn-panel-heading"><div><p className="pn-eyebrow">PROPOSE → REVIEW → APPROVE</p><h1>Memory inbox</h1></div><span className="pn-count">{pending.length} pending</span></div><div className="pn-pane-scroll"><p className="pn-muted">Proposals are separate from approved knowledge. Every memory needs a supporting source and your review. Agents do not silently update Canon.</p><form className="pn-card pn-proposal-form" onSubmit={event => { event.preventDefault(); if (!proposalSource) return; void act('Creating memory proposal', async current => { await current.request('/v1/proposals', 'POST', { title: proposalTitle, text: proposalText, sourceIds: [proposalSource] }); setProposalTitle(''); setProposalText(''); setProposalSource(''); }, 'Memory proposal saved for review.'); }}><h2>Propose a memory</h2><label>Title<input value={proposalTitle} onChange={event => setProposalTitle(event.target.value)} required maxLength={200} /></label><label>Memory<textarea value={proposalText} onChange={event => setProposalText(event.target.value)} required rows={4} /></label><label>Supporting source<select value={proposalSource} required onChange={event => setProposalSource(event.target.value)}><option value="">Choose supporting source</option>{objects.map(object => <option key={object.id} value={object.id}>{object.title}</option>)}</select></label>{!objects.length && <p className="pn-fine">First save a note or connect a source folder in your Brain.</p>}<button className="pn-primary" disabled={!!busy || !proposalSource}>Save proposal</button></form>
          {(brain.proposals || []).map(proposal => <article className="pn-card pn-proposal" key={proposal.id}><div className="pn-detail-heading"><span className={`pn-status pn-status-${proposal.status}`}>{proposal.status}</span><span className="pn-fine">{proposal.sourceIds.length} source links</span></div><h2>{proposal.title}</h2><p className="pn-prewrap">{proposal.text}</p>{proposal.status === 'pending' && <div className="pn-detail-actions"><button className="pn-primary" disabled={!!busy} onClick={() => void act('Approving memory', current => current.request(`/v1/proposals/${encodeURIComponent(proposal.id)}/review`, 'POST', { decision: 'accept' }), 'Memory approved. It is now available in both Brain views.')}>Approve memory</button><button disabled={!!busy} onClick={() => void act('Rejecting proposal', current => current.request(`/v1/proposals/${encodeURIComponent(proposal.id)}/review`, 'POST', { decision: 'reject' }))}>Reject</button></div>}</article>)}
        </div></>}

        {panel === 'node' && <>
          <div className="pn-panel-heading"><div><p className="pn-eyebrow">LOCAL FIRST / REPLICATE EXPLICITLY</p><h1>Personal node</h1></div></div>
          <div className="pn-pane-scroll">
            <section className="pn-card">
              <h2>Connected node</h2>
              <dl className="pn-definitions"><dt>Address</dt><dd>{client.url}</dd><dt>Node ID</dt><dd>{status.nodeId}</dd><dt>Brain</dt><dd>{brain.brainId}</dd><dt>State</dt><dd>Unlocked · single owner</dd><dt>History</dt><dd>{brain.revisions?.length || 0} revisions / {brain.audit?.length || 0} audit entries</dd></dl>
              <p className="pn-fine">The service encrypts stored Brain data. Local source folders remain in their original format. An unlocked execution node can read the information it serves.</p>
            </section>
            <section className="pn-card">
              <h2>Execution adapters</h2>
              {status.providers.map(provider => <div className="pn-provider" key={provider.id}><div><strong>{provider.name || provider.id}</strong><small>{provider.model || 'No model configured'}</small></div><span className={provider.configured ? 'pn-ready' : 'pn-muted'}>{provider.configured ? 'Configured' : 'Unavailable'}</span></div>)}
              <p className="pn-fine">Configure provider credentials on the node, never in this browser. A configured adapter is not proof of a successful live model call. Hermes is unavailable in this beta.</p>
            </section>
            <form className="pn-card" onSubmit={event => { event.preventDefault(); const destination = syncUrl; const credential = syncToken; void act('Synchronizing with paired node', async current => { try { await current.request('/v1/sync', 'POST', { url: destination, token: credential }); } finally { setSyncToken(''); } }, 'Sync completed. Inspect any conflicts below; conflicting records are not silently merged.'); }}>
              <h2>Sync with a personal node</h2>
              <p className="pn-muted">Sync transfers all object and revision content, including source paths, between paired nodes. Only pair nodes you trust to read the entire Brain. Remote nodes require HTTPS.</p>
              <label>Destination node URL<input type="url" required placeholder="https://brain.example.com" value={syncUrl} onChange={event => setSyncUrl(event.target.value)} /></label>
              <label>Dedicated peer sync token<input type="password" required value={syncToken} autoComplete="off" spellCheck={false} onChange={event => setSyncToken(event.target.value)} /></label>
              <p className="pn-fine">Use the destination node’s dedicated peer sync token, not its owner token. Chats, folder grants and approvals are not transferred.</p>
              <button disabled={!!busy}>Sync entire Brain now</button>
              <p className="pn-fine">No automatic discovery, background replication or cloud provisioning happens here. Synced data is a snapshot; it is not live access to an offline computer.</p>
            </form>
            <section className="pn-card"><h2>Sync conflicts <span className="pn-count">{brain.conflicts?.length || 0}</span></h2>{brain.conflicts?.length ? <><p className="pn-muted">These records need reconciliation. Their presence does not mean they were approved or merged.</p>{brain.conflicts.map((conflict, index) => <pre className="pn-conflict" key={index}>{JSON.stringify(conflict, null, 2)}</pre>)}</> : <p className="pn-muted">No conflicts recorded.</p>}</section>
            <section className="pn-card"><h2>Recovery</h2><p className="pn-muted">Export an encrypted bundle of this Brain, including its records and history. Keep the passphrase separately. Restore is available only when connecting to an empty node.</p><button disabled={!!busy} onClick={() => void exportBrain()}>↓ Download encrypted recovery bundle</button></section>
            <details className="pn-card pn-audit"><summary>Audit history <span className="pn-count">{brain.audit?.length || 0} entries</span></summary><p className="pn-fine">Recorded node events, newest first. This history is not proof of the truth of source content.</p>{brain.audit?.length ? [...brain.audit].reverse().map((entry, index) => <pre className="pn-conflict" key={index}>{JSON.stringify(entry, null, 2)}</pre>) : <p className="pn-muted">No events recorded.</p>}</details>
          </div>
        </>}
      </main>

      <section className="pn-chat-section" aria-label="Multi-chat canvas"><div className="pn-panel-heading"><div><p className="pn-eyebrow">INDEPENDENT CONTEXT / SHARED BRAIN</p><h2>Chat canvas</h2></div><span className="pn-count">{rooms.length}</span></div><form className="pn-new-room" onSubmit={event => { event.preventDefault(); void act('Creating chat', async current => { const room = await current.request<Room>('/v1/rooms', 'POST', { title: roomTitle }); setActiveRoomId(room.id); setRoomTitle(''); }); }}><label className="pn-sr" htmlFor="new-room">New chat name</label><input id="new-room" value={roomTitle} placeholder="Name a new chat…" onChange={event => setRoomTitle(event.target.value)} required maxLength={120} /><button disabled={!!busy}>＋ New</button></form><div className="pn-chat-canvas">{rooms.length ? rooms.map(room => <ChatCard key={room.id} room={room} objects={objects} providers={status.providers} active={activeRoom?.id === room.id} busy={!!busy} onActivate={() => setActiveRoomId(room.id)} onSources={ids => act('Updating chat context', current => current.request(`/v1/rooms/${encodeURIComponent(room.id)}/sources`, 'PUT', { objectIds: ids }))} onSend={body => act('Running agent', current => current.request(`/v1/rooms/${encodeURIComponent(room.id)}/messages`, 'POST', body))} />) : <Empty title="Give each conversation its own context.">Create a chat, then pick the files and memories it can use. Multiple chats stay visible here.</Empty>}</div><footer className="pn-chat-footer">{busy ? <span className="pn-working">● {busy}…</span> : <span>Source selection is explicit. No simulated replies.</span>}</footer></section>
    </div>
  </div>;
}

function BrainGraph({ objects, selectedId, onSelect }: { objects: BrainObject[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [scale, setScale] = useState(1);
  const size = Math.max(600, Math.ceil(Math.sqrt(objects.length)) * 150);
  const columns = Math.max(3, Math.ceil(Math.sqrt(objects.length)));
  const points = new Map(objects.map((object, index) => [object.id, { x: 100 + (index % columns) * 150, y: 100 + Math.floor(index / columns) * 130 }]));
  const edges = objects.flatMap(object => (object.sourceIds || []).filter(id => points.has(id)).map(sourceId => ({ from: object.id, to: sourceId })));
  return <div className="pn-graph"><div className="pn-graph-legend"><span><i /> {objects.length} objects</span><span>{edges.length} source links</span><div><button aria-label="Zoom out graph" onClick={() => setScale(value => Math.max(.5, value - .15))}>−</button><button aria-label="Reset graph zoom" onClick={() => setScale(1)}>{Math.round(scale * 100)}%</button><button aria-label="Zoom in graph" onClick={() => setScale(value => Math.min(2, value + .15))}>＋</button></div></div><div className="pn-graph-scroll"><div className="pn-graph-plane" style={{ width: size * scale, height: size * scale }}><svg width={size * scale} height={size * scale} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">{edges.map((edge, index) => { const from = points.get(edge.from)!; const to = points.get(edge.to)!; return <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={selectedId === edge.from || selectedId === edge.to ? '#ff5a1f' : '#343432'} strokeWidth="1" />; })}</svg>{objects.map(object => { const point = points.get(object.id)!; return <button key={object.id} className="pn-graph-node" style={{ left: point.x * scale, top: point.y * scale }} aria-pressed={selectedId === object.id} onClick={() => onSelect(object.id)} title={`${object.title} · ${object.kind}`}><span className={object.kind === 'memory' ? 'pn-dot pn-dot-memory' : 'pn-dot'} /><strong>{object.title}</strong><small>{object.kind}</small></button>; })}</div></div><p className="pn-graph-caption">Connections represent stored source relationships, not inferred similarities.</p></div>;
}

function ChatCard({ room, objects, providers, active, busy, onActivate, onSources, onSend }: {
  room: Room; objects: BrainObject[]; providers: Provider[]; active: boolean; busy: boolean;
  onActivate: () => void; onSources: (ids: string[]) => Promise<boolean>;
  onSend: (body: { text: string; provider: string; model?: string; allowExternal: boolean }) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [providerId, setProviderId] = useState(providers.find(provider => provider.configured)?.id || providers[0]?.id || '');
  const provider = providers.find(item => item.id === providerId);
  const selected = objects.filter(object => room.selectedSourceIds.includes(object.id));
  const consentScope = `${providerId}:${provider?.model || ''}:${selected.map(object => `${object.id}:${object.revisionId}`).join('|')}`;
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => setConsent(false), [consentScope]);
  useEffect(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [room.messages.length]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy || !provider?.configured || !text.trim() || (provider.external && !consent)) return;
    const message = text;
    const allowExternal = provider.external && consent;
    setConsent(false);
    const succeeded = await onSend({ text: message, provider: provider.id, model: provider.model || undefined, allowExternal });
    if (succeeded) setText('');
  }
  return <article className={`pn-chat-card${active ? ' pn-chat-active' : ''}`} onFocus={onActivate}>
    <header><button className="pn-room-title" aria-pressed={active} onClick={onActivate}><span>◌</span>{room.title}</button><span className="pn-fine">{room.messages.length} messages</span></header>
    <details className="pn-context">
      <summary>{selected.length} selected sources <span>Configure context ↓</span></summary>
      <div className="pn-context-list">{objects.length ? objects.map(object => <label className="pn-check" key={object.id}><input type="checkbox" disabled={busy} checked={room.selectedSourceIds.includes(object.id)} onChange={event => void onSources(event.target.checked ? [...room.selectedSourceIds, object.id] : room.selectedSourceIds.filter(id => id !== object.id))} /><span>{object.title}<small>{object.kind}</small></span></label>) : <p className="pn-fine">Save a note or connect a source folder first.</p>}</div>
    </details>
    <div className="pn-selected-sources" aria-label="Current selected sources">{selected.length ? selected.map(object => <span key={object.id} title={object.sourcePath || object.title}>{object.title}</span>) : <span>No Brain sources selected</span>}</div>
    <div className="pn-transcript" ref={transcript} aria-label={`${room.title} messages`} aria-live="polite">
      {room.messages.length ? room.messages.map(message => <div key={message.id} className={`pn-message pn-message-${message.role}`}><span className="pn-eyebrow">{message.role}</span><p>{message.text}</p>{!!message.sourceIds?.length && <div className="pn-message-sources"><span>Context references</span>{message.sourceIds.map(id => <small key={id}>{objects.find(object => object.id === id)?.title || id}</small>)}</div>}</div>) : <div className="pn-chat-empty"><span>↗</span><p>A conversation grounded<br />in the sources you choose.</p></div>}
    </div>
    <form className="pn-composer" onSubmit={send}>
      <label className="pn-sr" htmlFor={`provider-${room.id}`}>Agent provider for {room.title}</label>
      <select id={`provider-${room.id}`} value={providerId} onChange={event => setProviderId(event.target.value)} disabled={busy}>{providers.map(item => <option key={item.id} value={item.id}>{item.name || item.id}{item.configured ? '' : ' · unavailable'}</option>)}</select>
      {!provider?.configured && <p className="pn-unavailable">{provider?.id === 'hermes' ? 'Hermes is unavailable in this beta.' : 'No live adapter configured for this selection.'} Configure a supported adapter on the node to enable real replies.</p>}
      <label className="pn-sr" htmlFor={`message-${room.id}`}>Message {room.title}</label>
      <textarea id={`message-${room.id}`} placeholder="Ask about your selected sources…" value={text} onChange={event => { setText(event.target.value); setConsent(false); }} rows={3} disabled={busy} />
      {provider?.external && <label className="pn-check pn-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy || !provider.configured} /><span>For this request, send only my current message and the {selected.length} selected sources above to this provider. Chat history is not sent.</span></label>}
      {!provider?.external && <p className="pn-fine">This request uses your current message and selected sources, not chat history.</p>}
      <div className="pn-send-row"><small>{provider?.model || 'No model'}</small><button className="pn-primary" disabled={busy || !text.trim() || !provider?.configured || (provider.external && !consent)}>Send ↗</button></div>
    </form>
  </article>;
}
