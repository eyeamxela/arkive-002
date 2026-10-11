import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { PersonalNodeClient, NodeRequestError, chooseDesktopFolder, desktopConnection, isNativeDesktop } from './api';
import type { Brain, BrainObject, NodeStatus } from './api';
import { BrainGraph } from './BrainGraph';
import { CodeGraph, parseCodeGraph } from './CodeGraph';
import { SourcesPanel } from './SourcesPanel';
import { ChatWorkspace } from './ChatWorkspace';
import { WorkspacePanels } from './WorkspacePanels';
import { ObjectCanvas } from './ObjectCanvas';
import { FolderScanProgress } from './FolderScanProgress';
import { PersonalSidebar } from './PersonalSidebar';
import { createFolderScanMonitor, transferLimitBytes } from './folderScanModel.mjs';
import type { FolderScanMonitor, FolderScanView } from './folderScanModel.mjs';
import './UnifiedWorkspace.css';

type Panel = 'chat' | 'canvas' | 'brain' | 'inbox' | 'node' | 'sources' | 'work' | 'agents' | 'library' | 'manifests' | 'policies' | 'shared' | 'audit';
const NAV: { id: Panel; label: string; icon: string; group: string }[] = [
  { id: 'chat', label: 'Chat', icon: '◌', group: 'WORKSPACE' },
  { id: 'canvas', label: 'Canvas', icon: '⊞', group: 'WORKSPACE' },
  { id: 'brain', label: 'Brain', icon: '◈', group: 'WORKSPACE' },
  { id: 'work', label: 'Work', icon: '☷', group: 'WORKSPACE' },
  { id: 'agents', label: 'Agents', icon: '⌘', group: 'WORKSPACE' },
  { id: 'inbox', label: 'Memory inbox', icon: '⌑', group: 'KNOWLEDGE' },
  { id: 'library', label: 'Library', icon: '▤', group: 'KNOWLEDGE' },
  { id: 'manifests', label: 'Context presets', icon: '⊡', group: 'KNOWLEDGE' },
  { id: 'sources', label: 'Sources & sync', icon: '⇄', group: 'KNOWLEDGE' },
  { id: 'shared', label: 'Shared', icon: '↗', group: 'SYSTEM' },
  { id: 'policies', label: 'Policies', icon: '◇', group: 'SYSTEM' },
  { id: 'audit', label: 'Audit', icon: '≡', group: 'SYSTEM' },
  { id: 'node', label: 'Personal node', icon: '⏣', group: 'SYSTEM' },
];
const MEMBER_PANELS = new Set<Panel>(['chat', 'canvas', 'brain', 'agents', 'shared', 'policies']);
type Action = (client: PersonalNodeClient) => Promise<unknown>;
const TEMPLATE_NOTES = {
  personal: 'Notes, projects and decisions. Your own working memory.',
  creator: 'References, ideas and creative projects. One connected archive.',
  business: 'Company context, research and approved decisions. Private until explicitly shared.',
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
  const [panel, setPanel] = useState<Panel>('chat');
  const [view, setView] = useState<'files' | 'graph' | 'code' | 'freeform' | 'timeline'>('graph');
  const [preferredProviders, setPreferredProviders] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('arkive.personal.sidebar.v1') === 'collapsed'; }
    catch { return false; }
  });
  const [codeGraphId, setCodeGraphId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalText, setProposalText] = useState('');
  const [proposalSource, setProposalSource] = useState('');
  const [syncUrl, setSyncUrl] = useState('');
  const [syncToken, setSyncToken] = useState('');
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [folderScan, setFolderScan] = useState<{ view: FolderScanView; path: string } | null>(null);
  const folderScanMonitor = useRef<FolderScanMonitor | null>(null);
  const folderScanVersion = useRef(0);
  const connecting = useRef(false);
  const actionInFlight = useRef(false);
  const sessionVersion = useRef(0);
  const snapshotVersion = useRef(0);
  const currentClient = useRef<PersonalNodeClient | null>(null);
  const isMember = brain?.access?.kind === 'member' || status?.principal?.kind === 'member';

  useEffect(() => {
    try { window.localStorage.setItem('arkive.personal.sidebar.v1', sidebarCollapsed ? 'collapsed' : 'expanded'); }
    catch { /* A display preference is optional when browser storage is unavailable. */ }
  }, [sidebarCollapsed]);

  useEffect(() => { if (!brain) setSidebarOpen(false); }, [brain?.brainId]);

  function clearReadableSession() {
    sessionVersion.current += 1;
    snapshotVersion.current += 1;
    folderScanVersion.current += 1;
    folderScanMonitor.current?.dispose(); folderScanMonitor.current = null; setFolderScan(null);
    setBrain(null); setPassphrase(''); setProposalText(''); setProposalTitle(''); setProposalSource('');
    setSelectedId(null); setActiveRoomId(null); setFolderPath(''); setSearch(''); setSyncToken('');
    setNoteTitle(''); setNoteText(''); setEditingNoteId(null); setPreferredProviders({});
    setRestoreFile(null); setRestoreConfirmed(false); setNotice('');
  }

  useEffect(() => () => { folderScanMonitor.current?.dispose(); }, []);

  function disconnect() {
    clearReadableSession(); currentClient.current = null;
    setClient(null); setStatus(null); setToken(''); setPanel('chat'); setView('graph');
  }

  function navigate(next: string) {
    if (NAV.some(item => item.id === next) && (!isMember || MEMBER_PANELS.has(next as Panel))) { setPanel(next as Panel); setSidebarOpen(false); }
  }

  function openBrain(id?: string) {
    if (id) { setSelectedId(id); setSearch(''); if (view === 'code') setView('files'); }
    navigate('brain');
  }

  function openRoom(id: string, providerId?: string) {
    setActiveRoomId(id);
    if (providerId) setPreferredProviders(current => ({ ...current, [id]: providerId }));
    navigate('chat');
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!brain) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); setView('graph'); navigate('brain'); }
      if ((event.metaKey || event.ctrlKey) && event.key === ',') { event.preventDefault(); navigate('node'); }
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [brain?.brainId]);

  async function connect(nextUrl: string, nextToken: string) {
    setBusy('Connecting to personal node'); setError('');
    try {
      const next = new PersonalNodeClient(nextUrl, nextToken);
      const nextStatus = await next.status();
      const nextBrain = nextStatus.locked ? null : await next.brain();
      clearReadableSession(); currentClient.current = next;
      setClient(next); setStatus(nextStatus); setBrain(nextBrain); setToken(''); setPanel('chat');
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
    const version = sessionVersion.current;
    const requestVersion = ++snapshotVersion.current;
    const nextStatus = await current.status();
    if (currentClient.current !== current || sessionVersion.current !== version || requestVersion !== snapshotVersion.current) return;
    setStatus(nextStatus);
    if (nextStatus.locked) { clearReadableSession(); return; }
    const nextBrain = await current.brain();
    if (currentClient.current !== current || sessionVersion.current !== version || requestVersion !== snapshotVersion.current) return;
    setBrain(nextBrain);
  }

  // Read-only refresh exposes real run transitions and removes revoked views.
  // Stale in-flight responses cannot restore data after lock or disconnect.
  useEffect(() => {
    if (!client || !brain?.brainId) return;
    let stopped = false; let pendingRefresh = false;
    const check = async () => {
      if (stopped || pendingRefresh || document.visibilityState === 'hidden') return;
      pendingRefresh = true;
      try { await refresh(client); }
      catch (e) {
        if (stopped || currentClient.current !== client) return;
        if (e instanceof NodeRequestError && [401, 403, 423].includes(e.status)) {
          disconnect(); setError('This session no longer has access. Reconnect with an active credential.');
        } else if (isMember) {
          // Do not keep a member's private cache readable while authorization cannot be checked.
          disconnect(); setError('The node could not verify your access. Reconnect when it is available.');
        }
      } finally { pendingRefresh = false; }
    };
    const timer = window.setInterval(() => void check(), 5000);
    const visible = () => { if (document.visibilityState !== 'hidden') void check(); };
    window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, [client, brain?.brainId, isMember]);

  async function act(label: string, action: Action, success?: string) {
    if (!client || busy || actionInFlight.current) return false;
    actionInFlight.current = true;
    setBusy(label); setError(''); setNotice('');
    try {
      await action(client);
      await refresh(client);
      if (success) setNotice(success);
      return true;
    } catch (e) {
      setError(errorText(e));
      // A remote lock must also remove readable data from this view.
      try { await refresh(client); }
      catch (checkError) {
        if ((checkError instanceof NodeRequestError && [401, 403, 423].includes(checkError.status)) || isMember) {
          disconnect(); setError('This session no longer has verified access. Reconnect with an active credential.');
        }
      }
      return false;
    } finally { actionInFlight.current = false; setBusy(''); }
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
      clearReadableSession();
      setStatus(await client.status()); setNotice('Brain locked. The connection token remains only in this app session.');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(''); }
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    if (!noteTitle.trim() || !noteText.trim()) return;
    await act('Saving note', async current => {
      const note = await current.request<BrainObject>('/v1/objects', 'POST', {
        ...(editingNoteId ? { objectId: editingNoteId } : {}),
        title: noteTitle.trim(), text: noteText.trim(), kind: 'note',
      });
      setSelectedId(note.id); setNoteTitle(''); setNoteText(''); setSearch(''); setEditingNoteId(null);
    }, 'Note saved to your Brain. Select it as chat context or use it to support a memory proposal.');
  }

  async function importTextFile(file: File) {
    await act('Importing text file', async current => {
      if (!/\.(md|markdown|txt)$/i.test(file.name)) throw new Error('Choose a UTF-8 Markdown or text file.');
      if (file.size > 1024 * 1024) throw new Error('Text file exceeds the 1 MiB import limit.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const object = await current.request<BrainObject>('/v1/objects', 'POST', { title: file.name, text, kind: 'document' });
      setSelectedId(object.id); setSearch(''); setView('files');
    }, 'A copy was imported into your encrypted Brain. The original file was not changed or connected for sync.');
  }

  async function scanFolder(current: PersonalNodeClient, folderId: string, path: string) {
    const version = sessionVersion.current;
    const scanVersion = ++folderScanVersion.current;
    folderScanMonitor.current?.dispose();
    const isCurrent = () => currentClient.current === current && sessionVersion.current === version && folderScanVersion.current === scanVersion;
    const monitor = createFolderScanMonitor({ client: current, folderId, scanId: crypto.randomUUID(), isCurrent,
      onUpdate: view => { if (isCurrent()) setFolderScan({ view, path }); },
    });
    folderScanMonitor.current = monitor;
    try { await monitor.done; }
    catch (e) { if (isCurrent()) throw e; }
  }

  async function refreshFolder(folderId: string) {
    const folder = brain?.folders.find(item => item.id === folderId);
    if (!folder) return false;
    return act('Reading folder updates', current => scanFolder(current, folder.id, folder.path));
  }

  async function addFolder(native = false) {
    let path = folderPath.trim();
    if (native) {
      try { path = (await chooseDesktopFolder()) || ''; }
      catch (e) { setError(errorText(e)); return; }
    }
    if (!path) return;
    await act('Connecting folder', async current => {
      const version = sessionVersion.current;
      const folder = await current.request<{ id: string }>('/v1/folders', 'POST', { path });
      if (currentClient.current !== current || version !== sessionVersion.current) return;
      setFolderPath('');
      await scanFolder(current, folder.id, path);
    });
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
      const limit = transferLimitBytes(status?.limits?.transferBytes);
      if (file.size > limit) throw new Error(`Recovery bundle exceeds this node's ${(limit / 1024 / 1024).toLocaleString()} MiB transfer limit.`);
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
  const graphObjects = objects.filter(object => object.kind === 'code_graph');
  const graphObject = graphObjects.find(object => object.id === codeGraphId) ?? graphObjects[0];
  const codeGraph = useMemo(() => graphObject ? parseCodeGraph(graphObject.text) : null, [graphObject]);
  const noteObjects = useMemo(() => brain?.objects.filter(object => object.kind !== 'code_graph') ?? [], [brain?.objects]);
  const feedback = <><div className="pn-sr" role="status" aria-live="polite">{busy || notice}</div>{busy && !(folderScan?.view.requestPending) && <div className="pn-progress" aria-hidden="true"><span className="pn-spinner" />{busy}…</div>}{error && <div className="pn-alert" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}{notice && !error && !busy && <div className="pn-notice">{notice}</div>}{folderScan && !isMember && <FolderScanProgress view={folderScan.view} folderPath={folderScan.path} onCancel={() => { void folderScanMonitor.current?.cancel(); }} onDismiss={() => setFolderScan(null)} />}</>;

  if (!client || !status) return <main className="pn-gate"><section className="pn-setup"><Brand /><p className="pn-eyebrow">YOUR MEMORY. YOUR NODE.</p><h1>Connect your personal Brain.</h1><p>A local-first workspace for your files, conversations and approved knowledge. No cloud account is required for this mode.</p>{feedback}<form onSubmit={event => { event.preventDefault(); void connect(url, token); }}>
    <label>Personal node URL<input type="url" required value={url} onChange={event => setUrl(event.target.value)} spellCheck={false} /></label>
    <label>Node access token<input type="password" required value={token} onChange={event => setToken(event.target.value)} autoComplete="off" spellCheck={false} /></label>
    <button className="pn-primary" disabled={!!busy}>{busy || 'Connect node →'}</button>
  </form><p className="pn-fine">The desktop app connects to its local service automatically. In browser mode, enter your owner token or a separate member credential issued by the owner. Never share an owner token or Brain passphrase. Tokens stay in memory. Remote nodes require HTTPS and an explicitly allowed browser origin.</p><p className="pn-fine">The existing cloud workspace is a separate app mode.</p></section></main>;

  if (isMember && (!brain || status.locked)) return <main className="pn-gate"><section className="pn-setup"><Brand /><h1>The owner must unlock this node.</h1><p>Member credentials cannot unlock a Brain or change its encryption. Do not ask for the owner's passphrase.</p>{feedback}<button onClick={disconnect}>Disconnect this session</button></section></main>;

  if (!brain || status.locked) return <main className="pn-gate"><section className="pn-setup"><Brand /><p className="pn-eyebrow">{status.initialized ? 'ENCRYPTED BRAIN · LOCKED' : 'A NEW SPACE FOR YOUR KNOWLEDGE'}</p><h1>{status.initialized ? 'Welcome back.' : 'Start with your world.'}</h1><p>{status.initialized ? 'Unlock this node to read its Brain. Your passphrase is not saved in the interface.' : 'Choose a starting label and configuration. Your Brain starts private; room access is granted separately.'}</p>{feedback}<form onSubmit={unlock}>
    {!status.initialized && <><label>Brain name<input value={name} maxLength={120} required onChange={event => setName(event.target.value)} /></label><div className="pn-templates">{(Object.keys(TEMPLATE_NOTES) as Array<keyof typeof TEMPLATE_NOTES>).map(key => <button type="button" key={key} aria-pressed={template === key} onClick={() => setTemplate(key)}><strong>{key}</strong><span>{TEMPLATE_NOTES[key]}</span></button>)}</div></>}
    <label>{status.initialized ? 'Passphrase' : 'Create a passphrase · at least 12 characters'}<input type="password" value={passphrase} required minLength={status.initialized ? 1 : 12} onChange={event => setPassphrase(event.target.value)} autoComplete="off" /></label>
    <button className="pn-primary" disabled={!!busy}>{busy || (status.initialized ? 'Unlock Brain →' : 'Create encrypted Brain →')}</button>
  </form><p className="pn-fine">Encryption protects stored data. An unlocked node can read it to serve your requests. There is no passphrase reset; keep a recovery copy and your passphrase safely.</p>
  {!status.initialized && <details><summary>Restore an existing Brain instead</summary><form onSubmit={restore}><label>Encrypted recovery bundle<input type="file" accept="application/json,.json" onChange={event => setRestoreFile(event.target.files?.[0] || null)} /></label><label>Original bundle passphrase<input type="password" required value={passphrase} onChange={event => setPassphrase(event.target.value)} autoComplete="off" /></label><label className="pn-check"><input type="checkbox" checked={restoreConfirmed} onChange={event => setRestoreConfirmed(event.target.checked)} />Restore into this empty node only.</label><button disabled={!!busy || !restoreFile || !restoreConfirmed}>Restore encrypted bundle</button></form></details>}
  <button className="pn-text" disabled={!!busy} onClick={disconnect}>Disconnect this session</button></section></main>;

  return <div className={`pn-app pn-unified${sidebarCollapsed ? ' pn-sidebar-collapsed' : ''}`}>
    <header className="pn-header"><button className="pn-menu-toggle" aria-label="Toggle workspace navigation" aria-controls="pn-workspace-navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(value => !value)}>☰</button><Brand /><div className="pn-breadcrumb">{brain.name}<span>/ {NAV.find(item => item.id === panel)?.label}</span></div><span className="pn-node-pill"><i />{isMember ? 'member access' : 'personal node'}</span><button disabled={!!busy} onClick={() => void act('Refreshing Brain', async () => {})}>Refresh</button>{isMember ? <button onClick={disconnect}>Disconnect</button> : <button disabled={!!busy} onClick={() => void lock()}>Lock Brain</button>}</header>
    <div className="pn-workspace-feedback">{feedback}</div>
    <div className="pn-workspace">
      <PersonalSidebar items={NAV.filter(item => !isMember || MEMBER_PANELS.has(item.id))} active={panel} name={brain.name} member={isMember} busy={!!busy} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} open={sidebarOpen} setOpen={setSidebarOpen} onNavigate={navigate} onExport={() => void exportBrain()} onDisconnect={disconnect} counts={{ brain: objects.length, inbox: pending.length, agents: brain.governance?.runs.filter(run => run.state === 'awaiting-approval' || run.state === 'running').length || 0, work: brain.workspace?.tasks.filter(task => task.status !== 'done').length || 0 }} folders={<details open><summary>CONNECTED FOLDERS <span>{folders.length}</span></summary>
        <div className="pn-folders">{folders.map(folder => <div className="pn-folder" key={folder.id}><span title={folder.path}>▱ {folder.path.split('/').filter(Boolean).pop()}</span><button aria-label={`Refresh ${folder.path}`} title={folder.path} disabled={!!busy} onClick={() => void refreshFolder(folder.id)}>↻</button></div>)}{!folders.length && <p>No folders connected.</p>}</div>
        {isNativeDesktop() ? <button className="pn-add" disabled={!!busy} onClick={() => void addFolder(true)}>＋ Connect folder</button> : <form className="pn-folder-form" onSubmit={event => { event.preventDefault(); void addFolder(); }}><label>Folder on this node<input value={folderPath} placeholder="/absolute/path/to/notes" onChange={event => setFolderPath(event.target.value)} required /></label><button disabled={!!busy}>＋ Connect folder</button></form>}
        <p className="pn-fine">Connect an Obsidian vault or Markdown folder. Read refresh is manual. Writes require an exact preview and approval in Sources & sync. Hidden, secret and unsupported files are excluded.</p>
      </details>} />

      <main className="pn-main pn-unified-main">
        <div className="pn-view-host pn-chat-host" hidden={panel !== 'chat' && panel !== 'canvas'}>
          <ChatWorkspace key={brain.brainId} brain={brain} providers={status.providers} busy={!!busy} act={act} activeRoomId={activeRoom?.id || null} onActiveRoom={setActiveRoomId} onOpenBrain={openBrain} onNavigate={navigate} mode={panel === 'canvas' ? 'canvas' : 'chat'} visible={panel === 'chat' || panel === 'canvas'} preferredProviders={preferredProviders} />
        </div>
        {['work', 'agents', 'library', 'manifests', 'policies', 'shared', 'audit'].includes(panel) && <WorkspacePanels panel={panel as 'work' | 'agents' | 'library' | 'manifests' | 'policies' | 'shared' | 'audit'} brain={brain} providers={status.providers} busy={!!busy} act={act} activeRoomId={activeRoom?.id || null} onOpenRoom={openRoom} onOpenBrain={openBrain} onNavigate={navigate} />}
        {panel === 'sources' && !isMember && <SourcesPanel key={brain.brainId} brain={brain} busy={!!busy} act={act} onRefreshFolder={refreshFolder} />}
        <div className={`pn-view-host${view === 'graph' ? ' pn-brain-graph-mode' : ''}`} hidden={panel !== 'brain'}><div className="pn-panel-heading"><div><p className="pn-eyebrow">ONE BRAIN / MANY VIEWS</p><h1>{view === 'graph' ? 'Graph view' : 'Your Brain'}</h1></div><div className="pn-segment" aria-label="Brain view"><button aria-pressed={view === 'graph'} onClick={() => setView('graph')}>Obsidian</button>{!isMember && <button aria-pressed={view === 'code'} onClick={() => setView('code')}>GitNexus</button>}<button aria-pressed={view === 'files'} onClick={() => setView('files')}>Files</button>{!isMember && <><button aria-pressed={view === 'freeform'} onClick={() => setView('freeform')}>Freeform</button><button aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>Timeline</button></>}</div></div>{view !== 'code' && view !== 'graph' && <label className="pn-search"><span className="pn-sr">Search Brain objects</span><input type="search" placeholder="Search files and memory…" value={search} onChange={event => setSearch(event.target.value)} /></label>}
          {!isMember && <details className="pn-capture" open={!objects.length || !!editingNoteId || undefined}>
            <summary><span>{editingNoteId ? 'Edit local note' : '＋ Capture a note'}</span><small>{editingNoteId ? 'New revision · history retained' : 'No folder needed'}</small></summary>
            <form className="pn-note-form" onSubmit={saveNote}>
              <label>Title<input value={noteTitle} onChange={event => setNoteTitle(event.target.value)} maxLength={200} placeholder="An idea worth keeping" required disabled={!!busy} /></label>
              <label>Note<textarea value={noteText} onChange={event => setNoteText(event.target.value)} rows={3} placeholder="Add your own words. Notes become sources, not automatically approved memories." required disabled={!!busy} /></label>
              <div className="pn-capture-actions"><p className="pn-fine">Saved on this node. Nothing is sent to a model.</p>{editingNoteId && <button type="button" disabled={!!busy} onClick={() => { setEditingNoteId(null); setNoteTitle(''); setNoteText(''); }}>Cancel edit</button>}<button className="pn-primary" disabled={!!busy || !noteTitle.trim() || !noteText.trim()}>{busy === 'Saving note' ? 'Saving…' : editingNoteId ? 'Save revision →' : 'Save note →'}</button></div>
            </form>
            <div className="pn-single-import"><label>Import a Markdown or text file<input type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" disabled={!!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importTextFile(file); }} /></label><p className="pn-fine">A standalone copy, up to 1 MiB. For ongoing sync, connect a folder instead. Voice recording and transcription are not connected.</p></div>
          </details>}
          <div className="pn-brain-view"><div className="pn-object-host" hidden={view !== 'freeform' && view !== 'timeline'}><ObjectCanvas brain={brain} query={search} mode={view === 'timeline' ? 'timeline' : 'freeform'} onSelect={setSelectedId} busy={!!busy} activeRoom={activeRoom} onUseSources={ids => activeRoom ? act('Updating chat context', current => current.request(`/v1/rooms/${encodeURIComponent(activeRoom.id)}/sources`, 'PUT', { objectIds: Array.from(new Set([...activeRoom.selectedSourceIds, ...ids])) }), `Selected sources added to ${activeRoom.title}. Nothing was sent to a model.`) : Promise.resolve(false)} onOpenChat={() => navigate('chat')} /></div>{view === 'freeform' || view === 'timeline' ? null : view === 'code' ? <>
            {graphObjects.length > 0 && <label className="pn-search">Code repository snapshot<select value={graphObject?.id ?? ''} onChange={event => setCodeGraphId(event.target.value)}>{graphObjects.map(object => <option key={object.id} value={object.id}>{object.title}</option>)}</select></label>}
            <CodeGraph key={graphObject?.revisionId ?? 'empty'} graph={codeGraph} />
            <button onClick={() => setPanel('sources')}>Connect / refresh a code graph</button>
          </> : view === 'graph' ? <BrainGraph key={brain.brainId} objects={noteObjects} folders={folders} query={search} onSearchChange={setSearch} selectedId={selectedId} onSelect={setSelectedId} visible={panel === 'brain'} /> : !objects.length ? <Empty title="Start with something worth keeping.">Save a note above, or connect a folder of Markdown and text files. Then select sources for a chat or propose a memory. Your Brain starts empty, with no demo content.</Empty> : visibleObjects.length === 0 ? <Empty title="No matching objects">Try another title, type or source path.</Empty> : <div className="pn-file-list">{visibleObjects.map(object => <button className="pn-file" key={object.id} aria-pressed={selectedId === object.id} onClick={() => setSelectedId(object.id)}><span className="pn-file-icon">{object.kind === 'memory' ? '◇' : '▤'}</span><span><strong>{object.title}</strong><small>{object.sourcePath || `${object.kind} · ${object.sourceIds?.length || 0} source links`}</small></span><span>↗</span></button>)}</div>}</div>
          <section hidden={view === 'code' || (view === 'graph' && !selected)} className="pn-detail" aria-label="Source details">{selected ? <><div className="pn-detail-heading"><span className="pn-eyebrow">{selected.kind} / SOURCE DETAIL</span><button aria-label="Close source details" onClick={() => setSelectedId(null)}>×</button></div><h2>{selected.title}</h2><p className="pn-source-path">{selected.sourcePath || selected.id}</p><pre>{selected.text}</pre>{!isMember && <div className="pn-detail-actions"><button disabled={!activeRoom || !!busy} onClick={() => activeRoom && void act('Updating room context', current => current.request(`/v1/rooms/${encodeURIComponent(activeRoom.id)}/sources`, 'PUT', { objectIds: Array.from(new Set([...activeRoom.selectedSourceIds, selected.id])) }), `Source selected for ${activeRoom.title}.`)}>＋ Use in {activeRoom?.title || 'a chat'}</button><button onClick={() => { setProposalSource(selected.id); navigate('inbox'); }}>Propose memory</button>{selected.kind === 'note' && !selected.sourcePath && <button disabled={!!busy} onClick={() => { setEditingNoteId(selected.id); setNoteTitle(selected.title); setNoteText(selected.text); }}>Edit note</button>}<button onClick={() => navigate('work')}>Open task board</button></div>}<p className="pn-fine">{isMember ? 'Read-only source access. The owner manages context and sharing.' : `Revision ${selected.revisionId}. Selecting a source does not send it to a model.`}</p></> : <div className="pn-detail-hint">Select a node or file to inspect its content and provenance.</div>}</section>
        </div>

        {panel === 'inbox' && !isMember && <><div className="pn-panel-heading"><div><p className="pn-eyebrow">PROPOSE → REVIEW → APPROVE</p><h1>Memory inbox</h1></div><span className="pn-count">{pending.length} pending</span></div><div className="pn-pane-scroll"><p className="pn-muted">Proposals are separate from approved knowledge. Every memory needs a supporting source and your review. Agents do not silently update Canon.</p><form className="pn-card pn-proposal-form" onSubmit={event => { event.preventDefault(); if (!proposalSource) return; void act('Creating memory proposal', async current => { await current.request('/v1/proposals', 'POST', { title: proposalTitle, text: proposalText, sourceIds: [proposalSource] }); setProposalTitle(''); setProposalText(''); setProposalSource(''); }, 'Memory proposal saved for review.'); }}><h2>Propose a memory</h2><label>Title<input value={proposalTitle} onChange={event => setProposalTitle(event.target.value)} required maxLength={200} /></label><label>Memory<textarea value={proposalText} onChange={event => setProposalText(event.target.value)} required rows={4} /></label><label>Supporting source<select value={proposalSource} required onChange={event => setProposalSource(event.target.value)}><option value="">Choose supporting source</option>{objects.map(object => <option key={object.id} value={object.id}>{object.title}</option>)}</select></label>{!objects.length && <p className="pn-fine">First save a note or connect a source folder in your Brain.</p>}<button className="pn-primary" disabled={!!busy || !proposalSource}>Save proposal</button></form>
          {(brain.proposals || []).map(proposal => <article className="pn-card pn-proposal" key={proposal.id}><div className="pn-detail-heading"><span className={`pn-status pn-status-${proposal.status}`}>{proposal.status}</span><span className="pn-fine">{proposal.sourceIds.length} source links</span></div><h2>{proposal.title}</h2><p className="pn-prewrap">{proposal.text}</p>{proposal.status === 'pending' && <div className="pn-detail-actions"><button className="pn-primary" disabled={!!busy} onClick={() => void act('Approving memory', current => current.request(`/v1/proposals/${encodeURIComponent(proposal.id)}/review`, 'POST', { decision: 'accept' }), 'Memory approved. It is now available in both Brain views.')}>Approve memory</button><button disabled={!!busy} onClick={() => void act('Rejecting proposal', current => current.request(`/v1/proposals/${encodeURIComponent(proposal.id)}/review`, 'POST', { decision: 'reject' }))}>Reject</button></div>}</article>)}
        </div></>}

        {panel === 'node' && !isMember && <>
          <div className="pn-panel-heading"><div><p className="pn-eyebrow">LOCAL FIRST / REPLICATE EXPLICITLY</p><h1>Personal node</h1></div></div>
          <div className="pn-pane-scroll">
            <section className="pn-card">
              <h2>Connected node</h2>
              <dl className="pn-definitions"><dt>Address</dt><dd>{client.url}</dd><dt>Node ID</dt><dd>{status.nodeId}</dd><dt>Brain</dt><dd>{brain.brainId}</dd><dt>State</dt><dd>Unlocked · owner administration with scoped members</dd><dt>History</dt><dd>{brain.revisions?.length || 0} revisions / {brain.audit?.length || 0} audit entries</dd></dl>
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

    </div>
  </div>;
}
