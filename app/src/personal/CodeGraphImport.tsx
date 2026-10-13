import { useEffect, useState } from 'react';
import './CodeGraphImport.css';

export type RepositoryListing = { repositories: { name: string; indexedAt?: string; nodes?: number; edges?: number; files?: number }[]; skipped: number };
export type CodeImportInput = { repository: string } | { file: File };
export type CodeImportProps = {
  busy: boolean;
  loadRepositories: (signal: AbortSignal) => Promise<RepositoryListing>;
  onImport: (input: CodeImportInput) => Promise<boolean>;
};

/** Discovery is read-only; only an explicit import adds a snapshot to the Brain. */
export function CodeGraphImport({ busy, loadRepositories, onImport }: CodeImportProps) {
  const [listing, setListing] = useState<RepositoryListing | null>(null);
  const [repository, setRepository] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setLoading(true); setError(''); setListing(null);
    loadRepositories(controller.signal).then(result => {
      if (!current) return;
      setListing(result);
      setRepository(value => result.repositories.some(repo => repo.name === value) ? value : result.repositories[0]?.name || '');
    }).catch(reason => {
      if (current) setError(reason instanceof Error ? reason.message : 'Repository discovery is unavailable. You can still import a JSON snapshot.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [loadRepositories, refresh]);
  async function submit(input: CodeImportInput) {
    if (pending || busy) return;
    setPending(true); setError('');
    try { await onImport(input); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Import failed. Try again.'); }
    finally { setPending(false); }
  }
  const selected = listing?.repositories.find(repo => repo.name === repository);
  return <section className="pn-code-import" aria-label="Connect GitNexus repository" aria-busy={loading || pending}>
    <div className="pn-code-import-title"><div><span>LOCAL CODE INDEX</span><h3>Open a GitNexus repository</h3></div><button type="button" disabled={loading || pending || busy} onClick={() => setRefresh(value => value + 1)}>Refresh repositories</button></div>
    <p>Choose an existing index on this computer. Import saves its symbols and relationships in your encrypted Brain and opens the graph.</p>
    {loading ? <p role="status">Finding indexed repositories…</p> : listing?.repositories.length ? <form onSubmit={event => { event.preventDefault(); void submit({ repository }); }}>
      <label>Indexed repository<select value={repository} disabled={busy || pending} onChange={event => setRepository(event.target.value)}>{listing.repositories.map(repo => <option key={repo.name} value={repo.name}>{repo.name}</option>)}</select></label>
      <button type="submit" disabled={!repository || busy || pending}>{pending ? 'Importing…' : 'Import & open graph'}</button>
      {selected && <small>{selected.nodes === undefined ? '' : `${selected.nodes.toLocaleString()} indexed nodes · `}{selected.indexedAt ? `Index date: ${new Date(selected.indexedAt).toLocaleDateString()}` : 'Existing local index'}</small>}
    </form> : listing && <p>No registered repositories found. Index your code repository with GitNexus first, then refresh this list. An Obsidian vault does not contain a code index.</p>}
    {!!listing?.skipped && <p>{listing.skipped} invalid or ambiguous registry entries were omitted.</p>}
    {error && <p role="alert">{error}</p>}
    <details><summary>Import a JSON snapshot instead</summary><label>Arkive code-graph JSON<input type="file" accept=".json,application/json" disabled={busy || pending} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (file) void submit({ file });
    }} /></label><p>Use an exported <code>arkive-code-graph</code> v1 file, up to 1 MiB. Useful when your index is on a different computer.</p></details>
    <p className="pn-code-import-boundary">Up to 500 nodes / 1,500 relationships per snapshot. No repository code is executed or sent to a model. Re-import after re-indexing to update the graph.</p>
  </section>;
}
