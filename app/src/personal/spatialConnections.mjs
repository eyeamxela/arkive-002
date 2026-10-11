const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const STATES = new Set(['neutral', 'active', 'waiting', 'failed', 'complete']);
export const MAX_SPATIAL_CONNECTIONS = 200;

/** Presentation-only geometry. Missing endpoints never become invented cards. */
export function spatialConnections(rectangles, edges) {
  const byId = new Map(rectangles.map(rect => [rect.id, {
    ...rect, x: finite(rect.x), y: finite(rect.y),
    width: Math.max(1, finite(rect.width, 500)), height: Math.max(1, finite(rect.height, 500)),
  }]));
  const seen = new Set();
  return edges.slice(0, MAX_SPATIAL_CONNECTIONS).flatMap((edge, index) => {
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target || source.id === target.id) return [];
    const id = edge.id || `${edge.source}:${edge.target}:${index}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const horizontal = Math.abs(targetCenter.x - sourceCenter.x) > Math.abs(targetCenter.y - sourceCenter.y);
    const forward = horizontal ? targetCenter.x >= sourceCenter.x : targetCenter.y >= sourceCenter.y;
    const from = horizontal ? { x: source.x + (forward ? source.width : 0), y: sourceCenter.y }
      : { x: sourceCenter.x, y: source.y + (forward ? source.height : 0) };
    const to = horizontal ? { x: target.x + (forward ? 0 : target.width), y: targetCenter.y }
      : { x: targetCenter.x, y: target.y + (forward ? 0 : target.height) };
    const x = (from.x + to.x) / 2, y = (from.y + to.y) / 2;
    const path = horizontal ? `M ${from.x} ${from.y} C ${x} ${from.y}, ${x} ${to.y}, ${to.x} ${to.y}`
      : `M ${from.x} ${from.y} C ${from.x} ${y}, ${to.x} ${y}, ${to.x} ${to.y}`;
    return [{ ...edge, id, status: STATES.has(edge.status) ? edge.status : 'neutral', x, y, path }];
  });
}
