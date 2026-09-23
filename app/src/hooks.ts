import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';

export function useChatMessages(room: string) {
  return useQuery(api.messages.list, { room });
}

export function useWorkspace(room: string, deny: boolean, selectionIds?: ReadonlySet<string> | null, manifestId?: string | null) {
  // null follows the room/default context; an empty set deliberately selects no sources.
  return useQuery(api.workspace.get, { room, deny, selectionIds: selectionIds == null ? undefined : [...selectionIds] as Id<'brainObjects'>[], manifestId: manifestId ? manifestId as Id<'manifests'> : undefined });
}

export function useDocuments() {
  return useQuery(api.documents.list, {});
}
