import type { BrainObject, Message, Provider, Room } from './api';
export const MAX_CANVAS_ROOMS: number;
export const MESSAGE_PAGE_SIZE: number;
export function preferredProvider(providers: Provider[], preferredId?: string): Provider | undefined;
export function requestConsentScope(input: { room: Room; objects: BrainObject[]; provider?: Provider;
  text: string; presentation: string }): string;
export function messagePage(messages: Message[], offset?: number): { messages: Message[]; start: number; end: number;
  total: number; olderOffset: number | null; newerOffset: number | null };
export function visibleRoomIds(rooms: Room[], requestedIds: string[] | null, activeId?: string | null): string[];
