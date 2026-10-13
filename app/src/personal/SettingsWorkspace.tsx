import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Brain, NodeStatus, PersonalNodeClient } from './api';
import './SettingsWorkspace.css';
import { SavedConnections, ExecutionSettings } from './ConnectionSettings';
import { HarnessSettings } from './HarnessSettings';

type ProviderSettings = { revision: string; updatedAt: string | null; source: string; enabled: boolean; baseUrl: string; model: string; timeoutMs: number; temperature: number | null; maxTokens: number | null; hasApiKey: boolean };
type Check = { checkedAt: string; revision: string; models: string[]; modelListed: boolean; completionVerified: false };
type Act = (label: string, action: (client: PersonalNodeClient) => Promise<unknown>, success?: string) => Promise<boolean>;
type Props = { brain: Brain; status: NodeStatus; client: PersonalNodeClient; busy: boolean; act: Act; onNavigate: (panel: string) => void; children: ReactNode; initialSection?: string; collapsed: boolean; onCollapsed: (value: boolean) => void };
const SECTIONS = [
  { id: 'models', label: 'Models & connections', group: 'INTELLIGENCE', icon: '◌' },
  { id: 'agents', label: 'Agents & harnesses', group: 'INTELLIGENCE', icon: '⌘' },
  { id: 'capabilities', label: 'Capabilities', group: 'INTELLIGENCE', icon: '✧' },
  { id: 'runtime', label: 'Runtime & safety', group: 'INTELLIGENCE', icon: '⏣' },
  { id: 'memory', label: 'Memory & access', group: 'INTELLIGENCE', icon: '◇' },
  { id: 'node', label: 'Nodes, sync & recovery', group: 'YOUR SYSTEM', icon: '⏣' },
  { id: 'identity', label: 'Workspace & identity', group: 'YOUR SYSTEM', icon: '◈' },
  { id: 'appearance', label: 'Appearance & shortcuts', group: 'PERSONAL', icon: '◐' },
  { id: 'integrations', label: 'Channels & availability', group: 'PERSONAL', icon: '⇄' },
];
export function useSettingsAppearance() {
  const [motion, setMotion] = useState(() => { try { return localStorage.getItem('arkive.personal.motion.v1') === 'reduced' ? 'reduced' : 'system'; } catch { return 'system'; } });
  useEffect(() => { document.documentElement.dataset.arkiveMotion = motion; try { localStorage.setItem('arkive.personal.motion.v1', motion); } catch { /* Optional device preference. */ } }, [motion]);
  return { motion, setMotion };
}

export function SettingsWorkspace(props: Props & { motion: string; onMotion: (value: string) => void }) {
  const [section, setSection] = useState(props.initialSection || 'models');
  const [connectionsRevision, setConnectionsRevision] = useState(0);
  const [activeRevision, setActiveRevision] = useState(0);
  const active = SECTIONS.find(item => item.id === section)!;
  return <section className="pn-settings" aria-label="Arkive settings">
    <header className="pn-settings-heading"><div><p className="pn-eyebrow">YOUR BRAIN / YOUR CONTROLS</p><h1>Settings</h1><p>Connections, boundaries and the way you work.</p></div><span className="pn-settings-badge">Owner workspace</span></header>
    <div className="pn-settings-layout"><nav className="pn-settings-nav" aria-label="Settings sections">{SECTIONS.map((item, index) => <div key={item.id}>{(!index || item.group !== SECTIONS[index - 1].group) && <p className="pn-eyebrow">{item.group}</p>}<button aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}</button></div>)}<p className="pn-fine">Settings never grant an agent access to your Brain.</p></nav>
    <div className="pn-settings-content"><div className="pn-settings-section-title"><span className="pn-eyebrow">{active.group}</span><h2>{active.label}</h2></div>
      {section === 'models' && <><SavedConnections client={props.client} busy={props.busy} act={props.act} refresh={connectionsRevision} onActivate={() => setActiveRevision(value => value + 1)} /><ModelConnection key={`${props.brain.brainId}:${activeRevision}`} client={props.client} busy={props.busy} act={props.act} onSaved={() => setConnectionsRevision(value => value + 1)} /></>}
      {section === 'runtime' && <ExecutionSettings client={props.client} />}
      {section === 'capabilities' && <HarnessSettings key="catalog" client={props.client} busy={props.busy} act={props.act} catalogOnly />}
      {section === 'agents' && <HarnessSettings key="gateways" client={props.client} busy={props.busy} act={props.act} />}
      {section === 'node' && <div className="pn-settings-node">{props.children}</div>}
      {section === 'agents' && <><Card title="Four independent choices" badge="Architecture"><p>A model generates the answer. A harness controls an agent’s execution loop. A node is where it runs. Room policies decide which memory it may receive.</p><div className="pn-settings-route"><span>Room scope</span><span>Context compiler</span><span>Harness / adapter</span><span>Model on a node</span></div></Card><Card title="Arkive chat adapter" badge="Available"><p>Source-grounded text chat, explicit send consent, pinned context and owner-reviewed member requests. No shell, filesystem or autonomous tools are exposed to the model.</p><button onClick={() => props.onNavigate('agents')}>Manage agent profiles →</button></Card><Card title="External agent harnesses" badge="Execution not enabled"><p>Hermes metadata discovery is available above; executing Hermes, Claude Code, Codex or ACP sessions is not implemented yet. A reachable gateway is not a contained execution route. A compatible model endpoint is not a connection to those applications.</p><p className="pn-fine">Future adapters need an executable, arguments, secret environment bindings, working directory, tool scope and approval policy. No executable or permissive tool setting is accepted here until that boundary exists.</p></Card></>}
      {section === 'memory' && <><Card title="Permission before retrieval" badge="Enforced"><p>Rooms select sources, layers and members. A model connection does not alter those choices. Shared requests must remain readable by the room’s current members and require owner approval.</p><div className="pn-settings-actions"><button onClick={() => props.onNavigate('chat')}>Manage rooms →</button><button onClick={() => props.onNavigate('shared')}>Members & sharing →</button><button onClick={() => props.onNavigate('policies')}>Read policies →</button></div></Card><Card title="Sources, memory and Canon" badge="Separate layers"><p>Folder imports remain source evidence. Memory proposals need explicit review; neither a model response nor filing a document promotes it automatically.</p><div className="pn-settings-actions"><button onClick={() => props.onNavigate('sources')}>Sources & sync →</button><button onClick={() => props.onNavigate('inbox')}>Memory inbox →</button><button onClick={() => props.onNavigate('manifests')}>Context presets →</button></div></Card><Card title="Context limits" badge="Fixed safety bounds"><dl><dt>Selected sources per room</dt><dd>Up to 1,000</dd><dt>Compiled context</dt><dd>160,000 serialized characters; not a token estimate</dd><dt>Source writes</dt><dd>Exact preview and approval</dd></dl><p className="pn-fine">These are enforced by the service, not adjustable UI preferences.</p></Card></>}
      {section === 'identity' && <><Card title={props.brain.name} badge="Private Brain"><dl><dt>Brain ID</dt><dd>{props.brain.brainId}</dd><dt>Node ID</dt><dd>{props.status.nodeId}</dd><dt>Owner</dt><dd>Authenticated node administrator</dd><dt>Members</dt><dd>Separate revocable credentials and room scopes</dd></dl><p>Arkive does not currently issue a Nostr identity or public profile. Brain naming is set at creation; it is not a global account.</p><button onClick={() => props.onNavigate('shared')}>Manage workspace access →</button></Card><Card title="Disconnect is not delete" badge="Preserve your data"><p>Lock Brain clears the readable session. Disconnect drops this app’s connection. Neither deletes the encrypted Brain, local vault or recovery copies.</p><p className="pn-fine">Use the app’s Lock Brain or Disconnect session controls. There is no destructive “sign out and delete” action here.</p></Card></>}
      {section === 'appearance' && <><Card title="Arkive, as you like it" badge="This device"><p>The shared charcoal palette, orange actions and violet selections match the rest of Arkive. Individual folder colors remain customizable inside Files.</p><label className="pn-check"><input type="checkbox" checked={props.collapsed} onChange={event => props.onCollapsed(event.target.checked)} />Compact main sidebar</label><label>Animations<select aria-label="Animations" value={props.motion} onChange={event => props.onMotion(event.target.value)}><option value="system">Follow system reduced-motion preference</option><option value="reduced">Reduce interface motion</option></select></label><button onClick={() => props.onNavigate('brain')}>Open Brain & folder colors →</button></Card><Card title="Keyboard shortcuts" badge="Available"><dl><dt>⌘ / Ctrl + ,</dt><dd>Open Settings</dd><dt>⌘ / Ctrl + G</dt><dd>Open Brain graph</dd><dt>Escape</dt><dd>Close the mobile navigation drawer</dd></dl></Card></>}
      {section === 'integrations' && <><Card title="Available now" badge="Local beta"><p>Local Markdown/Obsidian imports, reviewed source writes, GitHub source connections, GitNexus snapshot import, task templates and a local calendar.</p><div className="pn-settings-actions"><button onClick={() => props.onNavigate('sources')}>Manage source connections →</button><button onClick={() => props.onNavigate('work')}>Planner & templates →</button></div></Card><Card title="Not connected yet" badge="No background services"><dl><dt>Telegram / WhatsApp</dt><dd>No channel adapter or remote control</dd><dt>Voice</dt><dd>No recorder, transcription or call settings</dd><dt>Notifications</dt><dd>No background reminders or push service</dd><dt>External calendars</dt><dd>No Google / Apple / Notion calendar sync</dd><dt>Compute sharing</dt><dd>No GPU sharing, model downloads or droplet provisioning</dd><dt>Updates</dt><dd>Manual local rebuild; no updater channel</dd></dl><p className="pn-fine">These capabilities need separate adapters and explicit authorization. No inactive switch pretends to enable them.</p></Card></>}
    </div></div>
  </section>;
}

function Card({ title, badge, children }: { title: string; badge: string; children: ReactNode }) {
  return <section className="pn-settings-card"><div className="pn-settings-card-title"><h3>{title}</h3><span className="pn-settings-badge">{badge}</span></div>{children}</section>;
}

function ModelConnection({ client, busy, act, onSaved }: { client: PersonalNodeClient; busy: boolean; act: Act; onSaved: () => void }) {
  const [saved, setSaved] = useState<ProviderSettings | null>(null);
  const [draft, setDraft] = useState<ProviderSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [checkConfirmed, setCheckConfirmed] = useState(false);
  const [checked, setChecked] = useState<Check | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setSaved(null); setDraft(null); setError(''); setApiKey(''); setConfirmed(false); setClearKey(false); setChecked(null); setCheckConfirmed(false);
    void client.request<ProviderSettings>('/v1/settings/provider', 'GET', undefined, controller.signal).then(value => { if (!controller.signal.aborted) { setSaved(value); setDraft(value); } }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Cannot read connection settings'); });
    return () => controller.abort();
  }, [client, reload]);
  const patch = (value: Partial<ProviderSettings>) => { setDraft(current => current ? { ...current, ...value } : current); setConfirmed(false); };
  if (error) return <Card title="Connection settings unavailable" badge="Retry"><p role="alert">{error}</p><button onClick={() => setReload(value => value + 1)}>Reload connection</button></Card>;
  if (!draft || !saved) return <p role="status">Loading node connection…</p>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || !!apiKey || clearKey;
  return <>
    <Card title="Model connection" badge={saved.enabled && saved.baseUrl && saved.model ? 'Configured · not health-verified' : 'Needs setup'}>
      <p>Edit the active node default here. Saved connections are managed above. This adapter accepts plain model servers exposing <code>/chat/completions</code>, not agent gateways with independent tools or memory. Native Anthropic and agent-app logins are not supported yet.</p>
      <form onSubmit={event => { event.preventDefault(); if (!confirmed) return; const key = apiKey; setApiKey(''); void act('Saving model connection', async current => {
        const value = await current.request<ProviderSettings>('/v1/settings/provider', 'POST', { expectedRevision: saved.revision, enabled: draft.enabled, baseUrl: draft.baseUrl, model: draft.model, timeoutMs: draft.timeoutMs, temperature: draft.temperature, maxTokens: draft.maxTokens, ...(key ? { apiKey: key } : {}), clearApiKey: clearKey });
        setSaved(value); setDraft(value); setClearKey(false); setConfirmed(false); setChecked(null); setCheckConfirmed(false);
        onSaved();
      }, 'Connection saved on this node. No model request or permission change was made.'); }}>
        <label className="pn-check"><input type="checkbox" checked={draft.enabled} onChange={event => patch({ enabled: event.target.checked })} />Enable this model connection</label>
        <label>API base URL<input type="url" required value={draft.baseUrl} placeholder="https://api.openai.com/v1" onChange={event => patch({ baseUrl: event.target.value })} spellCheck={false} /></label>
        <p className="pn-fine">Include the API prefix, usually /v1. Local servers may use http://127.0.0.1:port/v1. Remote endpoints require HTTPS; private-network destinations are blocked.</p>
        <label>Model ID<input required maxLength={200} list="pn-provider-models" value={draft.model} placeholder="Exact model ID from your provider" onChange={event => patch({ model: event.target.value })} spellCheck={false} /></label>
        <datalist id="pn-provider-models">{checked?.models.map(id => <option value={id} key={id} />)}</datalist>
        <label>{saved.hasApiKey ? 'Replace API key (optional)' : 'API key (optional for local servers)'}<input type="password" autoComplete="new-password" spellCheck={false} value={apiKey} onChange={event => { setApiKey(event.target.value); setConfirmed(false); }} placeholder={saved.hasApiKey ? 'Saved key is never returned to the app' : 'Enter directly here, not in chat'} /></label>
        {saved.hasApiKey && <label className="pn-check"><input type="checkbox" checked={clearKey} onChange={event => { setClearKey(event.target.checked); setConfirmed(false); }} />Clear the saved key when saving</label>}
        <div className="pn-settings-fields"><label>Timeout (seconds)<input type="number" required min={1} max={55} step={1} value={draft.timeoutMs / 1000} onChange={event => patch({ timeoutMs: Number(event.target.value) * 1000 })} /></label><label>Temperature (optional)<input type="number" min={0} max={2} step={0.1} placeholder="Provider default" value={draft.temperature ?? ''} onChange={event => patch({ temperature: event.target.value === '' ? null : Number(event.target.value) })} /></label><label>Max output tokens (optional)<input type="number" min={1} max={128000} step={1} placeholder="Provider default" value={draft.maxTokens ?? ''} onChange={event => patch({ maxTokens: event.target.value === '' ? null : Number(event.target.value) })} /></label></div>
        <p className="pn-fine">Leave optional generation fields blank unless your model supports temperature and max_tokens. They are not a context-window setting. Changing the endpoint, model or generation fields invalidates previously queued member approvals.</p>
        <div className="pn-settings-consent"><label className="pn-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Save this connection and any key encrypted on this node. Future sends may use this endpoint; each send still requires consent.</label></div>
        <div className="pn-settings-actions"><button className="pn-primary" disabled={busy || !confirmed || (clearKey && !!apiKey)}>Save connection</button><button type="button" disabled={busy} onClick={() => setReload(value => value + 1)}>Reload saved settings</button></div>
      </form>
    </Card>
    <Card title="Check connection" badge="No Brain content sent"><p>Requests the saved endpoint’s model list using its saved key. This checks /models access, not whether a chat completion will succeed. Providers without this endpoint can still support chat.</p><label className="pn-check"><input type="checkbox" checked={checkConfirmed} onChange={event => setCheckConfirmed(event.target.checked)} />Allow a model-list request to {saved.baseUrl || 'the saved endpoint'}.</label><button disabled={busy || dirty || !checkConfirmed || !saved.enabled || !saved.baseUrl || !saved.model} onClick={() => { setChecked(null); void act('Checking model connection', async current => { setChecked(await current.request<Check>('/v1/settings/provider/check', 'POST', { expectedRevision: saved.revision, allowExternal: true })); }); }}>Check saved connection</button>{dirty && <p className="pn-fine">Save or reload your changes before checking.</p>}{checked && <p role="status">Model list reachable · {checked.models.length} models returned · {checked.modelListed ? 'configured model listed' : 'configured model not listed'}. Chat completion not tested.</p>}</Card>
    <Card title="Where settings live" badge={saved.source === 'encrypted-node' ? 'Encrypted on node' : 'Node environment'}><p>Keys never appear in Brain objects, graphs, room context, browser storage, sync or recovery exports. Re-enter credentials on a restored or new node. The unlocked node can use its key; your device and node must still be trusted.</p><p className="pn-fine">{saved.updatedAt ? `Last saved ${new Date(saved.updatedAt).toLocaleString()}.` : 'Existing environment configuration remains active until you save an override.'} No automatic fallback to another provider.</p></Card>
  </>;
}
