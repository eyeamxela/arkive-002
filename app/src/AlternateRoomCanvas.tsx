import type { ReactNode } from 'react';
import { ChatPanel } from './ChatPanel';
import { InfiniteRoomCanvas } from './InfiniteRoomCanvas';
import { useRoomField } from './RoomSession';
import { useRoomCanvasModel, type RoomCanvasProps } from './RoomCanvasModel';
import './AlternateRoomCanvas.css';

type Mode = 'radial' | 'multi-room';
type Model = ReturnType<typeof useRoomCanvasModel>;
type CardKind = 'canon' | 'scope' | 'context' | 'boundary' | 'agent' | 'gate' | 'skills' | 'connectors' | 'cartridges' | 'audit' | 'graph';
type Tone = 'neutral' | 'orange' | 'amber' | 'taupe' | 'muted';
type Props = { mode: Mode; room: string; roomKeys: string[]; getRoomProps: (room: string) => RoomCanvasProps };
const WIDTH = 1120;

/** Alternative projections of the same room state, not additional graphs or authority. */
export function AlternateRoomCanvas({ mode, room, roomKeys, getRoomProps }: Props) {
  const [hidden, setHidden] = useRoomField<string[]>('@canvas-multi-room', 'hidden-rooms', []);
  const available = [...new Set([room, ...roomKeys])];
  const visible = available.filter(key => key === room || !hidden.includes(key));

  return <div className={'ark-alt-canvas ark-alt-canvas--' + mode}>
    {mode === 'multi-room' && <div className="ark-alt-room-picker" role="group" aria-label="rooms shown in multi-room canvas">
      <span>show rooms</span>
      {available.map(key => <button key={key} aria-pressed={visible.includes(key)} disabled={key === room}
        title={key === room ? 'The current room stays visible' : 'Show or hide ' + key}
        onClick={() => setHidden(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])}>
        <span aria-hidden="true">{visible.includes(key) ? '●' : '○'}</span> {key}{key === room ? ' · current' : ''}
      </button>)}
      <small>visibility only · scope unchanged</small>
    </div>}
    <InfiniteRoomCanvas key={mode === 'radial' ? 'radial:' + room : 'multi-room'}
      rooms={[mode === 'radial' ? room : 'multi-room-scene']} groupWidth={WIDTH} showGroupHandle={false}
      storageKey={mode === 'radial' ? 'radial:' + room : 'multi-room'}
      ariaLabel={mode === 'radial' ? 'infinite radial canvas' : 'infinite multi-room canvas'}
      renderRoom={() => mode === 'radial'
        ? <RadialScene {...getRoomProps(room)} />
        : <MultiRoomScene rooms={visible} currentRoom={room} getRoomProps={getRoomProps} />}
    />
  </div>;
}

function SceneTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="ark-alt-scene-title"><h2>{title}</h2><p>{subtitle}</p></header>;
}

function RadialScene(props: RoomCanvasProps) {
  const model = useRoomCanvasModel(props.room);
  const nodes: { kind: CardKind; x: number; y: number; w: number; h: number; visible: boolean }[] = [
    {kind:'canon',x:440,y:100,w:240,h:146,visible:props.layers.memory},
    {kind:'scope',x:220,y:622,w:240,h:150,visible:props.layers.memory},
    {kind:'context',x:758,y:610,w:244,h:156,visible:props.layers.memory},
    {kind:'boundary',x:450,y:784,w:230,h:134,visible:props.layers.memory},
    {kind:'agent',x:138,y:270,w:224,h:168,visible:props.layers.agents},
    {kind:'gate',x:770,y:290,w:230,h:168,visible:props.layers.agents},
    {kind:'skills',x:28,y:72,w:202,h:146,visible:props.layers.tools},
    {kind:'connectors',x:20,y:492,w:182,h:130,visible:props.layers.tools},
    {kind:'cartridges',x:910,y:44,w:196,h:184,visible:props.layers.tools},
    {kind:'audit',x:28,y:792,w:196,h:120,visible:props.layers.audit},
    {kind:'graph',x:910,y:808,w:196,h:112,visible:props.layers.graphFloor},
  ];
  return <section className={'ark-alt-scene ark-alt-radial' + (props.layers.graphFloor ? ' has-graph-floor' : '')} aria-label={'radial view of ' + props.room}>
    <SceneTitle title={props.room} subtitle="room at the center · memory, agents and tools in orbit" />
    <svg className="ark-alt-connections" viewBox="0 0 1120 950" aria-label="radial room connections">
      <g className="ark-alt-orbits">
        {props.layers.memory && <circle cx="560" cy="465" r="190" />}
        {props.layers.agents && <circle cx="560" cy="465" r="290" />}
        {props.layers.tools && <circle cx="560" cy="465" r="380" />}
      </g>
      {nodes.filter(node => node.visible).map(node => {
        const x = node.x + node.w / 2, y = node.y + node.h / 2;
        const state = connectionState(node.kind, model);
        return <path key={node.kind} d={`M 560 485 C 560 ${485 + (y - 485) * .6}, ${x} ${485 + (y - 485) * .4}, ${x} ${y}`}
          className={'ark-alt-line tone-' + state.tone + (state.running ? ' is-running' : '') + (node.kind === 'boundary' ? ' is-excluded' : '')}>
          <title>{state.label}</title>
        </path>;
      })}
    </svg>
    <div className="ark-alt-orbit-labels" aria-hidden="true">
      {props.layers.memory && <span style={{left:568,top:278}}>memory</span>}
      {props.layers.agents && <span style={{left:698,top:192}}>agents</span>}
      {props.layers.tools && <span style={{left:710,top:112}}>tools</span>}
    </div>
    {nodes.filter(node => node.visible).map(node => <div key={node.kind} className="ark-alt-node"
      style={{left:node.x,top:node.y,width:node.w,height:node.h}} data-radial-node={node.kind}>
      <ModelCard kind={node.kind} model={model} props={props} />
    </div>)}
    <div className="ark-alt-radial-chat ark-alt-live-chat ark-room-canvas-chat">
      <ChatPanel room={props.room} compact onExitCompact={props.onOpenChat} onOpenCapture={props.onOpenCapture} onOpenDoc={props.onOpenDoc} />
    </div>
    <p className="ark-alt-scene-note">read-only relationship projection · runtime simulated · hiding a layer never revokes access</p>
  </section>;
}

function MultiRoomScene({rooms,currentRoom,getRoomProps}:{rooms:string[];currentRoom:string;getRoomProps:(room:string)=>RoomCanvasProps}) {
  const layers = getRoomProps(currentRoom).layers;
  return <section className={'ark-alt-scene ark-alt-multi' + (layers.graphFloor ? ' has-graph-floor' : '')} aria-label="multi-room relationship view">
    <SceneTitle title="One workspace. Separate room contexts." subtitle="compare rooms side by side with their own scope, run and approval state" />
    <div className="ark-alt-zones" aria-hidden="true">
      {layers.memory && <div className="ark-alt-zone ark-alt-zone--memory"><span>memory · room-scoped</span></div>}
      <div className="ark-alt-zone ark-alt-zone--rooms"><span>rooms · live conversations</span></div>
      {(layers.agents || layers.tools) && <div className="ark-alt-zone ark-alt-zone--agents"><span>agents + tools · prototype</span></div>}
    </div>
    <div className="ark-alt-multi-rows">
      {rooms.map(room => <MultiRoomRow key={room} {...getRoomProps(room)} current={room === currentRoom} />)}
    </div>
    <p className="ark-alt-multi-note">Each row retains its own context. Lines visualize existing relationships; they do not share data or grant access between rooms.</p>
  </section>;
}

function MultiRoomRow(props:RoomCanvasProps & {current:boolean}) {
  const model = useRoomCanvasModel(props.room);
  const links: {kind:CardKind;from:[number,number];to:[number,number];visible:boolean}[] = [
    {kind:'canon',from:[282,55],to:[330,80],visible:props.layers.memory},
    {kind:'scope',from:[282,143],to:[330,150],visible:props.layers.memory},
    {kind:'context',from:[282,237],to:[330,222],visible:props.layers.memory},
    {kind:'agent',from:[750,80],to:[800,69],visible:props.layers.agents},
    {kind:'gate',from:[750,150],to:[800,175],visible:props.layers.agents},
    {kind:'skills',from:[750,222],to:[800,269],visible:props.layers.tools},
  ];
  return <section className="ark-alt-multi-row" aria-label={'multi-room row ' + props.room} data-multi-room={props.room}>
    <svg className="ark-alt-connections" viewBox="0 0 1120 310" aria-label={'connections for ' + props.room}>
      {links.filter(link=>link.visible).map(link=>{
        const state=connectionState(link.kind,model),mid=(link.from[0]+link.to[0])/2;
        return <path key={link.kind} d={`M ${link.from[0]} ${link.from[1]} C ${mid} ${link.from[1]}, ${mid} ${link.to[1]}, ${link.to[0]} ${link.to[1]}`}
          className={'ark-alt-line tone-'+state.tone+(state.running?' is-running':'')}><title>{state.label}</title></path>;
      })}
    </svg>
    {props.layers.memory && <div className="ark-alt-memory-column">
      <div className="ark-alt-multi-canon"><ModelCard kind="canon" model={model} props={props} compact /></div>
      <div className="ark-alt-multi-scope"><ModelCard kind="scope" model={model} props={props} compact /></div>
      <div className="ark-alt-multi-context"><ModelCard kind="context" model={model} props={props} compact /></div>
    </div>}
    <div className="ark-alt-room-column">
      <header className="ark-alt-row-heading"><span className={props.current ? 'is-current' : ''}>{props.room}</span><span>{props.current ? 'current room' : 'parallel room'}</span></header>
      <div className="ark-alt-multi-chat ark-alt-live-chat ark-room-canvas-chat">
        <ChatPanel room={props.room} compact onExitCompact={props.onOpenChat} onOpenCapture={props.onOpenCapture} onOpenDoc={props.onOpenDoc} />
      </div>
      {props.layers.audit && <button className="ark-alt-row-audit" onClick={props.onOpenAudit}>inspect audit trail →</button>}
    </div>
    {(props.layers.agents || props.layers.tools) && <div className="ark-alt-agent-column">
      {props.layers.agents && <>
        <div className="ark-alt-multi-agent"><ModelCard kind="agent" model={model} props={props} compact /></div>
        <div className="ark-alt-multi-gate"><ModelCard kind="gate" model={model} props={props} compact /></div>
      </>}
      {props.layers.tools && <div className="ark-alt-multi-tools"><ModelCard kind="skills" model={model} props={props} compact /></div>}
    </div>}
  </section>;
}

function connectionState(kind:CardKind,model:Model):{tone:Tone;running?:boolean;label:string} {
  if(kind==='scope') return {tone:model.runningReadsScope?'orange':'neutral',running:model.runningReadsScope,label:model.runningScopeNote};
  if(kind==='agent') return {tone:model.running?'orange':'neutral',running:!!model.running,label:model.running?'Simulated run in this room':'No live agent runtime connected'};
  if(kind==='gate') return {tone:model.waiting?'amber':'muted',label:model.waiting?'Room run is waiting for approval':'No room run waiting for approval'};
  if(kind==='context') return {tone:model.ctxOn.length?'taupe':'muted',label:'Enabled context summaries for this room'};
  if(kind==='boundary') return {tone:'muted',label:'Configured exclusions; endpoint authorization remains pending'};
  return {tone:kind==='canon'?'neutral':'muted',label:kind+' reference; visual connection only'};
}

function ModelCard({kind,model:m,props,compact=false}:{kind:CardKind;model:Model;props:RoomCanvasProps;compact?:boolean}) {
  const paths=(docs:{path?:string;title:string}[])=>docs.slice(0,compact?1:2).map(doc=>doc.path?.split('/').pop()??doc.title).join(' · ')||'none in this room';
  const openFirst=(docs:{path?:string}[])=>docs[0]?.path?props.onOpenDoc(docs[0].path):props.onOpenVault();
  switch(kind) {
    case 'canon': return <Card title="canon" badge="always loaded" tone="orange" number={m.canon.length} compact={compact}>
      <p>{paths(m.canon)}</p><Actions><Action onClick={()=>openFirst(m.canon)}>open in vault</Action></Actions>
    </Card>;
    case 'scope': return <Card title="effective scope" badge={m.workspace?.context.scopeLabel??'resolving'} number={m.scopedDocs.length} compact={compact}>
      <p>{m.scopedTierCounts.map(([tier,count])=>tier+' '+count).join(' · ')||'no mapped objects'}</p>
      {!compact && <p>{paths(m.scopedDocs)}</p>}
      <p className="ark-alt-subtle">manifest {m.manifest?.key??'none'}</p>
      <Actions><Action onClick={props.onOpenGraph}>inspect graph</Action><Action onClick={props.onOpenVault}>vault</Action></Actions>
    </Card>;
    case 'context': return <Card title="context summary" badge={m.ctxOn.length?m.ctxOn.map(c=>c.version).join('+')+' · on':'off'} tone="taupe" number={m.ctxOn.reduce((sum,c)=>sum+c.tokens,0).toFixed(1)+'k'} compact={compact}>
      {!compact && <p>{m.context.length} stored versions · summarization simulated</p>}
      <Actions><Action onClick={()=>{m.setContextOpen(true);props.onOpenContext();}}>summary / versions</Action></Actions>
    </Card>;
    case 'boundary': return <Card title="policy boundary" badge={m.policy?.inbox==='exclude'?'exclusion configured':'setup pending'} tone="muted" dashed>
      <p>{m.denied} recorded refusals in loaded audit</p><p>Endpoint authorization not enforced; exposure unverified.</p>
      <Actions><Action onClick={props.onOpenSettings}>inspect policy</Action></Actions>
    </Card>;
    case 'agent': return <Card title={m.agent?.name??m.agentKey} badge={m.agent?.paused?'paused · simulated':'simulated'} tone={m.running?'orange':'neutral'} compact={compact}>
      <p>{m.currentRun?m.currentRun.key+' · '+m.currentRun.task:'no run in this room'}</p>
      {!compact && <p>{m.currentGrant?m.currentGrant.objectIds.length+' explicit object grants':'no active grant'}</p>}
      <p className="ark-alt-subtle">{m.agent?.model??'no model'} · runtime not connected</p>
      <Actions><Action onClick={()=>m.currentRun?props.onOpenRun(m.currentRun.key):props.onOpenSettings()}>what it sees</Action><Action disabled={!m.agent||m.pausePending} onClick={()=>{void m.toggleAgentPaused();}}>{m.pausePending?'saving…':m.agent?.paused?'resume':'pause'}</Action></Actions>
      {m.pauseError&&<p role="alert" className="ark-alt-error">{m.pauseError}</p>}
    </Card>;
    case 'gate': return <Card title="approval gate" badge={m.waiting?'1 waiting':'clear'} tone={m.waiting?'amber':'muted'} compact={compact}>
      <p>{m.waiting?m.waiting.key+' · '+m.waiting.task:'nothing waiting in this room'}</p>
      <p className="ark-alt-subtle">{m.waiting?m.waiting.saw.docHashes.length+' pinned references · simulated send':'no external action connected'}</p>
      <Actions><Action primary disabled={!m.waiting||m.approvalPending} onClick={()=>{void m.approveWaitingRun();}}>{m.approvalPending?'approving…':'approve'}</Action><Action disabled={!m.waiting} onClick={()=>{if(m.waiting)props.onOpenRun(m.waiting.key);}}>preflight</Action></Actions>
      {m.approvalError&&<p role="alert" className="ark-alt-error">{m.approvalError}</p>}
    </Card>;
    case 'skills': return <Card title="skills" badge="scoped configuration" compact={compact}>
      <p>{m.roomSkills.map(skill=>skill.key).join(' · ')||'no scoped skills'}</p>
      {!compact && <p className="ark-alt-subtle">Available configuration, not verified execution capabilities.</p>}
      <Actions><Action onClick={props.onOpenSettings}>manage</Action>{compact&&<Action onClick={props.onOpenLibrary}>{m.mounted.length} mounted packs</Action>}</Actions>
    </Card>;
    case 'connectors': return <Card title="connectors" badge="not connected" tone="muted"><p>No live connector health check or runtime capability connected.</p><Actions><Action onClick={props.onOpenSettings}>configure</Action></Actions></Card>;
    case 'cartridges': return <Card title="cartridges" badge={m.mounted.length+' mounted'} tone="taupe">
      <p>{m.latestPack?m.latestPack.name+' v'+m.latestPack.version:'no mounted cartridge'}</p>
      {m.latestPack&&<p>{m.latestPack.updatePending?'update v'+m.latestPack.updatePending+' pending':'no update pending'} · {m.latestPack.execConsented?'execution configured (simulated)':'execution declined'}</p>}
      <Actions><Action onClick={props.onOpenLibrary}>{m.latestPack?.updatePending?'review update':'open library'}</Action></Actions>
    </Card>;
    case 'audit': return <Card title="audit trail" badge="recorded events" tone="muted"><p>Inspect the evidence behind changes and approvals.</p><Actions><Action onClick={props.onOpenAudit}>open audit</Action></Actions></Card>;
    case 'graph': return <Card title="graph floor" badge="visual only" tone="muted"><p>Canvas lines do not edit Brain relationships.</p><Actions><Action onClick={props.onOpenGraph}>inspect graph</Action></Actions></Card>;
  }
}

function Card({title,badge,tone='neutral',number,compact=false,dashed=false,children}:{title:string;badge:string;tone?:Tone;number?:number|string;compact?:boolean;dashed?:boolean;children:ReactNode}) {
  return <article className={'ark-room-card ark-alt-card tone-'+tone+(compact?' is-compact':'')+(dashed?' is-dashed':'')}>
    <header><i aria-hidden="true"/><h3>{title}</h3><span>{badge}</span></header>
    {number!==undefined&&<div className="ark-alt-card-number">{number}</div>}
    {children}
  </article>;
}
function Actions({children}:{children:ReactNode}) {return <div className="ark-alt-card-actions">{children}</div>;}
function Action({children,onClick,primary=false,disabled=false}:{children:ReactNode;onClick:()=>void;primary?:boolean;disabled?:boolean}) {
  return <button className={'ark-alt-card-action'+(primary?' is-primary':'')} onClick={onClick} disabled={disabled}>{children}</button>;
}
