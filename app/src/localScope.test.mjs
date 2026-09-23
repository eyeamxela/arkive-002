import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDraftModule } from './draftTestLoader.mjs';
const scope = loadDraftModule('./localScope.ts');
const draft = loadDraftModule('./draftStorage.ts');
const vault = loadDraftModule('./localVault.ts');
const access = { issuer: 'https://clerk.example', subject: 'owner-a', ownerIdentity: 'https://clerk.example|owner-a', workspaceId: 'workspace-a' };
const ownerScope = scope.workspaceStorageScope('https://example.convex.cloud', access);
const otherScope = scope.workspaceStorageScope('https://example.convex.cloud', { ...access, subject: 'owner-b', ownerIdentity: 'https://clerk.example|owner-b' });
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
test('verified storage namespaces separate owner, issuer, workspace, backend and fixture', () => {
  const names = [ownerScope, otherScope, scope.FIXTURE_STORAGE_SCOPE,
    scope.workspaceStorageScope('https://other.convex.cloud', access),
    scope.workspaceStorageScope('https://example.convex.cloud', { ...access, workspaceId: 'workspace-b' }),
    scope.workspaceStorageScope('https://example.convex.cloud', { ...access, issuer: 'https://other-clerk.example' })];
  assert.equal(new Set(names).size, names.length);
  for (const name of names) {
    assert.notEqual(scope.scopedDraftKey(name, draft.DRAFT_KEYS.rooms), draft.DRAFT_KEYS.rooms);
    assert.notEqual(scope.originalsDatabaseName(name), 'arkive-local-originals-v1');
  }
  assert.throws(() => scope.workspaceStorageScope('', access));
  assert.throws(() => scope.workspaceStorageScope('https://example.convex.cloud', { ...access, subject: '' }));
});
test('all draft kinds isolate accounts and fixtures, and leave legacy drafts untouched', () => {
  const disk = storage();
  for (const key of Object.values(draft.DRAFT_KEYS)) disk.setItem(key, 'legacy data remains');
  globalThis.window = { localStorage: disk };
  let session = scope.createLocalStorageSession(ownerScope);
  const { useLocalDraft } = loadDraftModule('./useLocalDraft.ts', {
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    './LocalScopeProvider': { useLocalScope: () => ({ session }) },
  });
  try {
    for (const [key, validate, value] of [
      [draft.DRAFT_KEYS.rooms, draft.validateRoomDrafts, { hermes: 'owner draft' }],
      [draft.DRAFT_KEYS.capture, draft.validateCaptureDraft, { ...draft.EMPTY_CAPTURE_DRAFT, note: 'owner note' }],
      [draft.DRAFT_KEYS.cartridge, draft.validateCartridgeDraft, { ...draft.emptyCartridgeDraft(), name: 'owner cartridge' }],
    ]) {
      session = scope.createLocalStorageSession(ownerScope);
      assert.equal(useLocalDraft(key, validate)[0], null);
      useLocalDraft(key, validate)[1](value);
      for (const namespace of [otherScope, scope.FIXTURE_STORAGE_SCOPE]) {
        session = scope.createLocalStorageSession(namespace);
        assert.equal(useLocalDraft(key, validate)[0], null);
      }
      session = scope.createLocalStorageSession(ownerScope);
      assert.deepEqual(useLocalDraft(key, validate)[0], value);
      assert.equal(disk.getItem(key), 'legacy data remains');
    }
  } finally { delete globalThis.window; }
});
test('stale async draft setter cannot clear either the new principal draft or old persisted draft', () => {
  const disk = storage(); globalThis.window = { localStorage: disk };
  let session = scope.createLocalStorageSession(ownerScope);
  const hook = loadDraftModule('./useLocalDraft.ts', {
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    './LocalScopeProvider': { useLocalScope: () => ({ session }) },
  }).useLocalDraft;
  try {
    const [, oldUpdate] = hook(draft.DRAFT_KEYS.rooms, draft.validateRoomDrafts);
    oldUpdate({ hermes: 'retain owner A' });
    scope.deactivateStorageSession(session);
    session = scope.createLocalStorageSession(otherScope);
    hook(draft.DRAFT_KEYS.rooms, draft.validateRoomDrafts)[1]({ hermes: 'retain owner B' });
    oldUpdate(null);
    assert.deepEqual(hook(draft.DRAFT_KEYS.rooms, draft.validateRoomDrafts)[0], { hermes: 'retain owner B' });
    session = scope.createLocalStorageSession(ownerScope);
    assert.deepEqual(hook(draft.DRAFT_KEYS.rooms, draft.validateRoomDrafts)[0], { hermes: 'retain owner A' });
  } finally { delete globalThis.window; }
});
test('original saves captured in an expired session reject before opening any database', async () => {
  const original = await vault.makeOriginal('bound.md', 'do not cross sessions');
  const session = scope.createLocalStorageSession(ownerScope);
  const pending = vault.saveOriginals([original], session);
  scope.deactivateStorageSession(session);
  await assert.rejects(pending, /session changed/);
  await assert.rejects(vault.listOriginals(session), /session changed/);
});
test('session revocation cancels registered active transactions and cannot change its scope', () => {
  const session = scope.createLocalStorageSession(ownerScope);
  let aborts = 0; session.onDeactivate.add(() => { aborts++; });
  scope.deactivateStorageSession(session);
  scope.deactivateStorageSession(session);
  assert.equal(aborts, 1);
  assert.equal(session.scope, ownerScope);
  assert.throws(() => scope.assertStorageSession(session), /session changed/);
});
test('IndexedDB connections and original read results are bound to the captured namespace', async () => {
  const opened = [];
  globalThis.indexedDB = {
    open(name) {
      opened.push(name);
      const request = { result: {
        close() {},
        transaction() {
          let aborted = false;
          const tx = {
            objectStore: () => ({ getAll: () => ({ result: [{ name, createdAt: 1 }] }) }),
            abort() { aborted = true; queueMicrotask(() => tx.onabort?.()); },
          };
          queueMicrotask(() => { if (!aborted) tx.oncomplete?.(); });
          return tx;
        },
      } };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  try {
    for (const namespace of [ownerScope, otherScope, scope.FIXTURE_STORAGE_SCOPE]) {
      const session = scope.createLocalStorageSession(namespace);
      const rows = await vault.listOriginals(session);
      assert.equal(rows[0].name, scope.originalsDatabaseName(namespace));
      scope.deactivateStorageSession(session);
    }
    assert.deepEqual(opened, [ownerScope, otherScope, scope.FIXTURE_STORAGE_SCOPE].map(scope.originalsDatabaseName));
    assert.equal(opened.includes('arkive-local-originals-v1'), false);
  } finally { delete globalThis.indexedDB; }
});
