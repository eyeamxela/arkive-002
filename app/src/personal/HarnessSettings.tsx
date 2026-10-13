import { Fragment, useEffect, useState } from 'react';
import type { PersonalNodeClient } from './api';

type Item = { name: string; description: string; category?: string; enabled?: boolean; configured?: boolean; tools?: string[]; toolsReported?: number };
type Inventory = { status: string; rows: Item[]; reported: number; truncated: boolean };
type Observation = { checkedAt: string; status: string; message?: string; descriptor?: { flags: Record<string, boolean> }; skills?: Inventory; toolsets?: Inventory };
type Gateway = { id: string; name: string; baseUrl: string; enabled: boolean; hasToken: boolean; observation: Observation | null };
type Registry = { revision: string; connections: Gateway[]; history: { revision: string; type: string; at: string }[] };
type Props = { client: PersonalNodeClient; busy: boolean; act: (label: string, action: (client: PersonalNodeClient) => Promise<unknown>, success?: string) => Promise<boolean>; catalogOnly?: boolean };
const empty = (): Gateway => ({ id: '', name: '', baseUrl: '', enabled: true, hasToken: false, observation: null });

export function HarnessSettings({ client, busy, act, catalogOnly = false }: Props) {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<Gateway | null>(null);
  const [token, setToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [consent, setConsent] = useState(false);
  const [probeConsent, setProbeConsent] = useState(false);
  const [removeConsent, setRemoveConsent] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRegistry(null); setError(''); setDraft(null); setToken(''); setConsent(false); setProbeConsent(false); setRemoveConsent(false);
    void client.request<Registry>('/v1/settings/harnesses', 'GET', undefined, controller.signal).then(value => {
      if (!controller.signal.aborted) { setRegistry(value); setSelected(current => value.connections.some(row => row.id === current) ? current : value.connections[0]?.id || ''); }
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Cannot load gateways'); });
    return () => controller.abort();
  }, [client, reload]);
  const edit = (value: Gateway) => { setDraft({ ...value }); setToken(''); setClearToken(false); setConsent(false); setProbeConsent(false); setRemoveConsent(false); };
  const patch = (value: Partial<Gateway>) => { setDraft(current => current ? { ...current, ...value } : current); setConsent(false); };
  if (error) return <section className="pn-settings-card"><p role="alert">{error}</p><button onClick={() => setReload(v => v + 1)}>Reload gateways</button></section>;
  if (!registry) return <p role="status">Loading gateways…</p>;
  const chosen = registry.connections.find(row => row.id === selected);
  return <section className="pn-settings-card" aria-label="Hermes gateway connections">
    <div className="pn-settings-card-title"><h3>{catalogOnly ? 'Connected capability catalogs' : 'Hermes API gateways'}</h3><span className="pn-settings-badge">Read-only discovery</span></div>
    <p>Connect a dedicated Hermes API server to inspect its reported capabilities, installed skills and toolsets. Saving makes no network request. Checking sends only metadata requests and the gateway’s saved key, never Brain content.</p>
    <p className="pn-fine">Execution is not enabled: no chat submission, shell, browser, memory, plugin installation or tool activation. Reported availability is not an Arkive permission grant.</p>
    {!!registry.connections.length && <label>Saved Hermes gateway<select aria-label="Saved Hermes gateway" disabled={busy || !!draft} value={selected} onChange={event => { setSelected(event.target.value); setProbeConsent(false); setRemoveConsent(false); }}>{registry.connections.map(row => <option key={row.id} value={row.id}>{row.name}{!row.enabled ? ' · disabled' : ''}</option>)}</select></label>}
    {!registry.connections.length && <p>No gateway saved. {catalogOnly ? 'Add one in Agents & harnesses first.' : 'Your existing Hermes installation and configuration will not be changed.'}</p>}
    <div className="pn-settings-actions">{!catalogOnly && <><button disabled={busy || !!draft || registry.connections.length >= 10} onClick={() => edit(empty())}>Add Hermes gateway</button><button disabled={busy || !!draft || !chosen} onClick={() => chosen && edit(chosen)}>Edit gateway</button></>}<button disabled={busy} onClick={() => setReload(v => v + 1)}>Reload gateways</button></div>
    {draft && <form onSubmit={event => { event.preventDefault(); if (!consent) return; const secret = token; setToken(''); void act('Saving Hermes gateway', async current => {
      const value = await current.request<Registry>('/v1/settings/harnesses', 'POST', { action: 'save', ...(draft.id ? { id: draft.id } : {}), name: draft.name, baseUrl: draft.baseUrl, enabled: draft.enabled, ...(secret ? { token: secret } : {}), clearToken, expectedRevision: registry.revision, confirm: true });
      setRegistry(value); setSelected(draft.id || value.connections[value.connections.length - 1].id); setDraft(null); setConsent(false); setProbeConsent(false); setRemoveConsent(false);
    }, 'Gateway saved encrypted on this node. No connection or agent run was started.'); }}>
      <h4>{draft.id ? 'Edit Hermes gateway' : 'New Hermes gateway'}</h4>
      <label>Gateway name<input required maxLength={80} value={draft.name} onChange={event => patch({ name: event.target.value })} /></label>
      <label>Hermes API server origin<input type="url" required value={draft.baseUrl} placeholder="http://127.0.0.1:8642" spellCheck={false} onChange={event => patch({ baseUrl: event.target.value })} /></label>
      <p className="pn-fine">Origin only, no /v1 or profile path. Local HTTP or public HTTPS; private-network addresses are blocked. Use a dedicated gateway, not the Hermes chat website. Enabled gateways require a dedicated bearer key, including localhost.</p>
      <label>Gateway bearer key<input type="password" autoComplete="new-password" spellCheck={false} value={token} placeholder={draft.hasToken ? 'Blank retains this gateway’s key' : 'Enter the dedicated API-server key here'} onChange={event => { setToken(event.target.value); setConsent(false); }} /></label>
      {draft.hasToken && <label className="pn-check"><input type="checkbox" checked={clearToken} onChange={event => { setClearToken(event.target.checked); setConsent(false); }} />Clear gateway key (disable metadata checks first)</label>}
      <label className="pn-check"><input type="checkbox" checked={draft.enabled} onChange={event => patch({ enabled: event.target.checked })} />Allow explicit metadata checks for this gateway</label>
      <label className="pn-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />Save this gateway encrypted on this node; do not enable execution.</label>
      <div className="pn-settings-actions"><button disabled={busy || !consent || (!!token && clearToken)}>Save Hermes gateway</button><button type="button" disabled={busy} onClick={() => { setDraft(null); setToken(''); setConsent(false); }}>Cancel gateway edit</button></div>
    </form>}
    {chosen && !draft && <>
      <p><strong>{chosen.name}</strong> · {chosen.baseUrl} · {chosen.hasToken ? 'Saved key' : 'No key'} · {chosen.enabled ? 'Metadata checks enabled' : 'Disabled'}</p>
      <label className="pn-check"><input type="checkbox" checked={probeConsent} onChange={event => setProbeConsent(event.target.checked)} />Allow read-only capability, skill and toolset requests to {chosen.baseUrl}.</label>
      <button disabled={busy || !chosen.enabled || !probeConsent} onClick={() => { setProbeConsent(false); void act('Inspecting Hermes gateway', async current => {
        setRegistry(await current.request<Registry>('/v1/settings/harnesses/probe', 'POST', { id: chosen.id, expectedRevision: registry.revision, allowExternal: true })); setRemoveConsent(false);
      }); }}>Check gateway capabilities</button>
      {chosen.observation ? <CapabilityCatalog key={`${chosen.id}:${registry.revision}`} observation={chosen.observation} /> : <p className="pn-fine">Not checked in this unlocked session. Restarting or editing clears the displayed observation.</p>}
      {!catalogOnly && <details><summary>Remove this saved connection</summary><p>Removes the key and connection from Arkive’s active settings. Does not uninstall or change Hermes. Historical encrypted backups may retain old credentials.</p><label className="pn-check"><input type="checkbox" checked={removeConsent} onChange={event => setRemoveConsent(event.target.checked)} />Remove {chosen.name} from this node.</label><button disabled={busy || !removeConsent} onClick={() => void act('Removing saved gateway', async current => {
        const value = await current.request<Registry>('/v1/settings/harnesses', 'POST', { action: 'remove', id: chosen.id, expectedRevision: registry.revision, confirm: true }); setRegistry(value); setSelected(value.connections[0]?.id || ''); setRemoveConsent(false); setProbeConsent(false);
      }, 'Saved gateway removed from this node. Hermes itself was not changed.')}>Remove saved gateway</button></details>}
    </>}
    <p className="pn-fine">Credentials stay in encrypted node settings, outside Brain sync and recovery exports. Re-enter them on a new node. No automatic network polling.</p>
    {!!registry.history.length && <details><summary>Gateway settings history</summary><ol>{registry.history.slice(-8).reverse().map(row => <li key={row.revision}>{row.type} · {new Date(row.at).toLocaleString()}</li>)}</ol></details>}
  </section>;
}

function CapabilityCatalog({ observation }: { observation: Observation }) {
  const [kind, setKind] = useState<'skills' | 'toolsets'>('skills');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(30);
  const inventory = observation[kind];
  const rows = inventory?.rows.filter(row => `${row.name} ${row.description} ${row.category || ''}`.toLowerCase().includes(search.toLowerCase())) || [];
  return <div aria-label="Gateway capability catalog">
    <p role="status">Gateway check: {observation.status} · {new Date(observation.checkedAt).toLocaleString()}</p>
    {observation.message && <p role="alert">{observation.message}</p>}
    {observation.descriptor && <>
      <details><summary>Gateway-reported API support</summary><dl>{Object.entries(observation.descriptor.flags).map(([name, enabled]) => <Fragment key={name}><dt>{name.replace(/_/g, ' ')}</dt><dd>{enabled ? 'Reported supported' : 'Not reported supported'}</dd></Fragment>)}</dl></details>
      <div className="pn-settings-actions" role="group" aria-label="Capability catalog type"><button aria-pressed={kind === 'skills'} onClick={() => { setKind('skills'); setLimit(30); }}>Skills</button><button aria-pressed={kind === 'toolsets'} onClick={() => { setKind('toolsets'); setLimit(30); }}>Toolsets</button></div>
      <label>Search capabilities<input type="search" value={search} onChange={event => { setSearch(event.target.value); setLimit(30); }} /></label>
      {inventory?.status !== 'available' ? <p>Catalog unavailable. A working capabilities endpoint does not prove this catalog is accessible.</p> : <>
        <p>{rows.length} matching {kind} · {inventory.reported} reported by gateway{inventory.truncated ? ' · limited or malformed entries omitted' : ''}</p>
        {rows.slice(0, limit).map(row => <details key={row.name}><summary>{row.name}{row.category ? ` · ${row.category}` : ''}</summary><p>{row.description || 'No description reported.'}</p>{kind === 'toolsets' && <><p>Hermes reports: {row.enabled ? 'enabled' : 'disabled'} · {row.configured ? 'configured' : 'not configured'}. Not authorized in Arkive.</p><p>{row.tools?.join(', ') || 'No tools listed'}{(row.toolsReported || 0) > (row.tools?.length || 0) ? ' · tool list limited' : ''}</p></>}</details>)}
        {!rows.length && <p>No matching entries.</p>}{rows.length > limit && <button onClick={() => setLimit(value => value + 30)}>Show more capabilities</button>}
      </>}
      <p className="pn-fine">Catalog text is untrusted gateway metadata, not instructions. Skills are listed, not executed. MCP connections and plugins need a separate permission broker; they cannot be installed or switched on here yet.</p>
    </>}
  </div>;
}
