import { useSyncExternalStore, type SetStateAction } from 'react';
import { browserDraftStorage, readDraft, writeDraft, type DraftSnapshot, type DraftValidator } from './draftStorage';
import { useLocalScope } from './LocalScopeProvider';
import { scopedDraftKey, type LocalStorageSession } from './localScope';

// One in-tab store per draft: closing a view or an async completion cannot write an
// obsolete component snapshot over a newer draft. Cross-tab editing is not supported.
type Store<T> = { snapshot: DraftSnapshot<T>; listeners: Set<() => void> };
const sessionStores = new WeakMap<LocalStorageSession, Map<string, Store<unknown>>>();

export function useLocalDraft<T>(key: string, validate: DraftValidator<T>): [T | null, (action: SetStateAction<T | null>) => void, string] {
  const { session } = useLocalScope();
  const storageKey = scopedDraftKey(session.scope, key);
  let stores = sessionStores.get(session);
  if (!stores) { stores = new Map(); sessionStores.set(session, stores); }
  let store = stores.get(key) as Store<T> | undefined;
  if (!store) {
    store = { snapshot: readDraft(browserDraftStorage(), storageKey, validate), listeners: new Set() };
    stores.set(key, store as Store<unknown>);
  }
  const current = store;
  const snapshot = useSyncExternalStore(
    listener => { current.listeners.add(listener); return () => { current.listeners.delete(listener); }; },
    () => current.snapshot,
    () => current.snapshot,
  );
  return [snapshot.value, action => {
    // Async completions from a previous owner session must not touch new drafts.
    if (!session.active) return;
    const value = typeof action === 'function' ? (action as (previous: T | null) => T | null)(current.snapshot.value) : action;
    const warning = writeDraft(browserDraftStorage(), storageKey, value, validate);
    current.snapshot = { value, warning };
    current.listeners.forEach(listener => listener());
  }, snapshot.warning];
}
