import test from 'node:test';
import assert from 'node:assert/strict';
import { activityNetwork, activityRuns, roomAskLayers, roomAuthorizationScope, runApprovalScope, ACTIVITY_ROOM_LIMIT } from '../../src/personal/agentActivityModel.mjs';
const run = { id: 'run', roomId: 'room', agentId: 'profile', prompt: 'Question', providerId: 'local', bindings: [{ sourceId: 'note', revisionId: 'rev1' }], state: 'awaiting-approval', createdAt: '2026-10-10T00:00:00Z' };
const brain = { access: { kind: 'owner' }, rooms: [{ id: 'room', title: 'Room', messages: [], selectedSourceIds: ['note'] }], workspace: { agents: [{ id: 'profile', name: 'Profile' }], tasks: [] }, governance: { runs: [run], roomPolicies: [{ roomId: 'room', agentId: 'profile', layerIds: ['ask'] }], layers: [{ id: 'ask', name: 'Private layer', mode: 'ask', sourceIds: ['note'] }], manifests: [] } };
test('network uses recorded room/profile/run/provider links with no invented delegation', () => {
  const model = activityNetwork(brain);
  assert.ok(model.edges.some(edge => edge.source === 'profile:room' && edge.target === 'run:run'));
  assert.ok(model.edges.some(edge => edge.source === 'run:run' && edge.target === 'provider:run'));
  const mismatched = activityNetwork({ ...brain, governance: { ...brain.governance, runs: [{ ...run, agentId: 'another' }] } });
  assert.ok(mismatched.edges.some(edge => edge.source === 'room:room' && edge.target === 'run:run'));
  assert.ok(!mismatched.edges.some(edge => edge.source === 'profile:room' && edge.target === 'run:run'));
});
test('network and list are bounded and scoped to actual room IDs', () => {
  const many = { ...brain, rooms: Array.from({ length: 1000 }, (_, index) => ({ ...brain.rooms[0], id: String(index) })) };
  assert.equal(activityNetwork(many).omittedRooms, 1000 - ACTIVITY_ROOM_LIMIT);
  assert.deepEqual(activityRuns(brain, 'missing'), []);
  assert.deepEqual(activityRuns(brain, 'room', 'completed'), []);
  assert.equal(activityNetwork(brain, 'room', 'completed').nodes.length, 0);
});
test('ask layers only gate selected or pinned inputs and exclude wins over ask', () => {
  assert.equal(roomAskLayers(brain, 'room').length, 1);
  assert.equal(roomAskLayers(brain, 'room', [{ sourceId: 'other', revisionId: 'r' }]).length, 0);
  const excluded = { ...brain, governance: { ...brain.governance, roomPolicies: [{ ...brain.governance.roomPolicies[0], layerIds: ['ask', 'exclude'] }], layers: [...brain.governance.layers, { id: 'exclude', mode: 'exclude', sourceIds: ['note'] }] } };
  assert.equal(roomAskLayers(excluded, 'room').length, 0);
});
test('run approval consent changes for prompt, revision, state, provider, approved asks and policy', () => {
  const provider = { id: 'local', configured: true, external: false, model: 'model' };
  const initial = runApprovalScope(brain, run, provider);
  for (const changed of [{ ...run, prompt: 'Other' }, { ...run, bindings: [{ sourceId: 'note', revisionId: 'rev2' }] }, { ...run, state: 'running' }]) assert.notEqual(runApprovalScope(brain, changed, provider), initial);
  assert.notEqual(runApprovalScope(brain, run, { ...provider, external: true }), initial);
  assert.notEqual(runApprovalScope(brain, run, provider, ['ask']), initial);
  const changed = { ...brain, governance: { ...brain.governance, roomPolicies: [{ ...brain.governance.roomPolicies[0], updatedAt: 'new' }] } };
  assert.notEqual(roomAuthorizationScope(brain, 'room'), roomAuthorizationScope(changed, 'room'));
  assert.notEqual(runApprovalScope(changed, run, provider), initial);
  const staleContext = { ...brain, governance: { ...brain.governance, scopes: [{ roomId: 'room', contextKey: 'new-policy-key' }] } };
  assert.notEqual(roomAuthorizationScope(brain, 'room'), roomAuthorizationScope(staleContext, 'room'));
});
