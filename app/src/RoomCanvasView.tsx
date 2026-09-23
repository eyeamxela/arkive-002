import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChatPanel } from './ChatPanel';
import { useRoomCanvasModel, type RoomCanvasProps } from './RoomCanvasModel';

const O = '#ff5a1f';
const WAIT = '#d9a13a';
const mono = "'IBM Plex Mono', monospace";

type LinkState = { id: string; from: string; to: string; color: string; dashed?: boolean; dotted?: boolean; label: string };
type DrawnLink = LinkState & { d: string };

export function RoomCanvasView(props: RoomCanvasProps) {
  const {
    room, manifest, scopedDocs, canon, scopedTierCounts, ctxOn, context,
    denied, policy, running, waiting, currentRun, agentKey, agent,
    currentGrant, roomSkills, mounted, latestPack, runningReadsScope, runningScopeNote, workspace,
    audit, approvalPending, approvalError, approveWaitingRun, setContextOpen, toggleAgentPaused, pausePending, pauseError,
  } = useRoomCanvasModel(props.room);

  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [drawnLinks, setDrawnLinks] = useState<DrawnLink[]>([]);
  const setCardRef = (id: string) => (element: HTMLDivElement | null) => { cardRefs.current[id] = element; };

  // Connectors are a read-only projection. They are never BrainObjects or persisted rows.
  const linkStates = useMemo<LinkState[]>(() => {
    const links: LinkState[] = [];
    if (props.layers.memory) {
      links.push({ id: 'canon', from: 'canon', to: 'room', color: '#5c5c5c', label: 'canon: always-loaded context' });
      links.push({ id: 'scope', from: 'scope', to: 'room', color: runningReadsScope ? O : '#5c5c5c', dashed: runningReadsScope, label: runningScopeNote });
      links.push({ id: 'summary', from: 'summary', to: 'room', color: ctxOn.length ? '#c8b4a6' : '#3a3a3a', label: ctxOn.length ? 'context summary: enabled' : 'context summary: off' });
      links.push({ id: 'sealed', from: 'sealed', to: 'room', color: '#3a3a3a', dotted: true, label: 'configured tier exclusions; owner identity is a separate boundary' });
    }
    if (props.layers.agents) {
      links.push({ id: 'agent', from: 'room', to: 'agent', color: running ? O : '#5c5c5c', dashed: !!running, label: running ? 'agent: simulated run' : 'agent: no live runtime connected' });
      links.push({ id: 'gate', from: 'room', to: 'gate', color: waiting ? WAIT : '#3a3a3a', label: waiting ? 'approval gate: waiting on you' : 'approval gate: nothing waiting' });
    }
    if (props.layers.tools) {
      links.push({ id: 'skills', from: 'room', to: 'skills', color: '#3a3a3a', label: 'skills: scoped prototype configuration' });
      links.push({ id: 'cartridges', from: 'room', to: 'cartridges', color: '#3a3a3a', label: 'cartridges: mounted references' });
    }
    return links;
  }, [props.layers.memory, props.layers.agents, props.layers.tools, runningReadsScope, runningScopeNote, !!running, !!waiting, ctxOn.length]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const bounds = stage.getBoundingClientRect();
      // Screen rectangles include the infinite-canvas camera scale; SVG paths
      // must stay in the stage's unscaled local coordinates.
      const scaleX = bounds.width / (stage.offsetWidth || 1) || 1;
      const scaleY = bounds.height / (stage.offsetHeight || 1) || 1;
      const next = linkStates.flatMap((link) => {
        const from = cardRefs.current[link.from]?.getBoundingClientRect();
        const to = cardRefs.current[link.to]?.getBoundingClientRect();
        if (!from || !to) return [];
        const x1 = (from.left + from.width / 2 - bounds.left) / scaleX;
        const y1 = (from.bottom - bounds.top) / scaleY;
        const x2 = (to.left + to.width / 2 - bounds.left) / scaleX;
        const y2 = (to.top - bounds.top) / scaleY;
        const mid = (y1 + y2) / 2;
        return [{ ...link, d: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}` }];
      });
      setDrawnLinks(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    Object.values(cardRefs.current).forEach((element) => { if (element) observer.observe(element); });
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [linkStates, props.layers.graphFloor, props.layers.audit, room?.key]);

  const paths = (items: {path?: string; title: string}[]) => items.slice(0, 2).map((d) => d.path?.split('/').pop() ?? d.title).join(' · ') || 'none in this room';
  const openFirst = (items: {path?: string}[]) => items[0]?.path ? props.onOpenDoc(items[0].path) : props.onOpenVault();

  return (
    <div className="ark-room-canvas ark-scroll" aria-label={'canvas view of ' + props.room}>
      <div className="ark-room-canvas-mobile-summary">reads {scopedDocs.length} docs · {running ? 1 : 0} simulated run · {waiting ? 1 : 0} gate</div>
      <div ref={stageRef} className={'ark-room-canvas-stage' + (props.layers.graphFloor ? ' ark-room-canvas-stage--floor' : '')}>
        <svg className="ark-room-connectors" aria-label="derived room connections">
          {drawnLinks.map((link) => <path key={link.id} d={link.d} fill="none" stroke={link.color} strokeWidth={link.dashed ? 1.4 : 1.2} strokeDasharray={link.dashed ? '6 6' : link.dotted ? '3 4' : undefined} className={link.dashed ? 'ark-room-link--running' : undefined}><title>{link.label}</title></path>)}
        </svg>

        {props.layers.memory && (
          <section className="ark-room-band-section">
            <BandHeading>memory layers · what the room can read</BandHeading>
            <div className="ark-room-canvas-band">
              <div ref={setCardRef('canon')}><CanvasCard title="canon" badge="always" color={O} number={String(canon.length)} body={paths(canon)}><CanvasButton onClick={() => openFirst(canon)}>open in vault</CanvasButton></CanvasCard></div>
              <div ref={setCardRef('scope')}><CanvasCard title="effective scope" badge={workspace?.context.scopeLabel ?? 'resolving'} number={String(scopedDocs.length)} body={(scopedTierCounts.map(([tier, count]) => tier + ' ' + count).join(' · ') || 'no mapped objects') + '\n' + paths(scopedDocs) + '\nmanifest reference: ' + (manifest?.key ?? 'none')}><CanvasButton onClick={props.onOpenGraph}>lasso ⌘g</CanvasButton><CanvasButton onClick={props.onOpenVault}>inspect</CanvasButton></CanvasCard></div>
              <div ref={setCardRef('summary')}><CanvasCard title="context summary" badge={ctxOn.length ? ctxOn.map((c) => c.version).join('+') + ' · on' : 'off'} color="#c8b4a6" number={ctxOn.reduce((n, c) => n + c.tokens, 0).toFixed(1) + 'k'} body={context.length + ' versions · local summarization remains simulated'}><CanvasButton onClick={() => { setContextOpen(true); props.onOpenContext(); }}>summarize / versions</CanvasButton></CanvasCard></div>
              <div ref={setCardRef('sealed')}><CanvasCard title="policy boundary" badge={policy?.inbox === 'exclude' ? 'exclusion configured' : policy ? 'policy configured' : 'policy loading'} color="#3a3a3a" number="—" dashed body={denied + ' recorded refusals · tier exclusions and owner identity are separate boundaries'}><span style={{ fontFamily: mono, fontSize: 8.5, color: '#5c5c5c' }}>team roles unavailable · no live agent execution</span></CanvasCard></div>
            </div>
          </section>
        )}

        <div ref={setCardRef('room')} className="ark-room-canvas-chat">
          <ChatPanel key={props.room} room={props.room} compact onExitCompact={props.onOpenChat} onOpenCapture={props.onOpenCapture} onOpenDoc={props.onOpenDoc} />
        </div>

        {(props.layers.agents || props.layers.tools) && (
          <section className="ark-room-band-section">
            <BandHeading>agents + tools · what the room can do</BandHeading>
            <div className="ark-room-canvas-band">
              {props.layers.agents && <>
                <div ref={setCardRef('agent')}><CanvasCard title={agent?.name ?? agentKey} badge={agent?.paused ? 'paused · simulated' : 'simulated'} color={running ? O : '#8a8a8a'} body={(currentRun ? currentRun.key + ' · ' + currentRun.task : 'no run in this room') + '\n' + (currentGrant ? currentGrant.objectIds.length + ' explicit object grants' : 'no active grant') + '\n' + (agent?.model ?? 'no model') + ' · runtime not connected'}><CanvasButton onClick={() => currentRun ? props.onOpenRun(currentRun.key) : props.onOpenSettings()}>what it sees</CanvasButton><CanvasButton onClick={() => { void toggleAgentPaused(); }} disabled={!agent || pausePending}>{pausePending ? 'saving…' : agent?.paused ? 'resume' : 'pause'}</CanvasButton>{pauseError && <span role="alert" style={{ color: '#ff9670', fontSize: 10, overflowWrap: 'anywhere' }}>{pauseError}</span>}</CanvasCard></div>
                <div ref={setCardRef('gate')}><CanvasCard title="approval gate" badge={waiting ? '1 waiting' : 'clear'} color={waiting ? WAIT : '#5c5c5c'} body={waiting ? waiting.key + ' · ' + waiting.task + '\nsaw ' + waiting.saw.docHashes.length + ' pinned references · simulated send' : 'nothing waiting in this room\nno external action is connected'}><CanvasButton primary disabled={!waiting || approvalPending} onClick={() => { void approveWaitingRun(); }}>{approvalPending ? 'approving…' : 'approve'}</CanvasButton><CanvasButton disabled={!waiting} onClick={() => { if (waiting) props.onOpenRun(waiting.key); }}>preflight</CanvasButton>{approvalError && <span role="alert" style={{ color: '#ff9670', fontSize: 10, overflowWrap: 'anywhere' }}>{approvalError}</span>}</CanvasCard></div>
              </>}
              {props.layers.tools && <>
                <div ref={setCardRef('skills')}><CanvasCard title="skills · connectors" badge="scoped" body={(roomSkills.map((s) => s.key).join(' · ') || 'no scoped skills') + '\nno live connector health check\n▣ no runtime capability connected'}><CanvasButton onClick={props.onOpenSettings}>manage</CanvasButton></CanvasCard></div>
                <div ref={setCardRef('cartridges')}><CanvasCard title="cartridges" badge={mounted.length + ' mounted'} color="#c8b4a6" body={latestPack ? latestPack.name + ' v' + latestPack.version + '\n' + (latestPack.updatePending ? 'update v' + latestPack.updatePending + ' pending' : 'no update pending') + ' · ' + (latestPack.execConsented ? '▣ configured (simulated)' : '▣ declined') : 'no mounted cartridge in the prototype'}><CanvasButton onClick={props.onOpenLibrary}>{latestPack?.updatePending ? 'review v' + latestPack.updatePending : 'open library'}</CanvasButton><CanvasButton onClick={props.onOpenLibrary}>load</CanvasButton></CanvasCard></div>
              </>}
            </div>
          </section>
        )}

        {props.layers.audit && <button onClick={props.onOpenAudit} className="ark-room-audit-strip">audit trail · {audit.length} loaded events · inspect →</button>}
        {props.layers.graphFloor && <div className="ark-room-floor-note">graph floor is a visual grid only in v1 · vault graph stays locked</div>}
        <div className="ark-room-canvas-footnote">prototype projection · Hermes is not connected · hiding a layer never revokes access</div>
      </div>
    </div>
  );
}

function BandHeading({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5c5c5c', marginBottom: 10 }}>{children}</div>;
}

function CanvasCard({ title, badge, color = '#8a8a8a', number, body, dashed = false, children }: { title: string; badge: string; color?: string; number?: string; body: string; dashed?: boolean; children?: React.ReactNode }) {
  return <div className="ark-room-card" style={{ borderStyle: dashed ? 'dashed' : 'solid', opacity: dashed ? .8 : 1 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 5, height: 5, borderRadius: 999, background: color, flex: 'none' }} /><span style={{ fontFamily: mono, fontSize: 10, color: '#e8e8e8' }}>{title}</span><span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 8, color, textAlign: 'right' }}>{badge}</span></div>
    {number && <div style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-.02em' }}>{number}</div>}
    <div style={{ fontFamily: mono, fontSize: 9, color: '#8a8a8a', lineHeight: 1.65, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{body}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 'auto', paddingTop: 4 }}>{children}</div>
  </div>;
}

function CanvasButton({ children, onClick, primary = false, disabled = false }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding: '5px 8px', borderRadius: 5, border: 'none', background: primary && !disabled ? O : '#171717', fontFamily: mono, fontSize: 8.5, color: primary && !disabled ? '#0a0a0a' : '#c8c8c8', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .4 : 1 }}>{children}</button>;
}
