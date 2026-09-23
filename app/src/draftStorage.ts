// Browser-local convenience drafts, not a vault, backup, identity or authority store.
// Deliberately separate from IndexedDB original-file storage. Nothing is encrypted here.
export const DRAFT_VERSION = 1;
export const MAX_DRAFT_CHARS = 1_000_000;
export const MAX_TEXT_CHARS = 100_000;
export const MAX_ROOM_DRAFTS = 64;
export const DRAFT_KEYS = {
  rooms: 'arkive.drafts.rooms.v1',
  capture: 'arkive.drafts.capture.v1',
  cartridge: 'arkive.drafts.cartridge.v1',
} as const;
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type DraftValidator<T> = (value: unknown) => T | null;
export type DraftSnapshot<T> = { value: T | null; warning: string };
const unavailable = 'Draft storage unavailable. Text is kept in this tab only; reloading may lose it.';

export function browserDraftStorage(): DraftStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

export function readDraft<T>(storage: DraftStorage | null, key: string, validate: DraftValidator<T>): DraftSnapshot<T> {
  if (!storage) return { value: null, warning: unavailable };
  try {
    const raw = storage.getItem(key);
    if (raw === null) return { value: null, warning: '' };
    if (raw.length > MAX_DRAFT_CHARS) throw new Error('oversized');
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== DRAFT_VERSION) throw new Error('version');
    const value = validate(parsed.value);
    if (value === null) throw new Error('invalid');
    return { value, warning: '' };
  } catch {
    return { value: null, warning: 'Saved draft could not be restored (invalid data, unsupported version or unavailable storage). Originals are unchanged.' };
  }
}

export function writeDraft<T>(storage: DraftStorage | null, key: string, value: T | null, validate: DraftValidator<T>): string {
  if (!storage) return unavailable;
  try {
    if (value === null) { storage.removeItem(key); return ''; }
    const safe = validate(value);
    if (safe === null) return 'Draft is too large or invalid for local storage. It remains in this tab; copy it before reloading.';
    const raw = JSON.stringify({ version: DRAFT_VERSION, value: safe });
    if (raw.length > MAX_DRAFT_CHARS) return 'Draft exceeds the local storage limit. It remains in this tab; copy it before reloading.';
    storage.setItem(key, raw);
    return '';
  } catch { return unavailable; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validText(value: unknown): value is string { return typeof value === 'string' && value.length <= MAX_TEXT_CHARS; }
function validStrings(value: unknown): value is string[] { return Array.isArray(value) && value.length <= 256 && value.every(validText); }

export function validateRoomDrafts(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_ROOM_DRAFTS || entries.some(([room, text]) => !room || room.length > 256 || !validText(text))) return null;
  return Object.fromEntries(entries.map(([room, text]) => [room, text as string]));
}

export type CaptureDraft = { mode: 'voice' | 'note' | 'task' | 'files'; note: string; task: string; title: string; route: 'inbox' | 'project' | 'journal' };
export const EMPTY_CAPTURE_DRAFT: CaptureDraft = { mode: 'voice', note: '', task: '', title: '', route: 'inbox' };
export function validateCaptureDraft(value: unknown): CaptureDraft | null {
  if (!isRecord(value) || !['voice', 'note', 'task', 'files'].includes(value.mode as string)
    || !['inbox', 'project', 'journal'].includes(value.route as string)
    || !validText(value.note) || !validText(value.task) || !validText(value.title)) return null;
  return { mode: value.mode as CaptureDraft['mode'], note: value.note, task: value.task, title: value.title, route: value.route as CaptureDraft['route'] };
}

export type CartridgeDraft = { step: number; tpls: string[]; name: string; purpose: string; srcs: string[]; instr: string; excl: string; execOn: boolean };
export function emptyCartridgeDraft(): CartridgeDraft {
  return { step: 1, tpls: [], name: '', purpose: '', srcs: [], instr: '', excl: '', execOn: false };
}
export function validateCartridgeDraft(value: unknown): CartridgeDraft | null {
  if (!isRecord(value) || !Number.isInteger(value.step) || (value.step as number) < 1 || (value.step as number) > 6
    || !validStrings(value.tpls) || !validStrings(value.srcs) || !validText(value.name) || !validText(value.purpose)
    || !validText(value.instr) || !validText(value.excl) || typeof value.execOn !== 'boolean') return null;
  // execOn is a proposed design field only: restoring it never enables any runtime capability.
  return { step: value.step as number, tpls: value.tpls, name: value.name, purpose: value.purpose, srcs: value.srcs, instr: value.instr, excl: value.excl, execOn: value.execOn };
}
