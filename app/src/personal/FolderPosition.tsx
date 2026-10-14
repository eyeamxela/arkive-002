import type { WorkspacePanelsProps } from './WorkspacePanels';
import { moveFolderOrder } from './folderOrder.mjs';

export function FolderPosition({ id, title, keys, saved, scope, busy, run }: { id: string; title: string; keys: string[]; saved?: string[]; scope: 'sections' | 'statuses'; busy: boolean; run: WorkspacePanelsProps['act'] }) {
  return <select className="pn-folder-position" aria-label={`Position for ${title}`} title="Change folder position (not task count)" value={keys.indexOf(id) + 1} disabled={busy} onChange={event => {
    const order = moveFolderOrder(keys, saved, id, Number(event.target.value));
    void run('Saving folder order', client => client.request('/v1/workspace/folder-order', 'POST', { scope, order, expectedOrder: saved ?? [] }), 'Folder order saved. Tasks and their status are unchanged.');
  }}>{keys.map((key, index) => <option key={key} value={index + 1}>{String(index + 1).padStart(2, '0')}</option>)}</select>;
}
