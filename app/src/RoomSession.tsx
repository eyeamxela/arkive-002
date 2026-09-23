import { createContext, useContext, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { DRAFT_KEYS, validateRoomDrafts } from './draftStorage';
import { useLocalDraft } from './useLocalDraft';

export type RoomSession = Record<string, unknown>;
export type RoomSessions = Record<string, RoomSession>;
export function updateRoomField<T>(sessions: RoomSessions, room: string, field: string, initial: T, action: SetStateAction<T>): RoomSessions {
  const current = (sessions[room]?.[field] ?? initial) as T;
  const value = typeof action === 'function' ? (action as (current: T) => T)(current) : action;
  return { ...sessions, [room]: { ...sessions[room], [field]: value } };
}
const SessionContext = createContext<{ sessions: RoomSessions; setSessions: Dispatch<SetStateAction<RoomSessions>> } | null>(null);
export function sessionsFromDrafts(drafts: Record<string, string> | null): RoomSessions {
  return Object.fromEntries(Object.entries(drafts ?? {}).map(([room, draft]) => [room, { draft }]));
}
export function draftsFromSessions(sessions: RoomSessions): Record<string, string> {
  return Object.fromEntries(Object.entries(sessions).flatMap(([room, state]) => typeof state.draft === 'string' && state.draft.length ? [[room, state.draft]] : []));
}
export function resetRoomScope(sessions: RoomSessions, room: string): RoomSessions {
  return { ...sessions, [room]: { ...sessions[room], selection: null, manifest: null, deny: true } };
}
// UX state lives above all presentations. ONLY composer text survives reload:
// selections, manifests, pending sends, grants and authority are always memory-only.
export function RoomSessionProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts, warning] = useLocalDraft(DRAFT_KEYS.rooms, validateRoomDrafts);
  const [sessions, setState] = useState<RoomSessions>(() => sessionsFromDrafts(drafts));
  const latest = useRef(sessions);
  const setSessions: Dispatch<SetStateAction<RoomSessions>> = action => {
    const next = typeof action === 'function' ? action(latest.current) : action;
    const before = draftsFromSessions(latest.current);
    const after = draftsFromSessions(next);
    latest.current = next;
    setState(next);
    if (JSON.stringify(before) !== JSON.stringify(after)) setDrafts(Object.keys(after).length ? after : null);
  };
  return <SessionContext.Provider value={{ sessions, setSessions }}>{children}{warning && <div role="alert" style={{ position: 'fixed', bottom: 8, left: 12, right: 12, zIndex: 100, padding: '8px 12px', background: '#241913', color: '#efbb98', border: '1px solid #604331', borderRadius: 6, fontSize: 11 }}>{warning}</div>}</SessionContext.Provider>;
}
export function useRoomScopeReset(): (room: string) => void {
  const store = useContext(SessionContext);
  if (!store) throw new Error('RoomSessionProvider is required');
  return room => store.setSessions(sessions => resetRoomScope(sessions, room));
}
export function useRoomField<T>(room: string, field: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(SessionContext);
  if (!store) throw new Error('RoomSessionProvider is required');
  return [(store.sessions[room]?.[field] ?? initial) as T, (action) => store.setSessions((sessions) => updateRoomField(sessions, room, field, initial, action))];
}
