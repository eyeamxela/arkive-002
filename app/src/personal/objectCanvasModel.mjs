/** Project real revision dates, never display invented task or workflow events. */
export function objectTimeline(objects, revisions, query = '') {
  const timestamps = new Map();
  for (const revision of revisions ?? []) {
    if (revision && typeof revision === 'object' && typeof revision.id === 'string' &&
        typeof revision.createdAt === 'string' && Number.isFinite(Date.parse(revision.createdAt))) {
      timestamps.set(revision.id, revision.createdAt);
    }
  }
  const needle = query.trim().toLowerCase();
  return objects.filter(object => object.kind !== 'code_graph' &&
    (!needle || [object.title, object.kind, object.sourcePath ?? ''].join(' ').toLowerCase().includes(needle)))
    .map(object => ({ object, updatedAt: timestamps.get(object.revisionId) ?? null }))
    .sort((a, b) => (b.updatedAt ? Date.parse(b.updatedAt) : -Infinity) -
      (a.updatedAt ? Date.parse(a.updatedAt) : -Infinity) || a.object.title.localeCompare(b.object.title));
}
