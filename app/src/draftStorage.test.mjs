import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDraftModule } from './draftTestLoader.mjs';
const { readDraft, writeDraft, DRAFT_KEYS, DRAFT_VERSION, MAX_DRAFT_CHARS, MAX_TEXT_CHARS, MAX_ROOM_DRAFTS, validateRoomDrafts, validateCaptureDraft, validateCartridgeDraft, emptyCartridgeDraft, EMPTY_CAPTURE_DRAFT } = loadDraftModule('./draftStorage.ts');
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
test('versioned room drafts round trip independently and successful clear removes text', () => {
  const disk = storage();
  assert.equal(writeDraft(disk, DRAFT_KEYS.rooms, { a: 'hello', b: 'world' }, validateRoomDrafts), '');
  assert.equal(JSON.parse(disk.getItem(DRAFT_KEYS.rooms)).version, DRAFT_VERSION);
  assert.deepEqual(readDraft(disk, DRAFT_KEYS.rooms, validateRoomDrafts).value, { a: 'hello', b: 'world' });
  writeDraft(disk, DRAFT_KEYS.rooms, { b: 'world' }, validateRoomDrafts);
  assert.deepEqual(readDraft(disk, DRAFT_KEYS.rooms, validateRoomDrafts).value, { b: 'world' });
  writeDraft(disk, DRAFT_KEYS.rooms, null, validateRoomDrafts);
  assert.equal(disk.getItem(DRAFT_KEYS.rooms), null);
});
test('corrupt, unknown-version, oversized and authority-shaped room data fail closed', () => {
  const disk = storage();
  for (const raw of ['{broken', JSON.stringify({ version: 90, value: { a: 'text' } }), 'x'.repeat(MAX_DRAFT_CHARS + 1), JSON.stringify({ version: 1, value: { a: { draft: 'text', deny: false } } })]) {
    disk.setItem(DRAFT_KEYS.rooms, raw);
    const restored = readDraft(disk, DRAFT_KEYS.rooms, validateRoomDrafts);
    assert.equal(restored.value, null);
    assert.ok(restored.warning);
  }
});
test('unavailable or full storage returns warnings without throwing or touching originals', () => {
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
  assert.ok(readDraft(null, DRAFT_KEYS.rooms, validateRoomDrafts).warning);
  assert.ok(readDraft(throwing, DRAFT_KEYS.rooms, validateRoomDrafts).warning);
  assert.ok(writeDraft(throwing, DRAFT_KEYS.rooms, { a: 'keep text' }, validateRoomDrafts));
  assert.ok(writeDraft(throwing, DRAFT_KEYS.rooms, null, validateRoomDrafts));
});
test('draft persistence is bounded and never silently truncates existing text', () => {
  const disk = storage();
  writeDraft(disk, DRAFT_KEYS.rooms, { a: 'previous' }, validateRoomDrafts);
  const previous = disk.getItem(DRAFT_KEYS.rooms);
  assert.ok(writeDraft(disk, DRAFT_KEYS.rooms, { a: 'x'.repeat(MAX_TEXT_CHARS + 1) }, validateRoomDrafts));
  assert.equal(disk.getItem(DRAFT_KEYS.rooms), previous);
  assert.equal(validateRoomDrafts(Object.fromEntries(Array.from({ length: MAX_ROOM_DRAFTS + 1 }, (_, i) => [String(i), 'text']))), null);
});
test('capture note and task text, current mode and title survive reload without recording state', () => {
  const disk = storage();
  const capture = { ...EMPTY_CAPTURE_DRAFT, mode: 'task', note: 'note text', task: 'task text', title: 'voice title', route: 'journal', rec: 'recording', capBusy: true };
  writeDraft(disk, DRAFT_KEYS.capture, capture, validateCaptureDraft);
  const restored = readDraft(disk, DRAFT_KEYS.capture, validateCaptureDraft).value;
  assert.deepEqual(restored, { mode: 'task', note: 'note text', task: 'task text', title: 'voice title', route: 'journal' });
});
test('full cartridge draft round trips all fields but never published/signature authority', () => {
  const disk = storage();
  const draft = { ...emptyCartridgeDraft(), step: 6, tpls: ['skill', 'knowledge pack'], name: 'brand pack', purpose: 'help team', srcs: ['canon/voice.md'], instr: 'cite sources', excl: 'never invent', execOn: true };
  writeDraft(disk, DRAFT_KEYS.cartridge, { ...draft, published: true, signature: 'fake' }, validateCartridgeDraft);
  assert.deepEqual(readDraft(disk, DRAFT_KEYS.cartridge, validateCartridgeDraft).value, draft);
  writeDraft(disk, DRAFT_KEYS.cartridge, null, validateCartridgeDraft);
  assert.equal(readDraft(disk, DRAFT_KEYS.cartridge, validateCartridgeDraft).value, null);
});
test('in-tab draft store survives close/remount and async success cannot erase newer text', () => {
  const disk = storage();
  globalThis.window = { localStorage: disk };
  try {
    const { useLocalDraft } = loadDraftModule('./useLocalDraft.ts', { react: { useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() } });
    const [, setFirst] = useLocalDraft(DRAFT_KEYS.capture, validateCaptureDraft);
    setFirst({ ...EMPTY_CAPTURE_DRAFT, mode: 'note', note: 'saving' });
    const [reopened, setSecond] = useLocalDraft(DRAFT_KEYS.capture, validateCaptureDraft);
    assert.equal(reopened.note, 'saving');
    setSecond(previous => ({ ...previous, note: 'newer' }));
    setFirst(previous => previous.note === 'saving' ? { ...previous, note: '' } : previous);
    assert.equal(useLocalDraft(DRAFT_KEYS.capture, validateCaptureDraft)[0].note, 'newer');
    setSecond(previous => ({ ...previous, task: 'keep task', note: '' }));
    const freshHook = loadDraftModule('./useLocalDraft.ts', { react: { useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() } });
    assert.equal(freshHook.useLocalDraft(DRAFT_KEYS.capture, validateCaptureDraft)[0].note, '');
    assert.equal(freshHook.useLocalDraft(DRAFT_KEYS.capture, validateCaptureDraft)[0].task, 'keep task');
  } finally { delete globalThis.window; }
});
test('failed persistence retains the latest draft in the tab with a visible warning', () => {
  globalThis.window = { localStorage: { getItem() { return null; }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } } };
  try {
    const { useLocalDraft } = loadDraftModule('./useLocalDraft.ts', { react: { useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() } });
    const [, update] = useLocalDraft(DRAFT_KEYS.cartridge, validateCartridgeDraft);
    update({ ...emptyCartridgeDraft(), name: 'still here' });
    const [current, , warning] = useLocalDraft(DRAFT_KEYS.cartridge, validateCartridgeDraft);
    assert.equal(current.name, 'still here');
    assert.match(warning, /reloading may lose/i);
  } finally { delete globalThis.window; }
});
