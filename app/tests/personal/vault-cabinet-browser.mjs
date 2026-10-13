/** Connected-folder cabinet regression: isolated synthetic vaults, no real source data. */
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
const fixture = await realpath(await mkdtemp(path.join(os.tmpdir(), 'arkive-vault-cabinet-')));
const output = path.join(appDirectory, '.personal-test');
const token = 'synthetic-vault-cabinet-owner-token-'.repeat(2);
const modulePath = process.env.PLAYWRIGHT_MODULE;
const playwright = await import(modulePath && path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath || 'playwright');
const checks = [], errors = [], outbound = [], mutations = [], sources = new Map();
let origin, server, browser, page;
const check = label => { checks.push(label); console.log('PASS ' + label); };
async function api(route, method = 'GET', body, credential = token) {
  const response = await fetch(origin + route, { method, headers: { Authorization: `Bearer ${credential}`, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); assert.ok(response.ok, `${method} ${route}: ${JSON.stringify(value)}`); return value;
}
async function seed(relative, text) {
  const target = path.join(fixture, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, text); sources.set(target, text); return target;
}
async function navigate(target, name) {
  const toggle = target.getByRole('button', { name: 'Toggle workspace navigation', exact: true });
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await target.getByRole('navigation', { name: 'Personal workspace' }).getByRole('button', { name, exact: true }).click();
}
async function connect(credential) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } }); const target = await context.newPage();
  target.on('pageerror', error => errors.push(error.message)); target.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  target.on('request', request => { if (['POST', 'PUT', 'DELETE'].includes(request.method())) mutations.push(new URL(request.url()).pathname); });
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue(); outbound.push(url.origin); return route.abort(); });
  await target.goto(origin + '/local.html'); await target.getByLabel('Personal node URL').fill(origin); await target.getByLabel('Node access token').fill(credential);
  await target.getByRole('button', { name: 'Connect node →', exact: true }).click(); await target.getByRole('navigation', { name: 'Personal workspace' }).waitFor();
  await navigate(target, 'Brain'); await target.getByRole('button', { name: 'Files', exact: true }).click(); return target;
}
async function assertRows(cabinet, count) { await page.waitForFunction(expected => document.querySelectorAll('.pn-file-cabinet .fc-file').length === expected, count); assert.equal(await cabinet.locator('.fc-file').count(), count); }

try {
  const ui = path.join(fixture, 'ui');
  await build({ root: appDirectory, configFile: false, plugins: [react()], logLevel: 'warn', build: { outDir: ui, emptyOutDir: true, rollupOptions: { input: path.join(appDirectory, 'local.html') } } });
  await mkdir(output, { recursive: true });
  const main = path.join(fixture, 'personal/vault'), other = path.join(fixture, 'business/vault'), nested = path.join(main, 'research/subvault');
  const rootSource = await seed('personal/vault/Root intro.md', 'Root level source.');
  const researchSource = await seed('personal/vault/research/Research alpha.md', 'Research source.');
  await seed('personal/vault/research/literature/Literature beta.md', 'Nested literature source.');
  await seed('personal/vault/research/subvault/Separate connected source.md', 'Longer root owns this source.');
  await seed('business/vault/Other vault intro.md', 'Same basename, different root.');
  for (let i = 0; i < 13; i++) await seed(`personal/vault/topic-${String(i).padStart(2, '0')}/Topic ${i}.md`, `Synthetic topic ${i}.`);
  const reserve = net.createServer(); await new Promise((resolve, reject) => { reserve.once('error', reject); reserve.listen(0, '127.0.0.1', resolve); }); const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve)); origin = `http://127.0.0.1:${port}`;
  server = await createNodeServer({ directory: path.join(fixture, 'brain'), host: '127.0.0.1', port, token, allowedOrigins: [origin], staticDirectory: ui, provider: {} }); await server.start();
  await api('/v1/unlock', 'POST', { create: true, passphrase: 'Synthetic vault test recovery phrase', name: 'Vault hierarchy test' });
  for (const sourceRoot of [main, other, nested]) { const folder = await api('/v1/folders', 'POST', { path: sourceRoot }); await api(`/v1/folders/${folder.id}/refresh`, 'POST', {}); }
  const loose = await api('/v1/objects', 'POST', { title: 'Unfiled capture', kind: 'note', text: 'Not silently put into a source folder.' });
  let state = await api('/v1/brain'); const rootObject = state.objects.find(object => object.sourcePath === rootSource), researchObject = state.objects.find(object => object.sourcePath === researchSource); assert.ok(rootObject && researchObject);
  const collection = await api('/v1/workspace/collections', 'POST', { name: 'Hand-picked references', color: '#f4bc59', sourceIds: [loose.id, rootObject.id] });
  const shared = await api('/v1/rooms', 'POST', { title: 'Shared references' }), member = await api('/v1/members', 'POST', { name: 'Vault source reader' });
  await api(`/v1/rooms/${shared.id}/sources`, 'PUT', { objectIds: [rootObject.id] });
  await api(`/v1/rooms/${shared.id}/policy`, 'PUT', { memberGrants: [{ memberId: member.member.id, role: 'reader', sourceIds: [rootObject.id] }] });
  const originalObjects = (await api('/v1/brain')).objects;
  browser = await playwright.chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) }); page = await connect(token);
  const cabinet = page.getByRole('region', { name: 'Files', exact: true }), inspector = cabinet.getByRole('complementary', { name: 'File preview' });
  assert.equal(await cabinet.getByRole('button', { name: /^Smart folders/ }).getAttribute('aria-pressed'), 'true');
  assert.equal(await cabinet.locator('.fc-tab').count(), 5);
  assert.ok((await cabinet.getByLabel('Choose Arkive folder').locator('option').allTextContents()).some(text => text.includes('Research')));
  assert.deepEqual(mutations, []);
  const originalTabOrder = await cabinet.locator('.fc-layer').evaluateAll(nodes=>nodes.map(node=>node.dataset.folderId));
  const researchTab = cabinet.locator('.fc-layer[data-folder-id="smart:Research"] .fc-tab');
  await researchTab.focus(); await researchTab.press('Enter'); await assertRows(cabinet,2);
  await page.waitForFunction(()=>document.querySelector('.fc-sheet').getAnimations().length === 0 && [...document.querySelectorAll('.fc-layer')].every(node=>node.getAnimations().length === 0));
  assert.deepEqual(await cabinet.locator('.fc-layer').evaluateAll(nodes=>nodes.map(node=>node.dataset.folderId)),originalTabOrder);
  assert.equal(await researchTab.evaluate(node=>document.activeElement===node),true);
  const geometry = await cabinet.locator('.fc-deck').evaluate(deck=>{
    const layers=[...deck.querySelectorAll('.fc-layer')], front=deck.querySelector('[data-front=true]');
    return {height:deck.getBoundingClientRect().height, front:front.getBoundingClientRect().top, tops:layers.map(node=>node.getBoundingClientRect().top), duration:getComputedStyle(front).transitionDuration};
  });
  assert.ok(geometry.height >= 240); assert.equal(geometry.front,Math.max(...geometry.tops)); assert.equal(geometry.duration,'0.38s');
  await page.getByRole('button',{name:'Refresh',exact:true}).click(); await page.locator('.pn-progress').waitFor({state:'hidden'});
  assert.equal(await cabinet.locator('.fc-sheet').evaluate(node=>node.getAnimations().length),0);
  await page.emulateMedia({reducedMotion:'reduce'});
  await cabinet.locator('.fc-layer[data-folder-id="smart:Inbox"] .fc-tab').click();
  assert.equal(await cabinet.locator('.fc-sheet').evaluate(node=>node.getAnimations().length),0);
  assert.equal(await cabinet.locator('.fc-layer').first().evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await cabinet.getByRole('button',{name:'Next folder sheets',exact:true}).click();
  assert.equal(await cabinet.locator('.fc-tab').count(),5);
  await cabinet.getByRole('button',{name:'Previous folder sheets',exact:true}).click();
  check('animated folder stack keeps stable tabs and keyboard focus, brings selection forward, supports paging and reduced motion, and does not replay on refresh');
  await cabinet.getByLabel('Choose Arkive folder').selectOption('smart:Research'); await assertRows(cabinet,2);
  await cabinet.getByLabel('Choose Arkive folder').selectOption('smart:Inbox');
  await cabinet.getByLabel(`Select file ${loose.title}`,{exact:true}).check();
  await cabinet.getByLabel('Refine destination',{exact:true}).fill('Projects');
  const refined=page.waitForResponse(response=>response.url().endsWith('/v1/workspace/filing'));
  await cabinet.getByRole('button',{name:'Refine selected',exact:true}).click(); assert.equal((await refined).ok(),true); await page.locator('.pn-progress').waitFor({state:'hidden'});
  await cabinet.getByLabel('Choose Arkive folder').selectOption('smart:Projects'); await assertRows(cabinet,1);
  await cabinet.getByLabel('Smart folder color',{exact:true}).fill('#a3b7a8');
  const colored=page.waitForResponse(response=>response.url().endsWith('/v1/workspace/filing'));
  await cabinet.getByRole('button',{name:'Save folder color',exact:true}).click(); assert.equal((await colored).ok(),true); await page.locator('.pn-progress').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Refresh',exact:true}).click(); await page.locator('.pn-progress').waitFor({state:'hidden'});
  await assertRows(cabinet,1); assert.equal(await cabinet.locator('.fc-sheet').evaluate(element=>getComputedStyle(element).getPropertyValue('--fc-fill').trim()),'#a3b7a8');
  await page.setViewportSize({width:1600,height:1500}); await cabinet.locator('.fc-toolbar').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(output,'smart-folders-desktop.png'),fullPage:true,animations:'disabled'});
  for(const width of [390,320]) { await page.setViewportSize({width,height:900}); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)); }
  await cabinet.locator('.fc-toolbar').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(output,'smart-folders-mobile.png'),fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:1600,height:1200});
  await cabinet.getByLabel(`Select file ${loose.title}`,{exact:true}).check();
  const reset=page.waitForResponse(response=>response.url().endsWith('/v1/workspace/filing'));
  await cabinet.getByRole('button',{name:'Reset to automatic',exact:true}).click(); assert.equal((await reset).ok(),true); await page.locator('.pn-progress').waitFor({state:'hidden'});
  assert.deepEqual((await api('/v1/brain')).workspace.filing.overrides,[]);
  assert.deepEqual((await api('/v1/brain')).objects,originalObjects);
  check('Smart folders opens automatically with multiple colored folder tabs; refinements and colors survive refresh, reset is reversible and mobile fits');
  await cabinet.getByRole('button',{name:/^Vault folders/}).click();
  await cabinet.getByLabel('Choose source vault').waitFor();
  assert.equal(await cabinet.getByRole('button', { name: /^Vault folders/ }).getAttribute('aria-pressed'), 'true'); assert.equal(await cabinet.locator('.fc-tab').count(), 3);
  const options = await cabinet.getByLabel('Choose source vault').locator('option').evaluateAll(elements => elements.map(element => ({ text: element.textContent, value: element.value })));
  const mainOption = options.find(option => option.text.includes(' · personal')), otherOption = options.find(option => option.text.includes(' · business')), nestedOption = options.find(option => option.text.startsWith('subvault'));
  assert.ok(mainOption && otherOption && nestedOption); assert.notEqual(mainOption.text, otherOption.text);
  await cabinet.getByLabel('Choose source vault').selectOption(mainOption.value); await assertRows(cabinet, 16);
  assert.equal(await cabinet.locator('.fc-subfolder').count(), 12); assert.equal(await cabinet.locator(`[data-object-id="${loose.id}"]`).count(), 0);
  check('original vault view remains separate; same-name roots are distinct and no collections are seeded');
  await cabinet.getByLabel('Include subfolders').uncheck(); await assertRows(cabinet, 1); assert.equal(await cabinet.locator(`[data-object-id="${rootObject.id}"]`).count(), 1);
  await cabinet.getByLabel('Include subfolders').check(); await assertRows(cabinet, 16);
  await cabinet.getByRole('button', { name: 'Open folder research, 2 imported files', exact: true }).click(); await assertRows(cabinet, 2);
  assert.equal(await cabinet.getByRole('navigation', { name: 'Vault folder path' }).getByRole('button').count(), 2);
  await cabinet.getByLabel('Include subfolders').uncheck(); await assertRows(cabinet, 1); assert.equal(await cabinet.locator(`[data-object-id="${researchObject.id}"]`).count(), 1);
  await cabinet.getByRole('button', { name: 'Open folder literature, 1 imported files', exact: true }).click(); await assertRows(cabinet, 1);
  assert.equal(await cabinet.getByRole('navigation', { name: 'Vault folder path' }).getByRole('button').count(), 3);
  await cabinet.getByRole('navigation', { name: 'Vault folder path' }).getByRole('button', { name: 'research', exact: true }).click(); await assertRows(cabinet, 1);
  check('real nested folders drill down with breadcrumbs; direct and subtree filters preserve root-level files');
  await cabinet.getByLabel('Choose source vault').selectOption(nestedOption.value); await assertRows(cabinet, 1); assert.match(await cabinet.locator('.fc-file').innerText(), /Separate connected source/);
  await cabinet.getByLabel('Choose source vault').selectOption(otherOption.value); await assertRows(cabinet, 1); assert.match(await cabinet.locator('.fc-file').innerText(), /Other vault intro/);
  check('overlapping grants use longest-root ownership and root switching never mixes same-named vaults');
  await cabinet.getByLabel('Choose source vault').selectOption(mainOption.value); await cabinet.getByLabel('Include subfolders').check();
  await cabinet.getByLabel('Find a subfolder').fill('topic-12'); assert.equal(await cabinet.locator('.fc-subfolder').count(), 1);
  await cabinet.getByLabel('Find a subfolder').fill(''); await cabinet.getByRole('button', { name: /Show more subfolders/ }).click(); assert.equal(await cabinet.locator('.fc-subfolder').count(), 14); assert.equal(await cabinet.locator('.fc-tab').count(), 3);
  await cabinet.locator(`[data-object-id="${rootObject.id}"]`).click(); await inspector.getByRole('heading', { name: rootObject.title, exact: true }).waitFor();
  await page.setViewportSize({ width: 1600, height: 2000 }); await cabinet.locator('.fc-toolbar').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'vault-cabinet-desktop.png'), fullPage: true, animations: 'disabled' }); await page.setViewportSize({ width: 1600, height: 1200 });
  check('large branches use searchable, paginated child cards while only connected vaults become sheets');
  await cabinet.getByRole('button', { name: /^Collections/ }).click(); await cabinet.getByLabel('Choose Arkive folder').selectOption('collection:' + collection.id); await assertRows(cabinet, 2);
  await cabinet.locator('.fc-color-toggle').click(); await cabinet.getByLabel('Hex color', { exact: true }).fill('#a3b7a8');
  const save = page.waitForResponse(response => response.url().endsWith('/v1/workspace/collections') && response.request().method() === 'POST'); await cabinet.getByRole('button', { name: 'Save color', exact: true }).click(); assert.equal((await save).ok(), true); await page.locator('.pn-progress').waitFor({ state: 'hidden' });
  state = await api('/v1/brain'); assert.equal(state.workspace.collections.find(item => item.id === collection.id).color, '#a3b7a8'); assert.deepEqual(state.workspace.collections.find(item => item.id === collection.id).sourceIds, [loose.id, rootObject.id]); assert.deepEqual(state.objects, originalObjects);
  check('manual collections and saved color edits remain independent of the derived vault hierarchy');
  await cabinet.getByRole('button', { name: /^Vault folders/ }).click(); await cabinet.getByLabel('Choose source vault').selectOption(otherOption.value); await cabinet.getByLabel('Search this Arkive folder').fill('nothing');
  await navigate(page, 'Library'); const card = page.locator('.pn-wp-card').filter({ has: page.getByRole('heading', { name: collection.name, exact: true }) }); await card.locator('.pn-wp-source-links summary').click(); await card.getByRole('button', { name: rootObject.title, exact: true }).click();
  await inspector.getByRole('heading', { name: rootObject.title, exact: true }).waitFor(); assert.equal(await cabinet.getByLabel('Choose source vault').inputValue(), mainOption.value); assert.equal(await cabinet.getByLabel('Search this Arkive folder').inputValue(), '');
  await navigate(page, 'Library'); await card.locator('.pn-wp-source-links summary').click(); await card.getByRole('button', { name: loose.title, exact: true }).click(); await inspector.getByRole('heading', { name: loose.title, exact: true }).waitFor(); assert.equal(await cabinet.getByLabel('Choose Arkive folder').inputValue(), 'system:all');
  check('external source links reveal their real containing vault folder or the all-files capture view');
  await cabinet.getByRole('button', { name: /^Vault folders/ }).click(); await cabinet.getByLabel('Choose source vault').selectOption(mainOption.value);
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 900 }); const size = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth })); assert.ok(size.document <= width + 1 && size.body <= width + 1, JSON.stringify(size)); }
  await cabinet.locator('.fc-toolbar').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, 'vault-cabinet-mobile.png'), fullPage: true, animations: 'disabled' }); check('vault hierarchy remains reachable at 390px and 320px without horizontal page overflow');
  const memberPage = await connect(member.token), memberCabinet = memberPage.getByRole('region', { name: 'Files', exact: true }); await memberCabinet.locator('.fc-file').waitFor(); assert.equal(await memberCabinet.locator('.fc-file').count(), 1); assert.equal(await memberCabinet.getByRole('group', { name: 'File organization views' }).count(), 0);
  await memberCabinet.locator('.fc-file').click(); const memberText = await memberCabinet.innerText(); for (const privateText of [fixture, 'Hand-picked references', 'personal/vault', 'business/vault']) assert.equal(memberText.includes(privateText), false);
  assert.equal(await memberCabinet.locator('.fc-file-form,.fc-color-control,.fc-vault-navigation').count(), 0); await memberPage.close(); check('member view exposes only permitted files, with no owner roots, path metadata, collection names or mutations');
  assert.deepEqual(mutations, ['/v1/workspace/filing','/v1/workspace/filing','/v1/workspace/filing','/v1/workspace/collections']); assert.deepEqual((await api('/v1/brain')).objects, originalObjects); for (const [source, original] of sources) assert.equal(await readFile(source, 'utf8'), original); assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  check('navigation never writes source files or collection membership and triggers no remote requests or runtime errors');
  console.log(`Vault cabinet checks: ${checks.length} passed. Screenshots: ${output}`);
} catch (error) { if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'vault-cabinet-failure.png'), fullPage: true }).catch(() => {}); throw error; }
finally { await browser?.close(); await server?.close(); if (path.basename(fixture).startsWith('arkive-vault-cabinet-')) await rm(fixture, { recursive: true, force: true }); }
