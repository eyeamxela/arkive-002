import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react';
import { fitCamera, moveWorldPoint, panCamera, zoomCameraAt } from '../infiniteCanvasMath';
import type { Bounds, Camera, Point } from '../infiniteCanvasMath';
import './SpatialCanvas.css';

export type SpatialCanvasState = { camera: Camera | null; positions: Record<string, Point> };
export type SpatialCanvasItem = { id: string; title: string; content: ReactNode;
  width?: number; height?: number; initialPosition?: Point };
export type SpatialCanvasProps = { items: SpatialCanvasItem[]; state?: SpatialCanvasState;
  onChange?: (state: SpatialCanvasState) => void; ariaLabel?: string; showHandles?: boolean };
const EMPTY_STATE: SpatialCanvasState = { camera: null, positions: {} };
const DEFAULT_CAMERA = { x: 30, y: 30, zoom: 1 };
const interactive = (target: EventTarget | null) => target instanceof Element && !!target.closest(
  'button,a,input,textarea,select,summary,[contenteditable="true"],[data-chat-scroll],[data-spatial-content]');

/** This canvas has no persistence adapter: all camera/position data is session memory. */
export function SpatialCanvas({ items, state = EMPTY_STATE, onChange, ariaLabel = 'Infinite canvas', showHandles = true }: SpatialCanvasProps) {
  const [camera, setCamera] = useState<Camera>(state.camera || DEFAULT_CAMERA);
  const [positions, setPositions] = useState(state.positions);
  const [hand, setHand] = useState(false);
  const [space, setSpace] = useState(false);
  const [dragging, setDragging] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const itemElements = useRef<Record<string, HTMLDivElement | null>>({});
  const size = useRef({ width: 800, height: 650 });
  const initialized = useRef(Boolean(state.camera));
  const lastEmitted = useRef<SpatialCanvasState | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const gesture = useRef<{ id: number; start: Point; camera: Camera; itemId?: string; position?: Point } | null>(null);
  const current = useRef({ camera, positions, items, onChange, hand, space });
  current.current = { camera, positions, items, onChange, hand, space };
  const helpId = useId();

  function positionFor(item: SpatialCanvasItem, index: number): Point {
    return current.current.positions[item.id] || item.initialPosition || { x: index * 548, y: 0 };
  }
  function bounds(): Bounds {
    const rectangles = current.current.items.map((item, index) => ({ ...positionFor(item, index),
      width: item.width || 500, height: item.height || itemElements.current[item.id]?.offsetHeight || 620 }));
    if (!rectangles.length) return { x: 0, y: 0, width: 500, height: 620 };
    const x = Math.min(...rectangles.map(rect => rect.x)); const y = Math.min(...rectangles.map(rect => rect.y));
    return { x, y, width: Math.max(...rectangles.map(rect => rect.x + rect.width)) - x,
      height: Math.max(...rectangles.map(rect => rect.y + rect.height)) - y };
  }
  function updateCamera(next: Camera) { current.current.camera = next; setCamera(next); }
  function updatePositions(next: Record<string, Point>) { current.current.positions = next; setPositions(next); }
  function commit() {
    const next = { camera: current.current.camera, positions: current.current.positions };
    lastEmitted.current = next; current.current.onChange?.(next);
  }
  function fit() {
    // Keep fitted cards above the navigation/help overlay, including their composers.
    const usableSize = { width: size.current.width, height: Math.max(1, size.current.height - 92) };
    updateCamera(fitCamera(bounds(), usableSize, 32)); commit();
  }
  function zoom(factor: number) {
    const previous = current.current.camera;
    updateCamera(zoomCameraAt(previous, { x: size.current.width / 2, y: size.current.height / 2 }, previous.zoom * factor));
    commit();
  }
  function flushMove() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null; pending.current?.(); pending.current = null;
  }

  useEffect(() => {
    if (state === lastEmitted.current || state === EMPTY_STATE) return;
    if (state.camera) { updateCamera(state.camera); initialized.current = true; }
    updatePositions(state.positions);
  }, [state]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (!element.clientWidth || !element.clientHeight) return;
      size.current = { width: element.clientWidth, height: element.clientHeight };
      if (!initialized.current) { initialized.current = true; fit(); }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const signature = JSON.stringify(items.map(item => [item.id, item.initialPosition]));
  useEffect(() => {
    const next = { ...current.current.positions };
    let changed = false;
    current.current.items.forEach((item, index) => {
      if (!next[item.id]) { next[item.id] = item.initialPosition || { x: index * 548, y: 0 }; changed = true; }
    });
    if (changed) { updatePositions(next); commit(); }
  }, [signature]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-spatial-toolbar]')) return;
      if (!event.ctrlKey && !event.metaKey && interactive(event.target)) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const previous = current.current.camera;
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        updateCamera(zoomCameraAt(previous, { x: event.clientX - rect.left, y: event.clientY - rect.top },
          previous.zoom * Math.exp(-event.deltaY * unit * .005)));
      } else {
        const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
        const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
        updateCamera(panCamera(previous, { x: -dx * unit, y: -dy * unit }));
      }
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(commit, 150);
    };
    const releaseSpace = (event: KeyboardEvent) => {
      if (event.code === 'Space') { current.current.space = false; setSpace(false); }
    };
    const blur = () => { current.current.space = false; setSpace(false); gesture.current = null; setDragging(false); flushMove(); commit(); };
    element.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keyup', releaseSpace); window.addEventListener('blur', blur);
    return () => {
      flushMove(); commit();
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      element.removeEventListener('wheel', wheel); window.removeEventListener('keyup', releaseSpace); window.removeEventListener('blur', blur);
    };
  }, []);

  function start(event: ReactPointerEvent<HTMLDivElement>) {
    if (gesture.current || ![0, 1].includes(event.button)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-spatial-toolbar],input,textarea,select,[contenteditable="true"]')) return;
    const handle = target?.closest<HTMLElement>('[data-spatial-handle]');
    const isPan = event.button === 1 || current.current.hand || current.current.space;
    if (!isPan && !handle && interactive(event.target)) return;
    if (!handle && !isPan && target?.closest('[data-spatial-item]')) return;
    event.preventDefault();
    const itemId = !isPan ? handle?.dataset.spatialHandle : undefined;
    const index = current.current.items.findIndex(item => item.id === itemId);
    gesture.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, camera: current.current.camera,
      ...(itemId && index >= 0 ? { itemId, position: positionFor(current.current.items[index], index) } : {}) };
    event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true }); setDragging(true);
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    const delta = { x: event.clientX - active.start.x, y: event.clientY - active.start.y };
    pending.current = () => {
      if (active.itemId && active.position) updatePositions({ ...current.current.positions,
        [active.itemId]: moveWorldPoint(active.position, delta, active.camera.zoom) });
      else updateCamera(panCamera(active.camera, delta));
    };
    if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; pending.current?.(); pending.current = null; });
  }
  function end(event: ReactPointerEvent<HTMLDivElement>) {
    if (gesture.current?.id !== event.pointerId) return;
    flushMove(); gesture.current = null; setDragging(false); commit();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <div ref={viewport} className={`pn-spatial-canvas${dragging ? ' is-dragging' : ''}${hand || space ? ' is-hand' : ''}`}
    role="region" aria-label={ariaLabel} aria-describedby={helpId} tabIndex={0}
    data-camera-x={camera.x.toFixed(2)} data-camera-y={camera.y.toFixed(2)} data-camera-zoom={camera.zoom.toFixed(4)}
    onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
    onAuxClick={event => { if (event.button === 1) event.preventDefault(); }}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      if (event.code === 'Space') { event.preventDefault(); setSpace(true); current.current.space = true; }
      const direction: Record<string, Point> = { ArrowLeft: { x: 64, y: 0 }, ArrowRight: { x: -64, y: 0 }, ArrowUp: { x: 0, y: 64 }, ArrowDown: { x: 0, y: -64 } };
      if (direction[event.key]) { event.preventDefault(); updateCamera(panCamera(current.current.camera, direction[event.key])); commit(); }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.2); }
      if (event.key === '-') { event.preventDefault(); zoom(1 / 1.2); }
      if (event.key === '0') { event.preventDefault(); fit(); }
    }}
    style={{ backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`, backgroundPosition: `${camera.x}px ${camera.y}px` }}>
    <div className="pn-spatial-world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
      {items.map((item, index) => {
        const point = positions[item.id] || item.initialPosition || { x: index * 548, y: 0 };
        return <div key={item.id} ref={element => { itemElements.current[item.id] = element; }} className="pn-spatial-item"
          data-spatial-item={item.id} style={{ left: point.x, top: point.y, width: item.width || 500, ...(item.height ? { height: item.height } : {}) }}>
          {showHandles ? <button type="button" className="pn-spatial-handle" data-spatial-handle={item.id}
            aria-label={`Move ${item.title}`} title="Drag to move · arrow keys move this card" onKeyDown={event => {
              const steps: Record<string, Point> = { ArrowLeft: { x: -24, y: 0 }, ArrowRight: { x: 24, y: 0 }, ArrowUp: { x: 0, y: -24 }, ArrowDown: { x: 0, y: 24 } };
              const delta = steps[event.key]; if (!delta) return;
              event.preventDefault(); event.stopPropagation(); const previous = positionFor(item, index);
              updatePositions({ ...current.current.positions, [item.id]: { x: previous.x + delta.x, y: previous.y + delta.y } }); commit();
            }}><span aria-hidden="true">⠿</span><strong>{item.title}</strong><small>drag to move</small></button> : null}
          <div className="pn-spatial-content" data-spatial-content>{item.content}</div>
        </div>;
      })}
    </div>
    <div className="pn-spatial-toolbar" data-spatial-toolbar role="toolbar" aria-label="Canvas navigation">
      <button type="button" aria-pressed={hand} aria-label="Pan canvas tool" onClick={() => setHand(value => !value)}>Hand</button>
      <button type="button" aria-label="Zoom out canvas" onClick={() => zoom(1 / 1.2)}>−</button>
      <button type="button" aria-label="Reset canvas zoom to 100 percent" onClick={() => {
        updateCamera(zoomCameraAt(current.current.camera, { x: size.current.width / 2, y: size.current.height / 2 }, 1)); commit();
      }}>{Math.round(camera.zoom * 100)}%</button>
      <button type="button" aria-label="Zoom in canvas" onClick={() => zoom(1.2)}>+</button>
      <button type="button" onClick={fit}>Fit view</button>
    </div>
    <p className="pn-spatial-help" id={helpId}>Drag background to pan · Ctrl/⌘ + scroll to zoom · arrow keys move focused cards</p>
  </div>;
}

export default SpatialCanvas;
