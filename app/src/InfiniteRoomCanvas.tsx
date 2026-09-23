import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useRoomField } from './RoomSession';
import { fitCamera, moveWorldPoint, panCamera, zoomCameraAt, type Bounds, type Camera, type Point } from './infiniteCanvasMath';

type ViewState = { camera: Camera | null; positions: Record<string, Point> };
type Gesture = { id: number; start: Point; camera: Camera; room?: string; position?: Point };
const INITIAL: ViewState = {camera:null, positions:{}};
const ROOM_WIDTH = 600;
const editable = (target: EventTarget | null) => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable="true"]');
const control = (target: EventTarget | null) => target instanceof Element && !!target.closest('button,a,input,textarea,select,[contenteditable="true"],[data-chat-scroll],.ark-room-card,[data-canvas-toolbar]');

/** A camera over an unbounded coordinate plane; room groups are ordinary live UI. */
export function InfiniteRoomCanvas({rooms, renderRoom, storageKey='infinite-view', groupWidth=ROOM_WIDTH, showGroupHandle=true, ariaLabel='infinite room canvas'}:{rooms:string[]; renderRoom:(room:string)=>ReactNode; storageKey?:string; groupWidth?:number; showGroupHandle?:boolean; ariaLabel?:string}) {
  const [saved, save] = useRoomField<ViewState>('@canvas-workspace',storageKey,INITIAL);
  const [camera, setCamera] = useState<Camera>(saved.camera ?? {x:0,y:0,zoom:1});
  const [positions, setPositions] = useState(saved.positions);
  const [hand, setHand] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [space, setSpace] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const groups = useRef<Record<string,HTMLDivElement|null>>({});
  const gesture = useRef<Gesture|null>(null);
  const size = useRef({width:1,height:1});
  const initialized = useRef(!!saved.camera);
  const wheelTimer = useRef<ReturnType<typeof setTimeout>>();
  const current = useRef({camera,positions,save,rooms,hand,space,groupWidth});
  current.current = {camera,positions,save,rooms,hand,space,groupWidth};
  const roomSignature = JSON.stringify(rooms);

  const positionFor = (room:string, index:number):Point => current.current.positions[room] ?? {x:index*(current.current.groupWidth+48),y:0};
  const bounds = ():Bounds => {
    const rects = current.current.rooms.map((room,index)=>({...positionFor(room,index),width:current.current.groupWidth,height:groups.current[room]?.offsetHeight ?? 840}));
    if (!rects.length) return {x:0,y:0,width:current.current.groupWidth,height:840};
    const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));
    return {x,y,width:Math.max(...rects.map(r=>r.x+r.width))-x,height:Math.max(...rects.map(r=>r.y+r.height))-y};
  };
  const commit = () => current.current.save({camera:current.current.camera,positions:current.current.positions});
  const changeCamera = (next:Camera) => { current.current.camera=next; setCamera(next); };
  const changePositions = (next:Record<string,Point>) => {current.current.positions=next;setPositions(next);};
  const fit = () => { changeCamera(fitCamera(bounds(),size.current,34)); commit(); };
  const zoom = (factor:number) => {const c=current.current.camera;changeCamera(zoomCameraAt(c,{x:size.current.width/2,y:size.current.height/2},c.zoom*factor));commit();};

  // Camera and group positions are UX preferences only; persist between tab switches,
  // not into the Brain or grants. Panning doesn't trigger provider-wide updates per frame.
  useLayoutEffect(()=>{
    const element=viewport.current;if(!element)return;
    const observer=new ResizeObserver(()=>{
      size.current={width:element.clientWidth,height:element.clientHeight};
      if(!initialized.current && element.clientWidth>0 && element.clientHeight>0){initialized.current=true;fit();}
    });
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    // Persist default world positions so room-order changes never swap their places.
    const next={...current.current.positions};let changed=false;
    for(const room of rooms) if(!next[room]) {
      const used=Object.values(next);next[room]={x:used.length?Math.max(...used.map(p=>p.x))+current.current.groupWidth+48:0,y:0};changed=true;
    }
    if(changed){changePositions(next);commit();}
  },[roomSignature]);

  useEffect(()=>{
    const element=viewport.current;if(!element)return;
    const wheel=(event:WheelEvent)=>{
      if(event.target instanceof Element && event.target.closest('[data-canvas-toolbar]'))return;
      if(!event.ctrlKey && !event.metaKey && control(event.target))return;
      event.preventDefault();
      const unit=event.deltaMode===1?16:event.deltaMode===2?element.clientHeight:1;
      const c=current.current.camera;
      if(event.ctrlKey||event.metaKey){
        const rect=element.getBoundingClientRect();
        changeCamera(zoomCameraAt(c,{x:event.clientX-rect.left,y:event.clientY-rect.top},c.zoom*Math.exp(-event.deltaY*unit*0.006)));
      } else {
        const dx=event.shiftKey && !event.deltaX?event.deltaY:event.deltaX;
        const dy=event.shiftKey && !event.deltaX?0:event.deltaY;
        changeCamera(panCamera(c,{x:-dx*unit,y:-dy*unit}));
      }
      clearTimeout(wheelTimer.current);wheelTimer.current=setTimeout(commit,160);
    };
    const keyDown=(event:KeyboardEvent)=>{
      if(!element.contains(document.activeElement)||editable(event.target))return;
      // Preserve native Space activation on buttons and other interactive content.
      if(event.code==='Space' && !control(event.target)){event.preventDefault();setSpace(true);current.current.space=true;}
      if(event.target!==element)return;
      const arrows:Record<string,Point>={ArrowLeft:{x:64,y:0},ArrowRight:{x:-64,y:0},ArrowUp:{x:0,y:64},ArrowDown:{x:0,y:-64}};
      if(arrows[event.key]){event.preventDefault();changeCamera(panCamera(current.current.camera,arrows[event.key]));commit();}
      if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.2);}
      if(event.key==='-'){event.preventDefault();zoom(1/1.2);}
      if(event.key==='0'){event.preventDefault();fit();}
    };
    const clear=()=>{setSpace(false);current.current.space=false;gesture.current=null;setDragging(false);commit();};
    const keyUp=(event:KeyboardEvent)=>{if(event.code==='Space'){setSpace(false);current.current.space=false;}};
    element.addEventListener('wheel',wheel,{passive:false});window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);window.addEventListener('blur',clear);
    return ()=>{clearTimeout(wheelTimer.current);commit();element.removeEventListener('wheel',wheel);window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',clear);};
  },[]);

  const start=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(gesture.current || ![0,1].includes(event.button) || editable(event.target))return;
    const target=event.target instanceof Element?event.target:null;
    if(target?.closest('[data-canvas-toolbar]'))return;
    const handle=target?.closest<HTMLElement>('[data-room-handle]');
    const pan=event.button===1 || current.current.space || current.current.hand;
    if(!pan && !handle && control(event.target))return;
    if(!pan && !handle && target?.closest('.ark-room-canvas-chat'))return;
    event.preventDefault();
    const room=!pan?handle?.dataset.roomHandle:undefined;
    gesture.current={id:event.pointerId,start:{x:event.clientX,y:event.clientY},camera:current.current.camera,...(room?{room,position:positionFor(room,rooms.indexOf(room))}:{})};
    event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.focus({preventScroll:true});setDragging(true);
  };
  const move=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;
    const delta={x:event.clientX-g.start.x,y:event.clientY-g.start.y};
    if(g.room && g.position)changePositions({...current.current.positions,[g.room]:moveWorldPoint(g.position,delta,g.camera.zoom)});
    else changeCamera(panCamera(g.camera,delta));
  };
  const end=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(gesture.current?.id!==event.pointerId)return;
    gesture.current=null;setDragging(false);commit();
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const children=useMemo(()=>rooms.map(room=>({room,content:renderRoom(room)})),[roomSignature,renderRoom]);

  return <div ref={viewport} className={'ark-infinite-canvas'+(dragging?' is-dragging':'')+(hand||space?' is-hand':'')} role="region" aria-label={ariaLabel} aria-describedby="infinite-canvas-help" tabIndex={0}
    data-camera-x={camera.x.toFixed(2)} data-camera-y={camera.y.toFixed(2)} data-camera-zoom={camera.zoom.toFixed(4)}
    onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onAuxClick={event=>{if(event.button===1)event.preventDefault();}}
    style={{backgroundSize:`${24*camera.zoom}px ${24*camera.zoom}px`,backgroundPosition:`${camera.x}px ${camera.y}px`}}>
    <div className="ark-infinite-world" style={{transform:`translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`}}>
      {children.map(({room,content},index)=>{
        const point=positions[room]??{x:index*(groupWidth+48),y:0};
        return <div key={room} ref={element=>{groups.current[room]=element;}} className="ark-infinite-group" data-canvas-room={room} style={{left:point.x,top:point.y,width:groupWidth}}>
          {showGroupHandle && <button className="ark-room-group-handle" data-room-handle={room} aria-label={'move room '+room} title="Drag this room group · arrow keys move it" onKeyDown={event=>{
            const dirs:Record<string,Point>={ArrowLeft:{x:-24,y:0},ArrowRight:{x:24,y:0},ArrowUp:{x:0,y:-24},ArrowDown:{x:0,y:24}};const delta=dirs[event.key];if(!delta)return;
            event.preventDefault();event.stopPropagation();const p=positionFor(room,index);changePositions({...current.current.positions,[room]:{x:p.x+delta.x,y:p.y+delta.y}});commit();
          }}><span aria-hidden="true">⠿</span> {room}<span>room group · drag to move</span></button>}
          {content}
        </div>;
      })}
    </div>
    <div className="ark-infinite-toolbar" data-canvas-toolbar="true" role="toolbar" aria-label="canvas navigation">
      <button aria-label="pan tool" aria-pressed={hand} onClick={()=>setHand(value=>!value)}>hand</button>
      <button aria-label="zoom out canvas" onClick={()=>zoom(1/1.2)}>−</button>
      <button aria-label="reset canvas zoom to 100 percent" onClick={()=>{const c=current.current.camera;changeCamera(zoomCameraAt(c,{x:size.current.width/2,y:size.current.height/2},1));commit();}}>{Math.round(camera.zoom*100)}%</button>
      <button aria-label="zoom in canvas" onClick={()=>zoom(1.2)}>+</button>
      <button onClick={fit}>fit view</button>
    </div>
    <div id="infinite-canvas-help" className="ark-infinite-help">infinite canvas · drag background / space + drag · scroll to pan · ctrl/⌘ + scroll to zoom</div>
  </div>;
}
