const COUNTERS = ['scanned', 'eligible', 'imported', 'unchanged', 'skipped', 'bytes', 'batches'];
const PHASES = new Set(['scanning', 'completed', 'cancelled', 'failed']);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function initialFolderScan(scanId, folderId) {
  return { scanId, folderId, phase: 'scanning', startedAt: new Date().toISOString(),
    scanned: 0, eligible: 0, imported: 0, unchanged: 0, skipped: 0, bytes: 0, batches: 0, skippedByReason: {} };
}

/** Ignore another scan and late in-flight polling responses after a terminal result. */
export function mergeFolderScan(previous, incoming) {
  if (!incoming || incoming.scanId !== previous.scanId || incoming.folderId !== previous.folderId || !PHASES.has(incoming.phase)) return previous;
  if (previous.phase !== 'scanning' && incoming.phase === 'scanning') return previous;
  const next = { ...previous, ...incoming, startedAt: incoming.startedAt || previous.startedAt };
  for (const key of COUNTERS) next[key] = Math.max(count(previous[key]), count(incoming[key]));
  next.skippedByReason = { ...previous.skippedByReason };
  for (const [reason, value] of Object.entries(incoming.skippedByReason || {})) next.skippedByReason[reason] = Math.max(count(next.skippedByReason[reason]), count(value));
  return next;
}

export function folderScanSummary(scan) {
  const counts = `${scan.imported.toLocaleString()} imported or updated · ${scan.unchanged.toLocaleString()} unchanged · ${scan.skipped.toLocaleString()} skipped`;
  if (scan.phase === 'completed') return `${scan.complete === false ? 'Scan ended with a partial result' : 'Scan completed'}: ${counts}.`;
  if (scan.phase === 'cancelled') return `Scan cancelled — partial result: ${counts}. Completed batches are retained. Read updates again to retry.`;
  if (scan.phase === 'failed') return `Scan failed — partial result: ${counts}. Completed batches are retained. Resolve the error, then read updates again.`;
  return `Scanning: ${scan.scanned.toLocaleString()} entries checked · ${counts}.`;
}

export function transferLimitBytes(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 192 * 1024 * 1024;
}

/** One POST, bounded non-overlapping status reads, and exact-ID cancellation. No credentials or state persisted. */
export function createFolderScanMonitor({ client, scanId, folderId, isCurrent, onUpdate, intervalMs = 600 }) {
  const base = `/v1/folders/${encodeURIComponent(folderId)}`;
  const controller = new AbortController();
  let view = { scan: initialFolderScan(scanId, folderId), requestPending: true, cancelling: false, cancelRequested: false, statusError: '', requestError: '' };
  let disposed = false;
  let timer;
  let polling = false;
  const current = () => !disposed && isCurrent();
  const publish = patch => { if (!current()) return; view = { ...view, ...patch }; onUpdate(view); };
  const accept = scan => {
    if (!current()) return false;
    const merged = mergeFolderScan(view.scan, scan);
    if (merged === view.scan) return false;
    publish({ scan: merged, statusError: '' });
    return true;
  };
  const schedule = () => {
    clearTimeout(timer);
    if (current() && view.scan.phase === 'scanning') timer = setTimeout(() => void poll(), intervalMs);
  };
  const readStatus = async () => {
    const result = await client.request(`${base}/scan`, 'GET', undefined, controller.signal);
    if (current()) accept(result.scan);
    return result.scan;
  };
  const poll = async () => {
    if (!current() || polling) return;
    polling = true;
    try { await readStatus(); }
    catch (error) { publish({ statusError: `Progress could not be checked: ${error instanceof Error ? error.message : String(error)}. Last confirmed counts are retained.` }); }
    finally { polling = false; schedule(); }
  };
  publish({});
  schedule();
  const done = Promise.resolve().then(async () => {
    try {
      if (!current()) throw new Error('The scan session ended before the request started.');
      const result = await client.request(`${base}/refresh`, 'POST', { scanId }, controller.signal);
      if (current()) {
        if (result.scanId !== scanId || result.folderId !== folderId || !['completed', 'cancelled'].includes(result.phase)) throw new Error('The node returned an unmatched scan result. Check scan status before retrying.');
        accept(result);
        publish({ requestPending: false, requestError: '' });
      }
      return result;
    } catch (error) {
      if (current()) {
        // The POST may fail after durable batches committed, so recover the authoritative counters.
        try {
          const scan = await readStatus();
          if (!scan || scan.scanId !== scanId || scan.folderId !== folderId) publish({
            scan: { ...view.scan, phase: 'failed', error: 'The node could not confirm this scan. Last confirmed counts are retained; review them before retrying.' },
          });
        } catch (statusError) {
          publish({ statusError: `Final status could not be checked: ${statusError instanceof Error ? statusError.message : String(statusError)}. Last confirmed counts are retained.` });
        }
        publish({ requestPending: false, requestError: error instanceof Error ? error.message : String(error) });
      }
      throw error;
    } finally { schedule(); }
  });
  return {
    done,
    dispose() { disposed = true; clearTimeout(timer); controller.abort(); },
    async cancel() {
      if (!current() || view.cancelling || view.scan.phase !== 'scanning') return;
      publish({ cancelling: true });
      try {
        const result = await client.request(`${base}/scan/cancel`, 'POST', { scanId }, controller.signal);
        if (!current()) return;
        if (!result.scan || result.scan.scanId !== scanId || result.scan.folderId !== folderId) throw new Error('Cancellation was not confirmed for this scan.');
        accept(result.scan);
        publish({ cancelRequested: true });
      } catch (error) {
        publish({ statusError: `Cancellation could not be confirmed: ${error instanceof Error ? error.message : String(error)}. Check progress before retrying.` });
      } finally { publish({ cancelling: false }); schedule(); }
    },
  };
}
