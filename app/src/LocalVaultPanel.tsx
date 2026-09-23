import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { decodeOriginal, exportOriginals, listOriginals, restoreOriginals, saveOriginals, type LocalOriginal } from './localVault';
import { useLocalScope } from './LocalScopeProvider';

const button: CSSProperties = { padding:'8px 12px', border:'1px solid #30302c', borderRadius:7, background:'#1b1b19', color:'#ddd', font:'inherit', fontSize:12, cursor:'pointer' };
export function LocalVaultPanel() {
  const { session } = useLocalScope();
  const [originals, setOriginals] = useState<LocalOriginal[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null); const restore = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void listOriginals(session).then(rows => { if (alive && session.active) setOriginals(rows); }).catch(error => { if (alive && session.active) setMessage(String(error)); }); };
    const changed = (event: Event) => { if ((event as CustomEvent<{scope: string}>).detail?.scope === session.scope) refresh(); };
    refresh(); window.addEventListener('arkive-originals-changed', changed);
    return () => { alive = false; window.removeEventListener('arkive-originals-changed', changed); };
  }, [session]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Storage operation failed.'); } finally { setBusy(false); }
  };
  const read = originals.find(row => row.hash === selected);
  return <section aria-label="local originals" style={{padding:18,border:'1px solid #252522',borderRadius:12,background:'#10100f',minWidth:0}}>
    <div style={{fontSize:17,color:'#e8e8e4'}}>local originals <span style={{fontSize:11,color:'#888'}}>· {originals.length} saved</span></div>
    <p style={{fontSize:12,color:'#999',lineHeight:1.6}}>Real .md / .txt imports, notes and tasks live in this browser or desktop webview’s storage. Nothing here is sent to an agent or cloud backend. Export for backup; clearing app data can remove this local copy.</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
      <button style={button} disabled={busy} onClick={() => input.current?.click()}>import text file</button>
      <button style={button} disabled={busy || !originals.length} onClick={() => void run(async () => {
        const data = await exportOriginals(session); const url = URL.createObjectURL(new Blob([data], {type:'application/json'}));
        const link = document.createElement('a'); link.href = url; link.download = 'arkive-local-originals.json'; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('Export prepared. Keep this unencrypted archive somewhere private.');
      })}>export originals</button>
      <button style={button} disabled={busy} onClick={() => restore.current?.click()}>restore archive</button>
    </div>
    <input ref={input} aria-label="import local text file" hidden type="file" accept=".md,.txt,text/plain,text/markdown" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if(file) void run(async () => { const row = await decodeOriginal(file); await saveOriginals([row], session); setSelected(row.hash); setMessage('Original saved and checksum verified. Brain registration is a separate next step.'); }); }} />
    <input ref={restore} aria-label="restore originals archive" hidden type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if(file) void run(async () => { const count = await restoreOriginals(file, session); setMessage(`${count} originals verified; restore is additive and leaves existing originals unchanged.`); }); }} />
    <p role="status" style={{fontSize:12,color:'#c8b4a6',lineHeight:1.5}}>{busy ? 'verifying…' : message}</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:5}}>{originals.map(row => <button key={row.hash} style={{...button,color:row.hash === selected ? '#ff5a1f' : '#bbb'}} onClick={() => setSelected(row.hash)}>{row.name}</button>)}</div>
    {read && <article style={{marginTop:16,borderTop:'1px solid #252522',paddingTop:14}}><div style={{fontSize:11,color:'#888',overflowWrap:'anywhere'}}>{read.kind} · {read.bytes} bytes · {read.hash}</div><pre style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,lineHeight:1.7,whiteSpace:'pre-wrap',overflowWrap:'anywhere',color:'#d8d8d4',maxHeight:360,overflowY:'auto'}}>{read.content}</pre></article>}
    <p style={{fontSize:10,color:'#777',marginBottom:0}}>Originals-only archive, not a full Brain backup. This workspace’s local storage is separate from fixture previews and legacy unscoped data. Namespace isolation is not encryption; another person with access to this browser profile can inspect it. No sync, model calls or automatic canon promotion are implied.</p>
  </section>;
}
