import test from 'node:test';
import assert from 'node:assert/strict';
import { initialFolderScan, mergeFolderScan, folderScanSummary, transferLimitBytes, createFolderScanMonitor } from '../../src/personal/folderScanModel.mjs';

const scan = (patch = {}) => ({ ...initialFolderScan('scan-one', 'folder-one'), ...patch });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function until(condition) {
  const deadline = Date.now() + 1500;
  while (!condition()) { if (Date.now() > deadline) throw new Error('Timed out waiting for synthetic scan state.'); await new Promise(resolve => setTimeout(resolve, 2)); }
}
function harness(t, { latest = scan(), isCurrent = () => true, intervalMs = 5 } = {}) {
  const post = deferred(); const updates = []; const calls = [];
  const state = { latest, cancel: scan({ phase: 'cancelled' }) };
  const client = { async request(path, method, body, signal) {
    calls.push({ path, method, body, signal });
    if (path.endsWith('/refresh')) return post.promise;
    const response = path.endsWith('/cancel') ? state.cancel : state.latest;
    if (response instanceof Error) throw response;
    return { scan: response };
  } };
  const monitor = createFolderScanMonitor({ client, scanId: 'scan-one', folderId: 'folder-one', isCurrent, onUpdate: view => updates.push(view), intervalMs });
  const outcome = monitor.done.catch(error => error);
  t.after(() => monitor.dispose());
  return { monitor, outcome, state, calls, updates, post, view: () => updates.at(-1) };
}

test('fresh scan has zero confirmed counters and an exact identity', () => {
  const value = scan(); assert.equal(value.phase, 'scanning'); assert.equal(value.imported, 0); assert.deepEqual(value.skippedByReason, {}); assert.ok(Date.parse(value.startedAt));
});
test('merge ignores previous scan IDs, other folders, and malformed phases', () => {
  const original = scan({ imported: 5 });
  for (const incoming of [null, { ...original, scanId: 'old' }, { ...original, folderId: 'other' }, { ...original, phase: 'done' }]) assert.equal(mergeFolderScan(original, incoming), original);
});
test('late counters cannot erase confirmed progress or terminal state', () => {
  const original = scan({ phase: 'completed', imported: 6, scanned: 12, skippedByReason: { hidden: 4 } });
  assert.equal(mergeFolderScan(original, scan({ imported: 99 })), original);
  const merged = mergeFolderScan(original, scan({ phase: 'completed', imported: 2, scanned: -1, skippedByReason: { hidden: 1, binary: 2 } }));
  assert.equal(merged.imported, 6); assert.equal(merged.scanned, 12); assert.deepEqual(merged.skippedByReason, { hidden: 4, binary: 2 });
});
test('summaries distinguish changed, unchanged, skips and partial outcomes', () => {
  const value = scan({ imported: 7, unchanged: 8, skipped: 9 });
  assert.match(folderScanSummary({ ...value, phase: 'completed' }), /7 imported or updated · 8 unchanged · 9 skipped/);
  assert.match(folderScanSummary({ ...value, phase: 'cancelled' }), /partial result.*Completed batches are retained.*retry/);
  assert.match(folderScanSummary({ ...value, phase: 'failed' }), /Scan failed.*Resolve the error/);
  assert.match(folderScanSummary({ ...value, phase: 'completed', complete: false }), /partial result/);
});
test('encrypted restore honors advertised transfer bytes with 192 MiB fallback', () => {
  for (const value of [undefined, null, NaN, Infinity, 0, -1, 1.5]) assert.equal(transferLimitBytes(value), 192 * 1024 * 1024);
  assert.equal(transferLimitBytes(210 * 1024 * 1024), 210 * 1024 * 1024);
});
test('one refresh POST carries scanId and accepts completed counters', async t => {
  const h = harness(t); h.post.resolve(scan({ phase: 'completed', complete: true, imported: 12, unchanged: 4 })); await h.outcome;
  assert.equal(h.calls.filter(call => call.path.endsWith('/refresh')).length, 1);
  assert.deepEqual(h.calls[0].body, { scanId: 'scan-one' });
  assert.equal(h.view().scan.imported, 12); assert.equal(h.view().requestPending, false);
});
test('polling ignores a previous scan then accepts the matching one', async t => {
  const h = harness(t, { latest: scan({ scanId: 'old', imported: 500 }) });
  await until(() => h.calls.length >= 2); assert.equal(h.view().scan.imported, 0);
  h.state.latest = scan({ imported: 15 }); await until(() => h.view().scan.imported === 15);
  h.post.resolve(scan({ phase: 'completed', imported: 15 })); await h.outcome;
});
test('poll failures preserve durable counts and recover without overlap', async t => {
  const h = harness(t, { latest: scan({ imported: 13, batches: 2 }) });
  await until(() => h.view().scan.imported === 13);
  h.state.latest = new Error('offline'); await until(() => h.view().statusError.includes('offline'));
  assert.equal(h.view().scan.batches, 2); assert.equal(h.view().scan.imported, 13);
  h.state.latest = scan({ imported: 14, batches: 3 }); await until(() => h.view().scan.imported === 14); assert.equal(h.view().statusError, '');
  h.post.resolve(scan({ phase: 'completed', imported: 14, batches: 3 })); await h.outcome;
});
test('POST error recovers failed scan counters through final status read', async t => {
  const h = harness(t, { latest: scan({ phase: 'failed', imported: 23, batches: 3, error: 'capacity reached' }), intervalMs: 600 });
  h.post.reject(new Error('capacity reached')); const error = await h.outcome;
  assert.match(error.message, /capacity/); assert.equal(h.view().scan.imported, 23); assert.equal(h.view().scan.phase, 'failed'); assert.equal(h.view().requestPending, false);
});
test('unmatched final status ends uncertain scan without copying another scan counts', async t => {
  const h = harness(t, { latest: scan({ imported: 6 }) }); await until(() => h.view().scan.imported === 6);
  h.state.latest = scan({ scanId: 'another', imported: 900 }); h.post.reject(new Error('lost response')); await h.outcome;
  assert.equal(h.view().scan.phase, 'failed'); assert.equal(h.view().scan.imported, 6); assert.match(h.view().scan.error, /could not confirm/);
  const calls = h.calls.length; await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(h.calls.length, calls);
});
test('final status outage keeps counts and explains uncertainty rather than completion', async t => {
  const h = harness(t, { latest: scan({ imported: 4 }) }); await until(() => h.view().scan.imported === 4);
  h.state.latest = new Error('offline'); h.post.reject(new Error('network dropped')); await h.outcome;
  assert.equal(h.view().scan.imported, 4); assert.equal(h.view().scan.phase, 'scanning'); assert.match(h.view().statusError, /Final status could not be checked/); assert.equal(h.view().requestPending, false);
});
test('cancel remains independent of long POST and uses exact scanId', async t => {
  const h = harness(t); await h.monitor.cancel();
  const call = h.calls.find(item => item.path.endsWith('/cancel')); assert.deepEqual(call.body, { scanId: 'scan-one' });
  assert.equal(h.view().scan.phase, 'cancelled'); assert.equal(h.view().requestPending, true);
  h.post.resolve(scan({ phase: 'cancelled', complete: false, imported: 8 })); await h.outcome; assert.equal(h.view().scan.imported, 8);
});
test('cancel failure does not claim cancellation or discard counters', async t => {
  const h = harness(t, { latest: scan({ imported: 3 }) }); await until(() => h.view().scan.imported === 3);
  h.state.cancel = new Error('request rejected'); await h.monitor.cancel();
  assert.equal(h.view().cancelRequested, false); assert.equal(h.view().scan.phase, 'scanning'); assert.equal(h.view().scan.imported, 3); assert.match(h.view().statusError, /Cancellation could not be confirmed/);
  h.post.resolve(scan({ phase: 'completed', imported: 3 })); await h.outcome;
});
test('dispose aborts outstanding requests and suppresses late results', async t => {
  const h = harness(t); await until(() => h.calls.length > 1);
  const updates = h.updates.length; h.monitor.dispose(); assert.ok(h.calls.every(call => call.signal.aborted));
  h.post.resolve(scan({ phase: 'completed', imported: 99 })); await h.outcome; await h.monitor.cancel(); assert.equal(h.updates.length, updates);
});
test('session invalidation suppresses new reads, cancellation and late failures', async t => {
  let current = true; const h = harness(t, { isCurrent: () => current }); await until(() => h.calls.length > 0);
  current = false; const updates = h.updates.length; const calls = h.calls.length;
  h.post.reject(new Error('old session failure')); await h.outcome; await h.monitor.cancel();
  assert.equal(h.calls.length, calls); assert.equal(h.updates.length, updates);
});
