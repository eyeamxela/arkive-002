/** Whole-vault scan UI against a real local node and synthetic files only. */
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createNodeServer } from '../../../personal-node/server.mjs';

const appDirectory = fileURLToPath(new URL('../../', import.meta.url));
const fixture = await realpath(await mkdtemp(path.join(os.tmpdir(), 'arkive-scan-browser-')));
const vault = path.join(fixture, 'vault'); const uiDirectory = path.join(fixture, 'ui');
const output = path.join(appDirectory, '.personal-test');
const token = 'synthetic-scan-browser-owner-'.repeat(2);
const password = 'Synthetic scan browser phrase only';
const playwrightPath = process.env.PLAYWRIGHT_MODULE;
const playwright = await import(playwrightPath && path.isAbsolute(playwrightPath) ? pathToFileURL(playwrightPath).href : playwrightPath || 'playwright');
let server; let browser;
const errors = []; const checks = [];
const check = (label) => { checks.push(label); console.log(`PASS ${label}`); };
try {
  await mkdir(vault); await mkdir(output, { recursive: true });
  for (let start = 0; start < 2_005; start += 100) await Promise.all(Array.from({ length: Math.min(100, 2_005 - start) }, (_, i) =>
    writeFile(path.join(vault, `note-${start + i}.md`), `# Synthetic note ${start + i}\n[[note-0]]\n`)));
  await writeFile(path.join(vault, 'credentials.txt'), 'SYNTHETIC_EXCLUDED_TEXT');
  await writeFile(path.join(vault, 'photo.png'), 'SYNTHETIC_UNSUPPORTED_IMAGE');
  await build({ root: appDirectory, configFile: false, plugins: [react()], logLevel: 'warn',
    build: { outDir: uiDirectory, emptyOutDir: true, rollupOptions: { input: path.join(appDirectory, 'local.html') } } });
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port; await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  server = await createNodeServer({ directory: path.join(fixture, 'brain'), port, token, allowedOrigins: [origin], staticDirectory: uiDirectory, provider: {} });
  await server.start();
  const request = async (route, body) => {
    const res = await fetch(`${origin}${route}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    assert.ok(res.ok, `${route}: ${res.status}`); return res.json();
  };
  await request('/v1/unlock', { create: true, passphrase: password, name: 'Synthetic whole vault' });
  browser = await playwright.chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  await page.goto(`${origin}/local.html`);
  await page.getByLabel('Personal node URL').fill(origin);
  await page.getByLabel('Node access token').fill(token);
  await page.getByRole('button', { name: 'Connect node →', exact: true }).click();
  await page.getByLabel('Folder on this node').fill(vault);
  await page.getByRole('button', { name: '＋ Connect folder', exact: true }).click();
  const progress = page.getByRole('region', { name: 'Folder scan progress' });
  await progress.waitFor();
  await page.waitForFunction(() => {
    const panel = document.querySelector('.pn-folder-scan'); const text = panel?.querySelector('[role="status"]')?.textContent || '';
    return panel?.getAttribute('data-scan-phase') === 'scanning' && /[1-9][\d,]* imported or updated/.test(text);
  });
  await page.screenshot({ path: path.join(output, 'scan-progress.png') });
  await progress.getByRole('button', { name: 'Cancel scan', exact: true }).click();
  await page.locator('.pn-folder-scan[data-scan-phase="cancelled"]').waitFor();
  await page.getByRole('button', { name: 'Lock Brain', exact: true }).waitFor();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find((b) => b.textContent === 'Lock Brain')?.disabled);
  assert.match(await progress.innerText(), /partial result/);
  const partial = await request('/v1/brain');
  assert.ok(partial.objects.length >= 100 && partial.objects.length < 2_005);
  check('new folder connection shows live committed counts and cancellation retains partial data');

  await page.getByRole('navigation', { name: 'Personal workspace' }).getByRole('button', { name: 'Sources & sync', exact: true }).click();
  const refresh = async () => {
    const finished = page.waitForResponse((response) => /\/v1\/folders\/[^/]+\/refresh$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Read updates', exact: true }).click();
    const response = await finished; assert.ok(response.ok(), await response.text());
    const result = await response.json();
    await page.locator('.pn-folder-scan[data-scan-phase="completed"]').waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find((b) => b.textContent === 'Read updates')?.disabled);
    return result;
  };
  const completed = await refresh();
  assert.equal(completed.imported + completed.unchanged, 2_005);
  assert.equal(completed.unchanged, partial.objects.length); assert.equal(completed.skipped, 2);
  const whole = await request('/v1/brain'); assert.equal(whole.objects.length, 2_005);
  assert.ok(!JSON.stringify(whole).includes('SYNTHETIC_EXCLUDED_TEXT'));
  check('Sources and sync retries to all 2,005 notes while preserving exclusions and source identities');
  const unchanged = await refresh(); assert.equal(unchanged.imported, 0); assert.equal(unchanged.unchanged, 2_005);
  assert.match(await progress.innerText(), /2,005 unchanged/);
  assert.equal((await request('/v1/brain')).revisions.length, whole.revisions.length);
  check('unchanged rescan reports no updates and creates no duplicate revisions');
  await writeFile(path.join(vault, 'note-2004.md'), '# Single updated synthetic note');
  const edited = await refresh(); assert.equal(edited.imported, 1); assert.equal(edited.unchanged, 2_004);
  assert.equal(await readFile(path.join(vault, 'note-2004.md'), 'utf8'), '# Single updated synthetic note');
  check('one disk edit becomes one revised record without writing back to the source');
  await progress.getByText(/Scan details/).click();
  assert.match(await progress.innerText(), /sensitive-name: 1/);
  assert.match(await progress.innerText(), /unsupported-type: 1/);
  await page.screenshot({ path: path.join(output, 'scan-complete.png') });
  check('completed scan exposes skipped reasons and bounded batch totals');
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  assert.equal(overflow, false);
  await page.screenshot({ path: path.join(output, 'scan-mobile.png') });
  check('scan results and expanded details fit the mobile viewport without horizontal overflow');
  await page.getByRole('button', { name: 'Lock Brain', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  assert.equal(await progress.count(), 0); assert.ok(!(await page.locator('body').innerText()).includes(vault));
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  for (const value of [token, password, vault, 'Single updated synthetic note']) assert.ok(!storage.includes(value));
  check('lock clears scan progress and source paths; credentials and note text are absent from browser storage');
  assert.deepEqual(errors, []); check('no browser runtime or console errors');
  console.log(`Completed ${checks.length} scan browser checks with synthetic sources only.`);
} finally {
  await browser?.close(); await server?.close(); await rm(fixture, { recursive: true, force: true });
}
