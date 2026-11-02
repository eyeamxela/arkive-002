import { useEffect, useRef, useState } from 'react';
import type { PersonalNodeClient } from './api';
import { PROVIDERS, providerFor, chatModelOptions, uniqueConnectionName, connectionNameIssue, toItemValue, fromItemValue } from './modelOptions.mjs';
import { getModelCapabilities } from '../../../personal-node/model-capabilities.mjs';

type Connection = { id: string; name: string; enabled: boolean; baseUrl: string; model: string; timeoutMs: number; temperature: number | null; maxTokens: number | null; hasApiKey: boolean };
type Registry = { revision: string; activeId: string; connections: Connection[]; history: { type: string; connectionId: string; at: string; revision: string }[] };
type Act = (label: string, action: (client: PersonalNodeClient) => Promise<unknown>, success?: string) => Promise<boolean>;
type Props = { client: PersonalNodeClient; busy: boolean; act: Act };
const blank = (): Connection => ({ id: '', name: '', enabled: true, baseUrl: '', model: '', timeoutMs: 45000, temperature: null, maxTokens: null, hasApiKey: false });
const configOf = (c: Connection) => ({ enabled: c.enabled, baseUrl: c.baseUrl, model: c.model, timeoutMs: c.timeoutMs, temperature: c.temperature, maxTokens: c.maxTokens });

function ModelChoice({ baseUrl, model, savedModel = '', models, onChange, disabled }: { baseUrl: string; model: string; savedModel?: string; models: string[]; onChange: (value: string) => void; disabled: boolean }) {
  const [typing, setTyping] = useState(false);
  const capabilities = getModelCapabilities(baseUrl, model);
  return <div className="pn-model-choice">
    {typing ? <label>Model ID<input autoFocus required maxLength={200} aria-label="Model ID" value={model} disabled={disabled} placeholder="Enter the exact model ID" spellCheck={false} onChange={event => onChange(event.target.value)} /></label>
      : <label>Model<select aria-label="Model" value={toItemValue(model)} disabled={disabled} onChange={event => { const next = fromItemValue(event.target.value); if (next === null) setTyping(true); else onChange(next); }}><option value="" disabled>Choose a model</option>{chatModelOptions(baseUrl, models, model, savedModel).map(option => <option key={option.id} value={toItemValue(option.id)} disabled={option.compatibility === 'unsupported'}>{option.id}{option.compatibility === 'unknown' ? ' · compatibility unverified' : option.compatibility === 'unsupported' ? ' · unavailable for chat' : ''}</option>)}<option value="custom">Enter model ID…</option></select></label>}
    {typing && <button type="button" disabled={disabled} onClick={() => setTyping(false)}>Choose from list</button>}
    {!!model.trim() && capabilities.compatibility !== 'supported' && <p className="pn-fine" role={capabilities.compatibility === 'unsupported' ? 'alert' : 'status'}>{capabilities.reason}</p>}
  </div>;
}

/** Hermes-style provider → model → Apply, backed by Arkive's encrypted registry. */
export function ModelSettings({ client, busy, act }: Props) {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [selected, setSelected] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [editor, setEditor] = useState<Connection | null>(null);
  const [preset, setPreset] = useState('custom');
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(false);
  const epoch = useRef(0);
  const locked = busy || pending;
  useEffect(() => {
    const controller = new AbortController(); const current = ++epoch.current;
    setRegistry(null); setError(''); setApiKey(''); setEditor(null); setModels([]); setNotice('');
    void client.request<Registry>('/v1/settings/connections', 'GET', undefined, controller.signal).then(value => {
      if (controller.signal.aborted || current !== epoch.current) return;
      setRegistry(value); setSelected(value.activeId);
      const active = value.connections.find(c => c.id === value.activeId)!;
      setModel(active.model);
      if (!active.baseUrl || !active.model) { setEditor({ ...active }); setPreset(providerFor(active.baseUrl).id); }
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Cannot load models'); });
    return () => { controller.abort(); epoch.current++; };
  }, [client, retry]);

  const resetCatalog = () => { epoch.current++; setModels([]); setNotice(''); setError(''); };
  const edit = (connection: Connection) => { resetCatalog(); setEditor({ ...connection, name: connection.name || uniqueConnectionName(providerFor(connection.baseUrl).name, registry?.connections || []) }); setPreset(providerFor(connection.baseUrl).id); setApiKey(''); setClearKey(false); };
  const patch = (fields: Partial<Connection>, route = false) => { if (route) resetCatalog(); setEditor(c => c ? { ...c, ...fields } : c); };
  if (!registry) return <section className="pn-settings-card">{error ? <><p role="alert">{error}</p><button onClick={() => setRetry(n => n + 1)}>Reload models</button></> : <p role="status">Loading models…</p>}</section>;
  const chosen = registry.connections.find(c => c.id === selected)!;
  const active = registry.connections.find(c => c.id === registry.activeId)!;
  const initial = registry.revision === 'environment';
  const target = editor || chosen;
  const presetInfo = PROVIDERS.find(p => p.id === preset)!;
  const needsKey = !!editor && presetInfo.keyRequired && !apiKey && (!editor.hasApiKey || clearKey);
  const routeReady = !!target.baseUrl && !needsKey && !(clearKey && apiKey);
  const capabilities = getModelCapabilities(target.baseUrl, editor ? editor.model : model);
  const unsupportedModel = capabilities.compatibility === 'unsupported';
  const incompatibleTemperature = !capabilities.supportsTemperature && target.temperature !== null;
  const nameIssue = editor && !initial ? connectionNameIssue(editor.name, registry.connections, editor.id) : '';

  const discover = async () => {
    const current = epoch.current; setPending(true); setNotice(''); setError('');
    try {
      const result = await client.request<{ models: string[] }>('/v1/settings/provider/check', 'POST', {
        expectedRevision: registry.revision, allowExternal: true,
        ...(target.id ? { connectionId: target.id } : {}),
        ...(editor ? { draft: { ...configOf(editor), clearApiKey: clearKey, ...(apiKey ? { apiKey } : {}) } } : {}),
      });
      if (current !== epoch.current) return;
      setModels(result.models);
      // Never silently choose a paid or incompatible model just because it is first.
      const choices = chatModelOptions(target.baseUrl, result.models);
      const hidden = new Set(result.models).size - choices.length;
      setNotice(result.models.length ? `${result.models.length} models found. ${hidden ? `${hidden} known non-chat or unsupported models hidden. ` : ''}Compatibility-unverified models are labelled. No generation request was sent.` : 'No models listed. You can enter a model ID manually.');
    } catch (e) { if (current === epoch.current) setError(e instanceof Error ? e.message : 'Could not load models. Enter a model ID manually or retry.'); }
    finally { setPending(false); }
  };

  const saveEditor = async () => {
    if (!editor?.model.trim() || !routeReady || unsupportedModel || incompatibleTemperature || nameIssue) return;
    const draft = { ...editor, name: editor.name.trim(), model: editor.model.trim() }; const key = apiKey; setApiKey('');
    await act('Saving model connection', async current => {
      const config = { ...configOf(draft), clearApiKey: clearKey, ...(key ? { apiKey: key } : {}) };
      let value: Registry;
      if (initial) {
        await current.request('/v1/settings/provider', 'POST', { ...config, expectedRevision: registry.revision });
        value = await current.request<Registry>('/v1/settings/connections');
      } else {
        value = await current.request<Registry>('/v1/settings/connections', 'POST', { action: 'save', expectedRevision: registry.revision, ...(draft.id ? { id: draft.id } : {}), name: draft.name, config });
      }
      const saved = value.connections.find(c => draft.id ? c.id === draft.id : c.name === draft.name) || value.connections.find(c => c.id === value.activeId)!;
      setRegistry(value); setSelected(saved.id); setModel(saved.model); setEditor(null); setClearKey(false); resetCatalog();
      setNotice(saved.id === value.activeId ? 'Saved as your default. No model request sent.' : 'Connection saved. Click Apply to use it as the default, or choose it in an individual chat.');
    }, 'Model connection saved securely.');
  };

  const apply = async () => {
    if (!model.trim() || !chosen.enabled || unsupportedModel || incompatibleTemperature) return;
    await act('Applying main model', async current => {
      let value = registry;
      if (model !== chosen.model || initial) {
        if (initial) {
          await current.request('/v1/settings/provider', 'POST', { ...configOf(chosen), model, expectedRevision: value.revision });
          value = await current.request<Registry>('/v1/settings/connections');
        } else value = await current.request<Registry>('/v1/settings/connections', 'POST', { action: 'save', id: chosen.id, name: chosen.name, config: { ...configOf(chosen), model }, expectedRevision: value.revision });
        // Keep a successful save visible even if the separate activation fails.
        setRegistry(value);
      }
      if (chosen.id !== value.activeId) {
        value = await current.request<Registry>('/v1/settings/connections', 'POST', { action: 'activate', id: chosen.id, expectedRevision: value.revision, confirmActivation: true });
        setRegistry(value);
      }
      setNotice('Default applied. Pinned chats keep their connection; no message was sent.');
    }, 'Main model updated.');
  };

  return <section className="pn-settings-card pn-model-settings" aria-label="Model settings">
    <div className="pn-settings-card-title"><h3>{editor ? editor.id ? 'Edit provider' : 'Add provider' : 'Main model'}</h3><span className="pn-settings-badge">This node</span></div>
    {!editor ? <>
      <p>Choose your default. You can choose a different saved connection inside each chat.</p>
      <div className="pn-model-form">
        <label>Provider<select aria-label="Provider" disabled={locked} value={selected} onChange={event => { if (event.target.value === 'add') { edit(blank()); return; } const c = registry.connections.find(row => row.id === event.target.value)!; resetCatalog(); setSelected(c.id); setModel(c.model); }}>
          {registry.connections.map(c => <option key={c.id} value={c.id}>{c.name === 'Default connection' ? providerFor(c.baseUrl).name : c.name}{c.id === registry.activeId ? ' · default' : ''}{!c.enabled ? ' · disabled' : ''}</option>)}<option value="add" disabled={initial}>＋ Add provider…</option>
        </select></label>
        <ModelChoice key={selected} baseUrl={chosen.baseUrl} model={model} savedModel={chosen.model} models={models} onChange={setModel} disabled={locked} />
        {incompatibleTemperature && <p role="alert">This model cannot use the saved temperature setting. Choose Edit connection, open Advanced and clear Temperature before applying.</p>}
        <div className="pn-settings-actions"><button className="pn-primary" disabled={locked || !model.trim() || !chosen.enabled || unsupportedModel || incompatibleTemperature || (!initial && chosen.id === registry.activeId && chosen.model === model)} onClick={() => void apply()}>Apply</button><button disabled={locked || !chosen.enabled || !chosen.baseUrl} onClick={() => void discover()}>{pending ? 'Loading models…' : 'Load models'}</button><button disabled={locked} onClick={() => edit(chosen)}>Edit connection</button><button disabled={locked || initial} onClick={() => edit(blank())}>＋ Add provider</button></div>
      </div>
      <p className="pn-fine">Load models contacts only {chosen.baseUrl || 'the selected endpoint'}, using its saved key. No Brain content is sent.</p>
      {model !== chosen.model && <p className="pn-fine">Applying a model change updates every chat pinned to this connection. Existing approvals may need review.</p>}
      {selected !== active.id && <p className="pn-fine">Apply makes this the default for unpinned chats. Other pinned chats stay separate.</p>}
    </> : <form onSubmit={event => { event.preventDefault(); void saveEditor(); }}>
      <label>Provider type<select aria-label="Provider type" disabled={locked} value={preset} onChange={event => {
        const p = PROVIDERS.find(row => row.id === event.target.value)!;
        resetCatalog(); setPreset(p.id); setApiKey(''); setClearKey(editor.hasApiKey);
        setEditor({ ...editor, baseUrl: p.baseUrl, model: '', name: editor.id ? editor.name : uniqueConnectionName(p.name, registry.connections) });
      }}>{PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {!initial && <label>Connection name<input required maxLength={80} disabled={locked} value={editor.name} onChange={event => patch({ name: event.target.value })} placeholder="A name you will recognize in chat" aria-invalid={!!nameIssue} /></label>}
      {nameIssue && <p role="alert">{nameIssue}</p>}
      {preset === 'custom' && <label>API base URL<input required type="url" value={editor.baseUrl} disabled={locked} placeholder="https://your-provider.example/v1" spellCheck={false} onChange={event => patch({ baseUrl: event.target.value }, true)} /></label>}
      <label>{editor.hasApiKey ? 'API key (leave blank to keep saved key)' : 'API key'}<input type="password" autoComplete="new-password" spellCheck={false} disabled={locked} value={apiKey} placeholder={presetInfo.keyRequired ? 'Paste your provider API key' : 'Optional for local servers'} onChange={event => { resetCatalog(); setApiKey(event.target.value); if (event.target.value) setClearKey(false); }} /></label>
      <div className="pn-settings-actions"><button type="button" disabled={locked || !routeReady || !editor.enabled} onClick={() => void discover()}>{pending ? 'Loading models…' : 'Load models'}</button></div>
      <p className="pn-fine">Loads the model list from {editor.baseUrl || 'your endpoint'}. Uses the key above, sends no Brain content and saves nothing yet.</p>
      <ModelChoice key={`${editor.id}:${preset}`} baseUrl={editor.baseUrl} model={editor.model} savedModel={registry.connections.find(c => c.id === editor.id)?.model} models={models} disabled={locked} onChange={value => patch({ model: value })} />
      {incompatibleTemperature && <p role="alert">The saved temperature cannot be used with this model. Open Advanced and clear Temperature to use the provider default. Nothing has been changed automatically.</p>}
      <details className="pn-model-advanced"><summary>Advanced</summary><div className="pn-model-form">
        {preset !== 'custom' && <label>API base URL<input required type="url" disabled={locked} value={editor.baseUrl} onChange={event => { setPreset('custom'); patch({ baseUrl: event.target.value }, true); }} /></label>}
        <div className="pn-settings-fields"><label>Timeout (seconds)<input required type="number" min={1} max={55} disabled={locked} value={editor.timeoutMs / 1000} onChange={event => patch({ timeoutMs: Number(event.target.value) * 1000 })} /></label><label>Temperature<input type="number" min={0} max={2} step={0.1} disabled={locked || !capabilities.supportsTemperature} value={editor.temperature ?? ''} placeholder="Provider default" onChange={event => patch({ temperature: event.target.value === '' ? null : Number(event.target.value) })} /></label><label>{capabilities.tokenParameter === 'max_completion_tokens' ? 'Completion token budget (answer + reasoning)' : 'Max output tokens'}<input type="number" min={1} max={128000} disabled={locked} value={editor.maxTokens ?? ''} placeholder="Provider default" onChange={event => patch({ maxTokens: event.target.value === '' ? null : Number(event.target.value) })} /></label></div>
        {!capabilities.supportsTemperature && <p className="pn-fine">Temperature is unavailable for this model. Leave it at the provider default.{incompatibleTemperature && <> <button type="button" disabled={locked} onClick={() => patch({ temperature: null })}>Clear Temperature</button></>}</p>}
        {capabilities.tokenParameter === 'max_completion_tokens' && <p className="pn-fine">This is a total completion budget. Reasoning models may use some of it before writing the visible answer.</p>}
        <label className="pn-check"><input type="checkbox" disabled={locked} checked={editor.enabled} onChange={event => patch({ enabled: event.target.checked })} />Connection enabled</label>
        {editor.hasApiKey && <label className="pn-check"><input type="checkbox" disabled={locked} checked={clearKey} onChange={event => { resetCatalog(); setClearKey(event.target.checked); if (event.target.checked) setApiKey(''); }} />Clear saved API key</label>}
        <p className="pn-fine">Optional generation settings require model support. Editing a saved connection affects chats pinned to it. Endpoint changes require a new key or explicitly clearing the old key.</p>
      </div></details>
      <div className="pn-settings-actions"><button className="pn-primary" disabled={locked || !editor.model.trim() || !routeReady || unsupportedModel || incompatibleTemperature || !!nameIssue}>Save connection</button><button type="button" disabled={locked} onClick={() => { setEditor(null); setApiKey(''); resetCatalog(); }}>Cancel</button></div>
      <p className="pn-fine">Save stores the connection encrypted on this node. {initial ? 'This becomes your default.' : 'The current default is unchanged.'} No chat is sent.</p>
    </form>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    <details><summary>Supported connections & privacy</summary><p>Plain Chat Completions endpoints only, not agent gateways. OpenAI uses an API key; ChatGPT/Codex subscription sign-in and native Anthropic login are not connected yet. Reasoning effort and speed controls are not connected by this adapter.</p><p>Credentials stay encrypted on this node, outside Brain objects and sync. Known unsupported models are hidden from discovery; saved models remain visible. Unknown compatibility is labelled, and discovery is not an execution test. Room permissions and send approvals stay unchanged.</p></details>
    {!!registry.history.length && <details><summary>Connection history</summary><ol>{registry.history.slice(-8).reverse().map(row => <li key={row.revision}>{row.type} · {registry.connections.find(c => c.id === row.connectionId)?.name} · {new Date(row.at).toLocaleString()}</li>)}</ol></details>}
    <button className="pn-model-reload" disabled={locked} onClick={() => setRetry(n => n + 1)}>Reload saved settings</button>
  </section>;
}
