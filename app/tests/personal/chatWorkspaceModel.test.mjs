import test from 'node:test';
import assert from 'node:assert/strict';
import { preferredProvider, requestConsentScope, messagePage, visibleRoomIds, MAX_CANVAS_ROOMS, MESSAGE_PAGE_SIZE } from '../../src/personal/chatWorkspaceModel.mjs';

const provider = { id: 'configured', model: 'test-model', configured: true, external: true };
const room = { id: 'room-a', title: 'A', selectedSourceIds: ['source'], messages: [] };
const objects = [{ id: 'source', revisionId: 'rev1' }, { id: 'unselected', revisionId: 'hidden1' }];
const scope = input => requestConsentScope({ room, objects, provider, text: 'Draft', presentation: 'chat:1', ...input });

test('provider selection honors explicit preference, then configured adapter, then availability', () => {
  const unavailable = { id: 'unavailable', model: null, configured: false, external: true };
  assert.equal(preferredProvider([unavailable, provider]).id, provider.id);
  assert.equal(preferredProvider([unavailable, provider], unavailable.id).id, unavailable.id);
  assert.equal(preferredProvider([unavailable]).id, unavailable.id);
  assert.equal(preferredProvider([]), undefined);
});

test('consent identifies exact room, draft, provider identity/model/availability and presentation generation', () => {
  const original = scope();
  for (const input of [
    { room: { ...room, id: 'room-b' } }, { text: 'Changed draft' },
    { provider: { ...provider, id: 'other' } }, { provider: { ...provider, model: 'other' } },
    { provider: { ...provider, configured: false } }, { provider: { ...provider, external: false } },
    { presentation: 'canvas:2' }, { presentation: 'chat:3' },
  ]) assert.notEqual(scope(input), original);
  assert.equal(scope(), original);
});

test('selected source revisions and membership revoke consent, unselected revisions do not broaden context', () => {
  const original = scope();
  assert.notEqual(scope({ objects: [{ id: 'source', revisionId: 'rev2' }] }), original);
  assert.notEqual(scope({ objects: [] }), original);
  assert.notEqual(scope({ room: { ...room, selectedSourceIds: [] } }), original);
  assert.notEqual(scope({ room: { ...room, selectedSourceIds: ['source', 'unselected'] } }), original);
  assert.equal(scope({ objects: [objects[0], { ...objects[1], revisionId: 'hidden2' }] }), original);
});

test('a newly received message invalidates a grant without including transcript text in its request fingerprint', () => {
  const next = { ...room, messages: [{ id: 'm1', text: 'Private history is not a prompt', role: 'assistant' }] };
  assert.notEqual(scope({ room: next }), scope());
  assert.ok(!scope({ room: next }).includes('Private history'));
});

test('transcript windows are bounded and support earlier/newer without dropping stored messages', () => {
  const messages = Array.from({ length: 181 }, (_, index) => ({ id: `m${index}` }));
  const latest = messagePage(messages);
  assert.equal(latest.messages.length, MESSAGE_PAGE_SIZE);
  assert.equal(latest.start, 121);
  assert.equal(latest.end, 181);
  assert.equal(latest.olderOffset, 60);
  assert.equal(latest.newerOffset, null);
  const earlier = messagePage(messages, latest.olderOffset);
  assert.equal(earlier.start, 61); assert.equal(earlier.newerOffset, 0);
  const first = messagePage(messages, 180);
  assert.equal(first.start, 0); assert.equal(first.messages.length, 1); assert.equal(first.olderOffset, null);
  assert.equal(messages.length, 181);
});

test('invalid transcript offsets and empty rooms remain safe', () => {
  assert.equal(messagePage([], 900).messages.length, 0);
  const messages = [{ id: 'one' }];
  for (const offset of [NaN, -100, Infinity, 1000]) assert.deepEqual(messagePage(messages, offset).messages, messages);
});

test('canvas room selection is explicit, deduplicated, valid and capped without changing actual rooms', () => {
  const rooms = Array.from({ length: 20 }, (_, index) => ({ id: `r${index}` }));
  assert.equal(visibleRoomIds(rooms, null).length, MAX_CANVAS_ROOMS);
  assert.deepEqual(visibleRoomIds(rooms, []), []);
  assert.deepEqual(visibleRoomIds(rooms, ['r7', 'missing', 'r7', 'r2']), ['r7', 'r2']);
  assert.equal(rooms.length, 20);
});

test('an active room beyond the first twelve stays visible and only evicts the last nonactive room', () => {
  const rooms = Array.from({ length: 20 }, (_, index) => ({ id: `r${index}` }));
  const selected = visibleRoomIds(rooms, null, 'r19');
  assert.deepEqual(selected, [...rooms.slice(0, 11).map(room => room.id), 'r19']);
  assert.equal(selected.length, MAX_CANVAS_ROOMS);
  assert.deepEqual(visibleRoomIds(rooms, selected, 'r0'), selected);
  assert.deepEqual(visibleRoomIds(rooms, ['r3'], 'r19'), ['r3', 'r19']);
  assert.deepEqual(visibleRoomIds(rooms, [], 'r19'), ['r19']);
  assert.deepEqual(visibleRoomIds(rooms, [], 'missing'), []);
  assert.equal(rooms.length, 20);
});
