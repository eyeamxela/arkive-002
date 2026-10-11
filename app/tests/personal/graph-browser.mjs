/** Isolated graph interaction regression. No real folders, repos or providers are touched. */
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
const fixture = await mkdtemp(path.join(os.tmpdir(), 'arkive-graph-browser-'));
const uiDirectory = path.join(fixture, 'ui');
const outputDirectory = path.join(appDirectory, '.personal-test');
const ownerToken = 'synthetic-graph-browser-token-'.repeat(2);
const modulePath = process.env.PLAYWRIGHT_MODULE;
const playwright = await import(modulePath && path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath || 'playwright');
let server;
let browser;
const errors = [];
const checks = [];
const check = label => { checks.push(label); console.log(`PASS ${label}`); };

try {
  // Build into this test's temporary directory, not the shared release or smoke output.
  await build({ root: appDirectory, configFile: false, plugins: [react()], logLevel: 'warn',
    build: { outDir: uiDirectory, emptyOutDir: true, rollupOptions: { input: path.join(appDirectory, 'local.html') } } });
  await mkdir(outputDirectory, { recursive: true });
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  server = await createNodeServer({ directory: path.join(fixture, 'brain'), host: '127.0.0.1', port,
    token: ownerToken, allowedOrigins: [origin], staticDirectory: uiDirectory, provider: {} });
  await server.start();
  async function request(route, body) {
    const response = await fetch(`${origin}${route}`, { method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const value = await response.json();
    assert.ok(response.ok, `${route}: ${JSON.stringify(value)}`);
    return value;
  }
  await request('/v1/unlock', { passphrase: 'Synthetic graph browser passphrase', create: true, name: 'Graph test' });
  for (const [title, text] of [['Alpha', '[[Beta]]'], ['Beta', '[[Gamma]]'], ['Gamma', 'Terminal note'], ['Orphan', 'No relationships']]) {
    await request('/v1/objects', { title, text, kind: 'note' });
  }
  await request('/v1/code-graphs', { graph: {
    format: 'arkive-code-graph', version: 1, repository: 'synthetic-repository', truncated: false,
    nodes: [{ id: 'file', label: 'index.ts', type: 'File', filePath: 'src/index.ts', community: 'runtime' },
      { id: 'fn', label: 'start', type: 'Function', filePath: 'src/index.ts', community: 'runtime' }],
    edges: [{ source: 'file', target: 'fn', type: 'CONTAINS' }],
  } });
  browser = await playwright.chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  await page.goto(`${origin}/local.html`);
  await page.getByLabel('Personal node URL').fill(origin);
  await page.getByLabel('Owner token').fill(ownerToken);
  await page.getByRole('button', { name: 'Connect node →', exact: true }).click();
  const noteGraph = page.getByRole('region', { name: 'Obsidian-style note graph' });
  await noteGraph.waitFor();
  const nodes = noteGraph.locator('.pn-notegraph-point');
  assert.equal(await nodes.count(), 4);
  assert.equal(await noteGraph.locator('.pn-notegraph-links line').count(), 2);
  check('real note links appear; code snapshot is excluded from note graph');

  const alpha = () => noteGraph.getByRole('button', { name: 'Alpha, note, 1 connections', exact: true });
  await alpha().click();
  await page.locator('.pn-detail h2').filter({ hasText: /^Alpha$/ }).waitFor();
  assert.equal(await alpha().getAttribute('aria-pressed'), 'true');
  check('pointer click on an SVG node selects its source details');
  await noteGraph.getByRole('button', { name: 'Local · 1', exact: true }).click();
  assert.equal(await nodes.count(), 2);
  await noteGraph.getByRole('button', { name: 'Local · 2', exact: true }).click();
  assert.equal(await nodes.count(), 3);
  await noteGraph.getByRole('button', { name: 'Global', exact: true }).click();
  await noteGraph.getByLabel('Orphans').uncheck();
  assert.equal(await nodes.count(), 3);
  await noteGraph.getByLabel('Orphans').check();
  assert.equal(await nodes.count(), 4);
  check('one-hop, two-hop and orphan controls preserve actual relationships');

  await noteGraph.getByRole('button', { name: 'Beta, note, 2 connections', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.locator('.pn-detail h2').filter({ hasText: /^Beta$/ }).waitFor();
  check('keyboard focus and Enter select a note');
  const svg = noteGraph.locator('.pn-notegraph-viewport > svg');
  const transform = svg.locator(':scope > g');
  const initialTransform = await transform.getAttribute('transform');
  const viewportBox = await svg.boundingBox();
  await page.mouse.move(viewportBox.x + 15, viewportBox.y + 15);
  await page.mouse.down();
  await page.mouse.move(viewportBox.x + 65, viewportBox.y + 45, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(previous => document.querySelector('.pn-notegraph-viewport > svg > g')?.getAttribute('transform') !== previous, initialTransform);
  check('background drag pans the graph');
  await noteGraph.getByRole('button', { name: 'Reset graph pan and zoom' }).click();
  const beforeWheel = await transform.getAttribute('transform');
  await svg.hover();
  await page.mouse.wheel(0, -180);
  await page.waitForFunction(previous => document.querySelector('.pn-notegraph-viewport > svg > g')?.getAttribute('transform') !== previous, beforeWheel);
  check('wheel zoom changes the viewport without a passive-listener error');
  await noteGraph.getByRole('button', { name: 'Reset graph pan and zoom' }).click();
  assert.equal(await transform.getAttribute('transform'), 'translate(0 0) scale(1)');

  const beforeDrag = await alpha().getAttribute('transform');
  const nodeBox = await alpha().locator('.pn-notegraph-dot').boundingBox();
  await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(nodeBox.x + nodeBox.width / 2 + 40, nodeBox.y + nodeBox.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(previous => document.querySelector('[aria-label="Alpha, note, 1 connections"]')?.getAttribute('transform') !== previous, beforeDrag);
  assert.equal(await page.locator('.pn-detail h2').textContent(), 'Beta');
  check('node drag moves geometry without accidentally selecting the node');

  await page.getByRole('searchbox', { name: 'Search Brain objects' }).fill('Alpha');
  assert.equal(await nodes.count(), 1);
  assert.equal(await noteGraph.locator('.pn-notegraph-diagnostics').count(), 0);
  await page.getByRole('searchbox', { name: 'Search Brain objects' }).fill('');
  check('search filters the display after full-scope link resolution');
  await page.screenshot({ path: path.join(outputDirectory, 'graph-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'GitNexus', exact: true }).click();
  const codeGraph = page.getByRole('region', { name: 'GitNexus code graph' });
  assert.equal(await codeGraph.locator('.pn-notegraph-point').count(), 2);
  await codeGraph.getByRole('button', { name: 'start, Function, 1 connections', exact: true }).click();
  await codeGraph.locator('[aria-label="Selected code symbol"]').waitFor();
  assert.match(await codeGraph.locator('.pn-codegraph-detail').textContent(), /src\/index\.ts/);
  assert.match(await codeGraph.locator('.pn-codegraph-detail').textContent(), /← CONTAINS/);
  const filePath = codeGraph.locator('.pn-codegraph-detail > p').filter({ hasText: /^src\/index\.ts$/ });
  await filePath.scrollIntoViewIfNeeded();
  const codeBounds = await page.locator('.pn-brain-view').boundingBox();
  const fileBounds = await filePath.boundingBox();
  assert.ok(fileBounds.y >= codeBounds.y && fileBounds.y + fileBounds.height <= codeBounds.y + codeBounds.height,
    'Selected source path must be inside the visible scroll viewport, not merely in the DOM');
  const footer = await codeGraph.locator('.pn-notegraph-foot').boundingBox();
  const legend = await codeGraph.locator('.pn-codegraph-legend').boundingBox();
  assert.ok(legend.y >= footer.y + footer.height - 1, 'Code legend must not overlap the graph footer');
  check('GitNexus node inspection preserves source file, edge type and direction');
  await page.screenshot({ path: path.join(outputDirectory, 'graph-code.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Obsidian', exact: true }).click();
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, JSON.stringify(dimensions));
  await page.screenshot({ path: path.join(outputDirectory, 'graph-mobile.png'), fullPage: true });
  check('mobile graph has no page-level horizontal overflow');
  assert.deepEqual(errors, []);
  check('no browser page or console errors');
  console.log(`Graph interaction checks: ${checks.length} passed. Screenshots: ${outputDirectory}`);
} finally {
  await browser?.close();
  await server?.close();
  if (fixture.startsWith(path.join(os.tmpdir(), 'arkive-graph-browser-'))) await rm(fixture, { recursive: true, force: true });
}
