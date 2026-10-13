import { useEffect, useState } from 'react';
import type { PersonalNodeClient } from './api';

type Connection = { id: string; name: string; enabled: boolean; baseUrl: string; model: string; timeoutMs: number; temperature: number | null; maxTokens: number | null; hasApiKey: boolean };
type Registry = { revision: string; activeId: string; connections: Connection[]; history: { type: string; connectionId: string; at: string; revision: string }[] };
type Act = (label: string, action: (client: PersonalNodeClient) => Promise<unknown>, success?: string) => Promise<boolean>;
type Props = { client: PersonalNodeClient; busy: boolean; act: Act; refresh: number; onActivate: () => void };
const empty = (): Connection => ({ id: '', name: '', enabled: true, baseUrl: '', model: '', timeoutMs: 45000, temperature: null, maxTokens: null, hasApiKey: false });

export function SavedConnections({ client, busy, act, refresh, onActivate }: Props) {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<Connection | null>(null);
  const [key, setKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [consent, setConsent] = useState(false);
  const [activateConsent, setActivateConsent] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRegistry(null); setError(''); setDraft(null); setKey(''); setConsent(false); setActivateConsent(false);
    void client.request<Registry>('/v1/settings/connections', 'GET', undefined, controller.signal).then(value => {
      if (!controller.signal.aborted) { setRegistry(value); setSelected(value.activeId); }
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Cannot load connections'); });
    return () => controller.abort();
  }, [client, refresh, retry]);
  const edit = (value: Connection) => { setDraft({ ...value }); setKey(''); setClearKey(false); setConsent(false); setActivateConsent(false); };
  const patch = (value: Partial<Connection>) => { setDraft(current => current ? { ...current, ...value } : current); setConsent(false); };
  if (error) return <section className="pn-settings-card"><p role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)}>Reload connections</button></section>;
  if (!registry) return <p role="status">Loading saved connections…</p>;
  const chosen = registry.connections.find(item => item.id === selected);
  const active = registry.connections.find(item => item.id === registry.activeId);
  return <section className="pn-settings-card" aria-label="Saved model connections">
    <div className="pn-settings-card-title"><h3>Saved connections</h3><span className="pn-settings-badge">Applies to · this node</span></div>
    <p>Default: <strong>{active?.name}</strong> · {active?.model || 'No model configured'}. Unpinned chats follow this default. Pin a saved connection in each chat to keep its selection separate. Source permissions stay in each room.</p>
    <label>Saved model connection<select aria-label="Saved model connection" value={selected} disabled={busy || !!draft} onChange={event => { setSelected(event.target.value); setActivateConsent(false); }}>{registry.connections.map(item => <option key={item.id} value={item.id}>{item.name}{item.id === registry.activeId ? ' · default' : ''}{!item.enabled ? ' · disabled' : ''}</option>)}</select></label>
    <div className="pn-settings-actions"><button disabled={busy || !!draft || registry.revision === 'environment'} onClick={() => edit(empty())}>＋ Add connection</button><button disabled={busy || !!draft || !chosen || registry.revision === 'environment'} onClick={() => chosen && edit(chosen)}>Edit selected connection</button><button disabled={busy} onClick={() => setRetry(value => value + 1)}>Reload connections</button></div>
    {registry.revision === 'environment' && <p className="pn-fine">Save your default connection below before adding more. Existing environment credentials stay untouched until then.</p>}
    {chosen && !draft && registry.revision !== 'environment' && <ConnectionCatalog key={`${registry.revision}:${chosen.id}`} connection={chosen} revision={registry.revision} busy={busy} act={act} onPick={model => edit({ ...chosen, model })} />}
    {chosen && chosen.id !== registry.activeId && !draft && <div className="pn-settings-consent">
      <p>Switch future sends to {chosen.name}: {chosen.model} at {chosen.baseUrl}. Existing queued requests may require a new approval.</p>
      <label className="pn-check"><input type="checkbox" checked={activateConsent} onChange={event => setActivateConsent(event.target.checked)} />Confirm changing the node default for unpinned chats only. No request will be sent now.</label>
      <button disabled={busy || !activateConsent || !chosen.enabled} onClick={() => void act('Switching node default', async current => {
        const value = await current.request<Registry>('/v1/settings/connections', 'POST', { action: 'activate', id: chosen.id, expectedRevision: registry.revision, confirmActivation: true });
        setRegistry(value); setActivateConsent(false); onActivate();
      }, 'Default switched. Review the model and context before your next send.')}>Use as node default</button>
    </div>}
    {draft && <form onSubmit={event => { event.preventDefault(); if (!consent) return; const secret = key; setKey(''); void act('Saving named connection', async current => {
      const value = await current.request<Registry>('/v1/settings/connections', 'POST', { action: 'save', expectedRevision: registry.revision, ...(draft.id ? { id: draft.id } : {}), name: draft.name,
        config: { enabled: draft.enabled, baseUrl: draft.baseUrl, model: draft.model, timeoutMs: draft.timeoutMs, temperature: draft.temperature, maxTokens: draft.maxTokens, clearApiKey: clearKey, ...(secret ? { apiKey: secret } : {}) } });
      setRegistry(value); setDraft(null); setConsent(false); setClearKey(false); onActivate();
    }, 'Connection saved. The active default was not changed.'); }}>
      <h4>{draft.id ? 'Edit connection' : 'New connection'}</h4>
      <label>Connection name<input required maxLength={80} value={draft.name} onChange={event => patch({ name: event.target.value })} /></label>
      <label>Connection API base URL<input type="url" required value={draft.baseUrl} onChange={event => patch({ baseUrl: event.target.value })} spellCheck={false} /></label>
      <label>Connection model ID<input required maxLength={200} value={draft.model} onChange={event => patch({ model: event.target.value })} spellCheck={false} /></label>
      <div className="pn-settings-fields"><label>Connection timeout (seconds)<input type="number" required min={1} max={55} step={1} value={draft.timeoutMs / 1000} onChange={event => patch({ timeoutMs: Number(event.target.value) * 1000 })} /></label><label>Connection temperature<input type="number" min={0} max={2} step={0.1} value={draft.temperature ?? ''} placeholder="Provider default" onChange={event => patch({ temperature: event.target.value === '' ? null : Number(event.target.value) })} /></label><label>Connection max output tokens<input type="number" min={1} max={128000} step={1} value={draft.maxTokens ?? ''} placeholder="Provider default" onChange={event => patch({ maxTokens: event.target.value === '' ? null : Number(event.target.value) })} /></label></div>
      <label>Connection API key<input type="password" autoComplete="new-password" value={key} onChange={event => { setKey(event.target.value); setConsent(false); }} placeholder={draft.hasApiKey ? 'Leave blank to retain this connection’s key' : 'New connections never inherit another key'} /></label>
      {draft.hasApiKey && <label className="pn-check"><input type="checkbox" checked={clearKey} onChange={event => { setClearKey(event.target.checked); setConsent(false); }} />Clear this connection’s key</label>}
      <label className="pn-check"><input type="checkbox" checked={draft.enabled} onChange={event => patch({ enabled: event.target.checked })} />Connection enabled</label>
      <p className="pn-fine">Plain Chat Completions model endpoints only. Do not enter an agent gateway with independent tools or memory. Optional generation fields require model support; blank uses provider defaults. Reasoning controls require adapter-specific support and are not exposed yet. Editing a connection affects future sends from all chats pinned to it and invalidates queued approvals when execution settings change.</p>
      <label className="pn-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />Save this named connection encrypted on this node without changing the default.</label>
      <div className="pn-settings-actions"><button disabled={busy || !consent || (!!key && clearKey)}>Save named connection</button><button type="button" disabled={busy} onClick={() => { setDraft(null); setKey(''); setConsent(false); }}>Cancel connection edit</button></div>
    </form>}
    {!!registry.history.length && <details><summary>Connection change history</summary><ol>{registry.history.slice(-8).reverse().map(row => <li key={row.revision}>{row.type} · {registry.connections.find(item => item.id === row.connectionId)?.name} · {new Date(row.at).toLocaleString()}</li>)}</ol><p className="pn-fine">Last 100 configuration changes retained on this node; not a full security audit export.</p></details>}
  </section>;
}

function ConnectionCatalog({ connection, revision, busy, act, onPick }: { connection: Connection; revision: string; busy: boolean; act: Act; onPick: (model: string) => void }) {
  const [consent, setConsent] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [selected, setSelected] = useState('');
  return <div aria-label="Selected connection model catalog">
    <p>Discover models on <strong>{connection.name}</strong> without changing the node default or any chat selection.</p>
    <label className="pn-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />Allow model discovery at {connection.baseUrl} using this connection’s saved key.</label>
    <button disabled={busy || !consent || !connection.enabled} onClick={() => { setModels(null); setConsent(false); void act('Discovering connection models', async current => {
      const result = await current.request<{ models: string[] }>('/v1/settings/provider/check', 'POST', { connectionId: connection.id, expectedRevision: revision, allowExternal: true }); setModels(result.models); setSelected(result.models.includes(connection.model) ? connection.model : result.models[0] || '');
    }); }}>Discover models for selected connection</button>
    {models && <><p role="status">{models.length} models listed. This does not verify chat completion or model-specific reasoning capabilities.</p>{!!models.length && <><label>Discovered model<select value={selected} onChange={event => setSelected(event.target.value)}>{models.map(model => <option key={model}>{model}</option>)}</select></label><button disabled={busy || !selected} onClick={() => onPick(selected)}>Review model change</button><p className="pn-fine">Opens an edit. Nothing changes until you save the connection.</p></>}</>}
  </div>;
}

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
