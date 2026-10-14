import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyClickAudit({ page, navigate, record, snapshot, outputDirectory }) {
  const originalViewport = page.viewportSize();
  const nav = page.getByRole('navigation', { name: 'Personal workspace' });
  const destinations = await nav.getByRole('button').evaluateAll(buttons => buttons.map(b => b.getAttribute('aria-label')));
  for (let round = 0; round < 2; round++) for (const name of destinations) {
    await navigate(name);
    assert.equal(await nav.getByRole('button', { name, exact: true }).getAttribute('aria-current'), 'page', `${name} responds`);
  }
  record(`Click audit: all ${destinations.length} sidebar destinations respond in two passes`);
  const settings = page.getByRole('navigation', { name: 'Settings sections' });
  const settingsCount = await settings.getByRole('button').count();
  for (let index = 0; index < settingsCount; index++) {
    const button = settings.getByRole('button').nth(index);
    await button.click();
    assert.equal(await button.getAttribute('aria-current'), 'page');
  }
  record(`Click audit: all ${settingsCount} settings sections respond`);
  await navigate('Work');
  const modes = page.getByLabel('Task view', { exact: true });
  for (let round = 0; round < 3; round++) for (const name of ['Calendar', 'Templates', 'Stacked', 'Board', 'List', 'Planner']) {
    const button = modes.getByRole('button', { name, exact: true });
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
  }
  record('Click audit: repeated switching through all six Work views');

  await page.getByLabel('Planner date', { exact: true }).fill('2026-10-14');
  for (const width of [1512, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const mode of ['Planner', 'Stacked']) {
      await modes.getByRole('button', { name: mode, exact: true }).click();
      const tabs = page.locator('.pn-work-cabinet button.fc-tab');
      for (let index = 0; index < await tabs.count(); index++) {
        const tab = tabs.nth(index), title = tab.locator('.fc-tab-name');
        await tab.scrollIntoViewIfNeeded();
        // Physical pointer hit-test, not a DOM-dispatched/forced click.
        await page.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === 'running'));
        const point = await title.evaluate(el => {
          const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
          return { x, y, receives: el.closest('button') === document.elementFromPoint(x, y)?.closest('button') };
        });
        assert.ok(point.receives, `${mode} folder ${index} receives pointer at ${width}px`);
        await page.mouse.click(point.x, point.y);
        assert.equal(await tab.getAttribute('aria-pressed'), 'true');
      }
    }
  }
  record('Click audit: every visible Planner/Stacked folder label receives physical clicks at 1512, 390 and 320px');
  await page.setViewportSize(originalViewport);
  await modes.getByRole('button', { name: 'Planner', exact: true }).click();
  const journal = page.getByLabel('Daily Journal', { exact: true });
  const before = await snapshot();
  // Model WKWebView without native JS dialogs. No application path should call it.
  await page.evaluate(() => { window.confirm = () => { throw new Error('Native confirm must not gate Arkive navigation'); }; });
  await journal.fill('Click audit: do not lose this draft');
  await modes.getByRole('button', { name: 'Planner', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0, 'active view does not prompt');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  assert.equal(await journal.inputValue(), 'Click audit: do not lose this draft');
  await modes.getByRole('button', { name: 'Calendar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
  await dialog.waitFor();
  await page.screenshot({ path: path.join(outputDirectory, 'click-audit-unsaved-dialog.png') });
  assert.equal(await dialog.getByRole('button', { name: 'Keep editing', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await journal.inputValue(), 'Click audit: do not lose this draft');
  assert.equal(await modes.getByRole('button', { name: 'Planner', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
  assert.equal(await page.getByLabel('Planner date', { exact: true }).inputValue(), '2026-10-14');
  await page.keyboard.press('Control+,');
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
  assert.equal(await nav.getByRole('button', { name: 'Work', exact: true }).getAttribute('aria-current'), 'page');
  await modes.getByRole('button', { name: 'Calendar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Discard and continue', exact: true }).click();
  await page.getByRole('region', { name: 'Task calendar', exact: true }).waitFor();
  assert.notEqual(await journal.inputValue(), 'Click audit: do not lose this draft');
  record('Click audit: native-dialog-free journal cancel/Escape/discard, same-view clicks, collapse and keyboard protection');

  await modes.getByRole('button', { name: 'Stacked', exact: true }).click();
  await journal.fill('Stacked unsaved draft');
  const selector = page.getByLabel('Daily template', { exact: true });
  const selected = await selector.inputValue();
  const other = await selector.locator('option').evaluateAll(options => options.map(o => o.value));
  await selector.selectOption(other.find(value => value !== selected));
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
  assert.equal(await selector.inputValue(), selected);
  assert.equal(await journal.inputValue(), 'Stacked unsaved draft');
  await page.getByLabel('Planner date', { exact: true }).fill('2026-10-15');
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
  assert.equal(await page.getByLabel('Planner date', { exact: true }).inputValue(), '2026-10-14');
  await selector.selectOption(other.find(value => value !== selected));
  await dialog.getByRole('button', { name: 'Discard and continue', exact: true }).click();
  assert.notEqual(await selector.inputValue(), selected);
  record('Click audit: Stacked template/date selection protects draft on change, not merely mouse click');

  await modes.getByRole('button', { name: 'Board', exact: true }).click();
  await page.getByRole('button', { name: '＋ Note', exact: true }).click();
  await page.getByLabel('Block text', { exact: true }).fill('Unsaved audit block');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await navigate('Settings');
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await nav.getByRole('button', { name: 'Settings', exact: true }).click();
  await dialog.getByRole('button', { name: 'Discard and continue', exact: true }).click();
  await page.getByRole('region', { name: 'Arkive settings', exact: true }).waitFor();
  assert.equal(await page.locator('.pn-unified-main').evaluate(el => el.inert), false);
  await page.setViewportSize(originalViewport);
  assert.deepEqual((await snapshot()).workspace.plannerDays, before.workspace.plannerDays, 'discard tests never write journals or board');
  record('Click audit: mobile dirty Board drawer close/cancel/continue works; no stuck inert overlay or draft writes');
}
