import { useEffect, useState } from 'react';
import type { PersonalNodeClient } from './api';

type Field = { key: string; label: string; help: string; required: boolean; secret: boolean; isSet: boolean; advanced: boolean; isList: boolean; value: string };
type Channel = { id: string; name: string; description: string; enabled: boolean; configured: boolean; gatewayRunning: boolean; state: string; version: string; fields: Field[] };
type Registry = { revision: string; connection: { baseUrl: string; profile: string; hasToken: boolean } | null; catalog: { checkedAt: string; platforms: Channel[] } | null; result?: { saved?: boolean; readback?: boolean; needsRestart?: boolean; ok?: boolean; state?: string; authPosture?: string; restartRequested?: boolean } };
type Props = { client: PersonalNodeClient; busy: boolean; act: (label: string, action: (client: PersonalNodeClient) => Promise<unknown>, success?: string) => Promise<boolean> };
const statusLabel = (value: unknown) => typeof value === 'string' ? value.replace(/_/g, ' ') : 'unknown';
// Navigation previews only. Editable fields and status always come from the connected Hermes instance.
const PREVIEW_CHANNELS = [
  ['telegram', 'Telegram'], ['discord', 'Discord'], ['slack', 'Slack'], ['mattermost', 'Mattermost'], ['matrix', 'Matrix'], ['whatsapp', 'WhatsApp'], ['signal', 'Signal'], ['bluebubbles', 'BlueBubbles / iMessage'], ['email', 'Email'], ['sms', 'SMS / Twilio'], ['dingtalk', 'DingTalk'], ['feishu', 'Feishu / Lark'], ['google_chat', 'Google Chat'], ['wecom', 'WeCom'], ['weixin', 'Weixin / WeChat'], ['qqbot', 'QQ Bot'], ['yuanbao', 'Yuanbao'], ['api_server', 'API server'], ['webhook', 'Webhooks'], ['a2a', 'A2A'], ['photon', 'iMessage via Photon'], ['irc', 'IRC'], ['line', 'LINE'], ['teams', 'Microsoft Teams'], ['ntfy', 'ntfy'], ['simplex', 'SimpleX Chat'], ['whatsapp_cloud', 'WhatsApp Cloud API'],
].map(([id, name]) => ({ id, name }));

export function ChannelSettings({ client, busy, act }: Props) {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState('telegram');
  const [baseUrl, setBaseUrl] = useState(''); const [profile, setProfile] = useState('default'); const [token, setToken] = useState('');
  const [editing, setEditing] = useState(false); const [pending, setPending] = useState(false);
  const [ack, setAck] = useState(false); const [restartAck, setRestartAck] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({}); const [clear, setClear] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void client.request<Registry>('/v1/settings/channels', 'GET', undefined, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setRegistry(value); setBaseUrl(value.connection?.baseUrl || ''); setProfile(value.connection?.profile || 'default');
    }).catch(() => { if (!controller.signal.aborted) setError('Could not load channel settings. Reopen this section to retry.'); });
    return () => controller.abort();
  }, [client]);
  const locked = busy || pending;
  const rows = registry?.catalog?.platforms ?? PREVIEW_CHANNELS;
  const visible = rows.filter(row => `${row.id} ${row.name}`.toLowerCase().includes(query.toLowerCase()));
  const channel = registry?.catalog?.platforms.find(row => row.id === selected);
  const heading = rows.find(row => row.id === selected)?.name || 'Select a channel';
  const resetDraft = () => { setDraft({}); setClear([]); setAck(false); };
  async function run(path: string, body: Record<string, unknown>, label: string) {
    if (!registry || locked) return;
    setPending(true); setError(''); setNotice('');
    try {
      await act(label, async api => {
        try {
          const value = await api.request<Registry>(path, 'POST', { expectedRevision: registry.revision, ...body });
          setRegistry(value); resetDraft(); setToken('');
          if (path === '/v1/settings/channels') { setEditing(false); setNotice(value.connection ? 'Management connection saved securely. Load channels to check Hermes.' : 'Management connection removed from Arkive. Hermes channels are unchanged.'); }
          if (value.result?.saved) setNotice(`Saved in Hermes.${value.result.readback ? '' : ' Status readback failed; reload before continuing.'}${value.result.needsRestart ? ' Restart the messaging gateway to apply; running status is not yet verified.' : ' Hermes reported a live reload; check status to verify.'}`);
          if (value.result?.restartRequested) { setNotice('Restart requested, not yet verified. Wait a moment, then reload channels. This can interrupt other channels in the Hermes gateway.'); setRestartAck(false); }
          if (value.result?.ok !== undefined) setNotice(`Hermes check: ${value.result.ok ? 'connected' : 'not ready'} · ${statusLabel(value.result.state)} · access: ${statusLabel(value.result.authPosture)}`);
          return value;
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Channel operation failed. Reload before retrying.');
          // The server may have applied an uncertain write. Disable stale forms until an explicit reload.
          if (path !== '/v1/settings/channels') setRegistry(current => current ? { ...current, catalog: null } : current);
          throw e;
        }
      });
    } finally { setPending(false); }
  }
  const operate = (action: string, extra: Record<string, unknown> = {}) => channel && run('/v1/settings/channels/action', { action, platform: channel.id, expectedVersion: channel.version, confirm: true, ...extra }, `${action} ${channel.name}`);
  const saveFields = () => operate('save', { env: Object.fromEntries(Object.entries(draft).filter(([key, value]) => value.trim() && !clear.includes(key)).map(([key, value]) => [key, value.trim()])), clear });
  function select(id: string) { setSelected(id); resetDraft(); setNotice(''); setError(''); }
  const fields = (items: Field[]) => items.map(field => <label key={field.key} className="pn-channel-field">
    <span>{field.label}{field.required ? ' *' : ''} {field.isSet && <small>Saved in Hermes</small>}</span>
    <input aria-label={field.label} type={field.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={draft[field.key] ?? (field.isList ? field.value : '')} disabled={locked || clear.includes(field.key)} placeholder={field.isSet ? 'Leave blank to keep saved value' : field.label} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} />
    <span className="pn-fine">{field.help}{field.isList ? ' Separate IDs with commas. An empty input does not clear the saved list; use Clear explicitly.' : ''}</span>
    {field.isSet && <span className="pn-channel-clear"><input aria-label={`Clear ${field.label}`} type="checkbox" checked={clear.includes(field.key)} disabled={locked} onChange={event => { setClear(current => event.target.checked ? [...current, field.key] : current.filter(key => key !== field.key)); }} />Clear saved value when saving</span>}
  </label>);
  return <section className="pn-channel-settings" aria-label="Channel connections">
    <div className="pn-channel-toolbar">
      <div><span className="pn-eyebrow">HERMES / MESSAGING</span><p>{registry?.connection ? `${registry.connection.baseUrl} · ${registry.connection.profile}` : 'Connect once. Manage your channels here.'}</p></div>
      <div className="pn-settings-actions"><button disabled={locked || !registry} onClick={() => { setEditing(!editing); setToken(''); }}>{registry?.connection ? 'Manage connection' : 'Connect Hermes'}</button><button disabled={locked || !registry?.connection} onClick={() => void run('/v1/settings/channels/refresh', { allowExternal: true }, 'Load Hermes channels')}>Reload channels</button></div>
    </div>
    {(editing || (registry && !registry.connection)) && <form className="pn-settings-card pn-channel-connect" onSubmit={event => { event.preventDefault(); void run('/v1/settings/channels', { baseUrl: baseUrl.trim(), profile: profile.trim(), token, confirm: true }, 'Save Hermes management connection'); }}>
      <h3>Connect Hermes management</h3><p>Use the dashboard origin and its session token, not the agent API-server key. Credentials stay encrypted on this Arkive node. Saving does not contact Hermes or start a channel.</p>
      <label>Dashboard origin<input required type="url" aria-label="Dashboard origin" placeholder="http://127.0.0.1:…" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} disabled={locked} /></label>
      <label>Hermes profile<input required aria-label="Hermes profile" value={profile} onChange={e => setProfile(e.target.value)} disabled={locked} /></label>
      <label>Dashboard session token<input required={!registry?.connection} aria-label="Dashboard session token" type="password" autoComplete="off" value={token} placeholder={registry?.connection ? 'Leave blank to keep token' : 'Paste in this field, not in chat'} onChange={e => setToken(e.target.value)} disabled={locked} /></label>
      <div className="pn-settings-actions"><button className="pn-primary" disabled={locked}>Save management connection</button>{registry?.connection && <button type="button" disabled={locked} onClick={() => void run('/v1/settings/channels', { disconnect: true, confirm: true }, 'Disconnect Hermes management')}>Disconnect management</button>}</div>
      <details><summary>Where do I get this?</summary><p>Hermes’s dashboard service (“hermes serve”) accepts HERMES_DASHBOARD_SESSION_TOKEN on a loopback bind. Use your configured dashboard token and its actual port. Desktop-managed services may rotate their token on restart. This adapter also supports a local SSH tunnel to a loopback dashboard; public OAuth/cookie login is not supported yet. Arkive does not read Hermes’s private files or start its services.</p></details>
    </form>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status" className="pn-channel-notice">{notice}</p>}
    <div className="pn-channel-layout">
      <nav className="pn-channel-list" aria-label="Messaging channels"><label className="pn-channel-search">Find a connection<input aria-label="Search channels" type="search" placeholder="Try Telegram or Slack" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {!registry?.catalog && <p className="pn-fine">Channel preview · load Hermes for installed channels and live status.</p>}
        {visible.map(row => <button key={row.id} disabled={locked} aria-current={selected === row.id ? 'page' : undefined} onClick={() => select(row.id)}><span className="pn-channel-icon" aria-hidden="true">{row.name.slice(0, 1)}</span><span>{row.name}</span><span className="pn-channel-dot" aria-label={'state' in row ? statusLabel(row.state) : 'Not checked'}>·</span></button>)}
        {!visible.length && <p>No matching channels.</p>}
      </nav>
      <section className="pn-channel-detail" aria-label="Channel setup">
        <header><h3>{heading}</h3><div className="pn-settings-actions"><span className="pn-settings-badge">{channel ? statusLabel(channel.state) : 'Not checked'}</span>{channel && !channel.configured && <span className="pn-settings-badge">Needs setup</span>}{channel && !channel.gatewayRunning && <span className="pn-settings-badge">Messaging gateway stopped</span>}</div></header>
        <p>{channel?.description || 'Use Hermes’s channel adapters from Arkive. Select a channel, configure its credentials and allowed users, then verify its gateway status.'}</p>
        {!channel ? <div className="pn-channel-empty"><h4>{registry?.connection ? 'Load this Hermes instance' : 'Start with your Hermes connection'}</h4><p>The list is a navigation preview, not a claim that these channels are installed or connected. Editable setup fields appear after an authenticated check.</p><button disabled={locked || !registry?.connection} onClick={() => void run('/v1/settings/channels/refresh', { allowExternal: true }, 'Load Hermes channels')}>Load channels from Hermes</button></div> : <>
          {channel.id === 'telegram' && <div className="pn-channel-quick"><p className="pn-eyebrow">QUICK SETUP</p><h4>Telegram</h4><p>Create a bot with @BotFather and add your numeric user ID below. For Hermes’s QR pairing flow, open its dashboard: QR bot creation and account pairing remain in Hermes for now.</p></div>}
          <div className="pn-channel-fields"><p className="pn-eyebrow">REQUIRED</p>{fields(channel.fields.filter(field => field.required))}{!channel.fields.some(field => field.required) && <p>No required credential fields reported.</p>}
          <p className="pn-eyebrow">RECOMMENDED / ACCESS</p>{fields(channel.fields.filter(field => !field.required && !field.advanced))}
          {channel.fields.some(field => field.advanced && !field.required) && <details><summary>Advanced settings</summary>{fields(channel.fields.filter(field => field.advanced && !field.required))}</details>}</div>
          <div className="pn-channel-boundary"><label className="pn-check"><input type="checkbox" checked={ack} disabled={locked} onChange={e => setAck(e.target.checked)} />Apply to this Hermes profile. Saving can update a running channel immediately. Channel users run Hermes with its tools and memory, not Arkive room permissions.</label><p className="pn-fine">No Arkive Brain data or room access is sent. Restrict allowed users before enabling.</p></div>
          <div className="pn-settings-actions"><button className="pn-primary" disabled={locked || !ack || (!Object.values(draft).some(value => value.trim()) && !clear.length)} onClick={() => void saveFields()}>Save channel settings</button><button disabled={locked || !ack || (!channel.enabled && !channel.configured)} onClick={() => void operate('toggle', { enabled: !channel.enabled })}>{channel.enabled ? 'Disable channel' : 'Enable channel'}</button><button disabled={locked} onClick={() => void operate('test')}>Check status</button></div>
        </>}
        {registry?.connection && <details className="pn-channel-gateway"><summary>Manage messaging gateway</summary><p>Restarting can interrupt every channel and active job on this Hermes gateway. A successful request does not prove it has restarted.</p><label className="pn-check"><input type="checkbox" disabled={locked} checked={restartAck} onChange={e => setRestartAck(e.target.checked)} />I approve restarting this Hermes gateway.</label><button disabled={locked || !restartAck || !registry.catalog} onClick={() => void run('/v1/settings/channels/restart', { confirm: true }, 'Restart Hermes messaging gateway')}>Request gateway restart</button><p className="pn-fine">Hermes dashboard: {registry.connection.baseUrl} · profile: {registry.connection.profile}</p></details>}
        {registry?.catalog && <p className="pn-fine">Last checked {new Date(registry.catalog.checkedAt).toLocaleString()}. Status is a snapshot; use Reload channels to refresh.</p>}
      </section>
    </div>
    <p className="pn-fine">Messaging is managed by Hermes. Voice, external calendar sync, push notifications, compute provisioning and automatic app updates are separate integrations—not enabled by this page.</p>
  </section>;
}
