import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createForceGraph, fitForceCamera, FORCE_GRAPH_DEFAULTS, forceTopologyKey, graphNodeRadius, normalizeForceSettings, packForcePositions, zoomForceCamera } from './forceGraphModel.mjs';
import type { ForceCamera, GraphForceSettings } from './forceGraphModel.mjs';
import type { GraphModel } from './graphModel.mjs';

export { FORCE_GRAPH_DEFAULTS };
export type { GraphForceSettings };
type Props = { model: GraphModel; selectedId: string | null; onSelect: (id: string) => void;
  visible?: boolean; settings?: Partial<GraphForceSettings>; colors?: Record<string, string>; appearance?: 'notes' | 'code' };
type PositionsMessage = { type: 'positions'; positions: Float32Array; generation: number; ticks: number; settled: boolean };
const EMPTY_COLORS: Record<string, string> = {};
const EMPTY_SETTINGS = {};
const short = (value: string, limit = 36) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;

/** Canvas2D draws every permitted node. Actual links drive a local worker simulation. */
export function ObsidianGraphCanvas({ model, selectedId, onSelect, visible = true, settings = EMPTY_SETTINGS, colors = EMPTY_COLORS, appearance = 'notes' }: Props) {
  const isCode = appearance === 'code';
  const noun = isCode ? 'symbol' : 'note';
  const background = isCode ? '#121411' : '#101010';
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const worker = useRef<Worker | null>(null);
  const raf = useRef<number | null>(null);
  const positions = useRef<Float32Array>(new Float32Array());
  const dimensions = useRef({ width: 720, height: 440, ratio: 1 });
  const measured = useRef(false);
  const camera = useRef<ForceCamera>({ x: 360, y: 220, scale: 1 });
  const needsFit = useRef(true);
  const topologyGeneration = useRef(0);
  const layoutTicks = useRef(0);
  const settled = useRef(false);
  const dragging = useRef<{ pointer: number; startX: number; startY: number; camera: ForceCamera; nodeIndex: number; moved: boolean; offsetX: number; offsetY: number } | null>(null);
  const hovered = useRef<string | null>(null);
  const highlight = useRef(new Set<string>());
  const [paused, setPaused] = useState(false);
  const [simulation, setSimulation] = useState<'running' | 'settled' | 'paused' | 'unavailable'>('running');
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerId, setPickerId] = useState('');
  const [zoomLabel, setZoomLabel] = useState(100);
  const helpId = useId();
  const nodePickerId = useId();
  const normalized = useMemo(() => normalizeForceSettings(settings), [settings.centerForce, settings.repelForce, settings.linkForce, settings.linkDistance, settings.nodeSize, settings.linkWidth, settings.labelThreshold]);
  const sortedNodes = useMemo(() => [...model.nodes].sort((a, b) => a.id.localeCompare(b.id)), [model.nodes]);
  const indexes = useMemo(() => new Map(sortedNodes.map((node, index) => [node.id, index])), [sortedNodes]);
  const edgeIndexes = useMemo(() => model.edges.flatMap(edge => {
    const source = indexes.get(edge.source); const target = indexes.get(edge.target);
    return source === undefined || target === undefined ? [] : [{ source, target, sourceOnly: edge.kinds.length === 1 && edge.kinds[0] === 'source' }];
  }), [model.edges, indexes]);
  const adjacency = useMemo(() => {
    const result = new Map<string, Set<string>>();
    for (const edge of model.edges) {
      if (!indexes.has(edge.source) || !indexes.has(edge.target)) continue;
      if (!result.has(edge.source)) result.set(edge.source, new Set());
      if (!result.has(edge.target)) result.set(edge.target, new Set());
      result.get(edge.source)!.add(edge.target); result.get(edge.target)!.add(edge.source);
    }
    return result;
  }, [model.edges, indexes]);
  const topology = useMemo(() => forceTopologyKey(model), [model]);
  const current = useRef({ sortedNodes, indexes, edgeIndexes, adjacency, selectedId, onSelect, visible, paused, normalized, colors, isCode });
  current.current = { sortedNodes, indexes, edgeIndexes, adjacency, selectedId, onSelect, visible, paused, normalized, colors, isCode };
  const drawRef = useRef<() => void>(() => {});

  function requestDraw() {
    if (!current.current.visible || raf.current !== null) return;
    raf.current = requestAnimationFrame(() => { raf.current = null; drawRef.current(); });
  }

  function updateCamera(next: ForceCamera) {
    camera.current = next; setZoomLabel(Math.round(next.scale * 100)); requestDraw();
  }

  function fit() {
    needsFit.current = false;
    updateCamera(fitForceCamera(positions.current, dimensions.current.width, dimensions.current.height));
  }

  function zoom(factor: number, x = dimensions.current.width / 2, y = dimensions.current.height / 2) {
    needsFit.current = false; updateCamera(zoomForceCamera(camera.current, factor, x, y));
  }

  drawRef.current = () => {
    const element = canvas.current; const wrapper = root.current;
    if (!element || !wrapper || !current.current.visible) return;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    const { width, height, ratio } = dimensions.current;
    const view = camera.current;
    const { sortedNodes: nodes, indexes: byId, edgeIndexes: edges, selectedId: selected, normalized: config, colors: palette, adjacency: neighbors, isCode: code } = current.current;
    const points = positions.current;
    const focus = hovered.current || selected;
    highlight.current = focus ? new Set([focus, ...(neighbors.get(focus) || [])]) : new Set();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = code ? '#121411' : '#101010'; ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = Math.max(.35, config.linkWidth * Math.sqrt(view.scale));
    ctx.strokeStyle = code ? '#a19bab' : '#9caa8c'; ctx.globalAlpha = focus ? .1 : .27;
    for (const sourceOnly of [false, true]) {
      ctx.setLineDash(sourceOnly ? [3, 4] : []); ctx.beginPath();
      for (const edge of edges) {
        if (edge.sourceOnly !== sourceOnly) continue;
        const from = edge.source * 2; const to = edge.target * 2;
        if (to + 1 >= points.length || from + 1 >= points.length) continue;
        const x1 = points[from] * view.scale + view.x; const y1 = points[from + 1] * view.scale + view.y;
        const x2 = points[to] * view.scale + view.x; const y2 = points[to + 1] * view.scale + view.y;
        if ((x1 < -20 && x2 < -20) || (x1 > width + 20 && x2 > width + 20) || (y1 < -20 && y2 < -20) || (y1 > height + 20 && y2 > height + 20)) continue;
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }
    if (focus) {
      const focusedIndex = byId.get(focus);
      if (focusedIndex !== undefined && focusedIndex * 2 + 1 < points.length) {
        ctx.globalAlpha = .9; ctx.strokeStyle = code ? '#b398d1' : '#c3b2e9'; ctx.lineWidth += .45;
        for (const sourceOnly of [false, true]) {
          ctx.setLineDash(sourceOnly ? [3, 4] : []); ctx.beginPath();
          for (const edge of edges) {
            if (edge.sourceOnly !== sourceOnly || (edge.source !== focusedIndex && edge.target !== focusedIndex)) continue;
            const index = edge.source === focusedIndex ? edge.target : edge.source;
            if (index * 2 + 1 >= points.length) continue;
            ctx.moveTo(points[focusedIndex * 2] * view.scale + view.x, points[focusedIndex * 2 + 1] * view.scale + view.y);
            ctx.lineTo(points[index * 2] * view.scale + view.x, points[index * 2 + 1] * view.scale + view.y);
          }
          ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    let labels = 0;
    for (let index = 0; index < nodes.length && index * 2 + 1 < points.length; index++) {
      const node = nodes[index];
      const x = points[index * 2] * view.scale + view.x; const y = points[index * 2 + 1] * view.scale + view.y;
      if (x < -60 || x > width + 60 || y < -30 || y > height + 30) continue;
      const nearby = !focus || highlight.current.has(node.id);
      const radius = Math.max(1.2, graphNodeRadius(node.degree, config.nodeSize) * Math.sqrt(view.scale));
      ctx.globalAlpha = nearby ? .93 : .18;
      ctx.fillStyle = palette[node.id] || (code ? '#b398d1' : node.degree ? '#9caa8c' : '#828279');
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      if (node.id === selected || node.id === hovered.current) {
        ctx.globalAlpha = 1; ctx.strokeStyle = code ? '#ded1ef' : '#d1c5ff'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(x, y, radius + 3, 0, Math.PI * 2); ctx.stroke();
      }
      const label = node.id === focus || node.id === selected || (labels < 350 && ((nearby && focus !== null) || view.scale >= config.labelThreshold));
      if (label) {
        ctx.globalAlpha = nearby ? 1 : .2; ctx.fillStyle = code ? '#d7d3ca' : '#deded7';
        ctx.fillText(short(node.title), x, y + radius + 6); labels++;
      }
    }
    ctx.globalAlpha = 1;
    wrapper.dataset.cameraScale = String(view.scale); wrapper.dataset.cameraX = String(view.x); wrapper.dataset.cameraY = String(view.y);
    wrapper.dataset.layoutTicks = String(layoutTicks.current); wrapper.dataset.layoutGeneration = String(topologyGeneration.current);
    wrapper.dataset.hoveredNodeId = hovered.current || '';
    wrapper.dataset.highlightedCount = String(highlight.current.size);
    const selectedIndex = selected ? byId.get(selected) : undefined;
    if (selectedIndex !== undefined && selectedIndex * 2 + 1 < points.length) {
      const x = points[selectedIndex * 2]; const y = points[selectedIndex * 2 + 1];
      wrapper.dataset.selectedNodeId = selected!; wrapper.dataset.selectedNodeX = String(x * view.scale + view.x); wrapper.dataset.selectedNodeY = String(y * view.scale + view.y);
      wrapper.dataset.selectedWorldX = String(x); wrapper.dataset.selectedWorldY = String(y);
    } else {
      for (const key of ['selectedNodeId', 'selectedNodeX', 'selectedNodeY', 'selectedWorldX', 'selectedWorldY']) delete wrapper.dataset[key];
    }
  };

  useEffect(() => {
    let instance: Worker;
    try { instance = new Worker(new URL('./forceGraphWorker.ts', import.meta.url), { type: 'module' }); }
    catch { setSimulation('unavailable'); return; }
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<PositionsMessage>) => {
      const result = event.data;
      if (result.type !== 'positions' || result.generation !== topologyGeneration.current) return;
      positions.current = result.positions; layoutTicks.current = result.ticks; settled.current = result.settled;
      if (needsFit.current && measured.current && result.positions.length) fit();
      setSimulation(!current.current.visible || current.current.paused ? 'paused' : result.settled ? 'settled' : 'running');
      requestDraw();
    };
    instance.onerror = () => { instance.terminate(); worker.current = null; setSimulation('unavailable'); };
    return () => { instance.terminate(); worker.current = null; if (raf.current !== null) cancelAnimationFrame(raf.current); raf.current = null; };
  }, []);

  useEffect(() => {
    topologyGeneration.current++; settled.current = model.nodes.length === 0; needsFit.current = true;
    const drag = dragging.current;
    dragging.current = null;
    if (drag && canvas.current?.hasPointerCapture(drag.pointer)) canvas.current.releasePointerCapture(drag.pointer);
    if (hovered.current && !indexes.has(hovered.current)) hovered.current = null;
    const orderedModel = { nodes: sortedNodes, edges: model.edges };
    // Give the first frame a deterministic layout while the worker starts, never cap nodes.
    if (!positions.current.length || positions.current.length !== sortedNodes.length * 2) positions.current = packForcePositions(createForceGraph(orderedModel));
    worker.current?.postMessage({ type: 'model', model: orderedModel, generation: topologyGeneration.current });
    requestDraw();
  }, [topology]);

  useEffect(() => {
    worker.current?.postMessage({ type: 'settings', settings: normalized });
  }, [normalized.centerForce, normalized.repelForce, normalized.linkForce, normalized.linkDistance]);

  useEffect(() => {
    const active = visible && !paused;
    worker.current?.postMessage({ type: 'active', active });
    if (!visible && raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; }
    if (worker.current) setSimulation(!active ? 'paused' : settled.current ? 'settled' : 'running');
    if (visible) requestDraw();
  }, [visible, paused]);

  useEffect(() => { requestDraw(); }, [sortedNodes, edgeIndexes, selectedId, colors, normalized, appearance]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const bounds = entries[0]?.contentRect;
      if (!bounds?.width || !bounds.height) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      measured.current = true;
      dimensions.current = { width: bounds.width, height: bounds.height, ratio };
      element.width = Math.round(bounds.width * ratio); element.height = Math.round(bounds.height * ratio);
      if (needsFit.current && positions.current.length) fit(); else requestDraw();
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if (!current.current.visible) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY * .0015), event.clientX - bounds.left, event.clientY - bounds.top);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel); };
  }, []);

  function localPoint(event: { clientX: number; clientY: number }) {
    const bounds = canvas.current?.getBoundingClientRect();
    return { x: event.clientX - (bounds?.left || 0), y: event.clientY - (bounds?.top || 0) };
  }

  function hitNode(x: number, y: number) {
    const view = camera.current; const nodes = current.current.sortedNodes;
    let closest = -1; let distance = Infinity;
    for (let index = 0; index < nodes.length && index * 2 + 1 < positions.current.length; index++) {
      const dx = positions.current[index * 2] * view.scale + view.x - x;
      const dy = positions.current[index * 2 + 1] * view.scale + view.y - y;
      const radius = Math.max(7, graphNodeRadius(nodes[index].degree, current.current.normalized.nodeSize) * Math.sqrt(view.scale) + 3);
      const next = dx * dx + dy * dy;
      if (next < radius * radius && next < distance) { closest = index; distance = next; }
    }
    return closest;
  }

  function beginPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || dragging.current) return;
    const point = localPoint(event); const index = hitNode(point.x, point.y); const view = camera.current;
    dragging.current = { pointer: event.pointerId, startX: point.x, startY: point.y, camera: { ...view }, nodeIndex: index, moved: false,
      offsetX: index >= 0 ? positions.current[index * 2] - (point.x - view.x) / view.scale : 0,
      offsetY: index >= 0 ? positions.current[index * 2 + 1] - (point.y - view.y) / view.scale : 0 };
    if (index >= 0) worker.current?.postMessage({ type: 'pin', id: sortedNodes[index].id, x: positions.current[index * 2], y: positions.current[index * 2 + 1] });
    canvas.current?.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = localPoint(event); const drag = dragging.current;
    if (!drag) {
      const index = hitNode(point.x, point.y); const id = index >= 0 ? sortedNodes[index].id : null;
      if (hovered.current !== id) { hovered.current = id; event.currentTarget.style.cursor = id ? 'pointer' : 'grab'; requestDraw(); }
      return;
    }
    if (event.pointerId !== drag.pointer) return;
    const dx = point.x - drag.startX; const dy = point.y - drag.startY;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    needsFit.current = false;
    if (drag.nodeIndex >= 0) {
      const x = (point.x - camera.current.x) / camera.current.scale + drag.offsetX;
      const y = (point.y - camera.current.y) / camera.current.scale + drag.offsetY;
      positions.current[drag.nodeIndex * 2] = x; positions.current[drag.nodeIndex * 2 + 1] = y;
      worker.current?.postMessage({ type: 'pin', id: sortedNodes[drag.nodeIndex].id, x, y });
    } else camera.current = { ...drag.camera, x: drag.camera.x + dx, y: drag.camera.y + dy };
    event.currentTarget.style.cursor = 'grabbing'; requestDraw();
  }

  function endPointer(event: ReactPointerEvent<HTMLCanvasElement>, cancelled = false) {
    const drag = dragging.current;
    if (!drag || event.pointerId !== drag.pointer) return;
    dragging.current = null;
    if (drag.nodeIndex >= 0) {
      const id = sortedNodes[drag.nodeIndex]?.id;
      if (id) { worker.current?.postMessage({ type: 'pin', id }); if (!drag.moved && !cancelled) onSelect(id); }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.style.cursor = 'grab'; requestDraw();
  }

  const matches = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    return sortedNodes.filter(node => !query || `${node.title} ${node.sourcePath || ''} ${node.id}`.toLowerCase().includes(query));
  }, [sortedNodes, pickerQuery]);
  const pickerNodes = matches.slice(0, 100);
  const matchesSelection = (id: string | null) => !!id && indexes.has(id) && (!pickerQuery.trim() || matches.some(node => node.id === id));
  const chosen = matchesSelection(pickerId) ? pickerId : matchesSelection(selectedId) ? selectedId! : pickerNodes[0]?.id || '';
  const chosenNode = chosen ? sortedNodes[indexes.get(chosen)!] : null;
  if (chosenNode && !pickerNodes.some(node => node.id === chosenNode.id)) pickerNodes.unshift(chosenNode);

  return <div ref={root} className="pn-obsidian-canvas" data-appearance={appearance} data-node-count={sortedNodes.length} data-edge-count={edgeIndexes.length} data-camera-scale="1" data-camera-x="0" data-camera-y="0" data-layout-generation="0" data-layout-ticks="0" data-simulation-state={simulation} style={{ position: 'relative', flex: 1, minHeight: 300, minWidth: 0, height: '100%', background, overflow: 'hidden' }}>
    <canvas ref={canvas} className="pn-obsidian-stage" role="img" aria-label={isCode ? 'Code symbols and relationships' : 'Note connections'} aria-describedby={helpId} tabIndex={0}
      style={{ display: 'block', width: '100%', height: '100%', minHeight: 300, touchAction: 'none', cursor: 'grab' }}
      onPointerDown={beginPointer} onPointerMove={movePointer} onPointerUp={event => endPointer(event)} onPointerCancel={event => endPointer(event, true)}
      onLostPointerCapture={event => endPointer(event, true)} onPointerLeave={() => { if (!dragging.current) { hovered.current = null; requestDraw(); } }}
      onKeyDown={event => {
        if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.25); }
        else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.25); }
        else if (event.key === '0') { event.preventDefault(); fit(); }
        else if (event.key.startsWith('Arrow')) {
          event.preventDefault(); needsFit.current = false; const distance = event.shiftKey ? 120 : 36;
          updateCamera({ ...camera.current, x: camera.current.x + (event.key === 'ArrowLeft' ? distance : event.key === 'ArrowRight' ? -distance : 0), y: camera.current.y + (event.key === 'ArrowUp' ? distance : event.key === 'ArrowDown' ? -distance : 0) });
        }
      }} />
    {!sortedNodes.length && <p className="pn-obsidian-canvas-empty" style={{ position: 'absolute', inset: '40% 20px auto', textAlign: 'center', color: isCode ? '#aaa69c' : '#aaa9a0' }}>No {noun}s match this graph view.</p>}
    <details className="pn-obsidian-note-picker" style={{ position: 'absolute', bottom: 12, left: 12, maxWidth: 'min(310px, 80%)' }}>
      <summary>Find a {noun} <span aria-hidden="true">⌕</span></summary>
      <label htmlFor={nodePickerId}>Find graph {noun}</label><input id={nodePickerId} type="search" value={pickerQuery} onChange={event => { setPickerQuery(event.target.value); setPickerId(''); }} placeholder="Title or path…" />
      <label>Graph {noun}<select aria-label={`Graph ${noun}`} value={chosen} onChange={event => setPickerId(event.target.value)} disabled={!pickerNodes.length}>{!pickerNodes.length && <option value="">No matching {noun}s</option>}{pickerNodes.map(node => <option key={node.id} value={node.id}>{node.title} · {node.degree} connections</option>)}</select></label>
      <button type="button" disabled={!chosen} onClick={() => chosen && onSelect(chosen)}>Open selected graph {noun}</button>
      <p className="pn-obsidian-picker-count">{matches.length > 100 ? `First 100 of ${matches.length} matches. Refine your search.` : `${matches.length} matching ${noun}s`}</p>
    </details>
    <div className="pn-obsidian-canvas-tools" aria-label="Graph controls" style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', gap: 4 }}>
      <button type="button" aria-label="Zoom out graph" title="Zoom out (−)" onClick={() => zoom(1 / 1.25)}>−</button>
      <button type="button" aria-label="Reset graph pan and zoom" title={`Fit all ${noun}s (0)`} onClick={fit}>{zoomLabel}%</button>
      <button type="button" aria-label="Zoom in graph" title="Zoom in (+)" onClick={() => zoom(1.25)}>+</button>
      <button type="button" aria-label={paused ? 'Resume graph layout' : 'Pause graph layout'} aria-pressed={paused} title={paused ? 'Resume physics' : 'Pause physics'} disabled={simulation === 'unavailable'} onClick={() => setPaused(value => !value)}>{paused ? '▷' : 'Ⅱ'}</button>
      <button type="button" aria-label="Restart graph layout" title="Restart physics" disabled={simulation === 'unavailable'} onClick={() => { settled.current = false; topologyGeneration.current++; setPaused(false); worker.current?.postMessage({ type: 'restart', generation: topologyGeneration.current }); setSimulation(visible ? 'running' : 'paused'); requestDraw(); }}>↻</button>
    </div>
    <p id={helpId} className="pn-sr">{sortedNodes.length} {noun}s and {edgeIndexes.length} links. Drag the background to pan, drag a {noun} to move it, click a {noun} to inspect it. Scroll to zoom at the pointer. Use plus or minus to zoom, arrow keys to pan, Shift for larger steps, and zero to fit all {noun}s. Find a {noun} provides keyboard access to every {noun}.</p>
    {simulation === 'unavailable' && <p className="pn-obsidian-canvas-status" role="status" style={{ position: 'absolute', top: 12, left: 12, color: isCode ? '#d7d3ca' : '#eeeeea', background: isCode ? '#1e211df0' : '#171715f0', padding: 8 }}>The local graph worker could not start. {isCode ? 'Symbols' : 'Notes'} remain selectable; reload to retry physics.</p>}
  </div>;
}
