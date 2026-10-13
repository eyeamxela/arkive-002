import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const css = name => readFile(new URL(`../../src/personal/${name}.css`, import.meta.url), 'utf8');

test('Settings and Planner use shared theme colors rather than a separate hard-coded palette', async () => {
  for (const name of ['SettingsWorkspace', 'PlannerWorkspace']) {
    const text = await css(name);
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(text), name);
    assert.ok(text.includes('var(--pn-raised)') && text.includes('var(--pn-ink)'), name);
  }
});
test('file chrome follows the app while folder materials remain customizable', async () => {
  const text = await css('FileCabinet');
  assert.ok(text.includes('--fc-shell: var(--pn-panel)'));
  assert.ok(text.includes('background-color: var(--fc-fill)'));
  assert.ok(text.includes('color: var(--fc-ink)'));
  assert.ok(!/#(303b34|272a27|a3b7a8|47584b)\b/i.test(text));
});
test('Work cannot redefine shared text tokens or restore green surface overrides', async () => {
  const text = await css('WorkspacePanels');
  assert.ok(!/--pn-(ink|muted|subtle)\s*:/.test(text));
  assert.ok(!/#(303b34|272a27|718174|b7c2b8)\b/i.test(text));
});
