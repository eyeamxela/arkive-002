/** Synthetic browser test: GitNexus discovery/export are mocked, Brain snapshot writes are real.
 * Never reads the machine's GitNexus registry or indexes a real repository. */
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createNodeServer } from '../../../personal-node/server.mjs';

const appDirectory = fileURLToPath(new URL('../../', import.meta.url));
const fixture = await mkdtemp(path.join(os.tmpdir(), 'arkive-code-import-browser-'));
const uiDirectory = path.join(fixture, 'ui');
const outputDirectory = path.join(appDirectory, '.personal-test');
const token = 'synthetic-code-import-owner-token-'.repeat(2);
const passphrase = 'Synthetic code import passphrase';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const playwright = await import(modulePath && path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath || 'playwright');
const repositories = ['synthetic-alpha', 'synthetic-beta', 'synthetic-sources'];
let server, browser, page, origin;
let listingMode = 'available';
let discoveryReads = 0;
const mockImports = [], browserWrites = [], errors = [], outbound = [], checks = [];
const expectedHttpErrors = new Set();
const check = label => { checks.push(label); console.log('PASS ' + label); };
const snapshot = repository => ({ format: 'arkive-code-graph', version: 1, repository, truncated: false,
  nodes: [{ id: 'file', label: 'entry.ts', type: 'File', filePath: 'src/entry.ts', community: 'Runtime' },
    { id: 'entry', label: 'start', type: 'Function', filePath: 'src/entry.ts', community: 'Runtime' },
    { id: 'check', label: 'checkPermission', type: 'Function', filePath: 'src/policy.ts', community: 'Policy' }],
  edges: [{ source: 'file', target: 'entry', type: 'CONTAINS' }, { source: 'entry', target: 'check', type: 'CALLS' }] });
async function api(route, method = 'GET', body, credential = token) {
  const response = await fetch(origin + route, { method, headers: { Authorization: `Bearer ${credential}`, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); assert.ok(response.ok, `${method} ${route}: ${JSON.stringify(value)}`); return value;
}
async function navigate(label, target = page) {
  const toggle = target.getByRole('button', { name: 'Toggle workspace navigation', exact: true });
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await target.getByRole('navigation', { name: 'Personal workspace', exact: true }).getByRole('button', { name: label, exact: true }).click();
}
async function connect(credential) {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  const target = await context.newPage(); target.setDefaultTimeout(10000);
  target.on('pageerror', error => errors.push(error.message));
  target.on('console', message => {
    if (message.type() !== 'error') return;
    const url = message.location().url;
    if (url && expectedHttpErrors.has(new URL(url).pathname) && /Failed to load resource/.test(message.text())) return;
    errors.push(message.text());
  });
  target.on('request', request => { if (['POST', 'PUT', 'DELETE'].includes(request.method())) browserWrites.push(new URL(request.url()).pathname); });
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) {
      if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
      outbound.push(url.origin); return route.abort();
    }
    // These two routes must never reach the real GitNexus registry or CLI.
    if (url.pathname === '/v1/gitnexus/repositories') {
      assert.equal(request.method(), 'GET'); discoveryReads++;
      if (listingMode === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Synthetic repository discovery unavailable. Import JSON or retry.', code: 'synthetic_discovery_unavailable' } }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repositories: listingMode === 'empty' ? [] : repositories.map(name => ({ name, indexedAt: '2026-10-11T12:00:00Z', nodes: 3, edges: 2, files: 2 })), skipped: listingMode === 'empty' ? 0 : 2 }) });
    }
    if (url.pathname === '/v1/gitnexus/import') {
      assert.equal(request.method(), 'POST');
      const body = request.postDataJSON(); assert.ok(repositories.includes(body.repository));
      mockImports.push(body.repository);
      // Use the actual authenticated backend for validation and encrypted Brain persistence.
      const object = await api('/v1/code-graphs', 'POST', { graph: snapshot(body.repository) });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(object) });
    }
    return route.continue();
  });
  await target.goto(origin + '/local.html');
  await target.getByLabel('Personal node URL').fill(origin); await target.getByLabel('Node access token').fill(credential);
  await target.getByRole('button', { name: 'Connect node →', exact: true }).click();
  await target.getByRole('navigation', { name: 'Personal workspace' }).waitFor();
  return target;
}
const graph = () => page.getByRole('region', { name: 'GitNexus code graph', exact: true });
const importer = () => page.getByRole('region', { name: 'Connect GitNexus repository', exact: true });
async function importRepository(name) {
  await importer().getByLabel('Indexed repository').selectOption(name);
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/gitnexus/import' && response.request().method() === 'POST');
  await importer().getByRole('button', { name: 'Import & open graph', exact: true }).click();
  const response = await responsePromise; assert.ok(response.ok(), await response.text());
  const object = await response.json();
  await page.locator('.pn-progress').waitFor({ state: 'hidden' });
  await graph().locator('.pn-codegraph-repository > strong').filter({ hasText: new RegExp(`^${name}$`) }).waitFor();
  assert.equal(await page.getByLabel('Code repository snapshot').inputValue(), object.id);
  assert.equal(await graph().locator('.pn-obsidian-canvas').getAttribute('data-node-count'), '3');
  return object;
}
async function openPicker() {
  await graph().getByRole('button', { name: 'Import / refresh repository', exact: true }).click();
  await importer().getByLabel('Indexed repository').waitFor();
}
async function openJson() {
  const details = importer().locator('details');
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  return importer().getByLabel('Arkive code-graph JSON', { exact: true });
}
async function noOverflow(width) {
  await page.setViewportSize({ width, height: 900 });
  const dimensions = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, JSON.stringify(dimensions));
}

try {
  await build({ root: appDirectory, configFile: false, plugins: [react()], logLevel: 'warn', build: { outDir: uiDirectory, emptyOutDir: true, rollupOptions: { input: path.join(appDirectory, 'local.html') } } });
  await mkdir(outputDirectory, { recursive: true });
  const reserve = net.createServer(); await new Promise((resolve, reject) => { reserve.once('error', reject); reserve.listen(0, '127.0.0.1', resolve); });
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve)); origin = `http://127.0.0.1:${port}`;
  server = await createNodeServer({ directory: path.join(fixture, 'brain'), host: '127.0.0.1', port, token, allowedOrigins: [origin], staticDirectory: uiDirectory, provider: {} }); await server.start();
  await api('/v1/unlock', 'POST', { create: true, name: 'Synthetic import Brain', passphrase });
  const member = await api('/v1/members', 'POST', { name: 'Synthetic import-restricted member' });
  browser = await playwright.chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  page = await connect(token); await navigate('Brain'); await page.getByRole('button', { name: 'GitNexus', exact: true }).click();
  await page.getByRole('button', { name: 'Code indexes', exact: true }).click();
  await importer().getByLabel('Indexed repository').waitFor();
  assert.match(await graph().innerText(), /A graph of your code/);
  assert.equal(await importer().getByLabel('Indexed repository').inputValue(), 'synthetic-alpha');
  assert.match(await importer().innerText(), /2 invalid or ambiguous registry entries were omitted/);
  assert.equal(discoveryReads, 1); assert.deepEqual(mockImports, []); assert.deepEqual(browserWrites, []);
  assert.equal((await api('/v1/brain')).objects.length, 0);
  await importer().getByLabel('Indexed repository').selectOption('synthetic-beta');
  await importer().getByRole('button', { name: 'Refresh repositories', exact: true }).click();
  await importer().getByLabel('Indexed repository').waitFor();
  assert.equal(await importer().getByLabel('Indexed repository').inputValue(), 'synthetic-beta');
  assert.equal(discoveryReads, 2); assert.deepEqual(mockImports, []); assert.equal((await api('/v1/brain')).objects.length, 0);
  check('empty Code view discovers synthetic mocked indexes read-only, preserves selection on refresh and never auto-imports');
  await page.screenshot({ path: path.join(outputDirectory, 'code-import-empty-desktop.png'), fullPage: true });
  await noOverflow(390); await page.screenshot({ path: path.join(outputDirectory, 'code-import-empty-mobile.png'), fullPage: true }); await noOverflow(320);
  check('empty-view repository picker fits 390px and 320px screens without horizontal overflow');
  await page.setViewportSize({ width: 1512, height: 1000 });
  const beta = await importRepository('synthetic-beta');
  assert.deepEqual(mockImports, ['synthetic-beta']);
  assert.equal((await api('/v1/brain')).objects.find(item => item.id === beta.id)?.kind, 'code_graph');
  check('explicit synthetic mocked GitNexus import writes a validated real Brain object and automatically opens its graph');
  await openPicker();
  const beforeSecond = (await api('/v1/brain')).objects.length;
  assert.equal(beforeSecond, 1); assert.equal(mockImports.length, 1);
  const alpha = await importRepository('synthetic-alpha');
  assert.notEqual(alpha.id, beta.id); assert.equal((await api('/v1/brain')).objects.length, 2);
  check('importing another repository selects the returned snapshot ID instead of leaving the previous graph active');
  await openPicker();
  let jsonInput = await openJson();
  let responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/code-graphs' && response.request().method() === 'POST');
  await jsonInput.setInputFiles({ name: 'synthetic-graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(snapshot('synthetic-json'))) });
  let response = await responsePromise; assert.ok(response.ok(), await response.text()); const jsonObject = await response.json();
  await graph().locator('.pn-codegraph-repository > strong').filter({ hasText: /^synthetic-json$/ }).waitFor();
  assert.equal(await page.getByLabel('Code repository snapshot').inputValue(), jsonObject.id);
  assert.equal((await api('/v1/brain')).objects.length, 3);
  check('JSON fallback imports through the real bounded backend and opens the returned graph');
  await openPicker(); jsonInput = await openJson();
  const writesBeforeInvalid = browserWrites.length;
  await jsonInput.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{ invalid JSON') });
  await page.locator('.pn-alert').filter({ hasText: 'Choose a valid Arkive code-graph JSON file.' }).waitFor();
  assert.equal(browserWrites.length, writesBeforeInvalid); assert.equal((await api('/v1/brain')).objects.length, 3);
  await jsonInput.setInputFiles({ name: 'oversize.json', mimeType: 'application/json', buffer: Buffer.alloc(1024 * 1024 + 1, ' ') });
  await page.locator('.pn-alert').filter({ hasText: 'Code graph exceeds 1 MiB.' }).waitFor();
  assert.equal(browserWrites.length, writesBeforeInvalid); assert.equal((await api('/v1/brain')).objects.length, 3);
  check('malformed and oversized JSON are rejected before transmission without modifying the current graph');
  expectedHttpErrors.add('/v1/code-graphs');
  responsePromise = page.waitForResponse(value => new URL(value.url()).pathname === '/v1/code-graphs' && value.request().method() === 'POST');
  await jsonInput.setInputFiles({ name: 'wrong-schema.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'not-a-code-graph' })) });
  response = await responsePromise; assert.equal(response.ok(), false);
  await page.locator('.pn-progress').waitFor({ state: 'hidden' });
  assert.equal((await api('/v1/brain')).objects.length, 3);
  assert.equal(await page.getByLabel('Code repository snapshot').inputValue(), jsonObject.id);
  check('invalid snapshot schema reaches real server validation, is rejected and preserves the selected graph');
  listingMode = 'error'; expectedHttpErrors.add('/v1/gitnexus/repositories');
  await navigate('Sources & sync');
  await importer().getByRole('alert').filter({ hasText: /Synthetic repository discovery unavailable/ }).waitFor();
  assert.equal(await importer().getByRole('button', { name: 'Import & open graph', exact: true }).count(), 0);
  assert.equal(await (await openJson()).isEnabled(), true);
  listingMode = 'empty';
  await importer().getByRole('button', { name: 'Refresh repositories', exact: true }).click();
  await importer().getByText('No registered repositories found.', { exact: false }).waitFor();
  assert.equal(await (await openJson()).isEnabled(), true);
  assert.equal(mockImports.length, 2); assert.equal((await api('/v1/brain')).objects.length, 3);
  check('discovery failure and empty registry explain the boundary while keeping JSON fallback available');
  listingMode = 'available';
  await importer().getByRole('button', { name: 'Refresh repositories', exact: true }).click();
  await importer().getByLabel('Indexed repository').waitFor();
  const sourceObject = await importRepository('synthetic-sources');
  assert.equal(await page.getByRole('navigation', { name: 'Personal workspace' }).getByRole('button', { name: 'Brain', exact: true }).getAttribute('aria-current'), 'page');
  assert.equal((await api('/v1/brain')).objects.find(item => item.id === sourceObject.id)?.kind, 'code_graph');
  check('Sources & sync import routes back to Brain and opens the newly imported graph even with existing snapshots');
  await openPicker(); await noOverflow(390); await noOverflow(320);
  await page.screenshot({ path: path.join(outputDirectory, 'code-import-loaded-mobile.png'), fullPage: true });
  check('loaded-graph import controls remain reachable on mobile without horizontal overflow');
  const beforeMemberDiscovery = discoveryReads;
  const memberPage = await connect(member.token); await navigate('Brain', memberPage);
  await memberPage.getByRole('button', { name: 'GitNexus', exact: true }).click();
  assert.equal(await memberPage.getByRole('button', { name: 'Code indexes', exact: true }).count(), 0);
  assert.equal(await memberPage.getByRole('region', { name: 'Connect GitNexus repository', exact: true }).count(), 0);
  assert.equal(await memberPage.getByRole('navigation', { name: 'Personal workspace' }).getByRole('button', { name: 'Sources & sync', exact: true }).count(), 0);
  assert.equal(discoveryReads, beforeMemberDiscovery); await memberPage.close();
  check('member sessions expose neither repository discovery nor owner-only import controls');
  const state = await api('/v1/brain');
  assert.equal(state.objects.length, 4); assert.equal(state.governance.runs.length, 0);
  assert.ok(state.rooms.every(room => room.messages.length === 0));
  assert.equal(browserWrites.some(route => /messages|runs|writebacks/.test(route)), false);
  assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  check('synthetic imports never run agents, execute repository code or make external browser requests');
  console.log(`Code import checks: ${checks.length} passed. GitNexus registry/exports MOCKED; Brain validation and writes REAL against a temporary synthetic vault. Screenshots: ${outputDirectory}`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(outputDirectory, 'code-import-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close(); await server?.close();
  if (fixture.startsWith(path.join(os.tmpdir(), 'arkive-code-import-browser-'))) await rm(fixture, { recursive: true, force: true });
}
