export function orderedFolders(items, saved, key) {
  const positions = new Map((saved ?? []).map((id, index) => [id, index]));
  return [...items].sort((a, b) => (positions.get(key(a)) ?? Infinity) - (positions.get(key(b)) ?? Infinity));
}
export function moveFolderOrder(visible, saved, id, position) {
  if (!Number.isInteger(position) || position < 1 || position > visible.length || !visible.includes(id)) throw new Error('Choose an available folder position');
  const next = visible.filter(key => key !== id);
  next.splice(position - 1, 0, id);
  // Retain preferences for sections absent on this date.
  return [...next, ...(saved ?? []).filter(key => !visible.includes(key))];
}
