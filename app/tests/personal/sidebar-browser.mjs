/** AGEN-style sidebar regression using an isolated build, synthetic Brain and no providers. */
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
const fixture = await mkdtemp(path.join(os.tmpdir(), 'arkive-sidebar-browser-'));
const uiDirectory = path.join(fixture, 'ui');
const outputDirectory = path.join(appDirectory, '.personal-test');
const ownerToken = 'synthetic-sidebar-owner-credential-'.repeat(2);
const password = 'Synthetic sidebar passphrase only';
const preferenceKey = 'arkive.personal.sidebar.v1';
const ownerDestinations = ['Chat', 'Canvas', 'Brain', 'Work', 'Agents', 'Memory inbox', 'Library', 'Context presets', 'Sources & sync', 'Shared', 'Policies', 'Audit', 'Personal node'];
const memberDestinations = ['Chat', 'Canvas', 'Brain', 'Agents', 'Shared', 'Policies'];
const modulePath = process.env.PLAYWRIGHT_MODULE;
const playwright = await import(modulePath && path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath || 'playwright');
let server; let browser; let origin; let page;
const errors = []; const externalRequests = []; const checks = [];
const check = label => { checks.push(label); console.log(`PASS ${label}`); };
const navigation = target => target.getByRole('navigation', { name: 'Personal workspace', exact: true });
const destination = (target, name) => navigation(target).getByRole('button', { name, exact: true });
const sidebar = target => target.locator('#pn-workspace-navigation');

async function request(route, body) {
  const response = await fetch(`${origin}${route}`, { method: 'POST', headers: {
    Authorization: `Bearer ${ownerToken}`, Origin: origin, 'Content-Type': 'application/json',
  }, body: JSON.stringify(body) });
  const value = await response.json();
  assert.ok(response.ok, `${route}: ${JSON.stringify(value)}`);
  return value;
}
async function connect(target, token) {
  await target.goto(`${origin}/local.html`);
  await target.getByLabel('Personal node URL').fill(origin);
  await target.getByLabel('Node access token').fill(token);
  await target.getByRole('button', { name: 'Connect node →', exact: true }).click();
  await navigation(target).waitFor();
}
async function makeContext(viewport = { width: 1512, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  context.on('page', target => {
    target.on('pageerror', error => errors.push(error.message));
    target.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    externalRequests.push(url.origin);
    return route.abort();
  });
  return context;
}
async function assertWidth(target, expected) {
  await target.waitForFunction(({ expected }) => {
    const element = document.querySelector('#pn-workspace-navigation');
    return element && Math.abs(element.getBoundingClientRect().width - expected) < 1;
  }, { expected });
}
async function noOverflow(target) {
  const dimensions = await target.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, JSON.stringify(dimensions));
}
async function focusIsWithinSidebar(target) {
  assert.equal(await target.evaluate(() => document.querySelector('#pn-workspace-navigation')?.contains(document.activeElement)), true);
}
async function screenshot(target, name) {
  await target.screenshot({ path: path.join(outputDirectory, `sidebar-${name}.png`), fullPage: false, animations: 'disabled' });
}

try {
  await build({ root: appDirectory, configFile: false, plugins: [react()], logLevel: 'warn',
    build: { outDir: uiDirectory, emptyOutDir: true, rollupOptions: { input: path.join(appDirectory, 'local.html') } } });
  await mkdir(outputDirectory, { recursive: true });
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = await createNodeServer({ directory: path.join(fixture, 'brain'), host: '127.0.0.1', port,
    token: ownerToken, allowedOrigins: [origin], staticDirectory: uiDirectory, provider: {} });
  await server.start();
  await request('/v1/unlock', { create: true, name: 'Synthetic Sidebar Brain', passphrase: password });
  const alpha = await request('/v1/objects', { kind: 'note', title: 'Alpha', text: 'Synthetic private note. [[Beta]]' });
  await request('/v1/objects', { kind: 'note', title: 'Beta', text: 'Synthetic second source.' });
  await request('/v1/proposals', { title: 'Synthetic proposed memory', text: 'Draft only.', sourceIds: [alpha.id] });
  await request('/v1/workspace/tasks', { title: 'Synthetic task', status: 'todo', description: '', sourceIds: [alpha.id] });
  await request('/v1/rooms', { title: 'Research room' });
  await request('/v1/rooms', { title: 'Review room' });
  const memberCredential = await request('/v1/members', { name: 'Synthetic scoped member' });

  browser = await playwright.chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const context = await makeContext(); page = await context.newPage();
  await connect(page, ownerToken);
  await assertWidth(page, 240);
  assert.deepEqual(await navigation(page).getByRole('button').evaluateAll(items => items.map(item => item.getAttribute('aria-label'))), ownerDestinations);
  assert.equal(await destination(page, 'Chat').getAttribute('aria-current'), 'page');
  for (const [name, count] of [['Brain', '2'], ['Work', '1'], ['Memory inbox', '1'], ['Agents', '0']]) {
    assert.equal((await destination(page, name).locator('small').textContent()).trim(), count);
  }
  assert.equal(await page.getByLabel('Folder on this node', { exact: true }).isVisible(), true);
  assert.equal(await sidebar(page).getByRole('button', { name: /Encrypted export/ }).isVisible(), true);
  check('expanded 240px sidebar preserves all 13 owner destinations, live counts and source/recovery controls');

  for (const name of ownerDestinations) {
    await destination(page, name).click();
    assert.equal(await destination(page, name).getAttribute('aria-current'), 'page');
    assert.equal(await navigation(page).locator('[aria-current="page"]').count(), 1);
    assert.match(await page.locator('.pn-breadcrumb').innerText(), new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  check('all 13 sidebar destinations remain navigable with exactly one current page');
  await destination(page, 'Brain').click();
  const graph = page.getByRole('region', { name: 'Obsidian-style note graph', exact: true });
  const graphCanvas = graph.locator('.pn-obsidian-canvas');
  assert.equal(await graphCanvas.getAttribute('data-node-count'), '2');
  assert.equal(await graphCanvas.getAttribute('data-edge-count'), '1');
  await graph.locator('.pn-obsidian-note-picker summary').click();
  await graph.getByLabel('Find graph note', { exact: true }).fill('Alpha');
  await graph.getByLabel('Graph note', { exact: true }).selectOption(alpha.id);
  await graph.getByRole('button', { name: 'Open selected graph note', exact: true }).click();
  await graph.locator('.pn-obsidian-note-picker summary').click();
  await page.locator('.pn-detail h2').filter({ hasText: /^Alpha$/ }).waitFor();
  await noOverflow(page); await screenshot(page, 'expanded');
  check('Brain graph still uses real note links and opens source details after navigation');

  await destination(page, 'Canvas').click();
  const presentation = page.getByRole('group', { name: 'Canvas presentation', exact: true });
  for (const name of ['Infinite', 'Radial', 'Multi-room']) {
    await presentation.getByRole('button', { name, exact: true }).click();
    assert.equal(await presentation.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true');
  }
  await presentation.getByRole('button', { name: 'Infinite', exact: true }).click();
  await page.getByRole('region', { name: 'Infinite chat canvas', exact: true }).waitFor();
  check('all three existing Canvas presentations remain functional');

  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await assertWidth(page, 80);
  assert.equal(await navigation(page).getByRole('button').count(), 13);
  await destination(page, 'Brain').focus(); await page.keyboard.press('Enter');
  assert.equal(await destination(page, 'Brain').getAttribute('aria-current'), 'page');
  assert.equal(await graph.isVisible(), true);
  await noOverflow(page); await screenshot(page, 'collapsed');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), preferenceKey), 'collapsed');
  check('80px icon rail retains accessible names, keyboard navigation and the selected Brain view');

  const restored = await context.newPage();
  await restored.goto(`${origin}/local.html`);
  await restored.getByRole('heading', { name: 'Connect your personal Brain.', exact: true }).waitFor();
  assert.equal(await restored.getByLabel('Node access token').inputValue(), '');
  await connect(restored, ownerToken);
  await assertWidth(restored, 80);
  await restored.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await assertWidth(restored, 240);
  assert.equal(await restored.evaluate(key => localStorage.getItem(key), preferenceKey), 'expanded');
  const stored = await restored.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  for (const secret of [ownerToken, password, memberCredential.token, alpha.text]) assert.ok(!stored.includes(secret));
  await restored.close();
  check('sidebar preference survives a new page while credentials and source plaintext remain memory-only');

  await page.setViewportSize({ width: 390, height: 844 });
  // Keep a DOM locator while the header intentionally leaves the accessibility tree under inert.
  const opener = page.locator('.pn-menu-toggle[aria-label="Toggle workspace navigation"]');
  assert.equal(await opener.getAttribute('aria-expanded'), 'false');
  await opener.click();
  assert.equal(await sidebar(page).getAttribute('role'), 'dialog');
  assert.equal(await sidebar(page).getAttribute('aria-modal'), 'true');
  assert.equal(await opener.getAttribute('aria-expanded'), 'true');
  await focusIsWithinSidebar(page);
  assert.equal(await page.locator('.pn-main').evaluate(element => !!element.closest('[inert]')), true);
  assert.equal(await page.locator('.pn-header').evaluate(element => !!element.closest('[inert]')), true);
  const focusableCount = await sidebar(page).locator('button:visible:not([disabled]), input:visible:not([disabled]), select:visible:not([disabled]), textarea:visible:not([disabled]), [tabindex="0"]:visible').count();
  for (let index = 0; index < focusableCount + 2; index += 1) { await page.keyboard.press('Tab'); await focusIsWithinSidebar(page); }
  for (let index = 0; index < focusableCount + 2; index += 1) { await page.keyboard.press('Shift+Tab'); await focusIsWithinSidebar(page); }
  await noOverflow(page); await screenshot(page, 'mobile');
  check('mobile drawer is modal with inert background and forward/reverse keyboard focus containment');

  await page.keyboard.press('Escape');
  assert.equal(await opener.getAttribute('aria-expanded'), 'false');
  assert.equal(await opener.evaluate(element => element === document.activeElement), true);
  assert.equal(await page.locator('.pn-main').evaluate(element => !!element.closest('[inert]')), false);
  await opener.click(); await destination(page, 'Canvas').click();
  assert.equal(await opener.getAttribute('aria-expanded'), 'false');
  await page.getByRole('region', { name: 'Canvas workspace', exact: true }).waitFor();
  assert.equal(await opener.evaluate(element => element === document.activeElement), true);
  check('Escape and selecting a destination both close the drawer, restore focus and release background');

  await opener.click();
  const dismiss = page.getByRole('button', { name: 'Dismiss navigation', exact: true });
  const scrimBox = await dismiss.boundingBox();
  assert.ok(scrimBox && scrimBox.width > 0);
  await dismiss.click({ position: { x: scrimBox.width - 10, y: scrimBox.height / 2 } });
  assert.equal(await opener.getAttribute('aria-expanded'), 'false');
  await opener.click(); await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
  assert.equal(await opener.getAttribute('aria-expanded'), 'false');
  await noOverflow(page);
  check('scrim and close control dismiss mobile navigation without viewport overflow');

  const memberContext = await makeContext(); const member = await memberContext.newPage();
  await connect(member, memberCredential.token);
  assert.deepEqual(await navigation(member).getByRole('button').evaluateAll(items => items.map(item => item.getAttribute('aria-label'))), memberDestinations);
  assert.equal(await member.getByLabel('Folder on this node', { exact: true }).count(), 0);
  assert.equal(await sidebar(member).getByRole('button', { name: /Encrypted export|Connect folder/ }).count(), 0);
  assert.equal(await sidebar(member).getByRole('button', { name: 'Disconnect session', exact: true }).isVisible(), true);
  assert.ok(!(await member.locator('body').innerText()).includes(alpha.text));
  await member.getByRole('button', { name: 'Collapse sidebar', exact: true }).click(); await assertWidth(member, 80);
  assert.equal(await navigation(member).getByRole('button').count(), 6);
  await screenshot(member, 'member');
  check('scoped members retain only six destinations and never receive owner folder/export controls or private notes');

  assert.deepEqual(externalRequests, []); assert.deepEqual(errors, []);
  check('no external requests, browser runtime errors or console errors');
  console.log(`Sidebar browser checks: ${checks.length} passed. Screenshots: ${outputDirectory}`);
} catch (error) {
  if (page && !page.isClosed()) await screenshot(page, 'failure').catch(() => {});
  throw error;
} finally {
  await browser?.close(); await server?.close();
  if (fixture.startsWith(path.join(os.tmpdir(), 'arkive-sidebar-browser-'))) await rm(fixture, { recursive: true, force: true });
}
