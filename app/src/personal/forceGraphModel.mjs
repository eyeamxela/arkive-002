/** Local, deterministic note-graph physics. No inferred links or remote services. */
export const FORCE_GRAPH_DEFAULTS = Object.freeze({ centerForce: .12, repelForce: 1, linkForce: .35,
  linkDistance: 70, nodeSize: 1, linkWidth: 1, labelThreshold: 1.4 });
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function normalizeForceSettings(settings = {}) {
  const limits = { centerForce: [0, 2], repelForce: [0, 5], linkForce: [0, 2],
    linkDistance: [10, 300], nodeSize: [.25, 3], linkWidth: [.1, 4], labelThreshold: [.1, 6] };
  return Object.fromEntries(Object.entries(FORCE_GRAPH_DEFAULTS).map(([key, fallback]) => {
    const value = Number(settings[key] ?? fallback);
    return [key, Number.isFinite(value) ? clamp(value, ...limits[key]) : fallback];
  }));
}

/** Exact topology key: metadata-only refreshes and input reordering cannot restart physics. */
export function forceTopologyKey(model) {
  const ids = model.nodes.map(node => node.id).sort();
  const allowed = new Set(ids);
  const edges = model.edges.filter(edge => allowed.has(edge.source) && allowed.has(edge.target))
    .map(edge => [edge.source, edge.target].sort()).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return JSON.stringify([ids, edges]);
}

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

export function createForceGraph(model, previous = null) {
  const old = new Map(previous?.nodes.map(node => [node.id, node]) || []);
  const groups = Array.from(new Set(model.nodes.map(node => node.group || ''))).sort();
  const groupIndex = new Map(groups.map((group, index) => [group, index]));
  const groupCounts = new Map();
  const spread = Math.max(65, Math.sqrt(model.nodes.length) * 9);
  const nodes = model.nodes.map((source, index) => {
    const retained = old.get(source.id);
    if (retained) return { ...retained, degree: source.degree || 0, fx: undefined, fy: undefined };
    const group = source.group || '';
    const ordinal = groupCounts.get(group) || 0;
    groupCounts.set(group, ordinal + 1);
    const angle = ordinal * GOLDEN_ANGLE + hash(source.id) / 0xffffffff * .35;
    const radius = Math.sqrt(ordinal + 1) * 13;
    const clusterAngle = (groupIndex.get(group) || 0) * GOLDEN_ANGLE;
    const clusterRadius = groups.length > 1 ? spread * .55 : 0;
    return { id: source.id, degree: source.degree || 0,
      x: Math.cos(clusterAngle) * clusterRadius + Math.cos(angle) * radius,
      y: Math.sin(clusterAngle) * clusterRadius + Math.sin(angle) * radius,
      vx: 0, vy: 0, seed: hash(source.id) || index + 1 };
  });
  const indexes = new Map(nodes.map((node, index) => [node.id, index]));
  const edges = model.edges.flatMap(edge => {
    const source = indexes.get(edge.source); const target = indexes.get(edge.target);
    return source !== undefined && target !== undefined && source !== target ? [{ source, target }] : [];
  });
  return { nodes, edges, alpha: 1, ticks: previous?.ticks || 0, visits: 0, settled: nodes.length === 0 };
}

function quadrant(cell, x, y) { return (x >= cell.x + cell.size / 2 ? 1 : 0) + (y >= cell.y + cell.size / 2 ? 2 : 0); }
function branch(cell) {
  const half = cell.size / 2;
  cell.children = Array.from({ length: 4 }, (_, index) => ({ x: cell.x + (index % 2) * half,
    y: cell.y + Math.floor(index / 2) * half, size: half, mass: 0, cx: 0, cy: 0, points: [] }));
}
function insert(cell, node, depth = 0) {
  cell.mass++; cell.cx += node.x; cell.cy += node.y;
  if (cell.children) { insert(cell.children[quadrant(cell, node.x, node.y)], node, depth + 1); return; }
  if (cell.points.length < 4 || depth >= 20) { cell.points.push(node); return; }
  branch(cell);
  for (const point of cell.points) insert(cell.children[quadrant(cell, point.x, point.y)], point, depth + 1);
  cell.points = [];
  insert(cell.children[quadrant(cell, node.x, node.y)], node, depth + 1);
}
function centerOfMass(cell) {
  if (cell.mass) { cell.cx /= cell.mass; cell.cy /= cell.mass; }
  if (cell.children) for (const child of cell.children) centerOfMass(child);
}
function quadtree(nodes) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const node of nodes) { minX = Math.min(minX, node.x); minY = Math.min(minY, node.y); maxX = Math.max(maxX, node.x); maxY = Math.max(maxY, node.y); }
  const root = { x: minX - 1, y: minY - 1, size: Math.max(maxX - minX, maxY - minY, 1) + 2, mass: 0, cx: 0, cy: 0, points: [] };
  for (const node of nodes) insert(root, node);
  centerOfMass(root);
  return root;
}

function repel(node, tree, charge) {
  let visits = 0;
  const stack = [tree];
  while (stack.length) {
    const cell = stack.pop();
    if (!cell.mass) continue;
    visits++;
    if (!cell.children) {
      for (const other of cell.points) {
        if (other === node) continue;
        let dx = node.x - other.x; let dy = node.y - other.y;
        if (Math.abs(dx) + Math.abs(dy) < .001) { const angle = (node.seed ^ other.seed) * .00001; const sign = node.id < other.id ? 1 : -1; dx = Math.cos(angle) * .1 * sign; dy = Math.sin(angle) * .1 * sign; }
        const distance2 = Math.max(36, dx * dx + dy * dy);
        node.vx += dx * charge / distance2; node.vy += dy * charge / distance2;
      }
      continue;
    }
    const dx = node.x - cell.cx; const dy = node.y - cell.cy; const distance2 = dx * dx + dy * dy;
    const contains = node.x >= cell.x && node.x < cell.x + cell.size && node.y >= cell.y && node.y < cell.y + cell.size;
    if (!contains && cell.size * cell.size < .81 * distance2) {
      const force = charge * cell.mass / Math.max(36, distance2);
      node.vx += dx * force; node.vy += dy * force;
    } else stack.push(...cell.children);
  }
  return visits;
}

export function reheatForceGraph(state, alpha = .7) {
  state.alpha = Math.max(state.alpha, clamp(alpha, .005, 1)); state.settled = state.nodes.length === 0;
}

export function stepForceGraph(state, rawSettings = FORCE_GRAPH_DEFAULTS) {
  if (state.settled || !state.nodes.length) return false;
  const settings = normalizeForceSettings(rawSettings);
  const alpha = state.alpha;
  const tree = settings.repelForce > 0 ? quadtree(state.nodes) : null;
  let visits = 0;
  for (const node of state.nodes) {
    if (tree) visits += repel(node, tree, settings.repelForce * 1.8 * alpha);
    node.vx -= node.x * settings.centerForce * .007 * alpha;
    node.vy -= node.y * settings.centerForce * .007 * alpha;
  }
  for (const edge of state.edges) {
    const from = state.nodes[edge.source]; const to = state.nodes[edge.target];
    const dx = to.x - from.x; const dy = to.y - from.y;
    const distance = Math.max(.01, Math.hypot(dx, dy));
    const weight = settings.linkForce * .08 * alpha * (distance - settings.linkDistance) / distance;
    const balance = Math.max(1, Math.sqrt(Math.min(from.degree || 1, to.degree || 1)));
    const fx = dx * weight / balance; const fy = dy * weight / balance;
    from.vx += fx; from.vy += fy; to.vx -= fx; to.vy -= fy;
  }
  for (const node of state.nodes) {
    node.vx = clamp(node.vx * .72, -24, 24); node.vy = clamp(node.vy * .72, -24, 24);
    if (node.fx !== undefined && node.fy !== undefined) { node.x = node.fx; node.y = node.fy; node.vx = 0; node.vy = 0; }
    else { node.x += node.vx; node.y += node.vy; }
  }
  state.ticks++; state.visits = visits; state.alpha *= .972;
  if (state.alpha < .003) { state.settled = true; for (const node of state.nodes) { node.vx = 0; node.vy = 0; } }
  return !state.settled;
}

export function packForcePositions(state) {
  const positions = new Float32Array(state.nodes.length * 2);
  state.nodes.forEach((node, index) => { positions[index * 2] = node.x; positions[index * 2 + 1] = node.y; });
  return positions;
}

export function graphNodeRadius(degree, size = 1) { return (3 + Math.min(7, Math.sqrt(Math.max(0, degree)) * 1.2)) * size; }

export function fitForceCamera(positions, width, height, padding = 48) {
  if (!positions.length || width <= 0 || height <= 0) return { x: width / 2, y: height / 2, scale: 1 };
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (let index = 0; index < positions.length; index += 2) { minX = Math.min(minX, positions[index]); maxX = Math.max(maxX, positions[index]); minY = Math.min(minY, positions[index + 1]); maxY = Math.max(maxY, positions[index + 1]); }
  const scale = clamp(Math.min(Math.max(40, width - padding * 2) / Math.max(60, maxX - minX), Math.max(40, height - padding * 2) / Math.max(60, maxY - minY)), .03, 2);
  return { scale, x: width / 2 - (minX + maxX) / 2 * scale, y: height / 2 - (minY + maxY) / 2 * scale };
}

export function zoomForceCamera(camera, factor, x, y) {
  const scale = clamp(camera.scale * factor, .03, 8);
  return { scale, x: x - (x - camera.x) * scale / camera.scale, y: y - (y - camera.y) * scale / camera.scale };
}
