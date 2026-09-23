import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { createLocalStorageSession, deactivateStorageSession, type LocalStorageSession } from './localScope';

type LocalScope = { session: LocalStorageSession; onSignOut?: () => void };
const Context = createContext<LocalScope | null>(null);

export function LocalScopeProvider({ scope, onSignOut, children }: { scope: string; onSignOut?: () => void; children: ReactNode }) {
  // The keyed inner provider unmounts all room, draft and originals UI state on a
  // workspace/principal change, rather than hydrating stale state in an effect.
  return <SessionProvider key={scope} scope={scope} onSignOut={onSignOut}>{children}</SessionProvider>;
}
function SessionProvider({ scope, onSignOut, children }: { scope: string; onSignOut?: () => void; children: ReactNode }) {
  const [session] = useState(() => createLocalStorageSession(scope));
  useLayoutEffect(() => {
    session.active = true;
    return () => deactivateStorageSession(session);
  }, [session]);
  return <Context.Provider value={{ session, onSignOut }}>{children}</Context.Provider>;
}
export function useLocalScope(): LocalScope {
  const value = useContext(Context);
  if (!value) throw new Error('A verified workspace or isolated fixture storage provider is required.');
  return value;
}
