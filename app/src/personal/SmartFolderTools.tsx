import { useId, useState } from 'react';
import type { BrainObject, PersonalWorkspace } from './api';
import type { FileCabinetProps } from './FileCabinet';
import type { CabinetFolder } from './fileCabinetModel.mjs';
type Props = { selected: BrainObject[]; visible: BrainObject[]; folders: CabinetFolder[]; active: CabinetFolder; filing?: PersonalWorkspace['filing']; busy: boolean; run: FileCabinetProps['act']; onSelectAll: () => void; onClear: () => void };
export function SmartFolderTools({ selected, visible, folders, active, filing, busy, run, onSelectAll, onClear }: Props) {
  const [destination, setDestination] = useState('');
  const [color, setColor] = useState(active.color);
  const listId = useId();
  async function refine(reset = false) {
    const folder = reset ? null : destination.trim();
    if (!selected.length || (!reset && !folder)) return;
    const assignments = selected.map(object => ({ sourceId: object.id, revisionId: object.revisionId, folder, expectedFolder: filing?.overrides.find(item => item.sourceId === object.id)?.folder ?? null }));
    if (await run('Refining smart folders', client => client.request('/v1/workspace/filing', 'POST', { assignments }), 'Smart folders updated. Obsidian files and collections are unchanged.')) onClear();
  }
  return <div className="fc-organizer">
    <div className="fc-bulk-toolbar" role="group" aria-label="Refine smart folders">
      <span aria-live="polite">{selected.length} selected</span>
      <button type="button" disabled={busy || !visible.length || visible.length > 1000} onClick={onSelectAll}>Select all matches</button>
      <button type="button" disabled={busy || !selected.length} onClick={onClear}>Clear selection</button>
      <label><span className="pn-sr">Refine destination</span><input aria-label="Refine destination" list={listId} value={destination} maxLength={80} placeholder="Choose or name a folder…" disabled={busy} onChange={event => setDestination(event.target.value)} /><datalist id={listId}>{folders.map(folder => <option value={folder.name} key={folder.id} />)}</datalist></label>
      <button type="button" disabled={busy || !selected.length || !destination.trim() || /[/\\\x00-\x1f]/.test(destination)} onClick={() => void refine()}>Refine selected</button>
      <button type="button" disabled={busy || !selected.some(object => filing?.overrides.some(item => item.sourceId === object.id))} onClick={() => void refine(true)}>Reset to automatic</button>
      <label className="fc-smart-color">Folder color<input aria-label="Smart folder color" type="color" value={color} disabled={busy} onChange={event => setColor(event.target.value)} /></label>
      <button type="button" disabled={busy || color === active.color || !active.id.startsWith('smart:')} onClick={() => void run('Saving smart folder color', client => client.request('/v1/workspace/filing', 'POST', { assignments: [], color: { folder: active.name, color, expectedColor: filing?.colors.find(item => item.folder === active.name)?.color ?? null } }), 'Smart folder color saved.')}>Save folder color</button>
    </div>
    <p className="fc-organizer-help">Auto-sorted from source folders first, then local title/content rules. Unclear files go to Inbox. Select files to refine their destination; your choices survive refresh. No files moved, no model calls. Collections remain separate.</p>
  </div>;
}
