import { useState } from 'react';
import type { Brain, PersonalNodeClient } from './api';
import './SourcesPanel.css';

type Act = (label: string, work: (client: PersonalNodeClient) => Promise<unknown>, success?: string) => Promise<boolean>;
type Preview = { id: string; kind: string; destination: string; beforeText: string; afterText: string; existed: boolean; expiresAt: string };

export function SourcesPanel({ brain, busy, act, onRefreshFolder }: { brain: Brain; busy: boolean; act: Act; onRefreshFolder: (folderId: string) => Promise<boolean> }) {
  const [repository, setRepository] = useState('');
  const [ref, setRef] = useState('main');
  const [subpath, setSubpath] = useState('');
  const [token, setToken] = useState('');
  const [target, setTarget] = useState('');
  const [filePath, setFilePath] = useState('');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [graphRepository, setGraphRepository] = useState('');
  const connections = brain.connections ?? [];
  const local = brain.folders.find(folder => folder.id === target);
  const github = connections.find(connection => connection.id === target);
  const files = brain.objects.filter(object => local ? object.sourcePath?.startsWith(`${local.path}/`) : github &&
    object.sourceMetadata?.repository === github.repository && object.sourceMetadata?.ref === github.ref &&
    (!github.subpath || object.sourceMetadata.path.startsWith(`${github.subpath}/`)));

  async function withToken(work: (client: PersonalNodeClient, secret: string) => Promise<unknown>, label: string) {
    const secret = token; setToken('');
    return act(label, client => work(client, secret));
  }
  async function cancel() {
    if (!preview) return;
    if (await act('Cancelling write preview', client => client.request(`/v1/writebacks/${preview.id}/cancel`, 'POST', {}))) {
      setPreview(null); setConfirmed(false);
    }
  }

  return <>
    <div className="pn-panel-heading"><div><p className="pn-eyebrow">READ → REVIEW → WRITE ON REQUEST</p><h1>Sources & sync</h1></div></div>
    <div className="pn-pane-scroll pn-sources">
      <section className="pn-card"><h2>Obsidian / Markdown vaults</h2><p>Connect your vault using the folder control in the sidebar. Arkive reads ordinary Markdown, including note links. It does not install an Obsidian plugin or edit your vault settings.</p>
        <p className="pn-fine">Refresh reads current files into versioned Brain objects. It never writes to a source. Missing files are retained in Brain history; deletion propagation and continuous background watching are not enabled.</p>
        {brain.folders.map(folder => <div className="pn-source-row" key={folder.id}><code>{folder.path}</code><button disabled={busy} onClick={() => void onRefreshFolder(folder.id)}>Read updates</button></div>)}
      </section>
      <form className="pn-card" onSubmit={event => { event.preventDefault(); void act('Connecting GitHub source', async client => {
        await client.request('/v1/connections', 'POST', { repository, ref, subpath }); setRepository('');
      }, 'Repository registered. Read updates to import its Markdown and text files.'); }}>
        <h2>Connect a GitHub Brain</h2><p className="pn-fine">Choose the repository, ref and optional folder explicitly. This imports Markdown/text, not arbitrary executable code. Code relationships use the separate GitNexus import below.</p>
        <label>Repository<input required placeholder="owner/repository" value={repository} onChange={event => setRepository(event.target.value)} disabled={busy} /></label>
        <label>Branch / tag / commit<input required value={ref} onChange={event => setRef(event.target.value)} disabled={busy} /></label>
        <label>Subfolder (optional)<input placeholder="knowledge" value={subpath} onChange={event => setSubpath(event.target.value)} disabled={busy} /></label>
        <button disabled={busy}>Connect GitHub source</button>
      </form>
      <section className="pn-card"><h2>GitHub access</h2><label>GitHub token (this operation only)<input type="password" autoComplete="off" spellCheck={false} value={token} onChange={event => setToken(event.target.value)} disabled={busy} /></label>
        <p className="pn-fine">Public reads can be anonymous. Private reads need repository Contents: read; writes need Contents: write. Use a fine-grained token limited to the chosen repository. Tokens are cleared after each operation and never saved in the Brain. Re-enter for approval.</p>
        {connections.map(connection => <div className="pn-source-row" key={connection.id}><div><strong>{connection.repository}</strong><small>{connection.ref}{connection.subpath && ` / ${connection.subpath}`}</small><small>{connection.lastSyncedAt ? `Last read ${new Date(connection.lastSyncedAt).toLocaleString()}` : 'Not read yet'}</small></div><button disabled={busy} onClick={() => void withToken(async (client, secret) => {
          const result = await client.request<{ imported: number; skipped: number }> (`/v1/connections/${connection.id}/refresh`, 'POST', { ...(secret ? { token: secret } : {}) });
          setReceipt(`Read ${result.imported} files; skipped ${result.skipped} unsupported or excluded entries.`);
        }, 'Reading GitHub snapshot')}>Read updates</button></div>)}
      </section>
      <section className="pn-card"><h2>Request a source change</h2><p>Changes here affect the original file. Chat replies and approved memories never write back automatically.</p>
        {!preview ? <form onSubmit={event => { event.preventDefault(); setReceipt(''); setConfirmed(false); void withToken(async (client, secret) => {
          const result = await client.request<Preview>('/v1/writebacks/preview', 'POST', {
            kind: local ? 'local' : 'github', ...(local ? { folderId: target } : { connectionId: target }),
            path: filePath, text, ...(secret ? { token: secret } : {}),
          }); setPreview(result);
        }, 'Preparing source change preview'); }}>
          <label>Write destination<select required value={target} disabled={busy} onChange={event => { setTarget(event.target.value); setFilePath(''); setText(''); }}><option value="">Choose a connected source</option>{brain.folders.map(folder => <option key={folder.id} value={folder.id}>{folder.path}</option>)}{connections.map(connection => <option key={connection.id} value={connection.id}>{connection.repository} · {connection.ref}{connection.subpath && ` / ${connection.subpath}`}</option>)}</select></label>
          <label>Load existing Brain copy (optional)<select disabled={busy || !target} value="" onChange={event => {
            const object = files.find(item => item.id === event.target.value); if (!object) return;
            setFilePath(local ? object.sourcePath!.slice(local.path.length + 1) : object.sourceMetadata!.path); setText(object.text);
          }}><option value="">Choose a file, or enter a new path below</option>{files.map(object => <option key={object.id} value={object.id}>{object.sourceMetadata?.path ?? object.sourcePath}</option>)}</select></label>
          <label>Relative Markdown / text path<input required value={filePath} disabled={busy} placeholder="notes/idea.md" onChange={event => setFilePath(event.target.value)} /></label>
          <label>Requested file contents<textarea value={text} rows={8} disabled={busy} onChange={event => setText(event.target.value)} /></label>
          <p className="pn-fine">GitHub writes create a commit directly on the displayed branch, subject to branch protection. They do not create a pull request. Choose a review branch when appropriate. Local parent folders must already exist.</p>
          <button disabled={busy || !target || !filePath}>Preview exact changes</button>
        </form> : <div className="pn-write-preview"><p className="pn-eyebrow">{preview.existed ? 'UPDATE EXISTING FILE' : 'CREATE NEW FILE'}</p><code>{preview.destination}</code><div className="pn-write-diff"><section><h3>Before</h3><pre>{preview.beforeText || '(empty / new file)'}</pre></section><section><h3>After</h3><pre>{preview.afterText || '(empty file)'}</pre></section></div><p className="pn-fine">Expires {new Date(preview.expiresAt).toLocaleTimeString()}. If the source changes, this preview will be rejected. The old contents are preserved in encrypted Brain history before applying.</p>
          <label className="pn-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I approve writing these exact contents to the displayed destination.</label>
          <div className="pn-detail-actions"><button className="pn-primary" disabled={busy || !confirmed || (preview.kind === 'github' && !token)} onClick={() => { const id = preview.id; void withToken(async (client, secret) => {
            try {
              const result = await client.request<{ verified: boolean; warning?: string }>(`/v1/writebacks/${id}/apply`, 'POST', { confirm: true, ...(secret ? { token: secret } : {}) });
              setReceipt(result.warning || 'Source write verified. The Brain copy and revision history are updated.');
            } finally { setPreview(null); setConfirmed(false); }
          }, 'Applying approved source change'); }}>Apply approved change</button><button disabled={busy} onClick={() => void cancel()}>Cancel preview</button></div>
        </div>}
      </section>
      <section className="pn-card"><h2>GitNexus code graph</h2><p>Import an already-indexed repository from GitNexus on this node. This is a snapshot of code symbols and relationships, separate from your note-link graph.</p>
        <form onSubmit={event => { event.preventDefault(); void act('Importing GitNexus code graph', client => client.request('/v1/gitnexus/import', 'POST', { repository: graphRepository }), 'Code graph imported. Open Brain → GitNexus.'); }}><label>Registered GitNexus repository name<input required placeholder="my-indexed-repository" value={graphRepository} disabled={busy} onChange={event => setGraphRepository(event.target.value)} /></label><button disabled={busy}>Import GitNexus snapshot</button></form>
        <label>Or import an Arkive code-graph JSON snapshot<input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
          void act('Importing code graph snapshot', async client => { if (file.size > 1024 * 1024) throw new Error('Code graph exceeds 1 MiB.'); await client.request('/v1/code-graphs', 'POST', { graph: JSON.parse(await file.text()) }); }, 'Code graph imported. Open Brain → GitNexus.');
        }} /></label><p className="pn-fine">Up to 500 nodes / 1,500 relationships. Arkive does not index repositories or run their code. Refresh a snapshot by importing it again after re-indexing with GitNexus.</p>
      </section>
      {receipt && <p className="pn-notice" role="status">{receipt}</p>}
    </div>
  </>;
}
