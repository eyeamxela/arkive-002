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
let page;
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
  const notes = new Map();
  for (const [title, text] of [['Alpha', '[[Beta]]'], ['Beta', '[[Gamma]]'], ['Gamma', 'Terminal note'], ['Orphan', 'No relationships']]) {
    notes.set(title, await request('/v1/objects', { title, text, kind: 'note' }));
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
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  await page.goto(`${origin}/local.html`);
  await page.getByLabel('Personal node URL').fill(origin);
  await page.getByLabel('Node access token').fill(ownerToken);
  await page.getByRole('button', { name: 'Connect node →', exact: true }).click();
  await page.getByRole('navigation', { name: 'Personal workspace' }).getByRole('button', { name: 'Brain', exact: true }).click();
  const noteGraph = page.getByRole('region', { name: 'Obsidian-style note graph' });
  await noteGraph.waitFor();
  const renderer = noteGraph.locator('.pn-obsidian-canvas');
  const count = async expected => page.waitForFunction(value => document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-node-count') === String(value), expected);
  await count(4);
  assert.equal(await renderer.getAttribute('data-edge-count'), '2');
  check('real note links appear; code snapshot is excluded from note graph');

  const selectNote = async title => {
    const picker = noteGraph.locator('.pn-obsidian-note-picker');
    if (await picker.getAttribute('open') === null) await picker.locator('summary').click();
    await noteGraph.getByLabel('Find graph note', { exact: true }).fill(title);
    await noteGraph.getByLabel('Graph note', { exact: true }).selectOption(notes.get(title).id);
    await noteGraph.getByRole('button', { name: 'Open selected graph note', exact: true }).click();
    await page.getByRole('region', { name: 'Source details', exact: true }).getByRole('heading', { name: title, exact: true }).waitFor();
    await picker.locator('summary').click();
    await page.waitForFunction(id => document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-selected-node-id') === id, notes.get(title).id);
  };
  await selectNote('Alpha');
  await noteGraph.getByRole('button', { name: 'Pause graph layout', exact: true }).click();
  await noteGraph.getByRole('button', { name: 'Reset graph pan and zoom', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const alphaPoint = { x: Number(await renderer.getAttribute('data-selected-node-x')), y: Number(await renderer.getAttribute('data-selected-node-y')) };
  await selectNote('Beta');
  const canvas = noteGraph.getByRole('img', { name: 'Note connections', exact: true });
  await canvas.click({ position: alphaPoint });
  await page.getByRole('region', { name: 'Source details', exact: true }).getByRole('heading', { name: 'Alpha', exact: true }).waitFor();
  check('pointer hit-testing on a Canvas2D note opens its real source details');
  await noteGraph.getByRole('button', { name: 'Local · 1', exact: true }).click();
  await count(2);
  await noteGraph.getByRole('button', { name: 'Local · 2', exact: true }).click();
  await count(3);
  await noteGraph.getByRole('button', { name: 'Global', exact: true }).click();
  await noteGraph.getByRole('button', { name: 'Graph settings', exact: true }).click();
  await noteGraph.getByLabel('Orphans').uncheck();
  await count(3);
  await noteGraph.getByLabel('Orphans').check();
  await count(4);
  await noteGraph.getByRole('button', { name: 'Graph settings', exact: true }).click();
  check('one-hop, two-hop and orphan controls preserve actual relationships');

  await noteGraph.locator('.pn-obsidian-note-picker summary').click();
  await noteGraph.getByLabel('Find graph note', { exact: true }).fill('Beta');
  await noteGraph.getByLabel('Graph note', { exact: true }).selectOption(notes.get('Beta').id);
  await noteGraph.getByRole('button', { name: 'Open selected graph note', exact: true }).press('Enter');
  await page.getByRole('region', { name: 'Source details', exact: true }).getByRole('heading', { name: 'Beta', exact: true }).waitFor();
  await noteGraph.locator('.pn-obsidian-note-picker summary').click();
  check('accessible graph picker and Enter select a note without per-node DOM rendering');
  const initialX = await renderer.getAttribute('data-camera-x');
  const viewportBox = await canvas.boundingBox();
  await page.mouse.move(viewportBox.x + 15, viewportBox.y + 15);
  await page.mouse.down();
  await page.mouse.move(viewportBox.x + 65, viewportBox.y + 45, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(previous => document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-camera-x') !== previous, initialX);
  check('background drag pans the graph');
  await noteGraph.getByRole('button', { name: 'Reset graph pan and zoom' }).click();
  const beforeWheel = Number(await renderer.getAttribute('data-camera-scale'));
  await canvas.hover();
  await page.mouse.wheel(0, -180);
  await page.waitForFunction(previous => Number(document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-camera-scale')) > previous, beforeWheel);
  check('wheel zoom changes the viewport without a passive-listener error');
  await noteGraph.getByRole('button', { name: 'Reset graph pan and zoom' }).click();
  assert.ok(Number(await renderer.getAttribute('data-camera-scale')) > 0);
  await selectNote('Alpha');
  const beforeDrag = Number(await renderer.getAttribute('data-selected-world-x'));
  const selectedX = Number(await renderer.getAttribute('data-selected-node-x'));
  const selectedY = Number(await renderer.getAttribute('data-selected-node-y'));
  const nodeBox = await canvas.boundingBox();
  await page.mouse.move(nodeBox.x + selectedX, nodeBox.y + selectedY);
  await page.mouse.down();
  await page.mouse.move(nodeBox.x + selectedX + 40, nodeBox.y + selectedY + 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(previous => Number(document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-selected-world-x')) !== previous, beforeDrag);
  assert.equal(await renderer.getAttribute('data-selected-node-id'), notes.get('Alpha').id);
  check('node drag changes Canvas2D geometry while preserving the selected source');

  await noteGraph.getByRole('button', { name: 'Graph settings', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search Brain objects' }).fill('Alpha');
  await count(1);
  assert.equal(await noteGraph.locator('.pn-notegraph-diagnostics').count(), 0);
  await page.getByRole('searchbox', { name: 'Search Brain objects' }).fill('');
  await noteGraph.getByRole('button', { name: 'Graph settings', exact: true }).click();
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
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(outputDirectory, 'graph-failure.png'), fullPage: false }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  if (fixture.startsWith(path.join(os.tmpdir(), 'arkive-graph-browser-'))) await rm(fixture, { recursive: true, force: true });
}
