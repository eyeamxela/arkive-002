export const MAX_CANVAS_ROOMS = 12;
export const MESSAGE_PAGE_SIZE = 60;

export function preferredProvider(providers, preferredId) {
  return providers.find(provider => provider.id === preferredId) || providers.find(provider => provider.configured) || providers[0];
}

/** Consent identifies one exact request and presentation, never a durable permission. */
export function requestConsentScope({ room, objects, provider, text, presentation }) {
  const byId = new Map(objects.map(object => [object.id, object]));
  return JSON.stringify({ room: room.id, text,
    provider: provider ? [provider.id, provider.model, provider.external, provider.configured, provider.configurationKey] : null,
    sources: room.selectedSourceIds.map(id => [id, byId.get(id)?.revisionId || 'missing']),
    messages: [room.messages.length, room.messages.at(-1)?.id || ''], presentation });
}

export function messagePage(messages, offset = 0) {
  const safeOffset = Math.max(0, Math.min(Math.max(0, messages.length - 1), Math.floor(offset) || 0));
  const end = messages.length - safeOffset;
  const start = Math.max(0, end - MESSAGE_PAGE_SIZE);
  return { messages: messages.slice(start, end), start, end, total: messages.length,
    olderOffset: start > 0 ? safeOffset + MESSAGE_PAGE_SIZE : null,
    newerOffset: safeOffset > 0 ? Math.max(0, safeOffset - MESSAGE_PAGE_SIZE) : null };
}

export function visibleRoomIds(rooms, requestedIds, activeId = null) {
  const valid = new Set(rooms.map(room => room.id));
  const selected = [...new Set(requestedIds === null ? rooms.map(room => room.id) : requestedIds)]
    .filter(id => valid.has(id)).slice(0, MAX_CANVAS_ROOMS);
  // An active room stays discoverable even when selected beyond the first page.
  if (valid.has(activeId) && !selected.includes(activeId)) return [...selected.slice(0, MAX_CANVAS_ROOMS - 1), activeId];
  return selected;
}
