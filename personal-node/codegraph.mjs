import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

const runFile = promisify(execFile);
const MAX_BYTES = 1024 * 1024;
const MAX_NODES = 500;
const MAX_EDGES = 1500;
const MAX_REGISTRY_BYTES = 1024 * 1024;
const MAX_REGISTERED_REPOS = 1000;
const DEFAULT_CLI = '/opt/homebrew/bin/gitnexus';
const SELECTION = 'MATCH (n) WHERE label(n) IN ["File", "Folder", "Function", "Class", "Method", "Interface", "Module", "Struct"]';
// Fixed 100-row pages also avoid the installed CLI's one-write 64 KiB stdout limit.
// These queries are built from internal constants, never user data. Repository names
// are separate execFile arguments, not interpolated into query text.
const PAGE_SIZE = 100;
const NODES_QUERIES = Array.from({ length: 6 }, (_, page) => `${SELECTION} WITH n ORDER BY n.id SKIP ${page * PAGE_SIZE} LIMIT ${page === 5 ? 1 : PAGE_SIZE} OPTIONAL MATCH (n)-[:CodeRelation {type:"MEMBER_OF"}]->(c:Community) RETURN {id:n.id,label:n.name,type:label(n),filePath:n.filePath,community:c.id} AS row ORDER BY n.id`);
const EDGES_QUERIES = Array.from({ length: 16 }, (_, page) => `${SELECTION} WITH n ORDER BY n.id LIMIT 500 WITH collect(n.id) AS selected MATCH (a)-[r:CodeRelation]->(b) WHERE a.id IN selected AND b.id IN selected RETURN {source:a.id,target:b.id,type:r.type} AS row ORDER BY a.id,b.id,r.type SKIP ${page * PAGE_SIZE} LIMIT ${page === 15 ? 1 : PAGE_SIZE}`);
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const repositoryName = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value) && !value.includes('..');
const string = (value, length) => typeof value === 'string' && value.length > 0 && value.length <= length && !/[\x00-\x1f\x7f]/.test(value);
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, allowed) => plain(value) && Object.keys(value).every((key) => allowed.includes(key));
const filePath = (value) => string(value, 1024) && !/[\\%?#:]/.test(value) && value.split('/').every((part) =>
  part && part !== '.' && part !== '..' && !part.startsWith('.'));

/** Read only the trusted local registry, never source files or executable code.
 * Unlike `gitnexus list`, this does not prune or rewrite the registry. */
export async function listGitNexusRepositories() {
  const directory = process.env.GITNEXUS_HOME ?? path.join(os.homedir(), '.gitnexus');
  const invalid = () => fail('CODEGRAPH_REGISTRY', 'The local GitNexus registry could not be read. Check its configuration in GitNexus, then retry discovery; Arkive has not changed it.', 503);
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || /[\x00-\x1f\x7f]/.test(directory)) throw invalid();
  let file;
  let entries;
  try {
    file = await open(path.join(directory, 'registry.json'), constants.O_RDONLY | constants.O_NOFOLLOW | (constants.O_NONBLOCK ?? 0));
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_REGISTRY_BYTES) throw invalid();
    const buffer = Buffer.alloc(MAX_REGISTRY_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = await file.read(buffer, length, buffer.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > MAX_REGISTRY_BYTES) throw invalid();
    entries = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)));
    if (!Array.isArray(entries) || entries.length > MAX_REGISTERED_REPOS) throw invalid();
  } catch (error) {
    if (error.code === 'ENOENT' && !file) return { repositories: [], skipped: 0 };
    throw invalid();
  } finally { await file?.close(); }
  const counts = new Map();
  for (const entry of entries) if (plain(entry) && repositoryName(entry.name)) {
    const key = entry.name.toLowerCase(); counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repositories = [];
  let skipped = 0;
  for (const entry of entries) {
    // Case-insensitive alias collisions cannot safely be selected by the import API.
    if (!plain(entry) || !repositoryName(entry.name) || counts.get(entry.name.toLowerCase()) !== 1) { skipped++; continue; }
    const repository = { name: entry.name };
    if (string(entry.indexedAt, 64) && Number.isFinite(Date.parse(entry.indexedAt))) repository.indexedAt = entry.indexedAt;
    for (const key of ['nodes', 'edges', 'files']) {
      const count = plain(entry.stats) ? entry.stats[key] : undefined;
      if (Number.isSafeInteger(count) && count >= 0) repository[key] = count;
    }
    repositories.push(repository);
  }
  repositories.sort((a, b) => a.name.localeCompare(b.name));
  return { repositories, skipped };
}

/** Portable data only: no executable payloads, HTML, extra metadata, or dangling edges. */
export function validateCodeGraph(value) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch { throw fail('CODEGRAPH_INVALID', 'Code graph must be safe JSON'); }
  if (typeof encoded !== 'string' || Buffer.byteLength(encoded, 'utf8') > MAX_BYTES ||
    !keys(value, ['format', 'version', 'repository', 'nodes', 'edges', 'truncated']) ||
    value.format !== 'arkive-code-graph' || value.version !== 1 || !repositoryName(value.repository) ||
    typeof value.truncated !== 'boolean' || !Array.isArray(value.nodes) || value.nodes.length > MAX_NODES ||
    !Array.isArray(value.edges) || value.edges.length > MAX_EDGES) {
    throw fail('CODEGRAPH_INVALID', 'Expected an Arkive code graph with at most 500 nodes, 1500 edges, and 1 MiB of JSON');
  }
  const ids = new Set();
  const nodes = value.nodes.map((node) => {
    if (!keys(node, ['id', 'label', 'type', 'filePath', 'community']) || !string(node.id, 1024) ||
      !string(node.label, 512) || !string(node.type, 64) || ids.has(node.id) ||
      (Object.hasOwn(node, 'filePath') && !filePath(node.filePath)) ||
      (Object.hasOwn(node, 'community') && !string(node.community, 256))) {
      throw fail('CODEGRAPH_INVALID', 'Code graph contains invalid or duplicate nodes');
    }
    ids.add(node.id);
    return { id: node.id, label: node.label, type: node.type,
      ...(node.filePath === undefined ? {} : { filePath: node.filePath }),
      ...(node.community === undefined ? {} : { community: node.community }) };
  });
  const edgeIds = new Set();
  const edges = value.edges.map((edge) => {
    if (!keys(edge, ['source', 'target', 'type']) || !string(edge.source, 1024) || !string(edge.target, 1024) ||
      !string(edge.type, 64) || !ids.has(edge.source) || !ids.has(edge.target)) {
      throw fail('CODEGRAPH_INVALID', 'Code graph contains invalid or dangling edges');
    }
    const id = JSON.stringify([edge.source, edge.target, edge.type]);
    if (edgeIds.has(id)) throw fail('CODEGRAPH_INVALID', 'Code graph contains duplicate edges');
    edgeIds.add(id);
    return { source: edge.source, target: edge.target, type: edge.type };
  });
  return { format: 'arkive-code-graph', version: 1, repository: value.repository, nodes, edges, truncated: value.truncated };
}

function parseRows(output, limit) {
  const raw = typeof output === 'string' ? output : output?.stdout;
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 2 * MAX_BYTES) throw fail('CODEGRAPH_EXPORT', 'GitNexus returned an invalid or oversized result', 502);
  let result;
  try { result = JSON.parse(raw); } catch { throw fail('CODEGRAPH_EXPORT', 'GitNexus did not return JSON', 502); }
  if (plain(result) && Object.hasOwn(result, 'error')) {
    throw fail('CODEGRAPH_INDEX_UNAVAILABLE', 'GitNexus could not read this index. Choose a registered repository or re-index it in GitNexus, then retry. Arkive does not index repositories automatically.', 503);
  }
  if (Array.isArray(result) && result.length === 0) return [];
  if (!plain(result) || typeof result.markdown !== 'string' || !Number.isSafeInteger(result.row_count) ||
    result.row_count < 0 || result.row_count > limit) throw fail('CODEGRAPH_EXPORT', 'GitNexus returned an unsupported result', 502);
  const lines = result.markdown.split('\n');
  if (lines[0] !== '| row |' || lines[1] !== '| --- |' || lines.length !== result.row_count + 2) {
    throw fail('CODEGRAPH_EXPORT', 'GitNexus returned malformed graph rows', 502);
  }
  return lines.slice(2).map((line) => {
    if (!line.startsWith('| ') || !line.endsWith(' |')) throw fail('CODEGRAPH_EXPORT', 'GitNexus returned malformed graph rows', 502);
    try {
      const row = JSON.parse(line.slice(2, -2));
      if (!plain(row)) throw new Error();
      return row;
    } catch { throw fail('CODEGRAPH_EXPORT', 'GitNexus returned malformed graph rows', 502); }
  });
}

/** Read an already registered local index. No indexing, network, shell, or arbitrary query input. */
export async function exportGitNexus(repository, { run = runFile, signal } = {}) {
  if (!repositoryName(repository)) throw fail('CODEGRAPH_REPOSITORY', 'Choose an existing GitNexus repository slug');
  // Only trusted process configuration selects an executable; no HTTP/client path override.
  const executable = process.env.ARKIVE_GITNEXUS_PATH ?? DEFAULT_CLI;
  if (!path.isAbsolute(executable) || path.resolve(executable) !== executable || /[\x00-\x1f\x7f]/.test(executable)) {
    throw fail('CODEGRAPH_UNAVAILABLE', 'ARKIVE_GITNEXUS_PATH must be an absolute executable path', 503);
  }
  const checkCancelled = () => { if (signal?.aborted) throw fail('CODEGRAPH_CANCELLED', 'GitNexus export cancelled', 499); };
  checkCancelled();
  // Finder-launched desktop apps do not normally inherit Homebrew's PATH.
  // The node already running this service is the trusted runtime for CLI children.
  const env = { ...process.env, PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter) };
  const query = async (text, limit) => {
    checkCancelled();
    let output;
    try { output = await run(executable, ['cypher', '--repo', repository, text], { timeout: 15000, maxBuffer: 2 * MAX_BYTES, shell: false, windowsHide: true, signal, env }); }
    catch (error) {
      checkCancelled();
      if (['ENOENT', 'EACCES'].includes(error.code)) throw fail('CODEGRAPH_EXECUTABLE', 'The configured GitNexus executable is unavailable. Install GitNexus on this node or configure its trusted ARKIVE_GITNEXUS_PATH, then retry.', 503);
      if (error.killed || error.code === 'ETIMEDOUT') throw fail('CODEGRAPH_TIMEOUT', 'GitNexus did not answer in time. Wait for any indexing to finish, then retry the snapshot import.', 504);
      if (error.code === 127) throw fail('CODEGRAPH_RUNTIME', 'GitNexus could not start its runtime. Check the node installation and GitNexus configuration, then retry.', 503);
      throw fail('CODEGRAPH_UNAVAILABLE', 'GitNexus export is unavailable; ensure this repository already has a registered local index', 503);
    }
    checkCancelled();
    return parseRows(output, limit);
  };
  const readPages = async (queries) => {
    const values = [];
    for (let index = 0; index < queries.length; index++) {
      checkCancelled();
      const limit = index === queries.length - 1 ? 1 : PAGE_SIZE;
      const page = await query(queries[index], limit);
      values.push(...page);
      if (page.length < limit) break;
    }
    return values;
  };
  const rawNodes = await readPages(NODES_QUERIES);
  const rawEdges = await readPages(EDGES_QUERIES);
  const nodes = rawNodes.slice(0, MAX_NODES).map((node) => ({ id: node.id, label: node.label, type: node.type,
    ...(node.filePath == null || node.filePath === '' ? {} : { filePath: node.filePath }),
    ...(node.community == null || node.community === '' ? {} : { community: node.community }) }));
  const ids = new Set(nodes.map((node) => node.id));
  // Reject index changes between the two reads instead of attaching ungrounded edges.
  const edges = rawEdges.slice(0, MAX_EDGES);
  if (edges.some((edge) => !ids.has(edge.source) || !ids.has(edge.target))) throw fail('CODEGRAPH_EXPORT', 'GitNexus index changed during export; retry after indexing finishes', 409);
  return validateCodeGraph({ format: 'arkive-code-graph', version: 1, repository, nodes, edges,
    truncated: rawNodes.length > MAX_NODES || rawEdges.length > MAX_EDGES });
}
