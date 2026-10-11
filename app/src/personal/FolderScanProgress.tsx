import { folderScanSummary } from './folderScanModel.mjs';
import type { FolderScanView } from './folderScanModel.mjs';

export function FolderScanProgress({ view, folderPath, onCancel, onDismiss }: {
  view: FolderScanView; folderPath: string; onCancel: () => void; onDismiss: () => void;
}) {
  const { scan } = view;
  const scanning = scan.phase === 'scanning';
  const reasons = Object.entries(scan.skippedByReason).filter(([, count]) => count > 0);
  return <section className="pn-folder-scan" aria-label="Folder scan progress" data-scan-phase={scan.phase}>
    <div className="pn-folder-scan-heading"><strong>{scanning ? 'Reading folder updates' : scan.phase === 'completed' ? 'Folder scan complete' : scan.phase === 'cancelled' ? 'Folder scan cancelled' : 'Folder scan failed'}</strong>
      {scanning ? <button type="button" disabled={view.cancelling || view.cancelRequested} onClick={onCancel}>{view.cancelling ? 'Requesting cancellation…' : view.cancelRequested ? 'Cancellation requested' : 'Cancel scan'}</button> : !view.requestPending && <button type="button" aria-label="Dismiss folder scan result" onClick={onDismiss}>×</button>}
    </div>
    <p className="pn-folder-scan-path" title={folderPath}>{folderPath}</p>
    <p role="status" aria-live="polite" aria-atomic="true">{folderScanSummary(scan)}</p>
    {(view.requestError || view.statusError || scan.error) && <p className="pn-folder-scan-warning" role="alert">{view.requestError && `Request error: ${view.requestError}. `}{scan.error && scan.error !== view.requestError && `${scan.error}. `}{view.statusError}{scanning && !view.requestPending && ' The scan may still be running. Keep this view open to check progress, or cancel before retrying.'}</p>}
    <details><summary>Scan details · {scan.eligible.toLocaleString()} eligible · {scan.batches.toLocaleString()} saved batches</summary>
      <p>{scan.scanned.toLocaleString()} entries checked · {(scan.bytes / 1024 / 1024).toFixed(1)} MiB read. This scans supported Markdown and text files; it is not an import of every file format. Originals are not changed.</p>
      {scan.note && <p>{scan.note}</p>}
      {reasons.length > 0 && <ul>{reasons.map(([reason, count]) => <li key={reason}>{reason.replace(/_/g, ' ')}: {count.toLocaleString()}</li>)}</ul>}
      <p>Scan ID: <code>{scan.scanId}</code></p>
    </details>
  </section>;
}
