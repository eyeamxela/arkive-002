import { useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import './PersonalSidebar.css';

export type SidebarItem = { id: string; label: string; group: string };
const ICONS: Record<string, string> = {
  chat: 'M4 4h16v12H8l-4 4z',
  canvas: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  brain: 'M12 8v8 M8 5l-4 5 4 8 M16 5l4 5-4 8 M8 5l4 3 4-3 M8 18l4-2 4 2 M4 10l8-2 8 2 M4 10l8 6 8-6',
  work: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  agents: 'M8 7V4h8v3 M4 7h16v13H4z M8 12h.01 M16 12h.01 M8 16h8 M1 11v5 M23 11v5',
  inbox: 'M4 4h16l2 13v3H2v-3z M2 15h6l2 3h4l2-3h6',
  library: 'M4 4h6v16H4z M14 4l6-1 3 16-6 1z',
  manifests: 'M4 5h16 M4 12h16 M4 19h16 M8 3v4 M16 10v4 M9 17v4',
  sources: 'M4 8a8 8 0 0 1 14-3l2 3 M20 3v5h-5 M20 16a8 8 0 0 1-14 3l-2-3 M4 21v-5h5',
  shared: 'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',
  policies: 'M12 3l8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z M8 12l3 3 5-6',
  audit: 'M8 3h11v18H5V6z M8 3v4H5 M9 11h6 M9 15h6',
  node: 'M4 3h16v7H4z M4 14h16v7H4z M7 6h.01 M7 17h.01 M11 6h6 M11 17h6',
  export: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
  disconnect: 'M10 4H4v16h6 M14 8l4 4-4 4 M8 12h12',
  chevron: 'M14 6l-6 6 6 6',
  close: 'M6 6l12 12 M18 6 6 18',
  folder: 'M3 6h7l2 3h9v11H3z M3 6V4h7l2 2',
};

function SidebarIcon({ name }: { name: string }) {
  return <svg className="pn-sidebar-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] || ICONS.brain} /></svg>;
}

type Props = {
  items: SidebarItem[];
  active: string;
  name: string;
  member: boolean;
  counts: Record<string, number>;
  busy: boolean;
  collapsed: boolean;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  onNavigate: (id: string) => void;
  onExport: () => void;
  onDisconnect: () => void;
  folders: ReactNode;
};

/** Navigation is presentational. The caller supplies only permission-filtered destinations. */
export function PersonalSidebar({ items, active, name, member, counts, busy, collapsed, setCollapsed, open, setOpen, onNavigate, onExport, onDisconnect, folders }: Props) {
  const side = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const drawer = open && mobile;

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 760px)');
    const resize = () => { setMobile(narrow.matches); if (!narrow.matches) setOpen(false); };
    narrow.addEventListener('change', resize);
    return () => narrow.removeEventListener('change', resize);
  }, [setOpen]);

  useEffect(() => {
    if (!drawer) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = Array.from(document.querySelectorAll<HTMLElement>('.pn-unified > .pn-header, .pn-workspace-feedback, .pn-unified-main'));
    const previousInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    const focusable = () => Array.from(side.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]') || []).filter(element => element.getClientRects().length > 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); side.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !side.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !side.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    focusable()[0]?.focus();
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('keydown', keydown);
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      if (previous?.isConnected && previous.getClientRects().length) previous.focus();
    };
  }, [drawer, setOpen]);

  const groups = Array.from(new Set(items.map(item => item.group)));
  return <>
    {drawer && <button className="pn-sidebar-scrim" aria-label="Dismiss navigation" tabIndex={-1} onClick={() => setOpen(false)} />}
    <aside ref={side} id="pn-workspace-navigation" className={`pn-sidebar${drawer ? ' pn-sidebar-open' : ''}`} role={drawer ? 'dialog' : undefined} aria-modal={drawer || undefined} aria-label="Workspace navigation" tabIndex={-1}>
      <div className="pn-sidebar-brand"><span className="pn-mark" aria-hidden="true">a<span>◦</span></span><strong className="pn-sidebar-label">arkive</strong><button className="pn-sidebar-collapse" aria-label={mobile ? 'Close navigation' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={mobile ? 'Close navigation' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed || drawer} aria-controls="pn-workspace-navigation" onClick={() => mobile ? setOpen(false) : setCollapsed(value => !value)}><SidebarIcon name={mobile ? 'close' : 'chevron'} /></button></div>
      <div className="pn-sidebar-account" title={`${name} · ${member ? 'Scoped member access' : 'Private personal workspace'}`}><span className="pn-sidebar-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase() || 'A'}</span><span className="pn-sidebar-account-copy"><strong>{name}</strong><small>{member ? 'Scoped member access' : 'Private personal workspace'}</small></span></div>
      <div className="pn-sidebar-scroll">
        <nav aria-label="Personal workspace">{groups.map(group => <div className="pn-nav-group" key={group}><div className="pn-sidebar-title">{group}</div>{items.filter(item => item.group === group).map(item => <button key={item.id} className="pn-sidebar-nav" aria-label={item.label} title={counts[item.id] === undefined ? item.label : `${item.label} · ${counts[item.id]}`} aria-current={active === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}><SidebarIcon name={item.id} /><span className="pn-sidebar-label">{item.label}</span>{counts[item.id] !== undefined && <small className="pn-sidebar-count" aria-hidden="true">{counts[item.id] > 999 ? '999+' : counts[item.id]}</small>}</button>)}</div>)}</nav>
        {!member && <div className="pn-sidebar-folders">{folders}</div>}
      </div>
      <footer className="pn-sidebar-bottom"><div className="pn-sidebar-privacy pn-sidebar-label"><i aria-hidden="true" /><span>{member ? 'Scoped member session' : 'Your Brain. Your data.'}</span></div>{!member && <button className="pn-sidebar-action" aria-label="Encrypted export" title="Download an encrypted recovery copy" disabled={busy} onClick={onExport}><SidebarIcon name="export" /><span className="pn-sidebar-label">Encrypted export</span></button>}<button className="pn-sidebar-action" aria-label="Disconnect session" title="Disconnect this session" disabled={busy} onClick={onDisconnect}><SidebarIcon name="disconnect" /><span className="pn-sidebar-label">Disconnect session</span></button><span className="pn-sr">{member ? 'Only granted rooms and sources are delivered. Access is rechecked while visible. Requests require owner approval.' : 'Members use separate revocable credentials. Background sync and autonomous tools remain unconnected.'}</span></footer>
    </aside>
  </>;
}
