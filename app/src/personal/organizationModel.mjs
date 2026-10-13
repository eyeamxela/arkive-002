const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const nameOrder = (a, b) => collator.compare(a.title, b.title) || a.id.localeCompare(b.id);
export function fileType(object) {
  const name = object.sourceMetadata?.path || object.sourcePath || object.title;
  return /\.([a-z0-9]{1,12})$/i.exec(name)?.[1].toLowerCase() || object.kind;
}
/** Revision time is the node's saved/import time, never the original file's mtime. */
export function sortCabinetFiles(objects, sort = 'name-asc', revisions = [], sourceIds = []) {
  const stamps = new Map(revisions.filter(item => item && typeof item === 'object').map(item => [item.id, Date.parse(item.createdAt) || 0]));
  const order = new Map(sourceIds.map((id, index) => [id, index]));
  return [...objects].sort((a, b) => {
    if (sort === 'name-desc') return -nameOrder(a, b);
    if (sort === 'type') return collator.compare(fileType(a), fileType(b)) || nameOrder(a, b);
    if (sort === 'recent') return (stamps.get(b.revisionId) || 0) - (stamps.get(a.revisionId) || 0) || nameOrder(a, b);
    if (sort === 'manual') return (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity) || nameOrder(a, b);
    return nameOrder(a, b);
  });
}
const ignored = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'notes', 'files', 'folder', 'collection']);
const tokens = value => [...new Set((value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(word => word.length > 2 && !ignored.has(word)))];
/** Local lexical hints, not semantic AI or authority. A tie deliberately produces no suggestion. */
export function suggestFiling(objects, collections) {
  const targets = collections.map(collection => ({ collection, terms: tokens(collection.name), members: new Set(collection.sourceIds) }));
  return objects.slice(0, 100).map(object => {
    const path = (object.sourceMetadata?.path || object.sourcePath || '').split('/').slice(0, -1).join('/');
    const folders = new Set(tokens(path)), title = new Set(tokens(object.title)), body = new Set(tokens(object.text.slice(0, 8000)));
    const ranked = targets.filter(target => !target.members.has(object.id) && target.members.size < 1000).map(({ collection, terms }) => {
      const folderHits = terms.filter(word => folders.has(word));
      const titleHits = terms.filter(word => title.has(word));
      const bodyHits = terms.filter(word => body.has(word));
      return { collection, score: folderHits.length * 4 + titleHits.length * 3 + bodyHits.length,
        reason: folderHits.length ? `Folder name matches: ${folderHits.join(', ')}` : titleHits.length ? `Title matches: ${titleHits.join(', ')}` : `Note text matches: ${bodyHits.join(', ')}` };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    return { object, collection: best && best.score !== ranked[1]?.score ? best.collection : null,
      reason: !best ? 'No clear match. Choose a collection yourself.' : best.score === ranked[1]?.score ? 'Multiple collections match equally. Choose a destination.' : best.reason };
  });
}
export function filingOperations(rows, collections, remove = false) {
  const operations = new Map();
  for (const row of rows) {
    if (!row.accepted || !row.collectionId) continue;
    const collection = collections.find(item => item.id === row.collectionId);
    if (!collection) throw new Error('Collection is no longer available. Review again.');
    if (!remove && collection.sourceIds.includes(row.object.id)) continue;
    if (!operations.has(collection.id)) operations.set(collection.id, { collectionId: collection.id, expected: structuredClone(collection), add: [], removeIds: [] });
    const operation = operations.get(collection.id);
    if (remove) operation.removeIds.push(row.object.id);
    else operation.add.push({ sourceId: row.object.id, revisionId: row.object.revisionId });
  }
  return [...operations.values()];
}
export function reorderCollection(collection, sourceId, direction) {
  const order = [...collection.sourceIds], index = order.indexOf(sourceId), target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return null;
  [order[index], order[target]] = [order[target], order[index]];
  return { collectionId: collection.id, expected: structuredClone(collection), add: [], removeIds: [], order };
}
