export const ACTIVITY_RUN_LIMIT = 60;
export const ACTIVITY_ROOM_LIMIT = 6;
export function runTone(state) {
  return ({ running: 'active', 'awaiting-approval': 'waiting', completed: 'complete', failed: 'failed', rejected: 'failed' })[state] || 'neutral';
}
export function roomAskLayers(brain, roomId, bindings) {
  const policy = brain.governance?.roomPolicies?.find(item => item.roomId === roomId);
  const applied = (brain.governance?.layers || []).filter(layer => policy?.layerIds.includes(layer.id));
  const excluded = new Set(applied.filter(layer => layer.mode === 'exclude').flatMap(layer => layer.sourceIds));
  const selected = new Set((bindings ? bindings.map(binding => binding.sourceId)
    : brain.rooms.find(room => room.id === roomId)?.selectedSourceIds || []).filter(id => !excluded.has(id)));
  return applied.filter(layer => layer.mode === 'ask' && layer.sourceIds.some(id => selected.has(id)));
}
export function roomAuthorizationScope(brain, roomId) {
  const governance = brain.governance;
  const policy = governance?.roomPolicies?.find(item => item.roomId === roomId);
  return JSON.stringify([brain.access, policy,
    governance?.scopes?.find(item => item.roomId === roomId),
    governance?.layers?.filter(layer => policy?.layerIds.includes(layer.id)),
    governance?.manifests?.find(manifest => manifest.id === policy?.activeManifestId)]);
}
export function runApprovalScope(brain, run, provider, approvedLayerIds = []) {
  return JSON.stringify([run, provider, roomAuthorizationScope(brain, run.roomId), [...approvedLayerIds].sort()]);
}
export function activityRuns(brain, roomId, state = 'all') {
  return (brain.governance?.runs || []).filter(run => (!roomId || run.roomId === roomId) && (state === 'all' || run.state === state))
    .slice().sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

/** Uses only recorded IDs; adjacency is never interpreted as delegation or permission. */
export function activityNetwork(brain, roomId, state = 'all') {
  const runs = activityRuns(brain, roomId, state);
  const roomsWithRuns = new Set(runs.map(run => run.roomId));
  const relevantRooms = brain.rooms.filter(room => (!roomId || room.id === roomId) && (state === 'all' || roomsWithRuns.has(room.id)));
  const rooms = relevantRooms.slice(0, ACTIVITY_ROOM_LIMIT);
  const nodes = [], edges = [];
  const profiles = new Map((brain.workspace?.agents || []).map(agent => [agent.id, agent]));
  const tasks = new Map((brain.workspace?.tasks || []).map(task => [task.id, task]));
  let y = 0;
  for (const room of rooms) {
    const policy = brain.governance?.roomPolicies?.find(item => item.roomId === room.id);
    const roomRuns = runs.filter(run => run.roomId === room.id).slice(0, 3);
    const roomNode = `room:${room.id}`;
    const profile = policy?.agentId ? profiles.get(policy.agentId) : null;
    nodes.push({ id: roomNode, title: room.title, kind: 'room', detail: `${room.messages.length} recorded messages`, roomId: room.id, x: 0, y, width: 220 });
    const scope = brain.governance?.scopes?.find(item => item.roomId === room.id);
    nodes.push({ id: `scope:${room.id}`, title: 'Effective context', kind: 'context', detail: `${scope?.sourceIds.length ?? room.selectedSourceIds.length} visible sources · ${scope?.manifestStatus || 'no pinned manifest'}`, roomId: room.id, x: -320, y, width: 220 });
    edges.push({ source: `scope:${room.id}`, target: roomNode, label: 'effective reads', detail: 'Server-resolved context for this room. A visual edge does not grant access.' });
    if (profile) {
      nodes.push({ id: `profile:${room.id}`, title: profile.name, kind: 'profile', detail: 'Assigned profile · not a background worker', roomId: room.id, x: 320, y, width: 220 });
      edges.push({ source: roomNode, target: `profile:${room.id}`, label: 'assigned profile', detail: 'Explicit agentId in the stored room policy. This assignment alone does not execute a request.' });
    }
    if (policy?.taskId && tasks.has(policy.taskId)) {
      const task = tasks.get(policy.taskId);
      nodes.push({ id: `task:${room.id}`, title: task.title, kind: 'task', detail: `Human task status: ${task.status}`, roomId: room.id, x: 0, y: y + 180, width: 220 });
      edges.push({ source: `task:${room.id}`, target: roomNode, label: 'linked task', detail: 'Explicit taskId in the room policy. A task status is not execution evidence.' });
    }
    roomRuns.forEach((run, index) => {
      const runNode = `run:${run.id}`, row = y + index * 180;
      nodes.push({ id: runNode, title: run.prompt ? run.prompt.slice(0, 85) : 'Recorded request', kind: 'run', detail: run.state, status: runTone(run.state), runId: run.id, roomId: room.id, x: 650, y: row, width: 250 });
      const assignedMatches = profile && run.agentId === profile.id;
      edges.push({ source: assignedMatches ? `profile:${room.id}` : roomNode, target: runNode,
        label: assignedMatches ? 'recorded run' : 'room request', status: runTone(run.state), detail: `Stored run ${run.id}. ${assignedMatches ? 'The run records this assigned profile.' : 'No matching current profile attribution is inferred.'}` });
      if (run.providerId) {
        nodes.push({ id: `provider:${run.id}`, title: run.providerId, kind: 'provider', detail: run.model || 'Model not recorded', roomId: room.id, x: 1010, y: row, width: 220 });
        edges.push({ source: runNode, target: `provider:${run.id}`, label: run.state === 'awaiting-approval' ? 'requested provider' : 'recorded provider', status: runTone(run.state), detail: 'The provider recorded on this request; awaiting approval does not mean the provider has run.' });
      }
    });
    y += Math.max(2, roomRuns.length) * 180 + 90;
  }
  return { nodes, edges, omittedRooms: Math.max(0, relevantRooms.length - rooms.length) };
}
