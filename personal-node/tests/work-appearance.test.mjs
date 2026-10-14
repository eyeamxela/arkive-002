import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { emptyWorkspace, validateWorkspace } from '../workspace.mjs';
import { saveWorkAppearance, validateWorkAppearance } from '../work-appearance.mjs';
import { createNodeServer } from '../server.mjs';
import { DEFAULT_APPEARANCE, APPEARANCE_PRESETS, presetAppearance, workMaterial, workSurface, WORK_PALETTE } from '../../app/src/personal/workAppearanceModel.mjs';
import { folderMaterial, colorContrast } from '../../app/src/personal/fileCabinetModel.mjs';

test('appearance is optional, strict, bounded and stale-safe, including reset tombstones', () => {
  const state = { workspace: emptyWorkspace() };
  validateWorkspace(state.workspace, new Set());
  const first = saveWorkAppearance(state, { settings: DEFAULT_APPEARANCE, expectedUpdatedAt: null });
  const before = structuredClone(state);
  assert.throws(() => saveWorkAppearance(state, { settings: null, expectedUpdatedAt: null }), { code: 'WORKSPACE_STALE' });
  assert.deepEqual(state, before);
  const second = saveWorkAppearance(state, { settings: null, expectedUpdatedAt: first.updatedAt });
  assert.ok(second.updatedAt > first.updatedAt);
  validateWorkspace(state.workspace, new Set());
  for (const settings of [undefined, {}, { ...DEFAULT_APPEARANCE, extra: true }, { ...DEFAULT_APPEARANCE, button: 'url(https://bad.invalid)' }, { ...DEFAULT_APPEARANCE, palette: [] }, { ...DEFAULT_APPEARANCE, pattern: 'script' }, { ...DEFAULT_APPEARANCE, patternSize: 65 }, { ...DEFAULT_APPEARANCE, gradientStrength: -1 }, { ...DEFAULT_APPEARANCE, roundness: 0.5 }]) {
    assert.throws(() => validateWorkAppearance({ settings, updatedAt: second.updatedAt }), { code: 'WORKSPACE_INVALID' });
  }
  assert.throws(() => validateWorkAppearance({ settings: null, updatedAt: 'yesterday' }));
});

test('neutral presets are valid, source colors are immutable and custom colors survive', () => {
  for (const preset of APPEARANCE_PRESETS) {
    const settings = presetAppearance(preset.name);
    validateWorkAppearance({ settings, updatedAt: new Date().toISOString() });
    settings.palette.forEach((fill, i) => assert.equal(workMaterial(WORK_PALETTE[i].color, settings)['--fc-fill'], fill));
    assert.equal(workMaterial('#123456', settings)['--fc-fill'], '#123456');
    const surface = workSurface(settings);
    assert.ok(colorContrast(surface['--wa-button'], surface['--wa-button-ink']) >= 4.5);
    assert.ok(colorContrast(surface['--wa-box'], surface['--wa-box-ink']) >= 4.5);
  }
  assert.deepEqual(workMaterial('#f4bc59', null), folderMaterial('#f4bc59'));
  const copy = presetAppearance('Sand'); copy.palette[0] = '#000000';
  assert.notEqual(presetAppearance('Sand').palette[0], '#000000');
});

test('patterns and gradients retain contrast even for extreme custom colors', () => {
  for (const fill of ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#f4bc59']) for (const pattern of ['grid', 'dots', 'diamonds', 'lines', 'plain']) for (const gradient of ['none', 'linear', 'radial']) {
    const settings = { ...DEFAULT_APPEARANCE, palette: Array(7).fill(fill), pattern, patternColor: '#000000', patternOpacity: 18, gradient, gradientColor: '#ffffff', gradientStrength: 20 };
    const m = workMaterial('#f4bc59', settings);
    for (const foreground of [m['--fc-ink'], m['--fc-muted']]) for (const background of [m['--fc-fill'], m['--wa-gradient-end']]) assert.ok(colorContrast(foreground, background) >= 4.5);
    assert.ok(!m['--wa-paper-image'].includes('undefined'));
    assert.ok(!m['--wa-paper-image'].includes('url('));
  }
});

test('owner appearance persists encrypted, preserves work and rejects member and stale writes', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'arkive-appearance-')), token = 'synthetic-appearance-owner-token'.repeat(2), phrase = 'Synthetic appearance passphrase';
  const server = await createNodeServer({ directory: root, host: '127.0.0.1', port: 0, token, provider: {}, allowedOrigins: ['http://127.0.0.1:4319'] });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const { port } = await server.start();
  const call = async (route, body, credential = token) => { const r = await fetch(`http://127.0.0.1:${port}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4319' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, body: await r.json() }; };
  await call('/v1/unlock', { passphrase: phrase, create: true, name: 'Appearance fixture' });
  await call('/v1/workspace/tasks', { title: 'Preserve this task', description: '', status: 'todo', sourceIds: [], section: 'Personal', dueDate: '2026-10-13' });
  const before = (await call('/v1/brain')).body;
  const input = { settings: presetAppearance('Sage'), expectedUpdatedAt: null };
  assert.equal((await call('/v1/workspace/appearance', input)).status, 200);
  assert.equal((await call('/v1/workspace/appearance', input)).status, 409);
  await call('/v1/lock', {}); await call('/v1/unlock', { passphrase: phrase });
  const after = (await call('/v1/brain')).body;
  assert.deepEqual(after.workspace.appearance.settings, input.settings);
  assert.deepEqual(after.workspace.tasks, before.workspace.tasks);
  assert.deepEqual(after.workspace.plannerDays, before.workspace.plannerDays);
  const member = (await call('/v1/members', { name: 'Appearance member' })).body;
  assert.equal((await call('/v1/workspace/appearance', input, member.token ?? member.credential)).status, 403);
  assert.equal((await call('/v1/brain', undefined, member.token ?? member.credential)).body.workspace.appearance, undefined);
  // The settings use the existing Brain encryption envelope, not browser storage.
  const encrypted = await readFile(path.join(root, 'brain.enc'), 'utf8');
  assert.equal(JSON.parse(encrypted).format, 'arkive-encrypted-brain');
  assert.ok(!encrypted.includes('patternOpacity'));
});
