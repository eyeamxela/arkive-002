import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getFunctionName } from 'convex/server';
import { dataRevision, getRevision, mutateFixture, notify, queryFixture, subscribe } from './fixture';
type Entry = { revision: number; pending: boolean; value?: any; error?: Error };
const cache = new Map<string, Entry>();
export function useQuery(reference: any, args: any = {}): any {
  useSyncExternalStore(subscribe, getRevision, getRevision);
  const name = getFunctionName(reference);
  const key = name + '|' + JSON.stringify(args);
  const revision = dataRevision;
  useEffect(() => {
    if (args === 'skip') return;
    const previous = cache.get(key);
    if (previous?.revision === revision) return;
    const entry: Entry = { revision, pending: true, value: previous?.value };
    cache.set(key, entry);
    queryFixture(name, args).then(value => {
      if (cache.get(key) !== entry) return;
      entry.value = value; entry.pending = false; notify();
    }, error => { if (cache.get(key) !== entry) return; entry.error = error; entry.pending = false; notify(); });
  }, [key, revision]);
  if (args === 'skip') return undefined;
  const entry = cache.get(key);
  if (entry?.error) throw entry.error;
  return entry?.value;
}
export function useMutation(reference: any): any {
  const name = getFunctionName(reference);
  return useCallback((args: any = {}) => mutateFixture(name, args), [name]);
}
