import { useSyncExternalStore, type SetStateAction } from 'react';
import { browserDraftStorage, readDraft, writeDraft, type DraftSnapshot, type DraftValidator } from './draftStorage';

// One in-tab store per draft: closing a view or an async completion cannot write an
// obsolete component snapshot over a newer draft. Cross-tab editing is not supported.
type Store<T> = { snapshot: DraftSnapshot<T>; listeners: Set<() => void> };
const stores = new Map<string, Store<unknown>>();

export function useLocalDraft<T>(key: string, validate: DraftValidator<T>): [T | null, (action: SetStateAction<T | null>) => void, string] {
  let store = stores.get(key) as Store<T> | undefined;
  if (!store) {
    store = { snapshot: readDraft(browserDraftStorage(), key, validate), listeners: new Set() };
    stores.set(key, store as Store<unknown>);
  }
  const current = store;
  const snapshot = useSyncExternalStore(
    listener => { current.listeners.add(listener); return () => { current.listeners.delete(listener); }; },
    () => current.snapshot,
    () => current.snapshot,
  );
  return [snapshot.value, action => {
    const value = typeof action === 'function' ? (action as (previous: T | null) => T | null)(current.snapshot.value) : action;
    const warning = writeDraft(browserDraftStorage(), key, value, validate);
    current.snapshot = { value, warning };
    current.listeners.forEach(listener => listener());
  }, snapshot.warning];
}
