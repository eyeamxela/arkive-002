import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { BrainObject } from './api';
import { graphNeighbors, layoutGraph } from './graphModel.mjs';
import type { GraphModel } from './graphModel.mjs';
import { ObsidianWorkspace } from './ObsidianWorkspace';
import './BrainGraph.css';

const EMPTY_FOLDERS: Array<{ id: string; path: string }> = [];
const INITIAL_VIEW = { x: 0, y: 0, scale: 1 };
const truncate = (value: string, limit = 32) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;

type GraphCanvasProps = {
  model: GraphModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  mode?: 'obsidian' | 'structure';
  focusDepth?: number;
  showOrphans?: boolean;
  label?: string;
};

/** Shared renderer; callers supply actual note or code relationships. */
export function GraphCanvas({ model, selectedId, onSelect, mode = 'obsidian', focusDepth = 0,
  showOrphans = true, label = 'Note connections' }: GraphCanvasProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 720, height: 440 });
  const [view, setView] = useState(INITIAL_VIEW);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const drag = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number;
    scale: number; nodeId?: string; moved: boolean; captureElement: SVGElement } | null>(null);
  const suppressClick = useRef<string | null>(null);
  const scheduledFrame = useRef<number | null>(null);
  const pendingMove = useRef<(() => void) | null>(null);
  const helpId = useId();

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const bounds = entries[0]?.contentRect;
      if (bounds?.width && bounds.height) {
        const width = Math.max(240, Math.round(bounds.width));
        const height = Math.max(220, Math.round(bounds.height));
        setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => { if (scheduledFrame.current !== null) cancelAnimationFrame(scheduledFrame.current); }, []);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const x = (event.clientX - bounds.left) * size.width / (bounds.width || size.width);
      const y = (event.clientY - bounds.top) * size.height / (bounds.height || size.height);
      setView(previous => {
        const scale = Math.max(.3, Math.min(4, previous.scale * Math.exp(-event.deltaY * .0015)));
        return { scale, x: x - (x - previous.x) * scale / previous.scale,
          y: y - (y - previous.y) * scale / previous.scale };
      });
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [size]);
  const layoutSelection = focusDepth || model.nodes.length > 300 ? selectedId : null;
  const layout = useMemo(() => layoutGraph(model, {
    mode, selectedId: layoutSelection, focusDepth, showOrphans, ...size,
  }), [model, mode, layoutSelection, focusDepth, showOrphans, size]);
  useEffect(() => { setOffsets({}); }, [layout]);
  const highlightId = hoveredId || selectedId;
  const neighbors = useMemo(() => graphNeighbors(layout.edges, highlightId), [layout.edges, highlightId]);
  const points = useMemo(() => new Map(layout.nodes.map(node => {
    const offset = offsets[node.id];
    return [node.id, { ...node, x: node.x + (offset?.x || 0), y: node.y + (offset?.y || 0) }];
  })), [layout.nodes, offsets]);

  function zoom(factor: number, atX = size.width / 2, atY = size.height / 2) {
    setView(previous => {
      const scale = Math.max(.3, Math.min(4, previous.scale * factor));
      return { scale, x: atX - (atX - previous.x) * scale / previous.scale,
        y: atY - (atY - previous.y) * scale / previous.scale };
    });
  }

  function localPoint(event: { clientX: number; clientY: number }) {
    const bounds = svg.current?.getBoundingClientRect();
    return { x: (event.clientX - (bounds?.left || 0)) * size.width / (bounds?.width || size.width),
      y: (event.clientY - (bounds?.top || 0)) * size.height / (bounds?.height || size.height) };
  }

  function startDrag(event: ReactPointerEvent<SVGElement>, nodeId?: string) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const point = localPoint(event);
    const offset = nodeId ? offsets[nodeId] : null;
    drag.current = { pointerId: event.pointerId, startX: point.x, startY: point.y,
      x: nodeId ? offset?.x || 0 : view.x, y: nodeId ? offset?.y || 0 : view.y,
      scale: view.scale, nodeId, moved: false, captureElement: event.currentTarget };
    suppressClick.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const point = localPoint(event);
    const dx = point.x - current.startX; const dy = point.y - current.startY;
    if (Math.hypot(dx, dy) > 3) current.moved = true;
    if (!current.moved) return;
    pendingMove.current = () => {
      if (current.nodeId) {
        const id = current.nodeId;
        setOffsets(previous => ({ ...previous, [id]: {
          x: current.x + dx / current.scale, y: current.y + dy / current.scale,
        } }));
      } else setView({ x: current.x + dx, y: current.y + dy, scale: current.scale });
    };
    if (scheduledFrame.current === null) scheduledFrame.current = requestAnimationFrame(() => {
      pendingMove.current?.(); pendingMove.current = null; scheduledFrame.current = null;
    });
  }

  function endDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (current.moved && current.nodeId) suppressClick.current = current.nodeId;
    drag.current = null;
    if (current.captureElement.hasPointerCapture(event.pointerId)) current.captureElement.releasePointerCapture(event.pointerId);
  }

  function select(id: string) {
    if (suppressClick.current === id) { suppressClick.current = null; return; }
    onSelect(id);
  }

  return <div className="pn-notegraph-canvas-wrap">
    <div className="pn-notegraph-tools" aria-label="Graph controls">
      <span>{layout.nodes.length} nodes · {layout.edges.length} links</span>
      <div>
        <button type="button" aria-label="Zoom out graph" onClick={() => zoom(1 / 1.2)}>−</button>
        <button type="button" aria-label="Reset graph pan and zoom" onClick={() => { setView(INITIAL_VIEW); setOffsets({}); }}>{Math.round(view.scale * 100)}%</button>
        <button type="button" aria-label="Zoom in graph" onClick={() => zoom(1.2)}>+</button>
      </div>
    </div>
    <div className="pn-notegraph-viewport" ref={viewport}>
      <svg ref={svg} viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label={label}
        aria-describedby={helpId} tabIndex={0} onPointerDown={event => startDrag(event)}
        onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.2); }
          else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.2); }
          else if (event.key === '0') { event.preventDefault(); setView(INITIAL_VIEW); setOffsets({}); }
          else if (event.key.startsWith('Arrow')) {
            event.preventDefault();
            setView(previous => ({ ...previous,
              x: previous.x + (event.key === 'ArrowLeft' ? 36 : event.key === 'ArrowRight' ? -36 : 0),
              y: previous.y + (event.key === 'ArrowUp' ? 36 : event.key === 'ArrowDown' ? -36 : 0) }));
          }
        }}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {mode === 'structure' && layout.groups.length <= 25 ? <g aria-hidden="true" className="pn-notegraph-clusters">
            {layout.groups.map(group => <text key={group.name} x={group.x} y={Math.max(18, group.y - size.height / Math.max(3, Math.sqrt(layout.groups.length) * 2))}
              textAnchor="middle" fill={group.color}>{truncate(group.name, 26)}</text>)}
          </g> : null}
          <g aria-hidden="true" className="pn-notegraph-links">{layout.edges.map(edge => {
            const from = points.get(edge.source)!; const to = points.get(edge.target)!;
            const highlighted = edge.source === highlightId || edge.target === highlightId;
            return <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              className={highlighted ? 'is-highlighted' : highlightId ? 'is-muted' : ''}
              strokeDasharray={edge.kinds.length === 1 && edge.kinds[0] === 'source' ? '3 4' : undefined} />;
          })}</g>
          {layout.nodes.map(node => {
            const point = points.get(node.id)!;
            const selected = selectedId === node.id;
            const nearby = neighbors.has(node.id);
            const showLabel = layout.nodes.length <= 65 || view.scale >= 1.6 || nearby || hoveredId === node.id;
            return <g key={node.id} className={`pn-notegraph-point${selected ? ' is-selected' : ''}${highlightId && !nearby ? ' is-muted' : ''}`}
              transform={`translate(${point.x} ${point.y})`} role="button" tabIndex={0}
              aria-label={`${node.title}, ${node.kind}, ${node.degree} connections`} aria-pressed={selected}
              onPointerDown={event => startDrag(event, node.id)} onClick={() => select(node.id)}
              onMouseEnter={() => setHoveredId(node.id)} onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(node.id)} onBlur={() => setHoveredId(null)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onSelect(node.id); }
              }}>
              <title>{`${node.title}\n${node.sourcePath || node.group}\n${node.degree} connections${node.tags.length ? `\n#${node.tags.join(' #')}` : ''}`}</title>
              <circle className="pn-notegraph-hit" r={Math.max(13, node.radius + 6)} />
              <circle className="pn-notegraph-ring" r={node.radius + 4} />
              <circle className="pn-notegraph-dot" r={node.radius} fill={selected ? '#d3c4ff' : node.color} />
              <text y={node.radius + 16} textAnchor="middle" className={showLabel ? '' : 'is-hidden'}>{truncate(node.title)}</text>
            </g>;
          })}
        </g>
      </svg>
      {!layout.nodes.length ? <div className="pn-notegraph-empty">No nodes in this view. Show orphans or choose Global to widen it.</div> : null}
    </div>
    <div className="pn-notegraph-foot">
      <p id={helpId}>Drag to pan or move a node · scroll to zoom · Tab + Enter to inspect</p>
      {layout.omittedNodes > 0 ? <p className="pn-notegraph-limit" role="status">Showing 300 nodes at most; {layout.omittedNodes} more match. Search or select a note and use Local to narrow the graph.</p> : null}
      {model.omittedObjects || model.edgeLimitReached ? <p className="pn-notegraph-limit">Safety limit reached: graph scanning is limited to 10,000 objects and 20,000 relationships.</p> : null}
    </div>
  </div>;
}

export type BrainGraphProps = {
  objects: BrainObject[];
  folders?: Array<{ id: string; path: string }>;
  query?: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  mode?: 'obsidian' | 'structure';
  onSearchChange?: (query: string) => void;
  visible?: boolean;
};

export function BrainGraph({ objects, folders = EMPTY_FOLDERS, query = '', selectedId, onSelect, onSearchChange, visible = true }: BrainGraphProps) {
  return <ObsidianWorkspace objects={objects} folders={folders} query={query} selectedId={selectedId} onSelect={onSelect} onSearchChange={onSearchChange} visible={visible} />;
}

export default BrainGraph;
