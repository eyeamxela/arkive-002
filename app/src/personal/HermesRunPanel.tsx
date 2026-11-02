import { useState } from 'react';
import type { PersonalNodeClient, RunProgress } from './api';

/** Controls intentionally do not use the workspace busy lock: a run can await approval. */
export function HermesRunPanel({ client, run }: { client: PersonalNodeClient; run: RunProgress }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const runtime = run.runtime;
  if (!runtime) return null;
  async function control(body: { action: string; requestId?: string; choice?: string }) {
    if (pending) return;
    setPending(true); setError(''); setNotice('');
    try {
      await client.request(`/v1/hermes/runs/${encodeURIComponent(run.id)}/control`, 'POST', body);
      setNotice(body.action === 'stop' ? 'Stop requested. Remote side effects may already have occurred.' : 'Response confirmed by Hermes.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Runtime control failed'); }
    finally { setPending(false); }
  }
  return <section className="pn-hermes-run" aria-label="Hermes live run">
    <header><strong>Hermes · {runtime.stopping ? 'Stopping' : 'Running'}</strong><button type="button" disabled={pending || runtime.stopping} onClick={() => void control({ action: 'stop' })}>Stop run</button></header>
    <small>Remote run: {runtime.remoteRunId || 'Awaiting acceptance'}</small>
    {runtime.text && <p className="pn-hermes-output">{runtime.text}</p>}
    {!!runtime.activity.length && <details open={!!runtime.approvals.length}><summary>Tool activity · {runtime.activity.length} recent events</summary><ol>{runtime.activity.map((event, index) => <li key={`${index}:${event.at}`}>{event.type} {event.tool}</li>)}</ol></details>}
    {runtime.approvals.map(item => <div className="pn-hermes-approval" key={item.requestId}>
      <strong>Hermes requests approval</strong><p>{item.description}</p><pre>{item.command}</pre>
      <p>This authorizes one action on the Hermes runtime—not a permanent Arkive permission.</p>
      <div>{item.choices.includes('deny') && <button type="button" disabled={pending || runtime.controlPending || runtime.stopping} onClick={() => void control({ action: 'approval', requestId: item.requestId, choice: 'deny' })}>Deny</button>}{item.choices.includes('once') && <button type="button" disabled={pending || runtime.controlPending || runtime.stopping} onClick={() => void control({ action: 'approval', requestId: item.requestId, choice: 'once' })}>Allow once</button>}</div>
    </div>)}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <small>Live output is unverified. Hermes tools run with the permissions configured on that server.</small>
  </section>;
}
