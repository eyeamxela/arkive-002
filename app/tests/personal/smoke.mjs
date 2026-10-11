/**
 * Built Personal UI -> authenticated node -> encrypted storage -> mock model.
 * Run from app after `npm run build:personal`:
 *   PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/personal/smoke.mjs
 * With Playwright already installed locally, the override can be omitted. This
 * script also accepts PLAYWRIGHT_EXECUTABLE_PATH for an existing Chromium binary.
 * Otherwise Playwright uses its own installed browser for this version.
 * It installs nothing and never calls live accounts or model providers.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createNodeServer, decryptExport } from '../../../personal-node/server.mjs';
import { verifyUnifiedWorkspace, verifyRestoredWorkspace } from './unified-browser.mjs';

const appDirectory = fileURLToPath(new URL('../../', import.meta.url));
const outputDirectory = path.join(appDirectory, '.personal-test');
const builtDirectory = path.join(appDirectory, 'dist-personal');
const port = Number(process.env.PERSONAL_TEST_PORT || 4319);
const origin = `http://127.0.0.1:${port}`;
const ownerToken = 'synthetic-browser-owner-token-'.repeat(2);
const passphrase = 'Synthetic browser recovery phrase only';
const noteTitle = 'Synthetic design source';
const noteText = 'The synthetic studio uses orange markers for reviewed decisions.';
const fileTitle = 'synthetic-source.md';
const approvedTitle = 'Reviewed marker convention';
const providerRequests = [];
const browserErrors = [];
const requestFailures = [];
const badResponses = [];
const checks = [];

await access(path.join(builtDirectory, 'local.html')).catch(() => {
  throw new Error('Missing built Personal UI. Run npm run build:personal from app first.');
});
let playwright;
try {
  const requested = process.env.PLAYWRIGHT_MODULE;
  playwright = await import(requested && path.isAbsolute(requested) ? pathToFileURL(requested).href : requested || 'playwright');
} catch (error) {
  throw new Error('Playwright is not available. Set PLAYWRIGHT_MODULE to an existing Playwright module, or install Playwright and its Chromium browser separately. This smoke script does not install dependencies.', { cause: error });
}

await mkdir(outputDirectory, { recursive: true });
const fixtureDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'arkive-personal-browser-')));
const brainDirectory = path.join(fixtureDirectory, 'brain');
const sourceDirectory = path.join(fixtureDirectory, 'sources');
await mkdir(sourceDirectory);
await writeFile(path.join(sourceDirectory, fileTitle), '# Synthetic folder source\n\nManual refresh imports this fixture only.\n');

const mockProvider = http.createServer(async (request, response) => {
  try {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v1/chat/completions');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    providerRequests.push(body);
    const evidence = JSON.parse(body.messages[1].content.split('\n').slice(1).join('\n'));
    const answer = evidence.length
      ? `Synthetic mock answer: orange markers identify reviewed decisions [${evidence[0].sourceId}].`
      : 'Synthetic mock answer: no Brain sources were selected for this independent room.';
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: answer } }] }));
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: String(error) }));
  }
});
const nodeOptions = {
  directory: brainDirectory, host: '127.0.0.1', port, token: ownerToken,
  allowedOrigins: [origin], staticDirectory: builtDirectory,
  provider: { baseUrl: '', model: 'synthetic-browser-model' },
};
let node;
let browser;
let page;
let completed = false;

function record(name) { checks.push(name); console.log(`PASS ${name}`); }
async function snapshot() {
  const response = await fetch(`${origin}/v1/brain`, { headers: { Authorization: `Bearer ${ownerToken}`, Origin: origin } });
  assert.equal(response.status, 200);
  return response.json();
}
async function idle() { await page.locator('.pn-progress').waitFor({ state: 'hidden' }); }
async function act(route, method, action) {
  const responsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === route && response.request().method() === method);
  const [, response] = await Promise.all([action(), responsePromise]);
  assert.ok(response.ok(), `${method} ${route}: ${response.status()} ${await response.text()}`);
  await idle();
  return response.json();
}
async function noOverflow(label) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1,
    `${label} horizontal overflow: ${JSON.stringify(dimensions)}`);
  record(`${label}: no page-level horizontal overflow`);
}
async function navigate(label) {
  const toggle = page.getByRole('button', { name: 'Toggle workspace navigation', exact: true });
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('navigation', { name: 'Personal workspace' }).getByRole('button', { name: new RegExp(`${escaped}(?:\\s*\\d+)?$`) }).click();
}
function roomCard(title) {
  return page.getByRole('article', { name: `${title} chat`, exact: true });
}
async function createRoom(title) {
  await navigate('Chat');
  await page.getByLabel('New chat name', { exact: true }).fill(title);
  return act('/v1/rooms', 'POST', () => page.getByRole('button', { name: '＋ New', exact: true }).click());
}

try {
  await new Promise((resolve, reject) => {
    mockProvider.once('error', reject);
    mockProvider.listen(0, '127.0.0.1', resolve);
  });
  nodeOptions.provider.baseUrl = `http://127.0.0.1:${mockProvider.address().port}/v1`;
  node = await createNodeServer(nodeOptions);
  await node.start();
  browser = await playwright.chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 }, acceptDownloads: true });
  page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('requestfailed', request => requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.goto(`${origin}/local.html`, { waitUntil: 'networkidle' });
  await page.getByLabel('Personal node URL').fill(origin);
  await page.getByLabel('Node access token').fill(ownerToken);
  await act('/v1/status', 'GET', () => page.getByRole('button', { name: 'Connect node →', exact: true }).click());
  await page.getByLabel('Brain name').fill('Synthetic browser Brain');
  await page.getByLabel('Create a passphrase · at least 12 characters').fill(passphrase);
  await act('/v1/unlock', 'POST', () => page.getByRole('button', { name: 'Create encrypted Brain →', exact: true }).click());
  await navigate('Brain');
  await page.getByRole('heading', { name: 'Your Brain', exact: true }).waitFor();
  assert.equal((await snapshot()).objects.length, 0, 'New Brain must contain no demo objects');
  record('connect and create empty encrypted Brain through UI');

  await page.getByLabel('Title', { exact: true }).fill(noteTitle);
  await page.getByLabel('Note', { exact: true }).fill(noteText);
  const note = await act('/v1/objects', 'POST', () => page.getByRole('button', { name: 'Save note →', exact: true }).click());
  assert.equal(note.text, noteText);
  assert.equal(providerRequests.length, 0, 'Capturing a note must not call a model');
  assert.equal((await snapshot()).objects[0].kind, 'note');
  record('manual note capture persists without model call or automatic memory approval');

  await page.getByLabel('Folder on this node').fill(sourceDirectory);
  const folder = await act('/v1/folders', 'POST', () => page.getByRole('button', { name: '＋ Connect folder', exact: true }).click());
  assert.equal((await snapshot()).objects.length, 2);
  assert.equal(await readFile(path.join(sourceDirectory, fileTitle), 'utf8'), '# Synthetic folder source\n\nManual refresh imports this fixture only.\n');
  await writeFile(path.join(sourceDirectory, fileTitle), '# Synthetic folder source\n\nManual refresh imports this revised fixture only.\n');
  await act(`/v1/folders/${folder.id}/refresh`, 'POST', () => page.getByRole('button', { name: `Refresh ${sourceDirectory}`, exact: true }).click());
  assert.ok((await snapshot()).objects.some(object => object.text.includes('revised fixture')));
  record('synthetic folder import and explicit refresh preserve originals');

  const firstRoom = await createRoom('Research room');
  const firstCard = roomCard('Research room');
  await firstCard.locator('summary').click();
  await act(`/v1/rooms/${firstRoom.id}/sources`, 'PUT', () => firstCard.getByRole('checkbox', { name: new RegExp(noteTitle) }).click());
  assert.equal(await firstCard.getByRole('checkbox', { name: new RegExp(noteTitle) }).isChecked(), true);
  await firstCard.getByLabel('Message Research room', { exact: true }).fill('Which marker does the synthetic studio use?');
  assert.equal(await firstCard.getByRole('button', { name: 'Send ↗', exact: true }).isDisabled(), true);
  assert.equal(providerRequests.length, 0);
  await firstCard.getByRole('checkbox', { name: /^For this request/ }).check();
  await act(`/v1/rooms/${firstRoom.id}/messages`, 'POST', () => firstCard.getByRole('button', { name: 'Send ↗', exact: true }).click());
  await firstCard.getByText(/Synthetic mock answer: orange markers/).waitFor();
  assert.equal(await firstCard.getByRole('checkbox', { name: /^For this request/ }).isChecked(), false);
  assert.equal(providerRequests.length, 1);
  assert.equal(providerRequests[0].model, 'synthetic-browser-model');
  assert.deepEqual(JSON.parse(providerRequests[0].messages[1].content.split('\n').slice(1).join('\n')).map(source => source.sourceId), [note.id]);
  record('explicit per-request consent and selected-source-only mock model reply');

  await navigate('Brain');
  await page.getByRole('button', { name: 'Propose memory', exact: true }).click();
  await page.locator('.pn-proposal-form').getByLabel('Title', { exact: true }).fill(approvedTitle);
  await page.locator('.pn-proposal-form').getByLabel('Memory', { exact: true }).fill('Reviewed synthetic convention: use orange markers for reviewed decisions.');
  await page.getByLabel('Supporting source').selectOption(note.id);
  await act('/v1/proposals', 'POST', () => page.getByRole('button', { name: 'Save proposal', exact: true }).click());
  let state = await snapshot();
  assert.equal(state.proposals[0].status, 'pending');
  assert.equal(state.objects.filter(object => object.kind === 'memory').length, 0);
  await act(`/v1/proposals/${state.proposals[0].id}/review`, 'POST', () => page.getByRole('button', { name: 'Approve memory', exact: true }).click());
  state = await snapshot();
  assert.equal(state.proposals[0].status, 'accepted');
  assert.equal(state.objects.filter(object => object.kind === 'memory').length, 1);
  record('memory proposal remains separate until explicit review approval');

  await navigate('Brain');
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.locator('.pn-file').filter({ hasText: approvedTitle }).click();
  assert.equal(await page.getByRole('region', { name: 'Source details' }).getByRole('heading', { name: approvedTitle, exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Obsidian', exact: true }).click();
  assert.equal(await page.locator('.pn-notegraph-point').count(), 3);
  assert.equal(await page.locator('.pn-notegraph-links line').count(), 1);
  await page.getByRole('button', { name: 'Zoom in graph', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Reset graph pan and zoom', exact: true }).textContent(), '120%');
  await page.getByRole('button', { name: 'Reset graph pan and zoom', exact: true }).click();
  record('Files and Graph share stored objects and approved-memory source link');

  await writeFile(path.join(sourceDirectory, 'linked-note.md'), '# Linked note\n\n[[synthetic-source|Source]]\n');
  await act(`/v1/folders/${folder.id}/refresh`, 'POST', () => page.getByRole('button', { name: `Refresh ${sourceDirectory}`, exact: true }).click());
  assert.equal(await page.locator('.pn-notegraph-point').count(), 4);
  assert.equal(await page.locator('.pn-notegraph-links line').count(), 2);
  await page.getByRole('button', { name: /^linked-note.md, document/ }).press('Enter');
  await page.getByRole('region', { name: 'Source details' }).getByRole('heading', { name: 'linked-note.md', exact: true }).waitFor();
  record('Obsidian wiki-link produces a real scoped edge and keyboard-selectable node');
  await page.screenshot({ path: path.join(outputDirectory, 'obsidian-graph.png'), fullPage: true });

  await navigate('Sources & sync');
  await page.getByLabel('Write destination').selectOption(folder.id);
  await page.getByLabel('Relative Markdown / text path').fill('linked-note.md');
  const approvedSourceText = '# Linked note\n\n[[synthetic-source]]\n\nExplicitly approved browser edit.\n';
  await page.getByLabel('Requested file contents').fill(approvedSourceText);
  const preview = await act('/v1/writebacks/preview', 'POST', () => page.getByRole('button', { name: 'Preview exact changes', exact: true }).click());
  assert.equal(await readFile(path.join(sourceDirectory, 'linked-note.md'), 'utf8'), '# Linked note\n\n[[synthetic-source|Source]]\n');
  assert.equal(await page.getByRole('button', { name: 'Apply approved change', exact: true }).isDisabled(), true);
  await page.screenshot({ path: path.join(outputDirectory, 'source-write-preview.png'), fullPage: true });
  await page.getByRole('checkbox', { name: /^I approve writing/ }).check();
  await act(`/v1/writebacks/${preview.id}/apply`, 'POST', () => page.getByRole('button', { name: 'Apply approved change', exact: true }).click());
  assert.equal(await readFile(path.join(sourceDirectory, 'linked-note.md'), 'utf8'), approvedSourceText);
  state = await snapshot();
  const linkedObject = state.objects.find(object => object.sourcePath === path.join(sourceDirectory, 'linked-note.md'));
  assert.equal(linkedObject.text, approvedSourceText);
  assert.ok(state.revisions.filter(revision => revision.objectId === linkedObject.id).length >= 2);
  record('source preview is read-only and explicit approval writes fixture plus encrypted revision history');

  const codeFixture = { format: 'arkive-code-graph', version: 1, repository: 'synthetic-code', truncated: false,
    nodes: [{ id: 'file', label: 'source.ts', type: 'File', filePath: 'src/source.ts', community: 'Synthetic module' },
      { id: 'call', label: 'readSource', type: 'Function', filePath: 'src/source.ts', community: 'Synthetic module' }],
    edges: [{ source: 'file', target: 'call', type: 'DEFINES' }] };
  await act('/v1/code-graphs', 'POST', () => page.getByLabel('Or import an Arkive code-graph JSON snapshot').setInputFiles({
    name: 'synthetic-code.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(codeFixture)),
  }));
  await navigate('Brain');
  await page.getByRole('button', { name: 'GitNexus', exact: true }).click();
  assert.equal(await page.locator('.pn-codegraph .pn-notegraph-point').count(), 2);
  await page.getByRole('button', { name: /^readSource, Function/ }).press('Enter');
  await page.getByLabel('Selected code symbol', { exact: true }).getByText('src/source.ts', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(outputDirectory, 'gitnexus-graph.png'), fullPage: true });
  record('separate GitNexus view renders imported symbol relationships and source-file inspection');
  await page.getByRole('button', { name: 'Obsidian', exact: true }).click();

  const secondRoom = await createRoom('Independent room');
  const secondCard = roomCard('Independent room');
  assert.equal(await secondCard.getByText('No sources selected', { exact: true }).count(), 1);
  await secondCard.getByLabel('Message Independent room', { exact: true }).fill('What context is available here?');
  await secondCard.getByRole('checkbox', { name: /^For this request/ }).check();
  await act(`/v1/rooms/${secondRoom.id}/messages`, 'POST', () => secondCard.getByRole('button', { name: 'Send ↗', exact: true }).click());
  assert.equal(providerRequests.length, 2);
  assert.deepEqual(JSON.parse(providerRequests[1].messages[1].content.split('\n').slice(1).join('\n')), []);
  assert.equal(providerRequests[1].messages.length, 3, 'No other room history should be sent');
  state = await snapshot();
  assert.deepEqual(state.rooms.find(room => room.id === firstRoom.id).selectedSourceIds, [note.id]);
  assert.deepEqual(state.rooms.find(room => room.id === secondRoom.id).selectedSourceIds, []);
  record('second visible chat has independent context and no inherited transcript');
  await noOverflow('desktop');
  await page.screenshot({ path: path.join(outputDirectory, 'desktop.png'), fullPage: true });

  const workspaceEvidence = await verifyUnifiedWorkspace({ page, act, snapshot, navigate, roomCard,
    firstRoom, secondRoom, note, providerRequests, outputDirectory, record, noOverflow });

  const downloadPromise = page.waitForEvent('download');
  await act('/v1/export', 'GET', () => page.getByRole('button', { name: '↓ Encrypted export', exact: true }).click());
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^arkive-brain-.*\.encrypted\.json$/);
  const downloaded = await readFile(await download.path(), 'utf8');
  assert.ok(!downloaded.includes(noteText), 'Downloaded bundle must not expose source plaintext');
  const recovered = await decryptExport(JSON.parse(downloaded), passphrase);
  assert.ok(JSON.stringify(recovered).includes(noteText));
  record('browser download is an authenticated encrypted recovery bundle');

  const beforeLock = await snapshot();
  await act('/v1/lock', 'POST', () => page.getByRole('button', { name: 'Lock Brain', exact: true }).click());
  await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
  assert.equal(await page.getByText(noteText, { exact: true }).count(), 0);
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert.ok(!JSON.stringify(storage).includes(ownerToken) && !JSON.stringify(storage).includes(passphrase));
  const encryptedFile = await readFile(path.join(brainDirectory, 'brain.enc'), 'utf8');
  assert.ok(!encryptedFile.includes(noteText));
  await node.close();
  node = await createNodeServer(nodeOptions);
  await node.start();
  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await act('/v1/unlock', 'POST', () => page.getByRole('button', { name: 'Unlock Brain →', exact: true }).click());
  state = await snapshot();
  assert.equal(state.objects.length, beforeLock.objects.length);
  assert.equal(state.rooms.length, beforeLock.rooms.length);
  assert.equal(state.rooms.reduce((sum, room) => sum + room.messages.length, 0), 4);
  assert.deepEqual(state.rooms.find(room => room.id === firstRoom.id).selectedSourceIds, [note.id]);
  await verifyRestoredWorkspace({ page, navigate, roomCard, snapshot, act, state, beforeLock,
    workspaceEvidence, origin, ownerToken, passphrase, record });
  record('lock clears readable UI; encrypted Brain survives service restart and unlock');

  await page.setViewportSize({ width: 390, height: 844 });
  await navigate('Brain');
  await noOverflow('mobile 390px');
  const mobileBounds = await page.evaluate(() => ({
    viewport: window.innerHeight, document: document.documentElement.scrollHeight,
    rootBottom: document.querySelector('.pn-app').getBoundingClientRect().bottom,
  }));
  assert.ok(mobileBounds.rootBottom <= mobileBounds.viewport + 1 && mobileBounds.document <= mobileBounds.viewport + 1,
    `Mobile workspace must be viewport-bounded: ${JSON.stringify(mobileBounds)}`);
  const menuToggle = page.getByRole('button', { name: 'Toggle workspace navigation', exact: true });
  await menuToggle.click();
  await noOverflow('mobile open navigation drawer');
  const navItems = page.getByRole('navigation', { name: 'Personal workspace' }).getByRole('button');
  assert.equal(await navItems.count(), 13);
  for (const item of await navItems.all()) {
    await item.scrollIntoViewIfNeeded();
    assert.equal(await item.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return rect.top >= 0 && rect.bottom <= window.innerHeight && (hit === element || element.contains(hit));
    }), true, `Mobile navigation item is unreachable: ${await item.textContent()}`);
  }
  await page.screenshot({ path: path.join(outputDirectory, 'unified-mobile-nav.png'), fullPage: false, animations: 'disabled' });
  await menuToggle.click();
  record('mobile shell is viewport-bounded and all 13 drawer destinations are scroll-reachable');
  await navigate('Work');
  await page.getByRole('heading', { name: 'Work', exact: true }).waitFor();
  await noOverflow('mobile Work');
  await navigate('Chat');
  await noOverflow('mobile Chat');
  await page.locator('.pn-cw-active-room select:visible').selectOption({ label: secondRoom.title });
  const mobileRoom = roomCard(secondRoom.title);
  await mobileRoom.locator('summary').click();
  await act(`/v1/rooms/${secondRoom.id}/sources`, 'PUT', () => mobileRoom.getByRole('checkbox', { name: new RegExp(noteTitle) }).click());
  assert.equal(await mobileRoom.getByRole('checkbox', { name: new RegExp(noteTitle) }).isChecked(), true);
  await act(`/v1/rooms/${secondRoom.id}/sources`, 'PUT', () => mobileRoom.getByRole('checkbox', { name: new RegExp(noteTitle) }).click());
  await mobileRoom.locator('summary').click();
  await mobileRoom.getByLabel(`Message ${secondRoom.title}`, { exact: true }).fill('Synthetic unsent mobile reachability check.');
  const mobileConsent = mobileRoom.getByRole('checkbox', { name: /^For this request/ });
  await mobileConsent.check();
  const mobileSend = mobileRoom.getByRole('button', { name: 'Send ↗', exact: true });
  await mobileSend.scrollIntoViewIfNeeded();
  assert.equal(await mobileSend.isEnabled(), true);
  assert.equal(await mobileSend.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return rect.top >= 0 && rect.bottom <= window.innerHeight && (hit === element || element.contains(hit));
  }), true, 'Mobile Send must be scroll-reachable and unobstructed');
  await mobileConsent.uncheck();
  record('mobile navigation, room selection, source controls and Send are reachable without model execution');
  await page.screenshot({ path: path.join(outputDirectory, 'unified-mobile.png'), fullPage: false, animations: 'disabled' });
  assert.deepEqual(browserErrors, [], 'No browser console or page errors');
  assert.deepEqual(requestFailures, [], 'No failed or external browser requests');
  assert.deepEqual(badResponses, [], 'No failed HTTP responses');
  record('browser console, page errors and network checks are clean');
  completed = true;
  console.log(JSON.stringify({ status: 'passed', checks, provider: 'local synthetic mock only', screenshots: outputDirectory }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(outputDirectory, 'failure.png'), fullPage: true }).catch(() => {});
  }
  console.error(JSON.stringify({ status: 'failed', checks, browserErrors, requestFailures, badResponses }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await node?.close();
  mockProvider.closeAllConnections();
  await new Promise(resolve => mockProvider.close(resolve));
  // The only recursive cleanup target is the exact fresh synthetic mkdtemp path.
  await rm(fixtureDirectory, { recursive: true, force: true });
  console.log(`${completed ? 'Completed' : 'Stopped'}; synthetic temporary Brain and source fixtures removed.`);
}
