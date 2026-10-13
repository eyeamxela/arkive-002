import { useState } from 'react';
import type { BrainCollection, BrainObject } from './api';
import type { FileCabinetProps } from './FileCabinet';
import { filingOperations, suggestFiling, type FilingRow } from './organizationModel.mjs';

type Props = {
  selected: BrainObject[]; visible: BrainObject[]; collections: BrainCollection[];
  collection?: BrainCollection; busy: boolean; onSelectAll: () => void; onClear: () => void;
  run: FileCabinetProps['act'];
};
type Review = { rows: FilingRow[]; collections: BrainCollection[]; remove: boolean };
/** Proposals live only in memory and never execute until the owner clicks Apply. */
export function CollectionOrganizer({ selected, visible, collections, collection, busy, onSelectAll, onClear, run }: Props) {
  const [destination, setDestination] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState('');
  function propose(mode: 'file' | 'remove' | 'smart') {
    const candidates = mode === 'smart' ? (selected.length ? selected : visible).slice(0, 100) : selected;
    const snapshot = structuredClone(collections);
    const rows = mode === 'smart' ? suggestFiling(candidates, snapshot).map(item => ({ object: item.object, collectionId: item.collection?.id || '', reason: item.reason, accepted: false }))
      : candidates.map(object => ({ object, collectionId: mode === 'remove' ? collection!.id : destination, accepted: true, reason: mode === 'remove' ? 'Remove only this collection reference.' : 'Add a reference; keep every existing filing.' }));
    setReview({ rows: structuredClone(rows), collections: snapshot, remove: mode === 'remove' }); setNotice('');
  }
  const accepted = review?.rows.filter(row => row.accepted && row.collectionId).length || 0;
  async function apply() {
    if (!review || !accepted) return;
    const operations = filingOperations(review.rows, review.collections, review.remove);
    if (!operations.length) { setNotice('These sources are already filed. Nothing changed.'); setReview(null); return; }
    if (await run('Applying reviewed filing', client => client.request('/v1/workspace/collections/organize', 'POST', { operations }), 'Filing saved. Original files, source revisions and room access are unchanged.')) {
      setReview(null); onClear(); setNotice('Reviewed filing saved on your node.');
    } else { setReview(null); setNotice('Filing was not applied. Check the error above and review again.'); }
  }
  return <div className="fc-organizer">
    <div className="fc-bulk-toolbar" role="group" aria-label="Organize selected files">
      <span aria-live="polite">{selected.length} selected</span>
      <button type="button" disabled={busy || !visible.length || visible.length > 1000} onClick={onSelectAll}>Select all matches</button>
      <button type="button" disabled={busy || !selected.length} onClick={onClear}>Clear selection</button>
      <label><span className="pn-sr">Bulk destination collection</span><select aria-label="Bulk destination collection" value={destination} disabled={busy || !collections.length} onChange={event => setDestination(event.target.value)}><option value="">Choose collection…</option>{collections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button type="button" disabled={busy || !selected.length || !collections.some(item => item.id === destination)} onClick={() => propose('file')}>Review filing</button>
      {collection && <button type="button" disabled={busy || !selected.length} onClick={() => propose('remove')}>Review removal</button>}
      <button type="button" disabled={busy || !visible.length || !collections.length} onClick={() => propose('smart')}>Suggest filing</button>
    </div>
    <p className="fc-organizer-help">Collections stay separate from Obsidian. Suggestions use local folder names, titles and the first 8,000 characters of each note; no model or network call. Up to 100 files per suggestion review.{visible.length > 1000 ? ' Narrow the filter to bulk-select at most 1,000 files.' : ''}</p>
    {notice && <p role="status">{notice}</p>}
    {review && <section className="fc-filing-review" aria-label="Review collection filing">
      <h3>{review.remove ? 'Review reference removal' : 'Review collection filing'}</h3>
      <p>{review.rows.length} files · Nothing has changed yet. Select the rows you want to apply. Originals and other collections stay in place.</p>
      <div className="fc-review-actions"><button type="button" disabled={busy} onClick={() => setReview({ ...review, rows: review.rows.map(row => ({ ...row, accepted: !!row.collectionId })) })}>Select all destinations</button><button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel review</button><button type="button" disabled={busy || !accepted} onClick={() => void apply()}>Apply {accepted} {review.remove ? 'removals' : 'filings'}</button></div>
      <div className="fc-review-rows">{review.rows.map((row, index) => <div className="fc-review-row" key={row.object.id}>
        <input type="checkbox" aria-label={`Approve filing ${row.object.title}`} checked={row.accepted} disabled={busy || !row.collectionId} onChange={event => setReview({ ...review, rows: review.rows.map((item, at) => at === index ? { ...item, accepted: event.target.checked } : item) })} />
        <div><strong>{row.object.title}</strong><small>{row.reason}</small></div>
        <select aria-label={`Destination for ${row.object.title}`} value={row.collectionId} disabled={busy || review.remove} onChange={event => setReview({ ...review, rows: review.rows.map((item, at) => at === index ? { ...item, collectionId: event.target.value, accepted: false } : item) })}><option value="">No new filing</option>{review.collections.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      </div>)}</div>
    </section>}
  </div>;
}
