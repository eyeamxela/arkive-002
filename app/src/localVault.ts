// Originals stay in this browser/webview's IndexedDB. This is not cloud sync,
// filesystem watching, encryption, or permission enforcement. Export for backup.
import { assertStorageSession, originalsDatabaseName, type LocalStorageSession } from './localScope';
export type LocalOriginal = { hash: string; name: string; content: string; bytes: number; createdAt: number; kind: 'source' | 'note' | 'task' };
export type VaultBundle = { format: 'arkive-local-originals'; version: 1; originals: LocalOriginal[] };
export const MAX_ORIGINAL_BYTES = 1024 * 1024;
export const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;
const encoder = new TextEncoder();
const connections = new Map<string, Promise<IDBDatabase>>();
export async function hashContent(content: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(content));
  return 'sha256:' + [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function makeOriginal(name: string, content: string, kind: LocalOriginal['kind'] = 'source'): Promise<LocalOriginal> {
  if (!name || name.length > 240 || /[\x00-\x1f/\\]/.test(name)) throw new Error('Use a plain filename, not a path.');
  const bytes = encoder.encode(content).byteLength;
  if (!bytes || bytes > MAX_ORIGINAL_BYTES || content.includes('\0')) throw new Error('Choose non-empty UTF-8 text up to 1 MiB.');
  return { name, content, kind, bytes, hash: await hashContent(content), createdAt: Date.now() };
}
export async function decodeOriginal(file: File): Promise<LocalOriginal> {
  if (!/\.(md|txt)$/i.test(file.name) || file.size > MAX_ORIGINAL_BYTES) throw new Error('Choose a .md or .txt file up to 1 MiB.');
  // Preserve a UTF-8 BOM and CRLF verbatim so re-encoding keeps the original bytes.
  const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
  return makeOriginal(file.name, content);
}
export async function validateBundle(value: unknown): Promise<VaultBundle> {
  if (!value || typeof value !== 'object') throw new Error('Invalid originals archive.');
  const b = value as Partial<VaultBundle>;
  if (b.format !== 'arkive-local-originals' || b.version !== 1 || !Array.isArray(b.originals) || b.originals.length > 1000) throw new Error('Unsupported originals archive format.');
  const seen = new Set<string>(); const originals: LocalOriginal[] = []; let bytes = 0;
  for (const row of b.originals) {
    if (!row || typeof row.name !== 'string' || typeof row.content !== 'string' || !['source','note','task'].includes(row.kind) || !Number.isSafeInteger(row.createdAt) || row.createdAt < 0) throw new Error('Invalid source metadata.');
    const checked = await makeOriginal(row.name, row.content, row.kind);
    bytes += checked.bytes;
    if (bytes > MAX_BUNDLE_BYTES) throw new Error('Archive exceeds 20 MiB.');
    if (checked.hash !== row.hash || checked.bytes !== row.bytes || seen.has(row.hash)) throw new Error('Checksum mismatch or duplicate source. Nothing restored.');
    seen.add(row.hash); originals.push({ ...checked, createdAt: row.createdAt });
  }
  return { format: 'arkive-local-originals', version: 1, originals };
}
function database(session: LocalStorageSession) {
  assertStorageSession(session);
  const name = originalsDatabaseName(session.scope);
  let connection = connections.get(name);
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('originals', { keyPath: 'hash' });
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connections.delete(name); }; resolve(request.result); };
      request.onerror = () => { connections.delete(name); reject(request.error); };
      request.onblocked = () => { connections.delete(name); reject(new Error('Close other Arkive tabs, then retry storage.')); };
    });
    connections.set(name, connection);
  }
  return connection;
}
function watchTransaction(session: LocalStorageSession, tx: IDBTransaction): () => void {
  const abort = () => { try { tx.abort(); } catch { /* Already committed/aborted. */ } };
  session.onDeactivate.add(abort);
  return () => session.onDeactivate.delete(abort);
}
export async function listOriginals(session: LocalStorageSession): Promise<LocalOriginal[]> {
  const db = await database(session);
  assertStorageSession(session);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('originals', 'readonly'); const request = tx.objectStore('originals').getAll();
    const stop = watchTransaction(session, tx);
    tx.oncomplete = () => { stop(); if (!session.active) reject(new Error('Workspace session changed.')); else resolve((request.result as LocalOriginal[]).sort((a,b) => b.createdAt - a.createdAt)); };
    tx.onerror = () => { stop(); reject(tx.error); }; tx.onabort = () => { stop(); reject(tx.error ?? new Error('Read aborted.')); };
  });
}
export async function saveOriginals(originals: LocalOriginal[], session: LocalStorageSession) {
  assertStorageSession(session);
  // Validate every record before starting a single atomic, additive transaction.
  const bundle = await validateBundle({ format: 'arkive-local-originals', version: 1, originals });
  const db = await database(session);
  assertStorageSession(session);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('originals', 'readwrite'); const store = tx.objectStore('originals');
    const stop = watchTransaction(session, tx);
    for (const row of bundle.originals) {
      const request = store.get(row.hash);
      request.onsuccess = () => { if (!request.result) store.add(row); else if (request.result.content !== row.content) tx.abort(); };
    }
    tx.oncomplete = () => { stop(); resolve(); }; tx.onerror = () => { stop(); reject(tx.error); }; tx.onabort = () => { stop(); reject(tx.error ?? new Error('Restore aborted; originals unchanged.')); };
  });
  assertStorageSession(session);
  window.dispatchEvent(new CustomEvent('arkive-originals-changed', { detail: { scope: session.scope } }));
}
export async function exportOriginals(session: LocalStorageSession): Promise<string> {
  const bundle = await validateBundle({ format: 'arkive-local-originals', version: 1, originals: await listOriginals(session) });
  assertStorageSession(session);
  const serialized = JSON.stringify(bundle, null, 2);
  if (encoder.encode(serialized).byteLength > MAX_BUNDLE_BYTES) throw new Error('Archive exceeds the current 20 MiB export limit.');
  return serialized;
}
export async function restoreOriginals(file: File, session: LocalStorageSession) {
  assertStorageSession(session);
  if (file.size > MAX_BUNDLE_BYTES) throw new Error('Archive exceeds 20 MiB.');
  const bundle = await validateBundle(JSON.parse(await file.text()));
  await saveOriginals(bundle.originals, session);
  return bundle.originals.length;
}
