import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDraftModule } from './draftTestLoader.mjs';
const { updateRoomField, sessionsFromDrafts, draftsFromSessions, resetRoomScope } = loadDraftModule('./RoomSession.tsx');
test('room draft, TTL and selection survive presentation and room transitions independently', () => {
  let state = updateRoomField({}, 'a', 'draft', '', 'draft A');
  state = updateRoomField(state, 'a', 'ttl', 'session', 'iso');
  state = updateRoomField(state, 'a', 'selection', new Set(), new Set(['doc-a']));
  const roomA = state.a;
  state = updateRoomField(state, 'b', 'draft', '', 'draft B');
  assert.equal(state.a, roomA);
  assert.equal(state.a.draft, 'draft A');
  assert.equal(state.a.ttl, 'iso');
  assert.deepEqual([...state.a.selection], ['doc-a']);
  assert.equal(state.b.draft, 'draft B');
});
test('context consumption is room-scoped and functional actions compose', () => {
  let state = updateRoomField({}, 'a', 'contextRequest', 0, n => n + 1);
  state = updateRoomField(state, 'a', 'contextConsumed', 0, state.a.contextRequest);
  state = updateRoomField(state, 'a', 'contextRequest', 0, n => n + 1);
  state = updateRoomField(state, 'b', 'contextRequest', 0, n => n + 1);
  assert.equal(state.a.contextRequest, 2);
  assert.equal(state.a.contextConsumed, 1);
  assert.equal(state.b.contextConsumed, undefined);
});
test('failed sends preserve drafts, successful old sends never erase newly typed text', () => {
  let state = updateRoomField({}, 'a', 'draft', '', 'retry me');
  state = updateRoomField(state, 'a', 'sendError', '', 'offline');
  assert.equal(state.a.draft, 'retry me');
  state = updateRoomField(state, 'a', 'draft', '', 'new text');
  state = updateRoomField(state, 'a', 'draft', '', current => current.trim() === 'retry me' ? '' : current);
  assert.equal(state.a.draft, 'new text');
});
test('reload restores composer text only, never selections, pending work or authority', () => {
  const original = { a: { draft: 'first draft', selection: new Set(['private']), manifest: 'old', deny: false, ttl: 'forever', sending: true, typing: true, contextRequest: 10 }, b: { draft: 'second draft' }, empty: { draft: '' } };
  const drafts = draftsFromSessions(original);
  assert.deepEqual(drafts, { a: 'first draft', b: 'second draft' });
  assert.deepEqual(sessionsFromDrafts(drafts), { a: { draft: 'first draft' }, b: { draft: 'second draft' } });
  assert.deepEqual(sessionsFromDrafts(null), {});
});
test('scope reset is room-local and preserves drafts without granting authority', () => {
  const before = { a: { draft: 'keep me', selection: new Set(['x']), manifest: 'old', deny: false }, b: { draft: 'other room', manifest: 'other' } };
  const after = resetRoomScope(before, 'a');
  assert.deepEqual(after.a, { draft: 'keep me', selection: null, manifest: null, deny: true });
  assert.equal(after.b, before.b);
});
