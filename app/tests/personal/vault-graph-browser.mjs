/** Same-Brain explorer regression. Real temporary note imports; no actual vault, GitNexus index or model. */
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createNodeServer } from '../../../personal-node/server.mjs';

const appDirectory = fileURLToPath(new URL('../../', import.meta.url));
const fixture = await realpath(await mkdtemp(path.join(os.tmpdir(), 'arkive-vault-graph-browser-')));
const outputDirectory = path.join(appDirectory, '.personal-test');
const token = 'synthetic-vault-graph-owner-token-'.repeat(2);
const passphrase = 'Synthetic vault graph recovery phrase';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const playwright = await import(modulePath && path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath || 'playwright');
const checks = [], errors = [], outbound = [], mutations = [], sourceFiles = new Map();
let origin, server, browser, page, discoveryReads = 0;
const check = label => { checks.push(label); console.log('PASS ' + label); };
const explorer = (target = page) => target.getByRole('region', { name: 'Vault graph explorer', exact: true });
const inspector = (target = page) => explorer(target).getByRole('complementary', { name: 'Note inspector', exact: true });
const renderer = (target = page) => explorer(target).locator('.pn-obsidian-canvas');
async function api(route, method = 'GET', body, credential = token) {
  const response = await fetch(origin + route, { method, headers: { Authorization: `Bearer ${credential}`, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); assert.ok(response.ok, `${method} ${route}: ${JSON.stringify(value)}`); return value;
}
async function act(route, method, action) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === route && response.request().method() === method);
  await action(); const response = await pending; assert.ok(response.ok(), await response.text());
  await page.locator('.pn-progress').waitFor({ state: 'hidden' }); return response.json();
}
async function seed(relative, text) {
  const target = path.join(fixture, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, text); sourceFiles.set(target, text); return target;
}
async function navigate(label, target = page) {
  const toggle = target.getByRole('button', { name: 'Toggle workspace navigation', exact: true });
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await target.getByRole('navigation', { name: 'Personal workspace', exact: true }).getByRole('button', { name: label, exact: true }).click();
}
async function connect(credential) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } }); const target = await context.newPage(); target.setDefaultTimeout(10000);
  target.on('pageerror', error => errors.push(error.message)); target.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  target.on('request', request => { if (['POST', 'PUT', 'DELETE'].includes(request.method())) mutations.push(new URL(request.url()).pathname); });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) { outbound.push(url.origin); return route.abort(); }
    // Fail closed around the machine's real registry and code indexes.
    if (url.pathname === '/v1/gitnexus/repositories') { discoveryReads++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repositories: [], skipped: 0 }) }); }
    if (url.pathname === '/v1/gitnexus/import') throw new Error('Vault graph must not import a code index');
    return route.continue();
  });
  await target.goto(origin + '/local.html'); await target.getByLabel('Personal node URL').fill(origin); await target.getByLabel('Node access token').fill(credential);
  await target.getByRole('button', { name: 'Connect node →', exact: true }).click(); await target.getByRole('navigation', { name: 'Personal workspace' }).waitFor(); return target;
}
async function graphCount(count, target = page) {
  await target.waitForFunction(expected => document.querySelector('[aria-label="Vault graph explorer"] .pn-obsidian-canvas')?.getAttribute('data-node-count') === String(expected), count);
}
async function selectGraphNote(note, target = page) {
  const graph = explorer(target), picker = graph.locator('.pn-obsidian-note-picker');
  if (await picker.getAttribute('open') === null) await picker.locator('summary').click();
  await graph.getByLabel('Find graph note', { exact: true }).fill(note.title); await graph.getByLabel('Graph note', { exact: true }).selectOption(note.id);
  await graph.getByRole('button', { name: 'Open selected graph note', exact: true }).click();
  await inspector(target).getByRole('heading', { name: note.title, exact: true }).waitFor();
  await picker.locator('summary').click();
  await target.waitForFunction(id => document.querySelector('[aria-label="Vault graph explorer"] .pn-obsidian-canvas')?.getAttribute('data-selected-node-id') === id, note.id);
}

try {
  const uiDirectory = path.join(fixture, 'ui'); await mkdir(outputDirectory, { recursive: true });
  const work = path.join(fixture, 'Work'), personal = path.join(fixture, 'Personal');
  const alphaPath = await seed('Work/projects/Alpha.md', '# Alpha\nSYNTHETIC_WORK_ALPHA\n[[Beta]] and [Gamma](Gamma.md).');
  const betaPath = await seed('Work/projects/Beta.md', '# Beta\nSYNTHETIC_WORK_BETA\n[[Alpha]]');
  await seed('Work/projects/Gamma.md', '# Gamma\nSYNTHETIC_WORK_GAMMA');
  await seed('Work/projects/Delta.md', '# Delta\n[[Alpha]]');
  await seed('Work/private/Unshared roadmap.md', '# Unshared roadmap\nSYNTHETIC_UNSHARED_CONTENT');
  await seed('Personal/projects/Alpha.md', '# Alpha\nSYNTHETIC_PERSONAL_ALPHA');
  for (let start = 0; start < 600; start += 100) await Promise.all(Array.from({ length: 100 }, (_, offset) => {
    const index = start + offset, next = (index + 1) % 600;
    return seed(`Work/archive/Note-${String(index).padStart(3, '0')}.md`, `# Archive ${index}\n[[Note-${String(next).padStart(3, '0')}]]`);
  }));
  await build({ root: appDirectory, configFile: false, plugins: [react()], logLevel: 'warn', build: { outDir: uiDirectory, emptyOutDir: true, rollupOptions: { input: path.join(appDirectory, 'local.html') } } });
  const reserve = net.createServer(); await new Promise((resolve, reject) => { reserve.once('error', reject); reserve.listen(0, '127.0.0.1', resolve); }); const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve)); origin = `http://127.0.0.1:${port}`;
  server = await createNodeServer({ directory: path.join(fixture, 'brain'), host: '127.0.0.1', port, token, allowedOrigins: [origin], staticDirectory: uiDirectory, provider: {} }); await server.start();
  await api('/v1/unlock', 'POST', { create: true, name: 'Synthetic same-Brain vault', passphrase });
  for (const vault of [work, personal]) { const folder = await api('/v1/folders', 'POST', { path: vault }); await api(`/v1/folders/${folder.id}/refresh`, 'POST', {}); }
  let state = await api('/v1/brain'); const alpha = state.objects.find(object => object.sourcePath === alphaPath), beta = state.objects.find(object => object.sourcePath === betaPath); assert.ok(alpha && beta); assert.equal(state.objects.length, 606);
  const activeRoom = await api('/v1/rooms', 'POST', { title: 'Vault review' });
  const sharedRoom = await api('/v1/rooms', 'POST', { title: 'Shared vault notes' });
  const member = await api('/v1/members', 'POST', { name: 'Synthetic vault reader' });
  await api(`/v1/rooms/${sharedRoom.id}/sources`, 'PUT', { objectIds: [alpha.id, beta.id] });
  await api(`/v1/rooms/${sharedRoom.id}/policy`, 'PUT', { memberGrants: [{ memberId: member.member.id, role: 'reader', sourceIds: [alpha.id, beta.id] }] });
  const originalObjects = (await api('/v1/brain')).objects;
  browser = await playwright.chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) }); page = await connect(token);
  await page.locator('.pn-cw-active-room select:visible').selectOption(activeRoom.id); await navigate('Brain');
  const obsidian = page.getByRole('region', { name: 'Obsidian-style note graph', exact: true });
  await page.waitForFunction(() => document.querySelector('.pn-obsidian-canvas')?.getAttribute('data-node-count') === '606');
  const originalCounts = { nodes: await obsidian.locator('.pn-obsidian-canvas').getAttribute('data-node-count'), edges: await obsidian.locator('.pn-obsidian-canvas').getAttribute('data-edge-count') };
  const obsidianPicker = obsidian.locator('.pn-obsidian-note-picker'); await obsidianPicker.locator('summary').click();
  await obsidian.getByLabel('Find graph note', { exact: true }).fill(alpha.title); await obsidian.getByLabel('Graph note', { exact: true }).selectOption(alpha.id); await obsidian.getByRole('button', { name: 'Open selected graph note', exact: true }).click();
  await page.getByRole('button', { name: 'GitNexus', exact: true }).click(); await graphCount(606);
  assert.equal(await page.getByRole('group', { name: 'Explorer source', exact: true }).getByRole('button', { name: 'Vault graph', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual({ nodes: await renderer().getAttribute('data-node-count'), edges: await renderer().getAttribute('data-edge-count') }, originalCounts);
  assert.equal(discoveryReads, 0); assert.deepEqual(mutations, []); assert.equal(await page.getByRole('region', { name: 'Connect GitNexus repository', exact: true }).count(), 0);
  await inspector().getByRole('heading', { name: alpha.title, exact: true }).waitFor(); assert.match(await inspector().innerText(), /SYNTHETIC_WORK_ALPHA/); assert.doesNotMatch(await inspector().innerText(), /SYNTHETIC_PERSONAL_ALPHA/);
  check('GitNexus-style Vault graph opens existing 606 notes and identical Obsidian edges with shared selection, no index discovery or writes');

  const outgoing = inspector().getByRole('region', { name: 'Outgoing note links', exact: true }), incoming = inspector().getByRole('region', { name: 'Backlinks', exact: true });
  assert.match(await outgoing.innerText(), /Beta/); assert.match(await outgoing.innerText(), /Gamma/); assert.doesNotMatch(await outgoing.innerText(), /Delta/);
  assert.match(await incoming.innerText(), /Beta/); assert.match(await incoming.innerText(), /Delta/); assert.doesNotMatch(await incoming.innerText(), /Gamma/);
  assert.doesNotMatch(await explorer().innerText(), /CALLS|Execution flow|compileContext/);
  check('inspector distinguishes real outgoing wiki/Markdown links and backlinks, including reciprocal links without invented calls');
  const painted = await renderer().locator('canvas').evaluate(element => { const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data; const colors = new Set(); for (let i = 0; i < pixels.length; i += 16) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`); return colors.size; }); assert.ok(painted > 5);
  assert.deepEqual(await renderer().locator('canvas').evaluate(element => Array.from(element.getContext('2d').getImageData(0, 0, 1, 1).data)), [16, 16, 16, 255]);
  await page.screenshot({ path: path.join(outputDirectory, 'vault-graph-desktop.png'), fullPage: true, animations: 'disabled' });
  check('full note graph actually paints beyond the 500-code-node limit using Arkive dark colors');

  const vaultFiles = explorer().getByRole('tree', { name: 'Vault files', exact: true });
  await vaultFiles.locator(`[data-object-id="${beta.id}"]`).click(); await inspector().getByRole('heading', { name: beta.title, exact: true }).waitFor();
  await explorer().getByRole('button', { name: 'Filter graph to selected folder', exact: true }).click(); await graphCount(4);
  assert.equal(await renderer().getAttribute('data-edge-count'), '3'); await explorer().getByRole('button', { name: 'Clear folder graph filter', exact: true }).click(); await graphCount(606);
  await explorer().getByLabel('Search vault graph', { exact: true }).fill('path:projects'); await graphCount(5);
  await explorer().getByLabel('Search vault graph', { exact: true }).fill(''); await graphCount(606);
  check('folder filter follows the selected source root without mixing duplicate vault paths; graph search remains a view-only filter');
  const generation = await renderer().getAttribute('data-layout-generation');
  await act('/v1/brain', 'GET', () => page.locator('.pn-header').getByRole('button', { name: 'Refresh', exact: true }).click());
  await inspector().getByRole('heading', { name: beta.title, exact: true }).waitFor(); assert.equal(await renderer().getAttribute('data-layout-generation'), generation);
  await page.getByRole('button', { name: 'Files', exact: true }).click(); await page.getByRole('complementary', { name: 'File preview', exact: true }).getByRole('heading', { name: beta.title, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Obsidian', exact: true }).click(); await page.getByRole('region', { name: 'Source details', exact: true }).getByRole('heading', { name: beta.title, exact: true }).waitFor();
  await page.getByRole('button', { name: 'GitNexus', exact: true }).click(); await inspector().getByRole('heading', { name: beta.title, exact: true }).waitFor();
  check('refresh retains source selection and force topology; Files, Obsidian and Vault explorer share exact source IDs');

  await act(`/v1/rooms/${activeRoom.id}/sources`, 'PUT', () => inspector().getByRole('button', { name: 'Add note to chat', exact: true }).click());
  state = await api('/v1/brain'); assert.deepEqual(state.rooms.find(room => room.id === activeRoom.id).selectedSourceIds, [beta.id]); assert.equal(state.governance.runs.length, 0); assert.ok(state.rooms.every(room => room.messages.length === 0));
  check('explicit Add note to chat attaches only its original source ID to the active room without sending a message or running a model');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const toggle = explorer().getByRole('button', { name: 'Toggle vault graph folders', exact: true }); if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await explorer().getByLabel('Search vault files', { exact: true }).fill('Beta'); await explorer().getByRole('treeitem', { name: beta.title, exact: true }).click();
    await inspector().getByRole('heading', { name: beta.title, exact: true }).waitFor();
    const size = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth })); assert.ok(size.document <= width + 1 && size.body <= width + 1, JSON.stringify(size));
  }
  await page.screenshot({ path: path.join(outputDirectory, 'vault-graph-mobile.png'), fullPage: true, animations: 'disabled' }); await page.setViewportSize({ width: 1600, height: 1100 });
  check('mobile folder selection reveals the note inspector and remains usable at 390px and 320px without page overflow');

  const memberPage = await connect(member.token); await navigate('Brain', memberPage); await memberPage.getByRole('button', { name: 'GitNexus', exact: true }).click(); await graphCount(2, memberPage); await selectGraphNote(beta, memberPage);
  assert.equal(await renderer(memberPage).getAttribute('data-edge-count'), '1'); assert.equal(await memberPage.getByRole('button', { name: 'Code indexes', exact: true }).count(), 0);
  const memberText = await explorer(memberPage).evaluate(element => element.outerHTML); for (const secret of [fixture, 'SYNTHETIC_UNSHARED_CONTENT', 'SYNTHETIC_PERSONAL_ALPHA', 'Unshared roadmap.md']) assert.equal(memberText.includes(secret), false);
  assert.equal(await inspector(memberPage).getByRole('button', { name: 'Add note to chat', exact: true }).isDisabled(), true); assert.equal(discoveryReads, 0); await memberPage.close();
  check('member explorer uses only its two permitted notes and relationship, redacts private roots/content and exposes no code indexes or mutations');

  await page.getByRole('button', { name: 'Code indexes', exact: true }).click(); await page.getByRole('region', { name: 'Connect GitNexus repository', exact: true }).getByText('No registered repositories found.', { exact: false }).waitFor();
  assert.equal(discoveryReads, 1); await page.getByRole('button', { name: 'Vault graph', exact: true }).click(); await graphCount(606);
  check('separate Code indexes is still available to the owner and discovery begins only after explicitly selecting it');
  await act('/v1/lock', 'POST', () => page.getByRole('button', { name: 'Lock Brain', exact: true }).click()); assert.equal(await explorer().count(), 0); assert.equal(await page.locator('.pn-vault-tree, .pn-obsidian-canvas').count(), 0);
  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase); await act('/v1/unlock', 'POST', () => page.getByRole('button', { name: 'Unlock Brain →', exact: true }).click());
  await navigate('Brain'); await page.getByRole('button', { name: 'GitNexus', exact: true }).click(); await graphCount(606);
  assert.equal(await inspector().getByRole('heading', { name: beta.title, exact: true }).count(), 0); assert.equal(discoveryReads, 1);
  check('lock removes all readable graph/tree/inspector data; unlock starts the Vault view without retained private selection');
  state = await api('/v1/brain'); assert.deepEqual(state.objects, originalObjects); assert.equal(state.objects.some(object => object.kind === 'code_graph'), false);
  for (const [file, text] of sourceFiles) assert.equal(await readFile(file, 'utf8'), text);
  assert.deepEqual(mutations, [`/v1/rooms/${activeRoom.id}/sources`, '/v1/lock', '/v1/unlock']); assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })); for (const secret of [token, passphrase, fixture, 'SYNTHETIC_WORK_ALPHA']) assert.equal(storage.includes(secret), false);
  check('source revisions and all 606 vault files stay unchanged; no code snapshot, remote request, plaintext persistence or console error');
  console.log(`Vault graph checks: ${checks.length} passed. Screenshots: ${outputDirectory}`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(outputDirectory, 'vault-graph-failure.png'), fullPage: true }).catch(() => {}); throw error;
} finally {
  await browser?.close(); await server?.close(); if (path.basename(fixture).startsWith('arkive-vault-graph-browser-')) await rm(fixture, { recursive: true, force: true });
}
