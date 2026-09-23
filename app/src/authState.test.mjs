import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDraftModule } from './draftTestLoader.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { readAppConfig, authGateState } = loadDraftModule('./authState.ts');
const exampleKey = 'pk_test_' + btoa('example.clerk.accounts.dev$');

test('missing or invalid service config fails closed; no fixture flag is an auth bypass', () => {
  assert.equal(readAppConfig({}).ok, false);
  assert.equal(readAppConfig({ VITE_DEMO: 'true', VITE_AUTH_BYPASS: 'true' }).ok, false);
  for (const value of ['http://example.com', 'javascript:alert(1)', 'https://secret@example.com', 'https://example.com/not-a-deployment', 'https://example.com?token=x']) {
    assert.equal(readAppConfig({ VITE_CONVEX_URL: value, VITE_CLERK_PUBLISHABLE_KEY: exampleKey }).ok, false);
  }
  assert.equal(readAppConfig({ VITE_CONVEX_URL: 'https://example.convex.cloud', VITE_CLERK_PUBLISHABLE_KEY: 'sk_test_secret' }).ok, false);
  assert.equal(readAppConfig({ VITE_CONVEX_URL: 'https://example.convex.cloud', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_example' }).ok, false);
  assert.equal(readAppConfig({ VITE_CONVEX_URL: 'https://example.convex.cloud', VITE_CLERK_PUBLISHABLE_KEY: exampleKey }).ok, true);
  assert.equal(readAppConfig({ VITE_CONVEX_URL: 'https://example.convex.cloud/', VITE_CLERK_PUBLISHABLE_KEY: exampleKey }).config.convexUrl, 'https://example.convex.cloud');
});

const verified = { clerkLoaded: true, signedIn: true, userId: 'owner-a', convexLoading: false, convexAuthenticated: true, access: { subject: 'owner-a', initialized: true } };
test('private UI requires loaded identity, verified Convex auth and matching server owner', () => {
  assert.equal(authGateState({ ...verified, clerkLoaded: false }), 'loading');
  assert.equal(authGateState({ ...verified, signedIn: false }), 'signed-out');
  assert.equal(authGateState({ ...verified, userId: null }), 'signed-out');
  assert.equal(authGateState({ ...verified, convexLoading: true }), 'verifying');
  assert.equal(authGateState({ ...verified, convexAuthenticated: false }), 'verifying');
  assert.equal(authGateState({ ...verified, access: undefined }), 'loading');
  assert.equal(authGateState({ ...verified, userId: 'owner-b' }), 'denied');
  assert.equal(authGateState({ ...verified, access: { subject: 'owner-a', initialized: false } }), 'initialize');
  assert.equal(authGateState(verified), 'ready');
});

test('previous query result cannot reopen private UI on signout, principal switch or token loss', () => {
  assert.notEqual(authGateState({ ...verified, signedIn: false }), 'ready');
  assert.notEqual(authGateState({ ...verified, userId: 'intruder' }), 'ready');
  assert.notEqual(authGateState({ ...verified, convexAuthenticated: false }), 'ready');
});

test('chat safety copy distinguishes fixture identity from a verified owner without claiming live execution', () => {
  const { FIXTURE_STORAGE_SCOPE } = loadDraftModule('./localScope.ts');
  let currentScope = FIXTURE_STORAGE_SCOPE;
  const { Tray } = loadDraftModule('./Tray.tsx', {
    '../convex/_generated/api': { api: {} },
    './hooks': { useWorkspace() { throw new Error('Presentation test must not query a backend'); } },
    './LocalScopeProvider': { useLocalScope: () => ({ session: { scope: currentScope } }) },
  });
  const sm = { ctxTok: 0, usedPct: 0, usedBand: 'normal', domTier: 'canon', domPct: 0, unrevN: 0, restrN: 0, apprN: 0, driftedN: 0, integPct: 0, counts: {}, scope: [] };
  const fixture = renderToStaticMarkup(createElement(Tray, { sm, onOpenMetric() {} }));
  assert.match(fixture, /fixture only/);
  assert.match(fixture, /synthetic identity/);
  assert.doesNotMatch(fixture, /verified owner workspace/);
  currentScope = 'verified-owner-test-scope';
  const owner = renderToStaticMarkup(createElement(Tray, { sm, onOpenMetric() {} }));
  assert.match(owner, /owner only/);
  assert.match(owner, /verified owner workspace/);
  for (const view of [fixture, owner]) {
    assert.match(view, /no live agent execution/);
    assert.doesNotMatch(view, /authentication pending|not enforced/);
  }
});
