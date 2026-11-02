import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Brain, NodeStatus, PersonalNodeClient } from './api';
import './SettingsWorkspace.css';
import { ExecutionSettings } from './ConnectionSettings';
import { ModelSettings } from './ModelSettings';
import { HarnessSettings } from './HarnessSettings';
import { ChannelSettings } from './ChannelSettings';

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
  { id: 'integrations', label: 'Connections & channels', group: 'PERSONAL', icon: '⇄' },
];
export function useSettingsAppearance() {
  const [motion, setMotion] = useState(() => { try { return localStorage.getItem('arkive.personal.motion.v1') === 'reduced' ? 'reduced' : 'system'; } catch { return 'system'; } });
  useEffect(() => { document.documentElement.dataset.arkiveMotion = motion; try { localStorage.setItem('arkive.personal.motion.v1', motion); } catch { /* Optional device preference. */ } }, [motion]);
  return { motion, setMotion };
}

export function SettingsWorkspace(props: Props & { motion: string; onMotion: (value: string) => void }) {
  const [section, setSection] = useState(props.initialSection || 'models');
  const active = SECTIONS.find(item => item.id === section)!;
  return <section className="pn-settings" aria-label="Arkive settings">
    <header className="pn-settings-heading"><div><p className="pn-eyebrow">YOUR BRAIN / YOUR CONTROLS</p><h1>Settings</h1><p>Connections, boundaries and the way you work.</p></div><span className="pn-settings-badge">Owner workspace</span></header>
    <div className="pn-settings-layout"><nav className="pn-settings-nav" aria-label="Settings sections">{SECTIONS.map((item, index) => <div key={item.id}>{(!index || item.group !== SECTIONS[index - 1].group) && <p className="pn-eyebrow">{item.group}</p>}<button aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}</button></div>)}<p className="pn-fine">Settings never grant an agent access to your Brain.</p></nav>
    <div className="pn-settings-content"><div className="pn-settings-section-title"><span className="pn-eyebrow">{active.group}</span><h2>{active.label}</h2></div>
      {section === 'models' && <ModelSettings client={props.client} busy={props.busy} act={props.act} />}
      {section === 'runtime' && <ExecutionSettings client={props.client} />}
      {section === 'capabilities' && <HarnessSettings key="catalog" client={props.client} busy={props.busy} act={props.act} catalogOnly />}
      {section === 'agents' && <HarnessSettings key="gateways" client={props.client} busy={props.busy} act={props.act} />}
      {section === 'node' && <div className="pn-settings-node">{props.children}</div>}
      {section === 'agents' && <><Card title="Four independent choices" badge="Architecture"><p>A model generates the answer. A harness controls an agent’s execution loop. A node is where it runs. Room policies decide which memory it may receive.</p><div className="pn-settings-route"><span>Room scope</span><span>Context compiler</span><span>Harness / adapter</span><span>Model on a node</span></div></Card><Card title="Arkive chat adapter" badge="Available"><p>Source-grounded text chat, explicit send consent, pinned context and owner-reviewed member requests. No shell, filesystem or autonomous tools are exposed to the text adapter.</p><button onClick={() => props.onNavigate('agents')}>Manage agent profiles →</button></Card><Card title="External agent harnesses" badge="Hermes owner pilot"><p>Dedicated Hermes gateways can execute private owner-only chats, stream replies and tool activity, and request one-time approvals. Arkive keeps context selection and the final receipt. Hermes keeps its installed skills, runtime plugins and tool configuration.</p><p className="pn-fine">A reachable gateway is not a sandbox. Configure isolation and retention on the server before opting in. Shared-room Hermes execution, plugin installation, managed containers, Claude Code, Codex and ACP adapters remain unavailable.</p></Card></>}
      {section === 'memory' && <><Card title="Permission before retrieval" badge="Enforced"><p>Rooms select sources, layers and members. A model connection does not alter those choices. Shared requests must remain readable by the room’s current members and require owner approval.</p><div className="pn-settings-actions"><button onClick={() => props.onNavigate('chat')}>Manage rooms →</button><button onClick={() => props.onNavigate('shared')}>Members & sharing →</button><button onClick={() => props.onNavigate('policies')}>Read policies →</button></div></Card><Card title="Sources, memory and Canon" badge="Separate layers"><p>Folder imports remain source evidence. Memory proposals need explicit review; neither a model response nor filing a document promotes it automatically.</p><div className="pn-settings-actions"><button onClick={() => props.onNavigate('sources')}>Sources & sync →</button><button onClick={() => props.onNavigate('inbox')}>Memory inbox →</button><button onClick={() => props.onNavigate('manifests')}>Context presets →</button></div></Card><Card title="Context limits" badge="Fixed safety bounds"><dl><dt>Selected sources per room</dt><dd>Up to 1,000</dd><dt>Compiled context</dt><dd>160,000 serialized characters; not a token estimate</dd><dt>Source writes</dt><dd>Exact preview and approval</dd></dl><p className="pn-fine">These are enforced by the service, not adjustable UI preferences.</p></Card></>}
      {section === 'identity' && <><Card title={props.brain.name} badge="Private Brain"><dl><dt>Brain ID</dt><dd>{props.brain.brainId}</dd><dt>Node ID</dt><dd>{props.status.nodeId}</dd><dt>Owner</dt><dd>Authenticated node administrator</dd><dt>Members</dt><dd>Separate revocable credentials and room scopes</dd></dl><p>Arkive does not currently issue a Nostr identity or public profile. Brain naming is set at creation; it is not a global account.</p><button onClick={() => props.onNavigate('shared')}>Manage workspace access →</button></Card><Card title="Disconnect is not delete" badge="Preserve your data"><p>Lock Brain clears the readable session. Disconnect drops this app’s connection. Neither deletes the encrypted Brain, local vault or recovery copies.</p><p className="pn-fine">Use the app’s Lock Brain or Disconnect session controls. There is no destructive “sign out and delete” action here.</p></Card></>}
      {section === 'appearance' && <><Card title="Arkive, as you like it" badge="This device"><p>The shared charcoal palette, orange actions and violet selections match the rest of Arkive. Individual folder colors remain customizable inside Files.</p><label className="pn-check"><input type="checkbox" checked={props.collapsed} onChange={event => props.onCollapsed(event.target.checked)} />Compact main sidebar</label><label>Animations<select aria-label="Animations" value={props.motion} onChange={event => props.onMotion(event.target.value)}><option value="system">Follow system reduced-motion preference</option><option value="reduced">Reduce interface motion</option></select></label><button onClick={() => props.onNavigate('brain')}>Open Brain & folder colors →</button></Card><Card title="Keyboard shortcuts" badge="Available"><dl><dt>⌘ / Ctrl + ,</dt><dd>Open Settings</dd><dt>⌘ / Ctrl + G</dt><dd>Open Brain graph</dd><dt>Escape</dt><dd>Close the mobile navigation drawer</dd></dl></Card></>}
      {section === 'integrations' && <><ChannelSettings client={props.client} busy={props.busy} act={props.act} /><Card title="Sources & calendar" badge="Arkive"><p>Vault folders and GitHub sources stay separate from messaging connections.</p><div className="pn-settings-actions"><button onClick={() => props.onNavigate('sources')}>Manage source connections →</button><button onClick={() => props.onNavigate('work')}>Planner & templates →</button></div></Card></>}
    </div></div>
  </section>;
}

function Card({ title, badge, children }: { title: string; badge: string; children: ReactNode }) {
  return <section className="pn-settings-card"><div className="pn-settings-card-title"><h3>{title}</h3><span className="pn-settings-badge">{badge}</span></div>{children}</section>;
}
