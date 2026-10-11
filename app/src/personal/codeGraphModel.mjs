const MAX_JSON_BYTES = 1024 * 1024;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit && !/[\x00-\x1f\x7f]/.test(value);
const keys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));
const repositoryName = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value) && !value.includes('..');
const filePath = value => string(value, 1024) && !/[\\%?#:]/.test(value) && value.split('/').every(part =>
  part && part !== '.' && part !== '..' && !part.startsWith('.'));

/** Treat restored snapshot text as untrusted input, not a TypeScript assertion. */
export function parseCodeGraph(text) {
  if (typeof text !== 'string' || text.length > MAX_JSON_BYTES || new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) return null;
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (!record(value) || !keys(value, ['format', 'version', 'repository', 'nodes', 'edges', 'truncated']) ||
    value.format !== 'arkive-code-graph' || value.version !== 1 || !repositoryName(value.repository) ||
    typeof value.truncated !== 'boolean' || !Array.isArray(value.nodes) || value.nodes.length > 500 ||
    !Array.isArray(value.edges) || value.edges.length > 1500) return null;
  const ids = new Set();
  for (const node of value.nodes) {
    if (!record(node) || !keys(node, ['id', 'label', 'type', 'filePath', 'community']) ||
      !string(node.id, 1024) || !string(node.label, 512) || !string(node.type, 64) || ids.has(node.id) ||
      (node.filePath !== undefined && !filePath(node.filePath)) ||
      (node.community !== undefined && !string(node.community, 256))) return null;
    ids.add(node.id);
  }
  const edgeIds = new Set();
  for (const edge of value.edges) {
    if (!record(edge) || !keys(edge, ['source', 'target', 'type']) ||
      !string(edge.source, 1024) || !string(edge.target, 1024) || !string(edge.type, 64) ||
      !ids.has(edge.source) || !ids.has(edge.target)) return null;
    const id = JSON.stringify([edge.source, edge.target, edge.type]);
    if (edgeIds.has(id)) return null;
    edgeIds.add(id);
  }
  return value;
}
