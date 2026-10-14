import assert from 'node:assert/strict';
import path from 'node:path';

async function checkTabSpacing(page, label) {
  const bounds = await page.locator('.pn-work-cabinet .fc-layer:has(> .pn-folder-position)').evaluateAll(layers => layers.map(layer => {
    const select = layer.querySelector('.pn-folder-position').getBoundingClientRect();
    const name = layer.querySelector('.fc-tab-name').getBoundingClientRect();
    return { title: layer.querySelector('.fc-tab-name').textContent, right: select.right, left: name.left, width: name.width };
  }));
  assert.ok(bounds.length, `${label}: tabs exist`);
  for (const bound of bounds) {
    assert.ok(bound.left >= bound.right + 5, `${label}: number overlaps ${bound.title}: ${JSON.stringify(bound)}`);
    assert.ok(bound.width >= 30, `${label}: name has room`);
  }
}
export async function verifyAppearance({ page, act, snapshot, noOverflow, record, outputDirectory }) {
  const viewport = page.viewportSize();
  await page.getByRole('button', { name: 'Planner', exact: true }).click();
  await checkTabSpacing(page, 'desktop Planner');
  await page.setViewportSize({ width: 390, height: 844 });
  await checkTabSpacing(page, 'mobile Planner');
  await page.setViewportSize(viewport);
  const before = (await snapshot()).workspace;
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Workspace appearance', exact: true });
  await editor.getByRole('button', { name: 'Sage', exact: true }).click();
  assert.equal(await page.getByRole('region', { name: 'Work', exact: true }).getAttribute('data-work-appearance'), 'true');
  assert.deepEqual((await snapshot()).workspace.appearance, before.appearance);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.getByRole('region', { name: 'Work', exact: true }).getAttribute('data-work-appearance'), 'false');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await editor.getByRole('button', { name: 'Sand', exact: true }).click();
  await editor.getByLabel('Paper pattern', { exact: true }).selectOption('dots');
  await editor.getByLabel('Folder palette 1', { exact: true }).fill('#dcc5a4');
  await editor.getByLabel('Boxes & inputs', { exact: true }).fill('#f3eadb');
  await editor.getByLabel('Gradient', { exact: true }).selectOption('radial');
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow('mobile appearance customizer');
  await page.setViewportSize({ width: viewport.width, height: 1900 });
  await page.locator('.pn-appearance').evaluate(el => { for (let node = el; node; node = node.parentElement) node.scrollTop = 0; });
  await page.screenshot({ path: path.join(outputDirectory, 'workspace-appearance-editor.png'), animations: 'disabled' });
  await act('/v1/workspace/appearance', 'POST', () => editor.getByRole('button', { name: 'Save appearance', exact: true }).click());
  const saved = (await snapshot()).workspace;
  assert.equal(saved.appearance.settings.pattern, 'dots');
  assert.equal(saved.appearance.settings.palette[0], '#dcc5a4');
  assert.equal(await page.getByLabel('Daily folder color', { exact: true }).inputValue(), '#dcc5a4');
  assert.deepEqual(saved.tasks, before.tasks);
  assert.deepEqual(saved.plannerDays, before.plannerDays);
  assert.deepEqual(saved.taskTemplates, before.taskTemplates);
  await page.screenshot({ path: path.join(outputDirectory, 'workspace-sand-planner.png'), animations: 'disabled' });
  await page.setViewportSize(viewport);
  await page.getByRole('button', { name: 'Stacked', exact: true }).click();
  await checkTabSpacing(page, 'desktop Stacked');
  await page.setViewportSize({ width: 320, height: 844 });
  await checkTabSpacing(page, '320px Stacked');
  await noOverflow('320px custom palette folders');
  await page.setViewportSize(viewport);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  assert.ok((await page.locator('.pn-board-sheet').evaluate(el => getComputedStyle(el).backgroundImage)).includes('radial-gradient'));
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  assert.equal(await editor.getByLabel('Paper pattern', { exact: true }).inputValue(), 'dots');
  await editor.getByRole('button', { name: 'Reset to original', exact: true }).click();
  await act('/v1/workspace/appearance', 'POST', () => editor.getByRole('button', { name: 'Save appearance', exact: true }).click());
  assert.equal((await snapshot()).workspace.appearance.settings, null);
  record('Folder number/title geometry verified on desktop and mobile; palette preview, cancel, save, cross-view reuse and reset preserve task/template/journal data');
}
