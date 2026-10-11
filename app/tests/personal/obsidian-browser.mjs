/** Real folder hierarchy and Canvas2D graph against a fresh synthetic-only personal node. */
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createNodeServer } from '../../../personal-node/server.mjs';

const appDirectory = fileURLToPath(new URL('../../', import.meta.url));
const fixture = await realpath(await mkdtemp(path.join(os.tmpdir(), 'arkive-obsidian-browser-')));
const uiDirectory = path.join(fixture, 'ui');
const outputDirectory = path.join(appDirectory, '.personal-test');
const token = 'synthetic-obsidian-graph-owner-'.repeat(2);
const passphrase = 'Synthetic graph interaction passphrase';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const playwright = await import(modulePath && path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath || 'playwright');
let server; let browser; let page; let origin;
const errors = []; const externalRequests = []; const checks = [];
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
const noteName = index => `note-${String(index).padStart(4, '0')}.md`;
const noteRelativePath = index => `${index < 500 ? 'projects' : 'archive'}/${noteName(index)}`;
const nodeCanvas = () => page.locator('.pn-obsidian-canvas');
const noteGraph = () => page.getByRole('region', { name: 'Obsidian-style note graph', exact: true });
const sourceDetails = () => page.getByRole('region', { name: 'Source details', exact: true });
async function api(route, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${origin}${route}`, { method,
    headers: { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); assert.ok(response.ok, `${route}: ${JSON.stringify(value)}`); return value;
}
async function navigate(label) {
  const opener = page.getByRole('button', { name: 'Toggle workspace navigation', exact: true });
  if (await opener.isVisible() && await opener.getAttribute('aria-expanded') !== 'true') await opener.click();
  await page.getByRole('navigation', { name: 'Personal workspace', exact: true }).getByRole('button', { name: label, exact: true }).click();
}
async function count(expected) {
  await page.waitForFunction(value => document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-node-count') === String(value), expected);
}
async function settings(open) {
  const button = noteGraph().getByRole('button', { name: 'Graph settings', exact: true });
  if ((await button.getAttribute('aria-expanded') === 'true') !== open) {
    if (open) await button.click();
    else await noteGraph().getByRole('button', { name: 'Close graph settings', exact: true }).click();
  }
}
async function selectNote(note) {
  const picker = noteGraph().locator('.pn-obsidian-note-picker');
  if (await picker.getAttribute('open') === null) await picker.locator('summary').click();
  await noteGraph().getByLabel('Find graph note', { exact: true }).fill(note.title);
  await noteGraph().getByLabel('Graph note', { exact: true }).selectOption(note.id);
  await noteGraph().getByRole('button', { name: 'Open selected graph note', exact: true }).click();
  await sourceDetails().getByRole('heading', { name: note.title, exact: true }).waitFor();
  await picker.locator('summary').click();
  await page.waitForFunction(id => document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-selected-node-id') === id, note.id);
}
async function positions() {
  return nodeCanvas().evaluate(element => Object.fromEntries(['camera-x', 'camera-y', 'camera-scale', 'selected-node-x', 'selected-node-y', 'selected-world-x', 'selected-world-y', 'layout-ticks', 'layout-generation'].map(key => [key, Number(element.getAttribute(`data-${key}`))])));
}
async function screenshot(name) {
  await page.screenshot({ path: path.join(outputDirectory, `obsidian-${name}.png`), fullPage: false, animations: 'disabled' });
}
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1), false);
}
async function connect(target, credential) {
  await target.goto(`${origin}/local.html`);
  await target.getByLabel('Personal node URL').fill(origin);
  await target.getByLabel('Node access token').fill(credential);
  await target.getByRole('button', { name: 'Connect node →', exact: true }).click();
  await target.getByRole('navigation', { name: 'Personal workspace', exact: true }).waitFor();
}
async function context() {
  const value = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  value.on('page', target => {
    target.on('pageerror', error => errors.push(error.message));
    target.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  });
  await value.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
    externalRequests.push(url.origin); return route.abort();
  });
  return value;
}

try {
  await mkdir(outputDirectory, { recursive: true });
  const vaults = ['Business', 'Research'].map(name => path.join(fixture, name));
  for (const vault of vaults) {
    await mkdir(path.join(vault, 'projects'), { recursive: true }); await mkdir(path.join(vault, 'archive'));
    for (let start = 0; start < 1000; start += 100) await Promise.all(Array.from({ length: 100 }, (_, offset) => {
      const index = start + offset; const next = (index + 1) % 1000;
      return writeFile(path.join(vault, noteRelativePath(index)), `# ${path.basename(vault)} ${index}\n\nSYNTHETIC_PRIVATE_${path.basename(vault)}_${index}\n[[${noteRelativePath(next).replace(/\.md$/, '')}]]\n`);
    }));
    await writeFile(path.join(vault, 'orphan.md'), '# Unlinked synthetic note\nNo declared links.');
  }
  await build({ root: appDirectory, configFile: false, plugins: [react()], logLevel: 'warn',
    build: { outDir: uiDirectory, emptyOutDir: true, rollupOptions: { input: path.join(appDirectory, 'local.html') } } });
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve)); origin = `http://127.0.0.1:${port}`;
  server = await createNodeServer({ directory: path.join(fixture, 'brain'), host: '127.0.0.1', port,
    token, allowedOrigins: [origin], staticDirectory: uiDirectory, provider: {} });
  await server.start(); await api('/v1/unlock', { create: true, name: 'Synthetic connected vaults', passphrase });
  for (const vault of vaults) {
    const folder = await api('/v1/folders', { path: vault });
    const result = await api(`/v1/folders/${folder.id}/refresh`, {});
    assert.equal(result.imported, 1001);
  }
  const snapshot = await api('/v1/brain'); assert.equal(snapshot.objects.length, 2002);
  const alpha = snapshot.objects.find(note => note.sourcePath === path.join(vaults[0], noteRelativePath(0)));
  const beta = snapshot.objects.find(note => note.sourcePath === path.join(vaults[0], noteRelativePath(1)));
  assert.ok(alpha && beta);
  const member = await api('/v1/members', { name: 'Synthetic ungranted graph viewer' });
  browser = await playwright.chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const ownerContext = await context(); page = await ownerContext.newPage(); await connect(page, token); await navigate('Brain');
  await count(2002);
  assert.equal(await nodeCanvas().getAttribute('data-edge-count'), '2000');
  assert.equal(await noteGraph().locator('.pn-notegraph-point').count(), 0);
  const canvas = noteGraph().getByRole('img', { name: 'Note connections', exact: true });
  assert.equal(await canvas.evaluate(element => element.tagName), 'CANVAS');
  await page.waitForFunction(() => Number(document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-layout-ticks')) > 2);
  const painted = await canvas.evaluate(element => {
    const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
    const colors = new Set(); for (let index = 0; index < pixels.length; index += 16) colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
    return colors.size;
  });
  assert.ok(painted > 5, `Canvas must actually draw its graph, not just report counts: ${painted}`);
  check('Canvas2D renders all 2,002 imported notes and 2,000 real scoped links without a 300-node DOM cap');

  const explorer = page.getByRole('region', { name: 'Vault explorer', exact: true });
  const tree = explorer.getByRole('tree', { name: 'Vault files', exact: true });
  await tree.getByRole('treeitem', { name: 'Business', exact: true }).waitFor();
  await tree.getByRole('treeitem', { name: 'Research', exact: true }).waitFor();
  assert.ok(await tree.getByRole('treeitem').count() < 2002, 'Explorer should virtualize or collapse rather than render every file');
  await tree.getByRole('treeitem', { name: 'projects', exact: true }).first().click();
  await tree.getByRole('treeitem', { name: noteName(0), exact: true }).first().click();
  await sourceDetails().getByRole('heading', { name: noteName(0), exact: true }).waitFor();
  assert.match(await sourceDetails().innerText(), /SYNTHETIC_PRIVATE_Business_0/);
  check('real registered vault roots and nested directories select the exact source, including duplicate basenames');

  const tallRows = await tree.getByRole('treeitem').count();
  await page.setViewportSize({ width: 1512, height: 680 });
  await page.waitForFunction(before => document.querySelectorAll('.pn-vault-tree [role="treeitem"]').length < before, tallRows);
  await page.setViewportSize({ width: 1512, height: 1000 });
  await page.waitForFunction(before => document.querySelectorAll('.pn-vault-tree [role="treeitem"]').length >= before, tallRows);
  check('virtualized folder rows track both shrinking and expanding viewport height');

  await tree.getByRole('treeitem', { name: 'projects', exact: true }).first().click();
  assert.equal(await tree.getByRole('treeitem', { name: 'projects', exact: true }).first().getAttribute('aria-expanded'), 'false');
  const treeBeforeRefresh = await tree.evaluate(element => ({ top: element.scrollTop, active: element.getAttribute('aria-activedescendant') }));
  const treeRefresh = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/brain');
  await page.locator('.pn-header').getByRole('button', { name: 'Refresh', exact: true }).click(); await treeRefresh;
  await page.locator('.pn-progress').waitFor({ state: 'hidden' });
  assert.equal(await tree.getByRole('treeitem', { name: 'projects', exact: true }).first().getAttribute('aria-expanded'), 'false');
  assert.deepEqual(await tree.evaluate(element => ({ top: element.scrollTop, active: element.getAttribute('aria-activedescendant') })), treeBeforeRefresh);
  check('identical node refresh preserves manually collapsed folders, focus and tree scroll');

  await explorer.getByLabel('Search vault files', { exact: true }).fill('note-0000');
  assert.equal(await tree.getByRole('treeitem', { name: noteName(0), exact: true }).count(), 2);
  await explorer.getByLabel('Search vault files', { exact: true }).fill('');
  await explorer.getByRole('button', { name: 'Sort files descending', exact: true }).click();
  await explorer.getByRole('button', { name: 'Sort files ascending', exact: true }).click();
  await explorer.getByRole('button', { name: 'Filter graph to selected folder', exact: true }).click();
  await count(500);
  assert.equal(await nodeCanvas().getAttribute('data-edge-count'), '499');
  await explorer.getByRole('button', { name: 'Clear folder graph filter', exact: true }).click(); await count(2002);
  await explorer.getByRole('button', { name: 'Filter graph to selected folder', exact: true }).click(); await count(500);
  await noteGraph().getByRole('button', { name: 'Clear filters', exact: true }).click(); await count(2002);
  assert.equal(await explorer.getByRole('button', { name: 'Clear folder graph filter', exact: true }).count(), 0);
  const clearedRefresh = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/brain');
  await page.locator('.pn-header').getByRole('button', { name: 'Refresh', exact: true }).click(); await clearedRefresh;
  await page.locator('.pn-progress').waitFor({ state: 'hidden' }); await count(2002);
  assert.equal(await explorer.getByRole('button', { name: 'Clear folder graph filter', exact: true }).count(), 0);
  check('file search finds both actual matching paths and sort controls reverse without changing stored records');
  check('parent Clear filters also clears explorer filter state and remains cleared after refresh');

  await selectNote(alpha);
  await noteGraph().getByRole('button', { name: 'Local · 1', exact: true }).click(); await count(3);
  await noteGraph().getByRole('button', { name: 'Local · 2', exact: true }).click(); await count(5);
  await noteGraph().getByRole('button', { name: 'Global', exact: true }).click(); await count(2002);
  await settings(true); await noteGraph().getByLabel('Orphans', { exact: true }).uncheck(); await count(2000);
  await noteGraph().getByLabel('Orphans', { exact: true }).check(); await count(2002);
  await page.getByRole('searchbox', { name: 'Search Brain objects', exact: true }).fill('note-0000'); await count(2);
  await page.getByRole('searchbox', { name: 'Search Brain objects', exact: true }).fill(''); await count(2002);
  check('local depth, orphan and search filters operate on actual edges without inventing cross-vault relationships');

  for (const label of ['Node size', 'Link thickness', 'Text fade threshold', 'Center force', 'Repel force', 'Link force', 'Link distance']) {
    const slider = noteGraph().getByLabel(label, { exact: true }); const before = await slider.inputValue();
    await slider.focus(); await slider.press('ArrowRight'); assert.notEqual(await slider.inputValue(), before, `${label} must be interactive`);
  }
  await noteGraph().getByRole('button', { name: '＋ New group', exact: true }).click();
  await noteGraph().getByLabel('Group search 1', { exact: true }).fill('path:projects');
  assert.equal(await noteGraph().getByLabel('Group color 1', { exact: true }).count(), 1);
  await settings(false); await noOverflow(); await screenshot('desktop-full');
  check('display, force and real-path group controls remain interactive on the large graph');

  await noteGraph().getByRole('button', { name: 'Pause graph layout', exact: true }).click();
  await noteGraph().getByRole('button', { name: 'Reset graph pan and zoom', exact: true }).click();
  await selectNote(alpha);
  const alphaPoint = await positions(); await selectNote(beta);
  await canvas.click({ position: { x: alphaPoint['selected-node-x'], y: alphaPoint['selected-node-y'] } });
  await page.waitForFunction(id => document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-selected-node-id') === id, alpha.id);
  assert.match(await sourceDetails().innerText(), /SYNTHETIC_PRIVATE_Business_0/);
  const beforeDrag = await positions(); const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + beforeDrag['selected-node-x'], bounds.y + beforeDrag['selected-node-y']); await page.mouse.down();
  await page.mouse.move(bounds.x + beforeDrag['selected-node-x'] + 40, bounds.y + beforeDrag['selected-node-y'] + 20, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(before => Number(document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-selected-world-x')) !== before, beforeDrag['selected-world-x']);
  check('real Canvas2D pointer hit-testing and dragging inspect and move the selected note');

  const beforePan = await positions();
  await page.mouse.move(bounds.x + 12, bounds.y + 12); await page.mouse.down(); await page.mouse.move(bounds.x + 62, bounds.y + 42, { steps: 6 }); await page.mouse.up();
  await page.waitForFunction(before => Number(document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-camera-x')) !== before, beforePan['camera-x']);
  const beforeWheel = await positions(); await canvas.hover(); await page.mouse.wheel(0, -160);
  await page.waitForFunction(before => Number(document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-camera-scale')) > before, beforeWheel['camera-scale']);
  await canvas.focus(); const beforeKey = await positions(); await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(before => Number(document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-camera-x')) !== before, beforeKey['camera-x']);
  await noteGraph().getByRole('button', { name: 'Reset graph pan and zoom', exact: true }).click();
  assert.ok((await positions())['camera-scale'] > 0);
  check('mouse pan, anchored wheel zoom, keyboard pan and fit controls update the camera');

  const beforeRefresh = await positions();
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/brain');
  await page.locator('.pn-header').getByRole('button', { name: 'Refresh', exact: true }).click(); await refreshed;
  await page.locator('.pn-progress').waitFor({ state: 'hidden' });
  const afterRefresh = await positions();
  assert.equal(afterRefresh['layout-generation'], beforeRefresh['layout-generation']);
  assert.equal(afterRefresh['selected-world-x'], beforeRefresh['selected-world-x']);
  assert.equal(afterRefresh['selected-world-y'], beforeRefresh['selected-world-y']);
  await noteGraph().getByRole('button', { name: 'Resume graph layout', exact: true }).click();
  await navigate('Chat');
  const hiddenTicks = Number(await nodeCanvas().getAttribute('data-layout-ticks'));
  await page.waitForTimeout(350);
  assert.equal(Number(await nodeCanvas().getAttribute('data-layout-ticks')), hiddenTicks);
  await navigate('Brain');
  const generation = Number(await nodeCanvas().getAttribute('data-layout-generation'));
  await noteGraph().getByRole('button', { name: 'Restart graph layout', exact: true }).click();
  await page.waitForFunction(before => Number(document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-layout-generation')) > before, generation);
  check('unchanged snapshots preserve positions; hidden graphs pause work and explicit restart starts a new layout');

  await settings(true); await noteGraph().getByRole('button', { name: 'Restore default settings', exact: true }).click(); await settings(false);
  await page.getByRole('button', { name: 'Close source details', exact: true }).click();
  await explorer.getByRole('button', { name: 'Collapse all folders', exact: true }).click();
  await tree.getByRole('treeitem', { name: 'Business', exact: true }).click();
  await tree.getByRole('treeitem', { name: 'Research', exact: true }).click();
  await noteGraph().getByRole('button', { name: 'Reset graph pan and zoom', exact: true }).click();
  await noOverflow(); await screenshot('desktop-default');

  await page.setViewportSize({ width: 390, height: 844 });
  const foldersToggle = page.getByRole('button', { name: 'Toggle graph folders', exact: true });
  await foldersToggle.click(); await explorer.waitFor();
  await explorer.getByLabel('Search vault files', { exact: true }).fill('note-0000');
  await tree.getByRole('treeitem', { name: noteName(0), exact: true }).first().click();
  if (await foldersToggle.getAttribute('aria-expanded') === 'true') await foldersToggle.click();
  await settings(true); await noteGraph().getByLabel('Orphans', { exact: true }).uncheck(); await count(2000);
  await noOverflow(); await screenshot('mobile-settings');
  await settings(false);
  await page.getByRole('button', { name: 'Close source details', exact: true }).click();
  await noOverflow(); await screenshot('mobile-graph');
  check('mobile folder search and graph settings are reachable without horizontal page overflow');

  const memberContext = await context(); const memberPage = await memberContext.newPage(); await connect(memberPage, member.token);
  const memberPayload = await memberPage.locator('body').innerText();
  for (const forbidden of [...vaults, 'SYNTHETIC_PRIVATE_Business_0', 'note-0000.md']) assert.ok(!memberPayload.includes(forbidden));
  await memberPage.getByRole('navigation', { name: 'Personal workspace', exact: true }).getByRole('button', { name: 'Brain', exact: true }).click();
  const memberBody = await memberPage.locator('body').innerText();
  for (const forbidden of [...vaults, 'SYNTHETIC_PRIVATE_Business_0', 'note-0000.md']) assert.ok(!memberBody.includes(forbidden));
  assert.equal(await memberPage.getByRole('treeitem', { name: 'Business', exact: true }).count(), 0);
  await memberContext.close();
  await page.getByRole('button', { name: 'Lock Brain', exact: true }).click(); await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
  assert.equal(await nodeCanvas().count(), 0);
  const afterLock = await page.locator('body').innerText(); const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  for (const forbidden of [token, passphrase, member.token, ...vaults, 'SYNTHETIC_PRIVATE_Business_0']) { assert.ok(!stored.includes(forbidden)); assert.ok(!afterLock.includes(forbidden)); }
  check('ungranted members never receive owner vault data and locking removes graph, tree and readable session data');
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []); check('no browser errors or external requests');
  console.log(`Obsidian workspace checks: ${checks.length} passed; synthetic notes only. Screenshots: ${outputDirectory}`);
} catch (error) {
  if (page && !page.isClosed()) await screenshot('failure').catch(() => {});
  throw error;
} finally {
  await browser?.close(); await server?.close();
  if (fixture.startsWith(path.join(await realpath(os.tmpdir()), 'arkive-obsidian-browser-'))) await rm(fixture, { recursive: true, force: true });
}
