import { useEffect, useState } from 'react';
import type { PersonalNodeClient } from './api';

type Execution = { contractVersion: number; effective: { harnessId: string; adapterId: string; connectionId: string; model: string | null; configured: boolean; capabilities: Record<string, boolean>; policy: Record<string, string> }; adapters: { id: string; name: string; implemented: boolean; reason: string }[] };
export function ExecutionSettings({ client }: { client: PersonalNodeClient }) {
  const [value, setValue] = useState<Execution | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setValue(null); setError('');
    void client.request<Execution>('/v1/settings/execution', 'GET', undefined, controller.signal).then(data => { if (!controller.signal.aborted) setValue(data); }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Cannot read execution settings'); });
    return () => controller.abort();
  }, [client, retry]);
  return <><section className="pn-settings-card"><div className="pn-settings-card-title"><h3>Effective execution route</h3><span className="pn-settings-badge">Read from node</span></div>
    {error && <p role="alert">{error}</p>}{!value && !error && <p role="status">Loading execution route…</p>}
    {value && <><p>Node default · {value.effective.configured ? 'Configured, not execution-verified' : 'Needs a model connection'}</p><dl><dt>Harness</dt><dd>{value.effective.harnessId}</dd><dt>Model adapter</dt><dd>{value.effective.adapterId}</dd><dt>Connection</dt><dd>{value.effective.connectionId}</dd><dt>Model</dt><dd>{value.effective.model || 'Not configured'}</dd><dt>Memory</dt><dd>Compiled room sources, filtered before execution</dd><dt>Conversation context</dt><dd>Opt-in per request: up to 8 completed turns / 32,000 characters with identical source, permission and connection boundaries</dd><dt>Run events</dt><dd>Authenticated live status from durable receipts; token streaming and external harness sessions are not enabled</dd><dt>External sends</dt><dd>Explicit consent; member requests require owner approval</dd></dl><p className="pn-fine">Contract v{value.contractVersion}. No tool, shell, file-write or background-job capability is enabled by these settings.</p></>}
    <button onClick={() => setRetry(count => count + 1)}>Refresh execution route</button></section>
    {value?.adapters.map(adapter => <section className="pn-settings-card" key={adapter.id}><div className="pn-settings-card-title"><h3>{adapter.name}</h3><span className="pn-settings-badge">{adapter.implemented ? 'Implemented' : 'Not implemented'}</span></div><p>{adapter.reason}</p></section>)}</>;
}
