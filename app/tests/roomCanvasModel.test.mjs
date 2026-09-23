import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// These exercise the actual room projection hook with isolated hook fixtures.
// They verify model wiring, not React rendering or hosted authorization.
const source = fileURLToPath(new URL('../src/RoomCanvasModel.ts', import.meta.url));
const mockedImports = new Set(['react', 'convex/react', '../convex/_generated/api', './RoomSession', './hooks', 'canvas-model-test-harness']);
const bundle = await build({
  stdin: { contents: `export { useRoomCanvasModel } from ${JSON.stringify(source)}; export { configureHarness } from 'canvas-model-test-harness';`, resolveDir: fileURLToPath(new URL('..', import.meta.url)) },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'isolated-room-hooks', setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => mockedImports.has(args.path) ? { path: 'hooks', namespace: 'canvas-model-fixture' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'canvas-model-fixture' }, () => ({ contents: `
      let active;
      export function configureHarness(harness) { active = harness; }
      export function useState(...args) { return active.useState(...args); }
      export function useRef(...args) { return active.useRef(...args); }
      export function useQuery(...args) { return active.useQuery(...args); }
      export function useMutation(...args) { return active.useMutation(...args); }
      export function useRoomField(...args) { return active.useRoomField(...args); }
      export function useWorkspace(...args) { return active.useWorkspace(...args); }
      const refs = (namespace) => new Proxy({}, { get: (_, name) => namespace + '.' + String(name) });
      export const api = { panels: refs('panels'), ops: refs('ops') };
    `, loader: 'js' }));
  } }],
});
const { useRoomCanvasModel, configureHarness } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

function fixture() {
  const businessSelection = new Set(['business-doc']);
  const researchSelection = new Set(['research-doc']);
  const roomFields = {
    business: { deny: true, selection: businessSelection, manifest: 'selected-business', ctxOverrides: { v1: false, v2: true }, ctxLocal: [{ version: 'local-business', on: true, tokens: 0.3 }] },
    research: { deny: false, selection: researchSelection, manifest: null, ctxOverrides: {}, ctxLocal: [] },
  };
  const documents = {
    business: [
      { title: 'Business canon', tier: 'canon', alwaysLoad: true, hash: 'business-canon' },
      { title: 'Optional canon', tier: 'canon', alwaysLoad: false, hash: 'business-optional' },
      { title: 'Working note', tier: 'working', alwaysLoad: false, hash: 'business-working' },
    ],
    research: [{ title: 'Research note', tier: 'knowledge', alwaysLoad: false, hash: 'research-note' }],
  };
  const workspaces = Object.fromEntries(Object.entries(documents).map(([room, docs]) => [room, { context: { documents: docs, scopeLabel: room } }]));
  workspaces.business.context.manifestId = 'selected-business';
  const runs = [
    { _id: 'research-running-id', key: 'research-running', agentKey: 'nezu', state: 'running', saw: { manifestId: 'research-manifest', docHashes: ['unrelated-hash'] } },
    { _id: 'business-waiting-id', key: 'business-waiting', agentKey: 'hermes', state: 'waiting', saw: { manifestId: 'business-manifest', docHashes: ['business-canon'] } },
    { _id: 'business-running-id', key: 'business-running', agentKey: 'hermes', state: 'running', saw: { manifestId: 'business-manifest', docHashes: ['business-canon'] } },
    { _id: 'research-waiting-id', key: 'research-waiting', agentKey: 'nezu', state: 'waiting', saw: { manifestId: 'research-manifest', docHashes: ['research-note'] } },
    { _id: 'shared-no-manifest-id', key: 'shared-no-manifest', agentKey: 'hermes', state: 'waiting', saw: { docHashes: [] } },
    { _id: 'unresolved-manifest-id', key: 'unresolved-manifest', agentKey: 'hermes', state: 'running', saw: { manifestId: 'missing-manifest', docHashes: [] } },
  ];
  const queries = {
    'panels.rooms': [{ key: 'business', activeManifestId: 'business-manifest' }, { key: 'research', activeManifestId: 'research-manifest' }],
    'panels.manifests': [{ _id: 'business-manifest', key: 'business-v1', room: 'business' }, { _id: 'research-manifest', key: 'research-v1', room: 'research' }, { _id: 'selected-business', key: 'selected-v2', room: 'business' }],
    'panels.contextSummaries': ({ room }) => room === 'business' ? [{ version: 'v1', on: true, tokens: 1 }, { version: 'v2', on: false, tokens: 2 }] : [{ version: 'research-v1', on: true, tokens: 3 }],
    'panels.agents': [{ key: 'hermes', name: 'Hermes', paused: false }, { key: 'nezu', name: 'Nezu', paused: true }],
    'panels.runs': runs,
    'panels.grants': [
      { _id: 'business-revoked', runId: 'business-running-id', revokedAt: 123, objectIds: ['old'] },
      { _id: 'business-waiting-grant', runId: 'business-waiting-id', objectIds: ['waiting-only'] },
      { _id: 'business-active', runId: 'business-running-id', objectIds: ['business-doc'] },
      { _id: 'research-active', runId: 'research-running-id', objectIds: ['research-doc'] },
    ],
    'panels.skills': [
      { key: 'common', on: true, scope: 'all' },
      { key: 'business-skill', on: true, scope: 'hermes' },
      { key: 'research-skill', on: true, scope: 'nezu' },
      { key: 'disabled-common', on: false, scope: 'all' },
      { key: 'other-agent', on: true, scope: 'other' },
    ],
    'panels.cartridges': [{ name: 'Installed', rel: 'installed' }, { name: 'Temporary update', rel: 'temp', updatePending: '2' }, { name: 'Available', rel: 'available' }],
    'panels.auditEvents': [{ kind: 'deny' }, { kind: 'approve' }, { kind: 'deny' }],
    'panels.tierPolicy': { inbox: 'exclude' },
  };
  const workspaceCalls = [], queryCalls = [], mutationCalls = [], fieldWrites = [];
  const stateByRoom = new Map();
  const refsByRoom = new Map();
  let activeRoom, stateCursor = 0, refCursor = 0;
  const harness = {
    mutationError: null,
    mutationDelay: null,
    useState(initial) {
      const state = stateByRoom.get(activeRoom);
      const index = stateCursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
    },
    useRef(initial) {
      const refs = refsByRoom.get(activeRoom);
      const index = refCursor++;
      return refs[index] ??= { current: initial };
    },
    useQuery(ref, args) {
      queryCalls.push({ ref, args });
      const data = queries[ref];
      return typeof data === 'function' ? data(args) : data;
    },
    useMutation(ref) {
      return async (args) => {
        mutationCalls.push({ ref, args });
        if (harness.mutationDelay) await harness.mutationDelay;
        if (harness.mutationError) throw harness.mutationError;
      };
    },
    useRoomField(room, field, initial) {
      const fields = roomFields[room] ??= {};
      if (!(field in fields)) fields[field] = initial;
      return [fields[field], (next) => { fields[field] = next; fieldWrites.push({ room, field, value: next }); }];
    },
    useWorkspace(...args) { workspaceCalls.push(args); return workspaces[args[0]]; },
  };
  function render(room) {
    activeRoom = room;
    stateCursor = 0;
    refCursor = 0;
    if (!stateByRoom.has(room)) stateByRoom.set(room, []);
    if (!refsByRoom.has(room)) refsByRoom.set(room, []);
    configureHarness(harness);
    return useRoomCanvasModel(room);
  }
  return { render, harness, queries, roomFields, workspaces, workspaceCalls, queryCalls, mutationCalls, fieldWrites, stateByRoom };
}

test('room model passes room-specific scope inputs unchanged and keeps context projections separate', () => {
  const f = fixture();
  const business = f.render('business');
  const research = f.render('research');
  assert.deepEqual(f.workspaceCalls.map(([room, deny, , manifest]) => [room, deny, manifest]), [['business', true, 'selected-business'], ['research', false, null]]);
  assert.strictEqual(f.workspaceCalls[0][2], f.roomFields.business.selection);
  assert.strictEqual(f.workspaceCalls[1][2], f.roomFields.research.selection);
  assert.strictEqual(business.workspace, f.workspaces.business);
  assert.strictEqual(research.scopedDocs, f.workspaces.research.context.documents);
  assert.deepEqual(business.canon.map((doc) => doc.hash), ['business-canon']);
  assert.deepEqual(business.scopedTierCounts, [['canon', 2], ['working', 1]]);
  assert.equal(business.manifest.key, 'selected-v2');
  assert.equal(research.manifest, undefined, 'explicit selection must not display the unrelated active room pointer');
  assert.deepEqual(business.ctxOn.map((item) => item.version), ['v2', 'local-business']);
  assert.deepEqual(business.context.map((item) => [item.version, item.on]), [['v1', true], ['v2', false]]);
  assert.deepEqual(research.ctxOn.map((item) => item.version), ['research-v1']);
  assert.deepEqual(f.queryCalls.filter(({ ref }) => ref === 'panels.contextSummaries').map(({ args }) => args), [{ room: 'business' }, { room: 'research' }]);
  business.setContextOpen(true);
  assert.deepEqual(f.fieldWrites, [{ room: 'business', field: 'ctxOpen', value: true }]);
  assert.equal(f.roomFields.research.ctxOpen, false);
});

test('runs, current agent, unrevoked grants and enabled skills are scoped to each room projection', () => {
  const f = fixture();
  const business = f.render('business');
  const research = f.render('research');
  assert.deepEqual(business.roomRuns.map((run) => run.key), ['business-waiting', 'business-running']);
  assert.deepEqual(research.roomRuns.map((run) => run.key), ['research-running', 'research-waiting']);
  assert.equal(business.currentRun.key, 'business-running');
  assert.equal(research.currentRun.key, 'research-running');
  assert.equal(business.agentKey, 'hermes');
  assert.equal(research.agentKey, 'nezu');
  assert.equal(business.agent.name, 'Hermes');
  assert.equal(research.agent.name, 'Nezu');
  assert.equal(business.currentGrant._id, 'business-active');
  assert.equal(research.currentGrant._id, 'research-active');
  assert.deepEqual(business.roomSkills.map((skill) => skill.key), ['common', 'business-skill']);
  assert.deepEqual(research.roomSkills.map((skill) => skill.key), ['common', 'research-skill']);
  assert.equal(business.runningReadsScope, true);
  assert.equal(business.runningScopeNote, 'Overlapping pinned references by content hash · not proof of current reads');
  assert.equal(research.runningReadsScope, false);
  assert.deepEqual(business.mounted.map((pack) => pack.name), ['Installed', 'Temporary update']);
  assert.equal(business.latestPack.name, 'Temporary update');
  assert.equal(business.denied, 2);
});

test('a no-manifest run belongs only to its agent DM, not shared rooms or another agent DM', () => {
  const f = fixture();
  const business = f.render('business');
  const hermesDm = f.render('dm:hermes');
  const nezuDm = f.render('dm:nezu');
  assert.equal(business.roomRuns.some((run) => run.key === 'shared-no-manifest'), false);
  assert.deepEqual(hermesDm.roomRuns.map((run) => run.key), ['shared-no-manifest']);
  assert.equal(hermesDm.waiting._id, 'shared-no-manifest-id');
  assert.equal(hermesDm.agentKey, 'hermes');
  assert.deepEqual(nezuDm.roomRuns, []);
  assert.equal(nezuDm.agentKey, 'nezu');
  assert.equal(nezuDm.currentGrant, undefined);
});

test('approval targets each exact waiting run even when a different run is current', async () => {
  const f = fixture();
  const business = f.render('business');
  const research = f.render('research');
  await business.approveWaitingRun();
  await research.approveWaitingRun();
  assert.deepEqual(f.mutationCalls, [
    { ref: 'ops.approvalDecide', args: { approve: true, runId: 'business-waiting-id' } },
    { ref: 'ops.approvalDecide', args: { approve: true, runId: 'research-waiting-id' } },
  ]);
  assert.equal(f.render('business').approvalPending, false);
  assert.equal(f.render('research').approvalError, null);
});

test('approval pending, missing-wait and failure paths remain local model state', async () => {
  const f = fixture();
  f.render('business');
  f.stateByRoom.get('business')[0] = true;
  await f.render('business').approveWaitingRun();
  await f.render('dm:nezu').approveWaitingRun();
  assert.deepEqual(f.mutationCalls, []);
  f.stateByRoom.get('business')[0] = false;
  f.harness.mutationError = new Error('Fixture approval rejected');
  await f.render('business').approveWaitingRun();
  const failed = f.render('business');
  assert.equal(failed.approvalPending, false);
  assert.equal(failed.approvalError, 'Fixture approval rejected');
  assert.equal(f.render('research').approvalError, null);
});

test('pause toggle sends the selected agent key and inverse state, and missing agents are a no-op', async () => {
  const f = fixture();
  await f.render('business').toggleAgentPaused();
  await f.render('research').toggleAgentPaused();
  await f.render('dm:missing-agent').toggleAgentPaused();
  assert.deepEqual(f.mutationCalls, [
    { ref: 'ops.agentSetPaused', args: { key: 'hermes', paused: true } },
    { ref: 'ops.agentSetPaused', args: { key: 'nezu', paused: false } },
  ]);
});

test('pause failure is shown only on its room and successful retry clears the error', async () => {
  const f = fixture();
  f.harness.mutationError = new Error('Fixture pause rejected');
  await f.render('business').toggleAgentPaused();
  assert.equal(f.render('business').pauseError, 'Fixture pause rejected');
  assert.equal(f.render('business').pausePending, false);
  assert.equal(f.render('business').agent.paused, false, 'failure must not claim a successful pause');
  assert.equal(f.render('research').pauseError, null);
  f.harness.mutationError = null;
  await f.render('business').toggleAgentPaused();
  assert.equal(f.render('business').pauseError, null);
  assert.equal(f.render('business').pausePending, false);
});

test('pause pending blocks repeated calls until the original mutation completes', async () => {
  const f = fixture();
  let release;
  f.harness.mutationDelay = new Promise((resolve) => { release = resolve; });
  const operation = f.render('business').toggleAgentPaused();
  assert.equal(f.render('business').pausePending, true);
  await f.render('business').toggleAgentPaused();
  assert.equal(f.mutationCalls.length, 1);
  release();
  await operation;
  assert.equal(f.render('business').pausePending, false);
});

test('unresolved query data produces a safe empty projection without invented actions', async () => {
  const f = fixture();
  for (const key of Object.keys(f.queries)) f.queries[key] = undefined;
  const model = f.render('dm:unknown');
  assert.equal(model.room, undefined);
  assert.equal(model.workspace, undefined);
  assert.deepEqual(model.scopedDocs, []);
  assert.deepEqual(model.roomRuns, []);
  assert.deepEqual(model.context, []);
  assert.equal(model.runningReadsScope, false);
  assert.equal(model.agentKey, 'unknown');
  await model.approveWaitingRun();
  await model.toggleAgentPaused();
  assert.deepEqual(f.mutationCalls, []);
});

test('room projections preserve default null versus deliberately empty source selection', () => {
  const f = fixture();
  f.roomFields.business.selection = new Set();
  f.render('business');
  f.render('dm:new-room');
  assert.equal(f.workspaceCalls[0][2].size, 0);
  assert.equal(f.workspaceCalls[1][2], null);
});

test('revoked manifest context keeps its label but displays no source references', () => {
  const f = fixture();
  f.queries['panels.manifests'][2].state = 'revoked';
  f.workspaces.business.context.documents = [];
  f.workspaces.business.contextError = 'Manifest is revoked';
  const model = f.render('business');
  assert.equal(model.manifest.state, 'revoked');
  assert.deepEqual(model.scopedDocs, []);
  assert.equal(model.workspace.contextError, 'Manifest is revoked');
});

test('actual workspace query serializes empty selection without reopening the default scope', async () => {
  const hookSource = fileURLToPath(new URL('../src/hooks.ts', import.meta.url));
  const result = await build({
    entryPoints: [hookSource], bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'workspace-query-fixture', setup(build) {
      build.onResolve({ filter: /^(convex\/react|\.\.\/convex\/_generated\/api)$/ }, () => ({ path: 'fixture', namespace: 'workspace-hook-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'workspace-hook-fixture' }, () => ({ contents: `
        export const api = {workspace:{get:'workspace.get'},messages:{list:'messages.list'},documents:{list:'documents.list'}};
        export function useQuery(ref, args) { return {ref,args}; }
      ` }));
    } }],
  });
  const { useWorkspace } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
  assert.equal(useWorkspace('room-a', true, null).args.selectionIds, undefined);
  assert.deepEqual(useWorkspace('room-a', true, new Set()).args.selectionIds, []);
  assert.deepEqual(useWorkspace('room-a', true, new Set(['doc-1']), 'manifest-1').args, { room: 'room-a', deny: true, selectionIds: ['doc-1'], manifestId: 'manifest-1' });
});
