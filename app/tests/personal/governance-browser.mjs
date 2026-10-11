/**
 * Isolated owner/member governance regression against the built Personal UI.
 * Run after npm run build:personal. Set PLAYWRIGHT_MODULE to an existing
 * Playwright module and optionally PLAYWRIGHT_EXECUTABLE_PATH to Chromium.
 * With a local Playwright install the module override is unnecessary.
 * No dependencies are installed. All sources, credentials and provider traffic
 * are synthetic; only this harness's freshly-created temporary directory is removed.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { access, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createNodeServer } from '../../../personal-node/server.mjs';

const appDirectory = fileURLToPath(new URL('../../', import.meta.url));
const builtDirectory = path.join(appDirectory, 'dist-personal');
const outputDirectory = path.join(appDirectory, '.personal-test');
await access(path.join(builtDirectory, 'local.html'));
const builtHtml = await readFile(path.join(builtDirectory, 'local.html'), 'utf8');
const buildAssets = [...builtHtml.matchAll(/assets\/[^"']+\.(?:js|css)/g)].map(match => match[0]);
const modulePath = process.env.PLAYWRIGHT_MODULE;
let playwright;
try {
  playwright = await import(modulePath && path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath || 'playwright');
} catch (cause) {
  throw new Error('Use an existing Playwright install via PLAYWRIGHT_MODULE. This test installs nothing.', { cause });
}
const fixture = await realpath(await mkdtemp(path.join(os.tmpdir(), 'arkive-governance-browser-')));
const ownerToken = 'synthetic-governance-owner-credential-'.repeat(2);
const sharedText = 'SYNTHETIC_SHARED_CONTEXT: Reviewed launch color is amber.';
const privateText = 'SYNTHETIC_PRIVATE_LEGAL: owner-only legal deliberations must never reach a member.';
const oldPrompt = 'SYNTHETIC_OLD_TRANSCRIPT: owner discussion before any membership existed.';
const requestPrompt = 'Summarize the reviewed launch color from my permitted source.';
const answer = 'Synthetic approved result: the reviewed launch color is amber.';
const checks = [], providerRequests = [], browserErrors = [], unexpectedResponses = [], requestFailures = [];
const expectedRevocations = [];
let node, browser, owner, member, reader, origin, revoking = false;
const record = label => { checks.push(label); console.log('PASS ' + label); };
const mockProvider = http.createServer(async (request, response) => {
  try {
    assert.equal(request.method, 'POST'); assert.equal(request.url, '/v1/chat/completions');
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    providerRequests.push(body);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: body.messages.at(-1).content === oldPrompt ? 'SYNTHETIC_OLD_PRIVATE_REPLY' : answer } }] }));
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: String(error) }));
  }
});

async function api(route, method = 'GET', body, token = ownerToken, expected = 200) {
  const response = await fetch(origin + route, { method, headers: {
    Authorization: 'Bearer ' + token, Origin: origin, 'Content-Type': 'application/json',
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json();
  assert.equal(response.status, expected, method + ' ' + route + ': ' + JSON.stringify(value));
  return value;
}
async function act(page, route, method, action) {
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === route && response.request().method() === method);
  const [, response] = await Promise.all([action(), responsePromise]);
  assert.ok(response.ok(), method + ' ' + route + ': ' + response.status() + ' ' + await response.text());
  await page.locator('.pn-progress').waitFor({ state: 'hidden' });
  return response.json();
}
async function navigate(page, label) {
  const toggle = page.getByRole('button', { name: 'Toggle workspace navigation', exact: true });
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByRole('navigation', { name: 'Personal workspace' }).getByRole('button', { name: label, exact: true }).click();
}
async function connect(token, name) {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 } });
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(name + ': ' + error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if (revoking && name === 'member' && /401/.test(message.text())) expectedRevocations.push('revoked member poll console 401');
    else browserErrors.push(name + ': ' + message.text());
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    if (revoking && name === 'member' && response.status() === 401 && ['/v1/status', '/v1/brain'].includes(new URL(response.url()).pathname)) expectedRevocations.push('revoked member poll 401');
    else unexpectedResponses.push(name + ': ' + response.status() + ' ' + response.url());
  });
  page.on('requestfailed', request => requestFailures.push(name + ': ' + request.url() + ' ' + request.failure()?.errorText));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort('blockedbyclient');
  });
  await page.goto(origin + '/local.html', { waitUntil: 'networkidle' });
  await page.getByLabel('Personal node URL').fill(origin);
  await page.getByLabel('Node access token').fill(token);
  await act(page, '/v1/status', 'GET', () => page.getByRole('button', { name: 'Connect node →', exact: true }).click());
  await page.getByRole('navigation', { name: 'Personal workspace' }).waitFor();
  return page;
}
const roomCard = page => page.getByRole('article', { name: 'Shared launch room chat', exact: true });
const governance = () => owner.locator('.pn-cw-focused-context').getByRole('complementary', { name: 'Governance for Shared launch room', exact: true });
async function section(title) {
  const target = governance().locator('.pn-rg-section').filter({ has: owner.getByText(title, { exact: true }) });
  if (await target.getAttribute('open') === null) await target.locator('summary').first().click();
  return target;
}
async function refresh(page) {
  await act(page, '/v1/brain', 'GET', () => page.locator('.pn-header').getByRole('button', { name: 'Refresh', exact: true }).click());
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outputDirectory, 'governance-' + name + '.png'), fullPage: false,
    animations: 'disabled', mask: [page.locator('.pn-rg-secret')] });
}
async function noOverflow(page, label) {
  const size = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(size.document <= size.width + 1 && size.body <= size.width + 1, label + ': ' + JSON.stringify(size));
}
async function noBrowserPersistence(page, forbidden) {
  const stored = await page.evaluate(async () => ({
    local: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)])),
    databases: indexedDB.databases ? await indexedDB.databases() : [],
  }));
  const serialized = JSON.stringify(stored);
  for (const value of forbidden) assert.ok(!serialized.includes(value), 'Credential or source plaintext persisted in browser storage');
  assert.deepEqual(stored.databases, [], 'No browser database should be created for this memory-only session');
}

try {
  await mkdir(outputDirectory, { recursive: true });
  await new Promise((resolve, reject) => { mockProvider.once('error', reject); mockProvider.listen(0, '127.0.0.1', resolve); });
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  origin = 'http://127.0.0.1:' + port;
  node = await createNodeServer({ directory: path.join(fixture, 'brain'), host: '127.0.0.1', port,
    token: ownerToken, allowedOrigins: [origin], staticDirectory: builtDirectory,
    provider: { baseUrl: 'http://127.0.0.1:' + mockProvider.address().port + '/v1', model: 'synthetic-governance-model' } });
  await node.start();
  await api('/v1/unlock', 'POST', { create: true, name: 'Synthetic governance Brain', passphrase: 'Synthetic governance recovery phrase only' });
  const sharedSource = await api('/v1/objects', 'POST', { title: 'Shared launch note', text: sharedText }, ownerToken, 201);
  const privateSource = await api('/v1/objects', 'POST', { title: 'Private legal source', text: privateText }, ownerToken, 201);
  const privateRoom = await api('/v1/rooms', 'POST', { title: 'Private legal room' }, ownerToken, 201);
  const sharedRoom = await api('/v1/rooms', 'POST', { title: 'Shared launch room' }, ownerToken, 201);
  await api('/v1/rooms/' + sharedRoom.id + '/sources', 'PUT', { objectIds: [privateSource.id] });
  await api('/v1/rooms/' + sharedRoom.id + '/messages', 'POST', { text: oldPrompt, allowExternal: true });
  const baselineCalls = providerRequests.length;
  assert.equal(baselineCalls, 1);
  const profile = await api('/v1/workspace/agents', 'POST', { name: 'Launch reviewer', description: 'Synthetic fixture profile', providerId: 'openai-compatible', sourceIds: [sharedSource.id] });
  const task = await api('/v1/workspace/tasks', 'POST', { title: 'Review launch context', description: 'Synthetic fixture task', status: 'todo', sourceIds: [sharedSource.id] });
  browser = await playwright.chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  owner = await connect(ownerToken, 'owner');
  await navigate(owner, 'Shared');
  async function createMember(name) {
    await owner.getByLabel('Member display name', { exact: true }).fill(name);
    const created = await act(owner, '/v1/members', 'POST', () => owner.getByRole('button', { name: 'Create separate member credential', exact: true }).click());
    const secret = owner.getByRole('region', { name: 'One-time member credential', exact: true });
    assert.equal(await secret.getByRole('textbox').inputValue(), created.token);
    assert.ok(created.token.startsWith('ark_member_'));
    await noBrowserPersistence(owner, [created.token, ownerToken, sharedText, privateText]);
    await secret.getByRole('button', { name: 'I saved it securely · dismiss credential', exact: true }).click();
    assert.equal(await secret.count(), 0);
    return created;
  }
  const participant = await createMember('Synthetic participant');
  const observer = await createMember('Synthetic reader');
  assert.equal(providerRequests.length, baselineCalls);
  record('owner creates two separate one-time credentials without room grants or model execution');
  await navigate(owner, 'Chat');
  await owner.locator('.pn-cw-active-room select:visible').selectOption(sharedRoom.id);
  await roomCard(owner).locator('summary').click();
  await act(owner, '/v1/rooms/' + sharedRoom.id + '/sources', 'PUT', () => roomCard(owner).getByRole('checkbox', { name: /Shared launch note/ }).click());
  assert.equal(await roomCard(owner).getByRole('checkbox', { name: /Shared launch note/ }).isChecked(), true);
  const layers = [];
  for (const [mode, name, source] of [['include', 'Reviewed launch knowledge', sharedSource], ['ask', 'Ask before launch context', sharedSource], ['exclude', 'Exclude legal deliberations', privateSource]]) {
    const area = await section('Memory layers');
    await area.getByRole('button', { name: '＋ Create memory layer', exact: true }).click();
    await area.getByLabel('Layer name', { exact: true }).fill(name);
    await area.getByLabel('Layer description', { exact: true }).fill('Synthetic ' + mode + ' policy gate.');
    await area.getByLabel(/^Layer policy/).selectOption(mode);
    await area.getByRole('group', { name: /^Layer sources/ }).getByRole('checkbox', { name: new RegExp(source.title) }).check();
    const layer = await act(owner, '/v1/layers', 'POST', () => area.getByRole('button', { name: 'Save layer', exact: true }).click());
    await act(owner, '/v1/rooms/' + sharedRoom.id + '/policy', 'PUT', () => area.getByRole('checkbox', { name, exact: true }).click());
    assert.equal(await area.getByRole('checkbox', { name, exact: true }).isChecked(), true);
    layers.push(layer);
  }
  let snapshot = await api('/v1/brain');
  assert.deepEqual(snapshot.governance.scopes.find(scope => scope.roomId === sharedRoom.id).sourceIds, [sharedSource.id]);
  assert.ok(snapshot.governance.scopes.find(scope => scope.roomId === sharedRoom.id).blocked.some(item => item.sourceId === privateSource.id));
  assert.equal(providerRequests.length, baselineCalls);
  record('include, ask and exclude layers are created and attached in UI; private source is blocked');
  const assignments = await section('Agent + work assignment');
  await act(owner, '/v1/rooms/' + sharedRoom.id + '/policy', 'PUT', () => assignments.getByLabel(/^Assigned agent profile/).selectOption(profile.id));
  await act(owner, '/v1/rooms/' + sharedRoom.id + '/policy', 'PUT', () => assignments.getByLabel(/^Linked task/).selectOption(task.id));
  for (const [account, role] of [[participant, 'participant'], [observer, 'reader']]) {
    const area = await section('Room participants');
    await area.getByRole('button', { name: '＋ Add room participant', exact: true }).click();
    const form = area.locator('.pn-rg-form');
    await form.getByLabel(/^Member/).selectOption(account.member.id);
    await form.getByLabel(/^Room role/).selectOption(role);
    await form.getByRole('group', { name: /^Permitted member sources/ }).getByRole('checkbox', { name: /Shared launch note/ }).check();
    await act(owner, '/v1/rooms/' + sharedRoom.id + '/policy', 'PUT', () => form.getByRole('button', { name: 'Save room access', exact: true }).click());
  }
  const pin = await section('Pinned context manifests');
  await pin.getByRole('checkbox', { name: /^Approve “Ask before launch context” for this manifest/ }).check();
  await pin.getByRole('checkbox', { name: /^I reviewed the selected sources and layer rules/ }).check();
  const manifest = await act(owner, '/v1/rooms/' + sharedRoom.id + '/manifests', 'POST', () => pin.getByRole('button', { name: 'Pin exact context', exact: true }).click());
  assert.deepEqual(manifest.bindings, [{ sourceId: sharedSource.id, revisionId: sharedSource.revisionId }]);
  snapshot = await api('/v1/brain');
  const policy = snapshot.governance.roomPolicies.find(item => item.roomId === sharedRoom.id);
  assert.equal(policy.agentId, profile.id); assert.equal(policy.taskId, task.id);
  assert.equal(policy.activeManifestId, manifest.id);
  assert.equal(snapshot.governance.scopes.find(scope => scope.roomId === sharedRoom.id).manifestStatus, 'active');
  assert.equal(providerRequests.length, baselineCalls);
  await screenshot(owner, 'owner-context');
  record('UI assigns profile/task, grants limited participant/reader access and pins exact approved context without executing');
  member = await connect(participant.token, 'member');
  reader = await connect(observer.token, 'reader');
  const memberState = await api('/v1/brain', 'GET', undefined, participant.token);
  assert.deepEqual(memberState.rooms.map(room => room.id), [sharedRoom.id]);
  assert.deepEqual(memberState.objects.map(source => source.id), [sharedSource.id]);
  assert.equal(memberState.rooms[0].messages.length, 0);
  const memberPayload = JSON.stringify(memberState);
  for (const forbidden of [privateText, privateSource.title, privateSource.id, privateRoom.id, privateRoom.title, oldPrompt, 'SYNTHETIC_OLD_PRIVATE_REPLY', sharedSource.revisionId, 'tokenHash']) {
    assert.ok(!memberPayload.includes(forbidden), 'Member received private or historical owner data');
  }
  assert.deepEqual(memberState.revisions, []); assert.deepEqual(memberState.audit, []);
  await roomCard(member).waitFor();
  assert.ok(!(await member.locator('body').innerText()).includes(privateSource.title));
  assert.equal(await member.getByLabel('New chat name', { exact: true }).count(), 0);
  assert.equal(await member.getByRole('button', { name: 'Encrypted export', exact: true }).count(), 0);
  assert.equal(await member.getByRole('navigation', { name: 'Workspace shortcuts', exact: true }).count(), 0);
  record('separate member context receives only its one permitted room/source, never private data or pre-grant transcript');
  for (const [route, method, body] of [
    ['/v1/rooms', 'POST', { title: 'Forbidden room' }], ['/v1/objects', 'POST', { title: 'Forbidden note', text: 'No mutation' }],
    ['/v1/export', 'GET'], ['/v1/sync', 'POST', {}], ['/v1/rooms/' + privateRoom.id, 'GET'],
    ['/v1/rooms/' + privateRoom.id + '/messages', 'POST', { text: 'Forbidden request' }],
  ]) await api(route, method, body, participant.token, 403);
  await roomCard(reader).getByLabel('Message Shared launch room', { exact: true }).fill('Reader must not submit this.');
  assert.equal(await roomCard(reader).getByRole('button', { name: 'Request owner approval', exact: true }).isDisabled(), true);
  await api('/v1/rooms/' + sharedRoom.id + '/messages', 'POST', { text: 'Reader forbidden request' }, observer.token, 403);
  assert.equal(providerRequests.length, baselineCalls);
  record('member owner-endpoints and other-room access return 403; reader cannot request or execute');
  await roomCard(member).getByLabel('Message Shared launch room', { exact: true }).fill(requestPrompt);
  const submitted = await act(member, '/v1/rooms/' + sharedRoom.id + '/messages', 'POST', () => roomCard(member).getByRole('button', { name: 'Request owner approval', exact: true }).click());
  assert.equal(submitted.run.state, 'awaiting-approval');
  assert.equal(providerRequests.length, baselineCalls, 'Participant submission must never call the provider');
  snapshot = await api('/v1/brain');
  const pendingRun = snapshot.governance.runs.find(run => run.id === submitted.run.id);
  assert.deepEqual(pendingRun.bindings, manifest.bindings);
  assert.equal(pendingRun.prompt, requestPrompt);
  assert.equal(pendingRun.manifestId, manifest.id);
  assert.equal(pendingRun.agentId, profile.id); assert.equal(pendingRun.taskId, task.id);
  await screenshot(member, 'member-pending');
  record('participant submits an awaiting-approval request with exact pinned inputs and zero provider calls');
  await refresh(owner); await navigate(owner, 'Agents');
  const activity = owner.getByRole('region', { name: 'Agent activity', exact: true });
  await activity.locator('.pn-activity-row').filter({ hasText: requestPrompt }).click();
  const inspector = activity.getByRole('region', { name: 'Request evidence inspector', exact: true });
  assert.equal(await inspector.getByRole('button', { name: 'Approve this request', exact: true }).isDisabled(), true);
  await inspector.locator('.pn-run-binding summary').click();
  assert.equal(await inspector.locator('.pn-run-binding pre').innerText(), sharedText);
  assert.ok((await inspector.innerText()).includes(sharedSource.revisionId));
  assert.ok(!(await inspector.innerText()).includes(privateText));
  await inspector.getByRole('checkbox', { name: /^Allow ask layer/ }).check();
  assert.equal(await inspector.getByRole('button', { name: 'Approve this request', exact: true }).isDisabled(), true);
  await screenshot(owner, 'pending-evidence');
  await inspector.getByRole('checkbox', { name: /^For this stored request/ }).check();
  await act(owner, '/v1/runs/' + pendingRun.id + '/approve', 'POST', () => inspector.getByRole('button', { name: 'Approve this request', exact: true }).click());
  assert.equal(providerRequests.length, baselineCalls + 1);
  const approvedInput = providerRequests.at(-1);
  const evidence = JSON.parse(approvedInput.messages[1].content.split('\n').slice(1).join('\n'));
  assert.deepEqual(evidence.map(item => item.sourceId), [sharedSource.id]);
  assert.equal(evidence[0].text, sharedText); assert.equal(approvedInput.messages.at(-1).content, requestPrompt);
  assert.ok(!JSON.stringify(approvedInput).includes(privateText)); assert.ok(!JSON.stringify(approvedInput).includes(oldPrompt));
  const completed = (await api('/v1/brain')).governance.runs.find(run => run.id === pendingRun.id);
  assert.equal(completed.state, 'completed');
  assert.ok(completed.events.some(event => event.type === 'owner.approved'));
  assert.ok(completed.events.some(event => event.type === 'provider.completed'));
  await member.bringToFront();
  await roomCard(member).getByText(answer, { exact: true }).waitFor({ timeout: 10000 });
  const visibleCompleted = (await api('/v1/brain', 'GET', undefined, participant.token)).governance.runs.find(run => run.id === pendingRun.id);
  assert.equal(visibleCompleted.state, 'completed'); assert.equal(visibleCompleted.bindings, undefined);
  record('owner inspects exact evidence and explicitly approves ask/external consent; one scoped mock call completes for the member');
  await navigate(member, 'Agents');
  const memberActivity = member.getByRole('region', { name: 'Agent activity', exact: true });
  await memberActivity.locator('.pn-activity-row').filter({ hasText: requestPrompt }).click();
  const memberInspector = memberActivity.getByRole('region', { name: 'Request evidence inspector', exact: true });
  await memberInspector.getByText('Source-revision details are redacted for this membership.', { exact: true }).waitFor();
  assert.ok((await memberInspector.innerText()).includes(answer));
  assert.equal(await memberInspector.getByRole('button', { name: 'Approve this request', exact: true }).count(), 0);
  assert.equal(await memberInspector.getByRole('button', { name: 'Prune member request', exact: true }).count(), 0);
  assert.ok(!(await memberInspector.innerText()).includes(sharedSource.revisionId));
  await screenshot(member, 'member-activity');
  record('member activity inspector shows its completed result but redacts exact revisions and owner-only actions');
  const network = activity.getByRole('region', { name: 'Recorded agent activity network', exact: true });
  assert.ok(await network.locator('[data-spatial-edge]').count() > 0);
  await network.getByRole('button', { name: 'Fit view', exact: true }).click();
  await screenshot(owner, 'agents-network');
  await navigate(owner, 'Canvas');
  await owner.getByRole('button', { name: 'Infinite', exact: true }).click();
  const canvas = owner.getByRole('region', { name: 'Infinite chat canvas', exact: true });
  assert.ok(await canvas.locator('[data-spatial-item="' + sharedRoom.id + ':governance"]').count());
  assert.ok(await canvas.locator('[data-spatial-item="' + sharedRoom.id + ':activity"]').count());
  const contextEdge = canvas.getByRole('button', { name: /Inspect connection: effective reads · 1/ }).first();
  await canvas.getByRole('button', { name: 'Fit view', exact: true }).click();
  await contextEdge.click();
  await canvas.getByRole('complementary', { name: 'Connection details', exact: true }).waitFor();
  assert.ok(await canvas.locator('[data-spatial-edge]').count() >= 4);
  await screenshot(owner, 'canvas');
  await noOverflow(owner, 'owner canvas');
  record('Canvas and Agents network show actual context/run connections with read-only connection inspection');
  await member.setViewportSize({ width: 390, height: 844 });
  await navigate(member, 'Chat');
  await roomCard(member).getByLabel('Message Shared launch room', { exact: true }).fill('Synthetic unsent member draft');
  const requestButton = roomCard(member).getByRole('button', { name: 'Request owner approval', exact: true });
  await requestButton.scrollIntoViewIfNeeded();
  assert.equal(await requestButton.isEnabled(), true);
  assert.equal(await requestButton.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true);
  await noOverflow(member, 'member mobile');
  await screenshot(member, 'mobile');
  await member.locator('.pn-cw-mobile-inspector summary').first().click();
  await member.locator('.pn-cw-mobile-inspector').getByRole('heading', { name: 'What this room can use', exact: true }).scrollIntoViewIfNeeded();
  await screenshot(member, 'mobile-context');
  await noBrowserPersistence(member, [participant.token, ownerToken, sharedText, privateText, requestPrompt, 'Synthetic unsent member draft']);
  await noBrowserPersistence(reader, [observer.token, sharedText, privateText]);
  record('mobile participant composer and room inspector remain reachable without overflow or plaintext browser persistence');
  await api('/v1/runs/prune', 'POST', { runIds: [pendingRun.id], confirm: true }, participant.token, 403);
  assert.equal(await member.getByRole('button', { name: 'Prune member request', exact: true }).count(), 0);
  await navigate(owner, 'Agents');
  const retentionActivity = owner.getByRole('region', { name: 'Agent activity', exact: true });
  await retentionActivity.locator('.pn-activity-row').filter({ hasText: requestPrompt }).click();
  const retention = retentionActivity.getByRole('region', { name: 'Request evidence inspector', exact: true });
  await retention.getByText('Member request retention', { exact: true }).click();
  const pruneButton = retention.getByRole('button', { name: 'Prune member request', exact: true });
  assert.equal(await pruneButton.isDisabled(), true);
  await retention.getByRole('checkbox', { name: 'I reviewed this member request and want to remove its receipt and messages.', exact: true }).check();
  const pruned = await act(owner, '/v1/runs/prune', 'POST', () => pruneButton.click());
  assert.deepEqual(pruned.prunedIds, [pendingRun.id]); assert.equal(pruned.messagesRemoved, 2);
  snapshot = await api('/v1/brain');
  assert.ok(!snapshot.governance.runs.some(run => run.id === pendingRun.id));
  assert.ok(!snapshot.rooms.flatMap(room => room.messages).some(message => message.runId === pendingRun.id));
  assert.ok(snapshot.audit.some(event => event.type === 'run.pruned'));
  await member.bringToFront();
  await roomCard(member).getByText(answer, { exact: true }).waitFor({ state: 'hidden', timeout: 10000 });
  assert.ok(!(await api('/v1/brain', 'GET', undefined, participant.token)).governance.runs.some(run => run.id === pendingRun.id));
  assert.equal(providerRequests.length, baselineCalls + 1);
  record('only owner can explicitly prune a terminal member receipt; associated chat messages disappear while audit remains');
  await navigate(owner, 'Chat');
  await owner.locator('.pn-cw-active-room select:visible').selectOption(sharedRoom.id);
  const participantsArea = await section('Room participants');
  const participantGrantCard = participantsArea.locator('.pn-rg-card').filter({ has: owner.getByRole('heading', { name: participant.member.name, exact: true }) });
  await participantGrantCard.getByRole('button', { name: 'Edit room access', exact: true }).click();
  const grantForm = participantsArea.locator('.pn-rg-form');
  assert.equal(await grantForm.getByRole('checkbox', { name: /Shared launch note/ }).isChecked(), true);
  snapshot = await api('/v1/brain');
  const livePolicy = snapshot.governance.roomPolicies.find(item => item.roomId === sharedRoom.id);
  await api('/v1/rooms/' + sharedRoom.id + '/policy', 'PUT', {
    agentId: livePolicy.agentId, taskId: livePolicy.taskId, layerIds: livePolicy.layerIds, activeManifestId: livePolicy.activeManifestId,
    memberGrants: livePolicy.memberGrants.map(({ memberId, role, sourceIds }) => ({ memberId, role, sourceIds: memberId === participant.member.id ? [] : sourceIds })),
    expectedContextKey: snapshot.governance.scopes.find(scope => scope.roomId === sharedRoom.id).contextKey,
  });
  await refresh(owner);
  await grantForm.locator('.pn-rg-warning').filter({ hasText: /changed|stale|outdated/i }).waitFor();
  assert.equal(await grantForm.getByRole('checkbox', { name: /Shared launch note/ }).isChecked(), true, 'Unsaved old grant remains visible for review');
  assert.equal(await grantForm.getByRole('button', { name: 'Save room access', exact: true }).isDisabled(), true);
  assert.deepEqual((await api('/v1/brain')).governance.roomPolicies.find(item => item.roomId === sharedRoom.id).memberGrants.find(item => item.memberId === participant.member.id).sourceIds, []);
  await screenshot(owner, 'stale-grant');
  await grantForm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await participantGrantCard.getByRole('button', { name: 'Edit room access', exact: true }).click();
  assert.equal(await grantForm.getByRole('checkbox', { name: /Shared launch note/ }).isChecked(), false);
  await grantForm.getByRole('checkbox', { name: /Shared launch note/ }).check();
  await act(owner, '/v1/rooms/' + sharedRoom.id + '/policy', 'PUT', () => grantForm.getByRole('button', { name: 'Save room access', exact: true }).click());
  record('concurrent owner restriction invalidates an open grant draft; refresh cannot silently restore old source access');
  const layerArea = await section('Memory layers');
  const includeLayerCard = layerArea.locator('.pn-rg-card').filter({ has: owner.getByRole('checkbox', { name: layers[0].name, exact: true }) });
  await includeLayerCard.getByRole('button', { name: 'Edit', exact: true }).click();
  const layerForm = layerArea.locator('.pn-rg-form');
  const liveLayer = (await api('/v1/brain')).governance.layers.find(layer => layer.id === layers[0].id);
  await api('/v1/layers', 'POST', { id: liveLayer.id, name: liveLayer.name, description: liveLayer.description,
    mode: 'exclude', sourceIds: liveLayer.sourceIds, expectedLayerKey: liveLayer.versionKey });
  await refresh(owner);
  await layerForm.locator('.pn-rg-warning').filter({ hasText: /changed|stale|outdated/i }).waitFor();
  assert.equal(await layerForm.getByLabel(/^Layer policy/).inputValue(), 'include', 'Old layer draft remains visible for review');
  assert.equal(await layerForm.getByRole('button', { name: 'Save layer', exact: true }).isDisabled(), true);
  assert.equal((await api('/v1/brain')).governance.layers.find(layer => layer.id === liveLayer.id).mode, 'exclude');
  await screenshot(owner, 'stale-layer');
  await layerForm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await includeLayerCard.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.equal(await layerForm.getByLabel(/^Layer policy/).inputValue(), 'exclude');
  await layerForm.getByLabel(/^Layer policy/).selectOption('include');
  await act(owner, '/v1/layers', 'POST', () => layerForm.getByRole('button', { name: 'Save layer', exact: true }).click());
  record('concurrent include-to-exclude layer update disables stale draft saving until fresh explicit review');
  const replacementArea = await section('Pinned context manifests');
  await replacementArea.getByRole('checkbox', { name: /^Approve “Ask before launch context” for this manifest/ }).check();
  await replacementArea.getByRole('checkbox', { name: /^I reviewed the selected sources and layer rules/ }).check();
  const replacement = await act(owner, '/v1/rooms/' + sharedRoom.id + '/manifests', 'POST', () => replacementArea.getByRole('button', { name: 'Create replacement manifest', exact: true }).click());
  const ownerRoom = roomCard(owner);
  await ownerRoom.getByLabel('Message Shared launch room', { exact: true }).fill('Synthetic unsent revoked-manifest check');
  await ownerRoom.getByRole('checkbox', { name: /^Allow ask layer/ }).check();
  const externalConsent = ownerRoom.getByRole('checkbox', { name: /^For this request/ });
  await externalConsent.check();
  assert.equal(await ownerRoom.getByRole('button', { name: 'Send ↗', exact: true }).isEnabled(), true);
  await act(owner, '/v1/manifests/' + replacement.id + '/revoke', 'POST', () => replacementArea.getByRole('button', { name: 'Revoke pinned context', exact: true }).click());
  assert.equal(await externalConsent.isDisabled(), true);
  assert.equal(await externalConsent.isChecked(), false);
  assert.equal(await ownerRoom.getByRole('button', { name: 'Send ↗', exact: true }).isDisabled(), true);
  assert.equal((await api('/v1/brain')).governance.scopes.find(scope => scope.roomId === sharedRoom.id).manifestStatus, 'revoked');
  assert.equal(providerRequests.length, baselineCalls + 1);
  record('revoking pinned context clears consent and disables owner consent/send before any provider call');
  await navigate(owner, 'Shared');
  const memberCard = owner.locator('.pn-rg-access-grid > .pn-rg-card').filter({ has: owner.getByRole('heading', { name: participant.member.name, exact: true }) });
  await memberCard.getByRole('button', { name: 'Revoke member credential', exact: true }).click();
  revoking = true;
  const revokedAt = Date.now();
  await act(owner, '/v1/members/' + participant.member.id + '/revoke', 'POST', () => memberCard.getByRole('button', { name: 'Confirm credential revocation', exact: true }).click());
  await member.bringToFront();
  await member.getByLabel('Node access token').waitFor({ timeout: 10000 });
  const revocationMs = Date.now() - revokedAt;
  assert.ok(revocationMs <= 10000, 'Visible revoked session must clear within 10 seconds');
  const cleared = await member.locator('body').innerText();
  for (const value of [sharedSource.title, sharedText, requestPrompt, answer, 'Synthetic unsent member draft']) assert.ok(!cleared.includes(value), 'Revoked session retained readable content');
  await api('/v1/brain', 'GET', undefined, participant.token, 401);
  await noBrowserPersistence(member, [participant.token, sharedText, requestPrompt]);
  await screenshot(member, 'revoked');
  assert.equal(providerRequests.length, baselineCalls + 1);
  record('UI credential revocation clears visible member content within ' + revocationMs + 'ms and future access returns 401');
  assert.deepEqual(browserErrors, []); assert.deepEqual(unexpectedResponses, []); assert.deepEqual(requestFailures, []);
  record('no unexpected browser errors, failed requests, external navigation or provider calls');
  console.log(JSON.stringify({ checks: checks.length, buildAssets, providerCalls: providerRequests.length,
    syntheticOwnerHistoryCalls: baselineCalls, approvedMemberCalls: providerRequests.length - baselineCalls,
    expectedRevocationResponses: expectedRevocations.length, screenshots: outputDirectory }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', checks, buildAssets, browserErrors, unexpectedResponses, requestFailures }, null, 2));
  if (owner && !owner.isClosed()) await screenshot(owner, 'failure').catch(() => {});
  throw error;
} finally {
  await browser?.close().catch(() => {});
  await node?.close().catch(() => {});
  await new Promise(resolve => mockProvider.close(resolve));
  await rm(fixture, { recursive: true, force: true });
  console.log('Removed only the synthetic governance fixture directory.');
}
