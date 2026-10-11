import { createForceGraph, normalizeForceSettings, packForcePositions, reheatForceGraph, stepForceGraph } from './forceGraphModel.mjs';
import type { ForceState, GraphForceSettings } from './forceGraphModel.mjs';
import type { GraphModel } from './graphModel.mjs';

type Message = { type: 'model'; model: Pick<GraphModel, 'nodes' | 'edges'>; generation: number }
  | { type: 'settings'; settings: GraphForceSettings }
  | { type: 'active'; active: boolean }
  | { type: 'restart'; generation: number }
  | { type: 'pin'; id: string; x?: number; y?: number };
const scope = self as unknown as { onmessage: ((event: MessageEvent<Message>) => void) | null; postMessage: (message: unknown, transfer?: Transferable[]) => void };
let state: ForceState | null = null;
let settings = normalizeForceSettings();
let active = true;
let generation = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function publish() {
  if (!state) return;
  const positions = packForcePositions(state);
  scope.postMessage({ type: 'positions', positions, generation, ticks: state.ticks, settled: state.settled }, [positions.buffer]);
}
function schedule() {
  if (timer !== null || !active || !state || state.settled) return;
  timer = setTimeout(() => {
    timer = null;
    if (!active || !state) return;
    stepForceGraph(state, settings);
    publish(); schedule();
  }, 24);
}
scope.onmessage = event => {
  const message = event.data;
  if (message.type === 'model') { state = createForceGraph(message.model, state); generation = message.generation; publish(); }
  else if (message.type === 'settings') { settings = normalizeForceSettings(message.settings); if (state) reheatForceGraph(state); }
  else if (message.type === 'active') {
    active = message.active;
    if (!active && timer !== null) { clearTimeout(timer); timer = null; }
  } else if (message.type === 'restart' && state) { generation = message.generation; reheatForceGraph(state, 1); publish(); }
  else if (message.type === 'pin' && state) {
    const node = state.nodes.find(item => item.id === message.id);
    if (node) {
      node.fx = message.x; node.fy = message.y;
      if (message.x !== undefined && message.y !== undefined) { node.x = message.x; node.y = message.y; node.vx = 0; node.vy = 0; }
      reheatForceGraph(state, .35); publish();
    }
  }
  schedule();
};
