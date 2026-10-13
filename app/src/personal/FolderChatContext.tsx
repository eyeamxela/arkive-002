import { useRef, useState } from 'react';
import type { Brain, BrainObject } from './api';
import type { CabinetFolder } from './fileCabinetModel.mjs';
import type { FileCabinetProps } from './FileCabinet';

type Props = { brain: Brain; folder: CabinetFolder; objects: BrainObject[]; activeRoomId?: string; busy: boolean; run: FileCabinetProps['act']; onOpenChat: () => void };
type Review = { roomId: string; key: string; sources: { sourceId: string; revisionId: string }[] };

/** Explicit snapshot selection, never a live folder grant or an automatic model request. */
export function FolderChatContext({ brain, folder, objects, activeRoomId, busy, run, onOpenChat }: Props) {
  const [roomChoice, setRoomChoice] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const room = brain.rooms.find(item => item.id === (roomChoice ?? activeRoomId));
  const folderIds = new Set(folder.sourceIds);
  // Independent of search, type filters and the 100-row display page.
  const sources = objects.filter(item => folderIds.has(item.id) && item.kind !== 'code_graph');
  const bindings = sources.map(item => ({ sourceId: item.id, revisionId: item.revisionId || '' }));
  const key = JSON.stringify([folder.id, bindings]);
  const selected = new Set(room?.selectedSourceIds ?? []);
  const newCount = sources.filter(item => !selected.has(item.id)).length;
  const total = selected.size + newCount;
  const stale = !!review && (review.key !== key || review.roomId !== room?.id);
  const policy = brain.governance?.roomPolicies.find(item => item.roomId === room?.id);
  const shared = policy?.memberGrants.some(grant => brain.governance?.members.some(member => member.id === grant.memberId && !member.revokedAt));
  const tooLarge = total > 1000;
  const unavailable = sources.length !== folderIds.size || bindings.some(item => !item.revisionId);
  async function apply() {
    if (!review || !room || stale || busy || tooLarge || unavailable) return;
    if (await run('Adding folder context', client => client.request(`/v1/rooms/${encodeURIComponent(review.roomId)}/sources/add`, 'POST', { sources: review.sources }),
      `${folder.name} sources added to ${room.title}. Existing context kept; permissions unchanged. Nothing sent to a model.`)) {
      setReview(null); trigger.current?.focus();
    }
  }
  return <section className="fc-folder-context" aria-label="Folder chat context">
    <div className="fc-folder-context-bar">
      <div><strong>Chat with {folder.name}</strong><p>{sources.length} imported files · whole folder, regardless of search filters</p></div>
      <label>Chat<select aria-label="Folder context chat" value={room?.id || ''} disabled={busy} onChange={event => { setRoomChoice(event.target.value); setReview(null); }}><option value="">Choose a chat</option>{brain.rooms.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <button ref={trigger} type="button" disabled={busy || !room || !sources.length || !newCount || tooLarge || unavailable} aria-expanded={!!review} onClick={() => setReview({ roomId: room!.id, key, sources: bindings })}>{room && !newCount && sources.length ? 'Folder files selected ✓' : 'Use this folder in chat'}</button>
    </div>
    {!brain.rooms.length && <p>Create a chat first. <button type="button" onClick={onOpenChat}>Open chat →</button></p>}
    {tooLarge && <p role="status">This would select {total} sources. Chats currently support 1,000. Choose a smaller folder or remove other context first; nothing is partially added.</p>}
    {unavailable && <p role="status">Some sources are unavailable. Refresh the Brain before selecting this folder.</p>}
    {review && <div className="fc-folder-context-review" role="region" aria-label="Review folder context">
      <h3>Add {folder.name} to {room?.title || 'chat'}?</h3>
      <p>{sources.length} folder files: {newCount} new, {sources.length - newCount} already selected. Existing chat sources stay selected.</p>
      <p>This selects the folder’s current imported files—not a live subscription. Later additions require another selection. It does not move files, promote Canon, grant access or send a model request.</p>
      <p>{shared ? 'Shared chat: each source must be allowed to every active member before a request can run. ' : ''}Layer, agent and pinned-context rules still apply. Large text bundles may exceed the current Context Compiler limit and require fewer selected sources.</p>
      <details><summary>Review {sources.length} source files</summary><ul>{sources.map(item => <li key={item.id}>{item.title}</li>)}</ul></details>
      {stale && <p role="alert">Folder contents changed. Cancel and review the current folder again.</p>}
      <div className="fc-form-actions"><button type="button" disabled={busy} onClick={() => { setReview(null); trigger.current?.focus(); }}>Cancel folder selection</button><button type="button" disabled={busy || stale || tooLarge || unavailable || !newCount} onClick={() => void apply()}>Add {newCount} files to chat</button></div>
    </div>}
  </section>;
}
