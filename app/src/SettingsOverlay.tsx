import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Team } from './Team';
import { LocalVaultPanel } from './LocalVaultPanel';
import { useMutationFeedback } from './useMutationFeedback';

// port target: design/arkive-v2.html [data-screen-label='settings'] — rail (personal · vault · app ·
// capabilities · workspace) + pane. panes from Component.panes(); row/seg primitives from Component.row()/seg().

const O = '#ff5a1f';
const mono = "'IBM Plex Mono', monospace";

const btnReset: React.CSSProperties = { border: 'none', margin: 0, font: 'inherit', color: 'inherit', textAlign: 'left', background: 'transparent', padding: 0 };

export type SegOpt = { label: string; bg: string; fg: string; cursor: string; onClick: () => void };
export type RowSpec = {
  k: string; d?: string; kFg?: string;
  isToggle?: boolean; on?: boolean; locked?: boolean; onToggle?: () => void;
  isSeg?: boolean; opts?: SegOpt[];
  isValue?: boolean; v?: string; vFg?: string;
  isPill?: boolean; pillBg?: string; pillFg?: string;
  isBtn?: boolean; btnLabel?: string; btnBg?: string; btnFg?: string; onBtn?: () => void;
};
type Block = { title?: string; note?: string; rows: RowSpec[] };
type Pane = { title: string; sub: string; blocks: Block[] };

// prototype row() defaults — one shared Row for every settings table line
export function Row({ r, sep }: { r: RowSpec; sep: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '15px 18px', borderTop: '1px solid ' + sep }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: r.kFg ?? '#e8e8e4', lineHeight: 1.35 }}>{r.k}</div>
        {r.d ? <div style={{ fontSize: 12.5, color: '#7a7a76', marginTop: 4, lineHeight: 1.45, textWrap: 'pretty' }}>{r.d}</div> : null}
      </div>
      {r.isToggle && (
        <button
          onClick={r.locked ? undefined : r.onToggle}
          disabled={r.locked || !r.onToggle}
          aria-label={r.k}
          aria-pressed={!!r.on}
          style={{ ...btnReset, width: 44, height: 24, borderRadius: 999, background: r.on ? (r.locked ? '#3a3a36' : O) : '#2a2a28', padding: 3, cursor: r.locked ? 'not-allowed' : 'pointer', flex: 'none', display: 'flex', justifyContent: r.on ? 'flex-end' : 'flex-start', transition: 'background .15s' }}
        >
          <div style={{ width: 18, height: 18, borderRadius: 999, background: r.on && !r.locked ? '#0f0f0e' : '#f6f6f4' }} />
        </button>
      )}
      {r.isSeg && (
        <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 8, background: '#1c1c1a', flex: 'none' }}>
          {(r.opts ?? []).map((o) => (
            <button key={o.label} onClick={o.onClick} style={{ ...btnReset, padding: '6px 12px', borderRadius: 6, background: o.bg, fontFamily: mono, fontSize: 10, color: o.fg, cursor: o.cursor, whiteSpace: 'nowrap' }}>{o.label}</button>
          ))}
        </div>
      )}
      {r.isValue && <div style={{ fontFamily: mono, fontSize: 11.5, color: r.vFg ?? '#c8c8c4', flex: 'none', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.v}</div>}
      {r.isPill && <div style={{ padding: '4px 10px', borderRadius: 5, background: r.pillBg ?? '#1e1e1c', fontFamily: mono, fontSize: 10, color: r.pillFg ?? '#c8c8c4', flex: 'none', whiteSpace: 'nowrap' }}>{r.v}</div>}
      {r.isBtn && <button onClick={r.onBtn} disabled={!r.onBtn} style={{ ...btnReset, padding: '8px 14px', borderRadius: 7, background: r.btnBg ?? '#232320', color: r.btnFg ?? '#e8e8e4', fontSize: 12.5, cursor: r.onBtn ? 'pointer' : 'not-allowed', flex: 'none', whiteSpace: 'nowrap' }}>{r.btnLabel}</button>}
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {b.title ? <div style={{ fontSize: 17, fontWeight: 500 }}>{b.title}</div> : null}
      <div style={{ borderRadius: 11, background: '#151514', overflow: 'hidden' }}>
        {b.rows.map((r, i) => <Row key={r.k + i} r={r} sep={i ? '#1e1e1c' : 'transparent'} />)}
      </div>
      {b.note ? <div style={{ fontFamily: mono, fontSize: 10.5, color: '#5c5c58', lineHeight: 1.5 }}>{b.note}</div> : null}
    </div>
  );
}

// prototype seg()
const seg = (current: string, opts: string[], onPick: (v: string) => void, locked?: boolean): SegOpt[] =>
  opts.map((v) => ({
    label: v,
    bg: current === v ? O : 'transparent',
    fg: current === v ? '#0f0f0e' : '#6a6a66',
    cursor: locked ? 'not-allowed' : 'pointer',
    onClick: locked ? () => {} : () => onPick(v)
  }));

// prototype capSkills 'up' strings ('4/17/26') from updatedAt
const fmtUp = (at: number) => {
  const d = new Date(at);
  return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '/' + String(d.getUTCFullYear() % 100);
};

const RAIL_GROUPS: { label: string; ids: [string, string][] }[] = [
  { label: 'personal', ids: [['profile', 'profile'], ['appearance', 'appearance'], ['notifications', 'notifications'], ['shortcuts', 'shortcuts']] },
  { label: 'vault', ids: [['policy', 'tier policy'], ['sync', 'desktop sync'], ['manifests', 'manifests'], ['sharing', 'sharing']] },
  { label: 'app', ids: [['agents', 'agents'], ['relay', 'relay'], ['experiments', 'experiments'], ['mobile', 'mobile'], ['updates', 'updates']] },
  { label: 'capabilities', ids: [['skills', 'skills'], ['connectors', 'connectors'], ['plugins', 'plugins']] },
  { label: 'workspace', ids: [['team', 'team']] }
];

const THEMES = [
  { id: 'near-black', name: 'near black', canvas: '#0a0a0a', rail: '#141414', body: '#0f0f0f', tray: '#e9e9e7', line: '#3a3a3a', accent: O },
  { id: 'graphite', name: 'graphite', canvas: '#15151a', rail: '#1d1d24', body: '#191920', tray: '#e9e9e7', line: '#45454f', accent: O },
  { id: 'true-black', name: 'true black', canvas: '#000000', rail: '#0a0a0a', body: '#000000', tray: '#e9e9e7', line: '#2a2a2a', accent: O }
];

const SHORTCUT_GROUPS: { label: string; rows: [string, string, string][] }[] = [
  { label: 'navigation', rows: [
    ['summon graph', 'open or close the vault canvas', '⌘G'],
    ['settings', 'open or close settings', '⌘,'],
    ['quick search', 'jump to a doc or room', '⌘K'],
    ['close', 'dismiss the graph, drawer or settings', 'Esc']
  ] },
  { label: 'scope', rows: [
    ['lasso add', 'add the marquee to the current selection', '⇧ drag'],
    ['clear selection', 'drop back to deny-by-tier', '⌘⌫'],
    ['sign manifest', 'publish the current selection as scope', '⌘↵']
  ] },
  { label: 'chat', rows: [
    ['send', 'send the current message', '↵'],
    ['capture note', 'prefix the composer with x note:', '⌘N'],
    ['inspect scope', 'open the manifest include list', '⌘I']
  ] }
];

export function SettingsOverlay({ onClose }: { onClose: () => void }) {
  const [pane, setPane] = useState('profile');
  const feedback = useMutationFeedback();

  // T userSettings · tierPolicy · watchedFolders · skills · connectors · plugins · agents · grants/requests (Team)
  const settings = useQuery(api.panels.userSettings);
  const policyDoc = useQuery(api.panels.tierPolicy);
  const folders = useQuery(api.panels.watchedFolders);
  const skillsQ = useQuery(api.panels.skills);
  const connsQ = useQuery(api.panels.connectors);
  const plugsQ = useQuery(api.panels.plugins);
  const agentsQ = useQuery(api.panels.agents);

  const settingsUpdate = useMutation(api.ops.settingsUpdate);
  const policySet = useMutation(api.ops.policySet);
  const folderAdd = useMutation(api.ops.folderAdd);
  const folderRemove = useMutation(api.ops.folderRemove);
  const skillToggle = useMutation(api.ops.skillToggle);
  const agentSetModel = useMutation(api.ops.agentSetModel);

  // R — pane-local state (prototype Shell state)
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [folderTier, setFolderTier] = useState('auto');
  const [labelMode, setLabelMode] = useState('canon'); // simulated — graph slice reads its own copy
  const [ttl, setTtl] = useState('session'); // simulated — manifest default, not yet persisted
  const [deny, setDeny] = useState(true); // simulated — chat holds its own deny state
  const [shareTarget, setShareTarget] = useState('kiln');
  const [shareExp, setShareExp] = useState('30d');
  const [scopeOverride, setScopeOverride] = useState<Record<string, string>>({}); // simulated — no skill-scope mutation
  const [imported, setImported] = useState(false); // simulated — no skill-import mutation
  const [importedOn, setImportedOn] = useState(false);
  const [connOverride, setConnOverride] = useState<Record<string, string>>({}); // simulated — no connector mutation
  const [connScope, setConnScope] = useState('none'); // simulated — connection ≠ access, no capabilityGrants write
  const [plugLocal, setPlugLocal] = useState<{ on?: boolean; exec?: boolean }>({}); // simulated — no plugin mutation

  const opt = (settings?.opt ?? {}) as Record<string, boolean>;
  const setOpt = (k: string) => () => { void feedback.run(() => settingsUpdate({ opt: { [k]: !opt[k] } })); };
  const density = settings?.density ?? 'comfortable';
  const theme = settings?.theme ?? 'near-black';

  const hermesModel = (agentsQ ?? []).find((a) => a.key === 'hermes')?.model ?? 'sonnet';

  const skillScopeOf = (key: string) => scopeOverride[key] ?? (skillsQ ?? []).find((x) => x.key === key)?.scope ?? 'none';

  const plug = (plugsQ ?? [])[0];
  const plugOn = plugLocal.on ?? plug?.on ?? true;
  const plugExec = plugLocal.exec ?? plug?.execConsented ?? false;

  const confirmFolder = async () => {
    let p = folderPath.trim();
    if (!p) return;
    if (!p.startsWith('~') && !p.startsWith('/')) p = '~/' + p;
    if (await feedback.run(() => folderAdd({ path: p, tier: folderTier }))) {
      setAddingFolder(false);
      setFolderPath('');
    }
  };

  const policyIds = ['canon', 'curated', 'dashboards', 'legal', 'inbox', 'dreams'] as const;

  const panes: Record<string, Pane> = {
    profile: {
      title: 'profile', sub: 'prototype profile — verified identity and key management are not connected.',
      blocks: [
        { rows: [
          { k: 'display name', isValue: true, v: 'xela' },
          { k: 'npub', isValue: true, v: 'not configured' },
          { k: 'nip-05', isValue: true, v: 'not configured' },
          { k: 'signing key', d: 'no keychain integration or cryptographic signing is implemented.', isPill: true, v: 'not implemented', pillBg: '#2a1a12', pillFg: O }
        ] },
        { title: 'data management', note: 'use desktop sync → local originals for the implemented export and restore tools.', rows: [
          { k: 'delete my data', d: 'not implemented; this control does not delete anything.', isBtn: true, btnLabel: 'unavailable', btnBg: '#7a2418', btnFg: '#ffe8e2' }
        ] }
      ]
    },
    appearance: {
      title: 'appearance', sub: 'choose a theme for arkive.',
      blocks: [
        { rows: [
          { k: 'density', d: 'saved interface preference.', isSeg: true, opts: seg(density, ['compact', 'comfortable'], (v) => { void feedback.run(() => settingsUpdate({ density: v })); }) },
          { k: 'graph labels', d: 'which nodes carry a filename on the canvas.', isSeg: true, opts: seg(labelMode, ['canon', 'selected', 'all'], setLabelMode) }
        ] }
      ]
    },
    notifications: {
      title: 'notifications', sub: 'design preview only — desktop notifications and scheduled briefs are not connected.',
      blocks: [
        { rows: [
          { k: 'capture committed', d: 'a note landed on disk and the node is on the map.', isToggle: true, on: opt.captureAlerts, onToggle: setOpt('captureAlerts') },
          { k: 'manifest signed', d: 'a new scope was published, or an old one superseded.', isToggle: true, on: opt.manifestAlerts, onToggle: setOpt('manifestAlerts') },
          { k: 'hash drift', d: 'a doc in an active manifest no longer matches its pin.', isToggle: true, on: opt.driftAlerts, onToggle: setOpt('driftAlerts') },
          { k: 'nightly brief posted', d: 'the 21:30 brief published to #xela.', isToggle: true, on: opt.briefAlerts, onToggle: setOpt('briefAlerts') },
          { k: 'hold while asleep', d: 'queue alerts on the droplet instead of firing on wake.', isToggle: true, on: opt.quiet, onToggle: setOpt('quiet') }
        ] }
      ]
    },
    shortcuts: { title: 'keyboard shortcuts', sub: 'design reference — this list includes planned shortcuts, not a verified key map.', blocks: [] },
    policy: {
      title: 'tier policy', sub: 'prototype context filtering — not per-user access control or relay publication.',
      blocks: [
        { rows: policyIds.map((id) => {
          const sealed = id === 'dreams';
          const cur = (policyDoc?.[id] as string | undefined) ?? (sealed ? 'exclude' : 'index');
          return {
            k: id,
            d: sealed ? 'excluded from context; no encryption guarantee' : cur === 'ask' ? 'excluded until a consent flow is implemented' : 'applies to context preview and simulated sends',
            isSeg: true, opts: seg(cur === 'index' ? 'include' : cur, ['include', 'ask', 'exclude'], (v) => { void feedback.run(() => policySet({ tier: id, mode: v })); }, sealed)
          };
        }), note: 'use sample data only. identity and retrieval-level permissions are not implemented.' }
      ]
    },
    sync: {
      title: 'desktop sync', sub: 'local text-original storage works in this browser. filesystem watching and cross-device sync are not implemented.',
      blocks: [
        { rows: [
          { k: 'paired desktop', isValue: true, v: 'not paired' },
          { k: 'droplet', isValue: true, v: 'not connected' },
          { k: 'direction', d: 'local browser storage only; originals are not encrypted or uploaded to the Brain.', isPill: true, v: 'no sync', pillBg: '#2a1a12', pillFg: O }
        ] },
        { title: 'watcher', rows: [
          { k: 'reindex on wake', d: 'flush the droplet queue and rescan as soon as the mac is reachable.', isToggle: true, on: opt.watchOnWake, onToggle: setOpt('watchOnWake') },
          { k: 'reindex on commit', d: 'git post-commit hook triggers an incremental scan.', isToggle: true, on: opt.autoReindex, onToggle: setOpt('autoReindex') },
          { k: 'embed locally', d: 'nomic-embed-text via ollama. vectors never leave the mac.', isToggle: true, on: opt.localEmbed, onToggle: setOpt('localEmbed') },
          { k: 'keep awake while agents run', d: 'prevents sleep while a local agent is mid-turn. releases after an hour idle.', isToggle: true, on: opt.keepAwake, onToggle: setOpt('keepAwake') }
        ] }
      ]
    },
    manifests: {
      title: 'manifest defaults', sub: 'what a freshly signed scope inherits.',
      blocks: [
        { rows: [
          { k: 'default ttl', isSeg: true, opts: seg(ttl, ['session', 'until-revoked', 'iso'], setTtl) },
          { k: 'deny by tier', d: 'with no manifest active the agent sees canon only.', isToggle: true, on: deny, onToggle: () => setDeny((v) => !v) },
          { k: 'supersede on sign', d: 'signing a new scope retires the previous one for that room.', isToggle: true, on: opt.autoSupersede, onToggle: setOpt('autoSupersede') },
          { k: 'pin by content hash', d: 'required. a manifest without hashes cannot be audited.', isToggle: true, on: true, locked: true }
        ] }
      ]
    },
    sharing: {
      title: 'sharing', sub: 'grants are explicit, expiring and revocable. sharing never auto-runs anything.',
      blocks: [
        { rows: [
          { k: 'guest link expiry', d: 'default lifetime for links handed outside the tailnet.', isSeg: true, opts: seg(shareExp, ['30d', '90d', 'never'], setShareExp) },
          { k: 'block downloads on guest links', d: 'guests read in place; nothing leaves as a file.', isToggle: true, on: opt.shareNoDl, onToggle: setOpt('shareNoDl') },
          { k: 'executable capability (▣)', d: 'per-person consent, never inherited from a role or a share.', isPill: true, v: 'separate consent', pillBg: '#2a1a12', pillFg: O }
        ] },
        { title: 'effective access — simulate', note: 'what a grant actually resolves to, before you commit it. revoking seals content; citations survive.', rows: [
          { k: 'simulate for', isSeg: true, opts: seg(shareTarget, ['kiln', 'nezu', 'hermes'], setShareTarget) },
          { k: 'they can', isValue: true, v: shareTarget === 'kiln' ? 'view + comment · expires ' + shareExp + ' · downloads ' + (opt.shareNoDl ? 'blocked' : 'allowed') : (shareTarget === 'nezu' ? 'read + edit shared projects · steward of print-specs · no canon' : 'per-run grants only · every send gated on you'), vFg: '#e8e8e4' },
          { k: 'why', isValue: true, v: shareTarget === 'kiln' ? 'guest link · direct grant · no role inheritance' : (shareTarget === 'nezu' ? 'steward grant · sensitivity outranks role' : 'agent grants never inherit from your roles') }
        ] }
      ]
    },
    team: { title: 'team', sub: 'members, roles, share grants and the permission simulator — everything here is explicit, expiring and audited.', blocks: [] },
    skills: {
      title: 'skills', sub: 'reusable instruction packs. enabling a skill never grants it to an agent by itself — scope does. all simulated.',
      blocks: [
        { rows: [
          ...(skillsQ ?? []).map((sk) => ({
            k: sk.key, d: sk.by + ' · updated ' + fmtUp(sk.updatedAt) + ' · scope: ' + skillScopeOf(sk.key),
            isToggle: true, on: sk.on, onToggle: () => { void skillToggle({ id: sk._id }); }
          })),
          ...(imported ? [{ k: 'brand-voice-check', d: 'you · updated today · scope: none', isToggle: true, on: importedOn, onToggle: () => setImportedOn((v) => !v) }] : [])
        ] },
        { title: 'scope + import', note: 'scope decides which agents may load an enabled skill — changes land in agent detail → tools and the audit log.', rows: [
          { k: 'json-ld-blog-schema → agents', isSeg: true, opts: seg(skillScopeOf('json-ld-blog-schema'), ['none', 'hermes', 'all'], (v) => setScopeOverride((p) => ({ ...p, 'json-ld-blog-schema': v }))) },
          { k: 'web-artifacts-builder → agents', isSeg: true, opts: seg(skillScopeOf('web-artifacts-builder'), ['none', 'hermes', 'all'], (v) => setScopeOverride((p) => ({ ...p, 'web-artifacts-builder': v }))) },
          { k: 'import a skill folder', d: 'validated before it can be enabled · disabled by default', isBtn: true, btnLabel: imported ? 'imported ✓' : 'import (simulated)', onBtn: () => setImported(true) }
        ] }
      ]
    },
    connectors: {
      title: 'connectors', sub: 'service integrations live here. connection status is separate from agent access — connecting grants no agent anything. all simulated.',
      blocks: [
        { rows: (connsQ ?? []).map((c) => {
          const st = connOverride[c.key] ?? c.status;
          return {
            k: c.key, kFg: st === 'error' ? O : '#e8e8e4',
            d: 'web · ' + (st === 'connected' ? 'connected · synced' : (st === 'error' ? 'needs attention — auth expired' : 'not connected')),
            isBtn: true, btnLabel: st === 'connected' ? 'disconnect' : (st === 'error' ? 'reconnect' : 'connect'),
            btnBg: st === 'error' ? '#2a1a12' : '#232320', btnFg: st === 'error' ? O : '#e8e8e4',
            onBtn: () => setConnOverride((p) => ({ ...p, [c.key]: st === 'connected' ? 'off' : 'connected' }))
          };
        }) },
        { title: 'agent access', note: 'a connected service is never automatically available to an agent — grant per agent, revocable, audited.', rows: [
          { k: 'gmail → agents', d: 'read-only lease per run, like every agent grant', isSeg: true, opts: seg(connScope, ['none', 'hermes', 'all'], setConnScope) },
          { k: 'everything else', isValue: true, v: 'no agent access granted' }
        ] }
      ]
    },
    plugins: {
      title: 'plugins', sub: 'bundles of skills, connectors and tools from a publisher. executable pieces always need their own consent.',
      blocks: [
        { rows: [
          { k: 'bie full stack', d: 'publisher — · v1 · 38 skills · updated 7/28/26', isToggle: true, on: plugOn, onToggle: () => setPlugLocal({ on: !plugOn, exec: false }) },
          { k: '▣ executable capabilities (2)', d: 'runs code on this machine — consented separately, never bundled with install. revocable.', isToggle: true, on: plugExec, locked: !plugOn, onToggle: () => setPlugLocal({ on: plugOn, exec: !plugExec }) },
          { k: 'trust', isValue: true, v: 'unsigned publisher · sandboxed until signed', vFg: '#d9a13a' },
          { k: 'includes', isValue: true, v: '38 skills · 2 connectors · 2 ▣ tools · deps: none' }
        ] }
      ]
    },
    agents: {
      title: 'agents', sub: 'which agent runtimes arkive can use on this machine.',
      blocks: [
        { rows: [
          { k: 'hermes agent', d: 'prototype identity only. no runtime adapter or health check is configured.', isPill: true, v: 'simulated', pillBg: '#2a1a12', pillFg: O },
          { k: 'claude code', d: 'available as a future harness adapter; not connected to this app.', isPill: true, v: 'not connected', pillBg: '#1c1c1c', pillFg: '#8a8a8a' },
          { k: 'codex', d: 'available as a future harness adapter; not connected to this app.', isPill: true, v: 'not connected', pillBg: '#1c1c1c', pillFg: '#8a8a8a' },
          { k: 'nezu agent', d: 'prototype identity only. no runtime adapter is configured.', isPill: true, v: 'simulated', pillBg: '#2a1a12', pillFg: O },
          { k: 'goose', d: 'arkive talks to goose through the goose cli.', isBtn: true, btnLabel: 'install cli', btnBg: '#e8e8e4', btnFg: '#111' }
        ] },
        { title: 'defaults', rows: [
          { k: 'default harness', isValue: true, v: 'none · prototype simulation' },
          { k: 'default model', d: 'identity, memory and grants survive a swap — logged as a version event.', isSeg: true, opts: seg(hermesModel, ['haiku', 'sonnet', 'opus'], (v) => { void agentSetModel({ key: 'hermes', model: v }); }) },
          { k: 'approval gate', d: 'anything that sends or publishes waits for you — it surfaces on the agents tab.', isToggle: true, on: opt.approvalGate, onToggle: setOpt('approvalGate') },
          { k: 'standing rules', d: 'loaded before anything else in every turn.', isValue: true, v: 'canon/standing-rules.md' },
          { k: 'enforcement', d: 'verified identity and principal access checks must ship before private-data beta testing.', isPill: true, v: 'not implemented', pillBg: '#2a1a12', pillFg: O }
        ] }
      ]
    },
    relay: {
      title: 'relay', sub: 'design preview — no relay, tailnet or server connection has been configured.',
      blocks: [
        { rows: [
          { k: 'url', isValue: true, v: 'not connected' },
          { k: 'tailnet', isValue: true, v: 'not connected' },
          { k: 'community', isValue: true, v: 'xela' },
          { k: 'at rest', d: 'references and queued captures. no vault content, ever.', isPill: true, v: 'refs only', pillBg: '#2a1a12', pillFg: O },
          { k: 'relay patches', d: 'stock build. divergence is debt.', isValue: true, v: '0' },
          { k: 'tenancy', d: 'frtl and zbmd run their own droplets.', isValue: true, v: 'single' }
        ] }
      ]
    },
    experiments: {
      title: 'experiments', sub: 'planned capabilities only. these disabled controls do not enable working services.',
      blocks: [
        { rows: [
          { k: 'server-side enforcement', d: 'the relay refuses out-of-manifest reads instead of trusting the agent.', isToggle: true, on: opt.xServerEnforce, onToggle: setOpt('xServerEnforce') },
          { k: 'semantic prefetch', d: 'warm the likely next docs into the droplet cache before you ask.', isToggle: true, on: opt.xPrefetch, onToggle: setOpt('xPrefetch') },
          { k: 'workflows', d: 'yaml-defined automations with approval gates.', isToggle: true, on: opt.xWorkflows, onToggle: setOpt('xWorkflows') },
          { k: 'multi-relay federation', d: 'query frtl and zbmd graphs from this client.', isToggle: true, on: opt.xFederation, onToggle: setOpt('xFederation') }
        ] }
      ]
    },
    mobile: {
      title: 'mobile', sub: 'mobile pairing and end-to-end encryption are not implemented. no pairing code or connection is available.',
      blocks: []
    },
    updates: {
      title: 'software updates', sub: 'keep arkive up to date with the latest features and fixes.',
      blocks: [
        { rows: [
          { k: 'update status', d: 'check if a new version is available.', isBtn: true, btnLabel: 'check for updates', btnBg: '#e8e8e4', btnFg: '#111' },
          { k: 'version', isValue: true, v: 'v0.0.2 · prototype' }
        ] }
      ]
    }
  };

  const cur = panes[pane] ?? panes.profile;

  return (
    <div data-screen-label="settings" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', background: '#0a0a09', animation: 'arkFade .16s ease-out', fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <div className="ark-scroll ark-settings-rail" style={{ width: 244, flex: 'none', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 22, padding: '22px 14px 16px 18px' }}>
        <button onClick={onClose} style={{ ...btnReset, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 8px', borderRadius: 7, color: '#d8d8d8', flex: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M13 8H3.5M7.4 3.6 3 8l4.4 4.4" /></svg>
          <div style={{ fontSize: 13.5 }}>back to app</div>
        </button>

        {RAIL_GROUPS.map((g) => (
          <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 'none' }}>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: '#4a4a48', padding: '0 8px 6px 8px' }}>{g.label}</div>
            {g.ids.map(([id, label]) => (
              <button key={id} onClick={() => setPane(id)} style={{ ...btnReset, display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 9px', borderRadius: 7, cursor: 'pointer', background: pane === id ? '#1b1b12' : 'transparent', transition: 'background .12s', width: '100%' }}>
                <div style={{ width: 3, height: 13, borderRadius: 2, background: pane === id ? O : 'transparent', flex: 'none' }} />
                <div style={{ fontSize: 13.5, color: pane === id ? '#f4f4f0' : '#8a8a86', fontWeight: pane === id ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
              </button>
            ))}
          </div>
        ))}

        <div style={{ marginTop: 'auto', padding: 8, fontFamily: mono, fontSize: 9.5, color: '#3a3a38', flex: 'none' }}>v0.0.2 · arkive prototype</div>
      </div>

      <div style={{ flex: 1, minWidth: 0, padding: '14px 14px 14px 0', display: 'flex' }}>
        <div className="ark-scroll ark-settings-pane" style={{ flex: 1, minWidth: 0, overflowY: 'auto', borderRadius: 16, background: '#0f0f0e', padding: '30px 34px 40px 34px' }}>
          <div role="note" style={{ marginBottom: 20, padding: 12, border: '1px solid #6b3a20', borderRadius: 8, color: '#efb58a', fontSize: 12, lineHeight: 1.6 }}>Prototype settings · disabled sections are design previews, not active services. No provider, relay, keychain, encryption or filesystem watcher is connected. Use sample data only.</div>
          {feedback.error && <div role="alert" style={{ color: '#ff8b6a', marginBottom: 12 }}>{feedback.error}</div>}
          {feedback.pending && <div role="status">saving configuration…</div>}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, maxWidth: 940 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-.02em', lineHeight: 1.1 }}>{cur.title}</div>
              <div style={{ fontSize: 14, color: '#8a8a86', marginTop: 9, lineHeight: 1.5, textWrap: 'pretty' }}>{cur.sub}</div>
            </div>
            {pane === 'profile' && (
              <button disabled title="Profile editing is not implemented" style={{ ...btnReset, flex: 'none', padding: '9px 15px', borderRadius: 8, background: '#e8e8e4', color: '#111', fontSize: 13, cursor: 'not-allowed', whiteSpace: 'nowrap' }}>edit (planned)</button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 30, maxWidth: 940 }}>
            {pane === 'sync' && <LocalVaultPanel />}
            {pane === 'sync' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 17, fontWeight: 500 }}>folder sync · demo configuration</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: '#5c5c58' }}>{(folders ?? []).length + ' configured · not watched'}</div>
                  <button onClick={() => { setAddingFolder(true); setFolderPath(''); setFolderTier('auto'); }} style={{ ...btnReset, marginLeft: 'auto', padding: '8px 14px', borderRadius: 7, background: '#232320', color: '#e8e8e4', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>add folder</button>
                </div>
                <div style={{ borderRadius: 11, background: '#151514', overflow: 'hidden' }}>
                  {(folders ?? []).map((f, i) => {
                    const scanning = f.status === 'scanning';
                    return (
                      <div key={f._id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderTop: '1px solid ' + (i === 0 ? 'transparent' : '#1e1e1c') }}>
                        <div style={{ width: 6, height: 6, borderRadius: 999, background: scanning ? O : '#3a7a4a', animation: scanning ? 'arkPulse .9s ease-in-out infinite' : 'none', flex: 'none' }} />
                        <div style={{ fontFamily: mono, fontSize: 11.5, color: '#e8e8e4', flex: '1 1 auto', minWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</div>
                        <div style={{ padding: '3px 9px', borderRadius: 4, background: '#1e1e1c', fontFamily: mono, fontSize: 9.5, color: f.tier === 'canon' ? O : '#a8a8a4', flex: '0 1 auto', minWidth: 34, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.tier === 'auto' ? 'by subfolder' : f.tier}</div>
                        <div style={{ fontFamily: mono, fontSize: 10, color: '#5c5c58', flex: '0 1 auto', minWidth: 0, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>metadata only</div>
                        {f.primary && <div style={{ fontFamily: mono, fontSize: 9, color: '#4a4a46', flex: 'none', width: 22, textAlign: 'center' }}>pri</div>}
                        {!f.primary && (
                          <button disabled={feedback.pending} onClick={() => { void feedback.run(() => folderRemove({ id: f._id })); }} title="remove folder configuration" style={{ ...btnReset, width: 22, height: 22, borderRadius: 5, display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#5c5c58', flex: 'none' }}>
                            <svg width="9" height="9" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2"><path d="M1.5 1.5 10.5 10.5M10.5 1.5 1.5 10.5" /></svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {addingFolder && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', borderTop: '1px solid #1e1e1c', background: '#17170f' }}>
                      <div style={{ fontFamily: mono, fontSize: 11, color: '#4a4a46', flex: 'none' }}>›</div>
                      <input
                        value={folderPath}
                        onChange={(e) => setFolderPath(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmFolder();
                          if (e.key === 'Escape') { e.stopPropagation(); setAddingFolder(false); setFolderPath(''); }
                        }}
                        placeholder="~/path/to/folder"
                        autoFocus
                        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#f2f2f0', fontSize: 12, fontFamily: mono }}
                      />
                      <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 8, background: '#1c1c1a', flex: 'none' }}>
                        {['auto', 'canon', 'curated', 'inbox'].map((v) => (
                          <button key={v} onClick={() => setFolderTier(v)} style={{ ...btnReset, padding: '5px 10px', borderRadius: 6, background: folderTier === v ? O : 'transparent', fontFamily: mono, fontSize: 10, color: folderTier === v ? '#0f0f0e' : '#5c5c58', cursor: 'pointer', whiteSpace: 'nowrap' }}>{v}</button>
                        ))}
                      </div>
                      <button disabled={feedback.pending || !folderPath.trim()} onClick={() => void confirmFolder()} style={{ ...btnReset, padding: '7px 13px', borderRadius: 6, background: folderPath.trim() ? O : '#232320', color: folderPath.trim() ? '#0f0f0e' : '#5c5c58', fontFamily: mono, fontSize: 10, cursor: 'pointer', flex: 'none' }}>save config</button>
                      <button onClick={() => { setAddingFolder(false); setFolderPath(''); }} style={{ ...btnReset, width: 22, height: 22, borderRadius: 5, display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#5c5c58', flex: 'none' }}>
                        <svg width="9" height="9" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2"><path d="M1.5 1.5 10.5 10.5M10.5 1.5 1.5 10.5" /></svg>
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: mono, fontSize: 10.5, color: '#73736f', lineHeight: 1.5 }}>These are prototype folder records, not live filesystem watchers. Real originals can be imported and exported in the local panel above. No folder is scanned or synced by these controls.</div>
              </div>
            )}

            {pane === 'team' && <Team />}

            {cur.blocks.map((b, i) => <fieldset key={(b.title ?? '') + i} disabled={feedback.pending || !['appearance', 'policy'].includes(pane)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><BlockView b={b} /></fieldset>)}

            {pane === 'appearance' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
                {THEMES.map((t) => {
                  const on = theme === t.id;
                  return (
                    <button key={t.id} disabled={feedback.pending} onClick={() => { void feedback.run(() => settingsUpdate({ theme: t.id })); }} style={{ ...btnReset, display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer' }}>
                      <div style={{ height: 104, width: '100%', borderRadius: 10, border: '1.5px solid ' + (on ? O : '#2a2a28'), background: t.canvas, padding: 9, display: 'flex', gap: 7, overflow: 'hidden' }}>
                        <div style={{ width: '34%', borderRadius: 5, background: t.rail, display: 'flex', flexDirection: 'column', gap: 4, padding: 6 }}>
                          <div style={{ height: 3, borderRadius: 2, background: t.line, width: '80%' }} />
                          <div style={{ height: 3, borderRadius: 2, background: t.line, width: '60%' }} />
                          <div style={{ height: 3, borderRadius: 2, background: t.accent, width: '70%' }} />
                        </div>
                        <div style={{ flex: 1, borderRadius: 5, background: t.body, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4, padding: 6 }}>
                          <div style={{ height: 3, borderRadius: 2, background: t.line, width: '90%' }} />
                          <div style={{ height: 3, borderRadius: 2, background: t.line, width: '55%' }} />
                          <div style={{ height: 8, borderRadius: 3, background: t.tray }} />
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: on ? '#f4f4f0' : '#8a8a86' }}>{t.name}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {pane === 'shortcuts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                {SHORTCUT_GROUPS.map((g) => (
                  <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    <div style={{ fontSize: 17, fontWeight: 500 }}>{g.label}</div>
                    <div style={{ borderRadius: 11, background: '#151514', overflow: 'hidden' }}>
                      {g.rows.map(([name, desc, key], i) => (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderTop: '1px solid ' + (i ? '#1e1e1c' : 'transparent') }}>
                          <div style={{ fontSize: 13.5, flex: 'none' }}>{name}</div>
                          <div style={{ fontSize: 12.5, color: '#7a7a76', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</div>
                          <div style={{ padding: '4px 9px', borderRadius: 5, background: '#1e1e1c', fontFamily: mono, fontSize: 10.5, color: '#c8c8c4', flex: 'none' }}>{key}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pane === 'mobile' && (
              <div style={{ display: 'grid', placeItems: 'center', padding: '22px 0' }}>
                <div style={{ width: 270, height: 270, borderRadius: 14, background: '#f4f4f0', display: 'grid', placeItems: 'center' }}>
                  <button disabled style={{ ...btnReset, padding: '11px 20px', borderRadius: 8, background: '#e2e2dc', color: '#111', fontSize: 13.5, cursor: 'not-allowed' }}>pairing not implemented</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
