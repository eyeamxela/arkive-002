import assert from 'node:assert/strict';
import path from 'node:path';

// Called by smoke.mjs against its synthetic-only node and local mock provider.
// No additional servers, external accounts, fixtures or live model calls.
export async function verifyUnifiedWorkspace(test) {
  const { page, act, snapshot, navigate, roomCard, firstRoom, secondRoom, note,
    providerRequests, outputDirectory, record, noOverflow } = test;
  const requestCount = providerRequests.length;
  const draftText = 'Synthetic unsent draft retained across workspace views.';
  await navigate('Chat');
  await roomCard(secondRoom.title).getByLabel(`Message ${secondRoom.title}`, { exact: true }).fill(draftText);
  await roomCard(secondRoom.title).getByRole('checkbox', { name: /^For this request/ }).check();
  await navigate('Brain');
  const importField = page.getByLabel('Import a Markdown or text file', { exact: true });
  if (!await importField.isVisible()) await page.locator('.pn-capture summary').click();
  const imported = await act('/v1/objects', 'POST', () => importField.setInputFiles({
    name: 'synthetic-standalone.md', mimeType: 'text/markdown',
    buffer: Buffer.from('# Standalone synthetic source\n\nA copied document, not a live folder connection.\n'),
  }));
  assert.equal(imported.kind, 'document');
  assert.equal(imported.sourcePath, undefined);
  assert.equal(providerRequests.length, requestCount);
  record('standalone Markdown upload stores a document copy without source access or model execution');
  await navigate('Chat');
  assert.equal(await roomCard(secondRoom.title).getByLabel(`Message ${secondRoom.title}`, { exact: true }).inputValue(), draftText);
  assert.equal(await roomCard(secondRoom.title).getByRole('checkbox', { name: /^For this request/ }).isChecked(), false);
  await roomCard(secondRoom.title).getByRole('checkbox', { name: /^For this request/ }).check();
  await selectRoom(page, firstRoom.title);
  await selectRoom(page, secondRoom.title);
  assert.equal(await roomCard(secondRoom.title).getByRole('checkbox', { name: /^For this request/ }).isChecked(), false, 'Focused room round-trip cannot resurrect consent');
  await page.screenshot({ path: path.join(outputDirectory, 'unified-chat.png'), fullPage: false, animations: 'disabled' });

  await verifyCanvasModes(test, draftText);
  record('Chat and all Canvas modes preserve the same rooms, messages, context and unsent draft');

  await navigate('Work');
  await page.getByRole('button', { name: 'Stacked', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Stacked', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('group', { name: 'Task folders', exact: true }).getByRole('button').count(), 4);
  assert.equal(await page.locator('#work-task-sheet').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(244, 188, 89)');
  await page.getByRole('button', { name: 'Review task folder', exact: true }).click();
  await page.getByRole('button', { name: 'To do task folder', exact: true }).click();
  await page.getByRole('button', { name: '＋ New task', exact: true }).click();
  await page.getByLabel('Task title', { exact: true }).fill('Synthetic review task');
  await page.getByLabel('Description', { exact: true }).fill('Review the saved synthetic source. No agent execution is requested.');
  await page.locator('.pn-wp-editor').getByRole('checkbox', { name: new RegExp(note.title) }).check();
  const task = await act('/v1/workspace/tasks', 'POST', () => page.getByRole('button', { name: 'Save task', exact: true }).click());
  const taskCard = page.locator('.pn-wp-task').filter({ hasText: 'Synthetic review task' });
  await act('/v1/workspace/tasks', 'POST', () => taskCard.locator('.pn-wp-status-select select').selectOption('doing'));
  let state = await snapshot();
  assert.equal(state.workspace.tasks.find(item => item.id === task.id).status, 'doing');
  assert.deepEqual(state.workspace.tasks.find(item => item.id === task.id).sourceIds, [note.id]);
  assert.equal(await page.getByRole('button', { name: 'In progress task folder', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('complementary', { name: 'Linked notes' }).getByRole('button', { name: new RegExp(note.title) }).waitFor();
  await act('/v1/workspace/tasks', 'POST', () => taskCard.getByRole('checkbox', { name: 'Complete task Synthetic review task', exact: true }).click());
  assert.equal((await snapshot()).workspace.tasks.find(item => item.id === task.id).status, 'done');
  assert.equal(await taskCard.getByRole('checkbox').isChecked(), true);
  assert.equal(await page.getByRole('button', { name: 'Done task folder', exact: true }).getAttribute('aria-pressed'), 'true');
  await act('/v1/workspace/tasks', 'POST', () => taskCard.getByRole('checkbox', { name: 'Complete task Synthetic review task', exact: true }).click());
  assert.equal((await snapshot()).workspace.tasks.find(item => item.id === task.id).status, 'todo');
  await page.getByRole('button', { name: 'Edit task Synthetic review task', exact: true }).click();
  await page.getByLabel('Description', { exact: true }).fill('Updated task description with its original supporting source.');
  await act('/v1/workspace/tasks', 'POST', () => page.getByRole('button', { name: 'Save task', exact: true }).click());
  assert.deepEqual((await snapshot()).workspace.tasks.find(item => item.id === task.id).sourceIds, [note.id]);
  await noOverflow('desktop stacked Work');
  await page.screenshot({ path: path.join(outputDirectory, 'work-stacked-desktop.png'), fullPage: false, animations: 'disabled' });
  const workViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow('mobile stacked Work');
  for (const name of ['Review', 'Done', 'To do']) {
    await page.getByRole('button', { name: `${name} task folder`, exact: true }).click();
    assert.equal(await page.getByRole('button', { name: `${name} task folder`, exact: true }).getAttribute('aria-pressed'), 'true');
  }
  await page.screenshot({ path: path.join(outputDirectory, 'work-stacked-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('complementary', { name: 'Linked notes' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDirectory, 'work-stacked-mobile-notes.png'), fullPage: false, animations: 'disabled' });
  await page.getByRole('complementary', { name: 'Linked notes' }).getByRole('button', { name: new RegExp(note.title) }).click();
  assert.equal(await page.getByRole('region', { name: 'Work', exact: true }).count(), 0);
  await navigate('Work');
  await page.getByRole('button', { name: 'Stacked', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 844 });
  await noOverflow('320px stacked Work');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.pn-work-cabinet .fc-layer').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize(workViewport);
  await act('/v1/workspace/tasks', 'POST', () => taskCard.locator('.pn-wp-status-select select').selectOption('doing'));
  await page.getByRole('button', { name: 'List', exact: true }).click();
  assert.equal(await page.locator('.pn-wp-task').count(), 1);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await noOverflow('desktop Work');
  await page.screenshot({ path: path.join(outputDirectory, 'unified-work.png'), fullPage: false, animations: 'disabled' });
  record('Work task creation, supporting source and status are persisted records');
  record('Stacked Work shares cabinet materials; task folders, completion, edit, linked sources, mobile and reduced motion verified');

  await navigate('Agents');
  await page.getByRole('button', { name: '＋ New profile', exact: true }).click();
  await page.getByLabel('Profile name', { exact: true }).fill('Synthetic reader profile');
  await page.getByLabel('Purpose / description', { exact: true }).fill('Organizational metadata, not system instructions.');
  await page.locator('.pn-wp-editor select').selectOption('hermes');
  await page.locator('.pn-wp-editor').getByRole('checkbox', { name: new RegExp(note.title) }).check();
  const agent = await act('/v1/workspace/agents', 'POST', () => page.getByRole('button', { name: 'Save profile', exact: true }).click());
  const profile = page.locator('.pn-wp-card').filter({ has: page.getByRole('heading', { name: 'Synthetic reader profile', exact: true }) });
  const profileRoom = await act('/v1/rooms', 'POST', () => profile.getByRole('button', { name: 'Open chat', exact: true }).click());
  state = await snapshot();
  assert.deepEqual(state.rooms.find(room => room.id === profileRoom.id).selectedSourceIds, [note.id]);
  assert.equal(await roomCard(profileRoom.title).getByLabel(`Agent provider for ${profileRoom.title}`, { exact: true }).inputValue(), 'hermes');
  assert.equal(await roomCard(profileRoom.title).getByRole('button', { name: 'Send ↗', exact: true }).isDisabled(), true);
  assert.equal(providerRequests.length, requestCount);
  record('saved agent profile opens a room with its exact source/provider defaults without execution');

  const metadata = { taskId: task.id, agentId: agent.id, profileRoomId: profileRoom.id, draftRoomTitle: secondRoom.title, draftText };
  for (const item of [
    { panel: 'Library', label: 'collection', kind: 'collections', name: 'Synthetic source collection', source: note },
    { panel: 'Context presets', label: 'context preset', kind: 'manifests', name: 'Synthetic reviewed context', source: state.objects.find(object => object.kind === 'memory') },
  ]) {
    await navigate(item.panel);
    await page.getByRole('button', { name: `＋ New ${item.label}`, exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill(item.name);
    await page.getByLabel('Description', { exact: true }).fill('Synthetic local reference set only.');
    await page.locator('.pn-wp-editor').getByRole('checkbox', { name: new RegExp(item.source.title) }).check();
    const saved = await act(`/v1/workspace/${item.kind}`, 'POST', () => page.getByRole('button', { name: `Save ${item.label}`, exact: true }).click());
    metadata[item.kind] = { id: saved.id, name: item.name, sourceIds: [item.source.id] };
    assert.deepEqual((await snapshot()).workspace[item.kind].find(record => record.id === saved.id).sourceIds, [item.source.id]);
    if (item.kind === 'manifests') {
      await page.locator('.pn-wp-apply').getByText('Use these sources in a chat', { exact: true }).click();
      await act(`/v1/rooms/${profileRoom.id}/sources`, 'PUT', () => page.getByRole('button', { name: 'Replace active room sources', exact: true }).click());
      assert.deepEqual((await snapshot()).rooms.find(room => room.id === profileRoom.id).selectedSourceIds, [item.source.id]);
    }
  }
  assert.equal(providerRequests.length, requestCount);
  record('Library collection and context preset persist; applying a preset replaces selection without a model call');

  await navigate('Audit');
  state = await snapshot();
  assert.equal(await page.locator('.pn-wp-audit-list > li').count(), Math.min(200, state.audit.length));
  const eventTypes = await page.locator('.pn-wp-audit-heading h2').allTextContents();
  assert.ok(eventTypes.every(type => state.audit.some(event => event.type === type)));
  assert.ok(eventTypes.includes('workspace.tasks.updated'));
  await page.getByLabel('Search event type, target or metadata').fill('definitely-not-an-event');
  assert.equal(await page.locator('.pn-wp-audit-list > li').count(), 0);
  await page.getByRole('heading', { name: 'No matching events.', exact: true }).waitFor();
  record('Audit renders actual recorded events and empty search rather than fabricated activity');

  await navigate('Brain');
  const canvasObjects = state.objects.filter(object => object.kind !== 'code_graph');
  const storedTitles = [...canvasObjects.map(object => object.title)].sort();
  for (const mode of ['Freeform', 'Timeline']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    const titles = await page.locator('.pn-object-card h3').allTextContents();
    assert.deepEqual([...titles].sort(), storedTitles);
    if (mode === 'Freeform') {
      const canvas = page.getByRole('region', { name: 'Infinite Brain object canvas', exact: true });
      const item = canvas.locator(`[data-spatial-item="${note.id}"]`);
      const before = await item.evaluate(element => element.style.left);
      await canvas.getByRole('button', { name: `Move ${note.title}`, exact: true }).press('ArrowRight');
      const moved = await item.evaluate(element => element.style.left);
      assert.notEqual(moved, before);
      await page.getByRole('button', { name: 'Obsidian', exact: true }).click();
      await page.getByRole('button', { name: 'Freeform', exact: true }).click();
      assert.equal(await item.evaluate(element => element.style.left), moved);
    }
    if (mode === 'Timeline') {
      const dates = await page.locator('.pn-object-timeline time').evaluateAll(elements => elements.map(element => element.getAttribute('datetime')));
      assert.equal(dates.length, canvasObjects.length);
      assert.ok(dates.every(date => date && state.revisions.some(revision => revision.createdAt === date)));
    }
  }
  await page.getByRole('button', { name: 'Obsidian', exact: true }).click();
  if (await page.locator('.pn-capture').getAttribute('open') !== null) await page.locator('.pn-capture summary').click();
  await page.screenshot({ path: path.join(outputDirectory, 'unified-brain.png'), fullPage: false, animations: 'disabled' });
  assert.equal(providerRequests.length, requestCount);
  record('Freeform and Timeline contain only real stored Brain objects and revision dates');
  await navigate('Chat');
  // Keep an unsent draft in a non-active room to prove lock clears all room drafts.
  await selectRoom(page, secondRoom.title);
  assert.equal(await roomCard(secondRoom.title).getByLabel(`Message ${secondRoom.title}`, { exact: true }).inputValue(), draftText);
  await verifyRoomLimit(test);
  await navigate('Chat');
  await selectRoom(page, secondRoom.title);
  return metadata;
}

async function verifyRoomLimit({ page, act, snapshot, navigate, roomCard, record }) {
  const initial = await snapshot();
  for (let count = initial.rooms.length; count < 13; count++) {
    await page.getByLabel('New chat name', { exact: true }).fill(`Synthetic cap room ${count + 1}`);
    await act('/v1/rooms', 'POST', () => page.getByRole('button', { name: '＋ New', exact: true }).click());
  }
  await navigate('Canvas');
  await page.getByRole('button', { name: 'Infinite', exact: true }).click();
  assert.equal(await page.locator('.pn-live-room:visible').count(), 12);
  assert.equal(await roomCard('Synthetic cap room 13').count(), 1, 'Newest active room must appear even beyond the canvas limit');
  const visible = await page.locator('.pn-spatial-canvas:visible [data-spatial-item]').evaluateAll(elements => elements.map(element => element.getAttribute('data-spatial-item')));
  const hidden = (await snapshot()).rooms.find(room => !visible.includes(room.id));
  assert.ok(hidden);
  await selectRoom(page, hidden.title);
  assert.equal(await roomCard(hidden.title).count(), 1, 'Selecting a hidden room brings it onto a full canvas');
  assert.equal(await page.locator('.pn-live-room:visible').count(), 12);
  await page.getByLabel('New chat name', { exact: true }).fill('Synthetic cap room 14');
  await act('/v1/rooms', 'POST', () => page.getByRole('button', { name: '＋ New', exact: true }).click());
  await roomCard('Synthetic cap room 14').waitFor({ state: 'visible', timeout: 5000 });
  assert.equal(await roomCard('Synthetic cap room 14').count(), 1, 'Creating a room on a full canvas makes it visible');
  assert.equal(await page.locator('.pn-live-room:visible').count(), 12);
  record('full 12-room canvas includes newly created and explicitly activated rooms without losing saved rooms');
}

async function selectRoom(page, title) {
  await page.locator('.pn-cw-active-room select:visible').selectOption({ label: title });
}

async function verifyCanvasModes(test, draftText) {
  const { page, act, navigate, snapshot, roomCard, firstRoom, secondRoom, note, outputDirectory, noOverflow } = test;
  const before = await snapshot();
  await navigate('Canvas');
  for (const mode of ['Infinite', 'Radial', 'Multi-room']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    assert.deepEqual((await snapshot()).rooms, before.rooms);
    if (mode === 'Radial') await selectRoom(page, firstRoom.title);
    await roomCard(firstRoom.title).getByText(/Synthetic mock answer: orange markers/).waitFor();
    if (mode === 'Radial') await selectRoom(page, secondRoom.title);
    assert.equal(await roomCard(secondRoom.title).getByLabel(`Message ${secondRoom.title}`, { exact: true }).inputValue(), draftText);
    await roomCard(secondRoom.title).getByText(/Synthetic mock answer: no Brain sources/).waitFor();
    await noOverflow(`desktop ${mode}`);
    await page.screenshot({ path: path.join(outputDirectory, `unified-${mode.toLowerCase()}.png`), fullPage: false, animations: 'disabled' });
    if (mode === 'Infinite') {
      await roomCard(firstRoom.title).getByLabel(`Message ${firstRoom.title}`, { exact: true }).fill('Synthetic room-specific grant check.');
      await roomCard(firstRoom.title).getByRole('checkbox', { name: /^For this request/ }).check();
      await roomCard(secondRoom.title).locator('header button').click();
      assert.equal(await roomCard(firstRoom.title).getByRole('checkbox', { name: /^For this request/ }).isChecked(), true, 'Activating another visible Infinite room does not replace this room request scope');
      await roomCard(firstRoom.title).getByLabel(`Message ${firstRoom.title}`, { exact: true }).fill('');
      const canvas = page.getByRole('region', { name: 'Infinite chat canvas', exact: true });
      const x = Number(await canvas.getAttribute('data-camera-x'));
      await canvas.focus();
      for (let count = 0; count < 180; count++) await page.keyboard.press('ArrowRight');
      assert.ok(Number(await canvas.getAttribute('data-camera-x')) < x - 10_000, 'Infinite pan is not clamped to a finite board');
      await page.getByRole('button', { name: 'Fit view', exact: true }).click();
      const zoom = Number(await canvas.getAttribute('data-camera-zoom'));
      await page.getByRole('button', { name: 'Zoom in canvas', exact: true }).click();
      assert.ok(Number(await canvas.getAttribute('data-camera-zoom')) > zoom);
      await page.getByRole('button', { name: 'Fit view', exact: true }).click();
      const item = canvas.locator(`[data-spatial-item="${firstRoom.id}"]`);
      const previous = await item.evaluate(element => ({ left: element.style.left, top: element.style.top }));
      const handle = canvas.getByRole('button', { name: `Move ${firstRoom.title}`, exact: true });
      const box = await handle.boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 35, { steps: 8 });
      await page.mouse.up();
      const next = await item.evaluate(element => ({ left: element.style.left, top: element.style.top }));
      assert.notDeepEqual(next, previous);
      await page.getByRole('button', { name: 'Fit view', exact: true }).click();
      const toolbarBox = await canvas.getByRole('toolbar', { name: 'Canvas navigation' }).boundingBox();
      for (const title of [firstRoom.title, secondRoom.title]) {
        const sendBox = await roomCard(title).getByRole('button', { name: 'Send ↗', exact: true }).boundingBox();
        assert.ok(sendBox && toolbarBox);
        const overlapWidth = Math.max(0, Math.min(sendBox.x + sendBox.width, toolbarBox.x + toolbarBox.width) - Math.max(sendBox.x, toolbarBox.x));
        const overlapHeight = Math.max(0, Math.min(sendBox.y + sendBox.height, toolbarBox.y + toolbarBox.height) - Math.max(sendBox.y, toolbarBox.y));
        assert.equal(overlapWidth * overlapHeight, 0, 'Fit must not put Send beneath the canvas toolbar');
      }
    }
  }
  await navigate('Chat');
  await selectRoom(page, secondRoom.title);
  const card = roomCard(secondRoom.title);
  const consent = card.getByRole('checkbox', { name: /^For this request/ });
  await consent.check();
  await card.getByLabel(`Message ${secondRoom.title}`, { exact: true }).fill(`${draftText} Edited.`);
  assert.equal(await consent.isChecked(), false, 'Editing a message revokes previous consent');
  await card.getByLabel(`Message ${secondRoom.title}`, { exact: true }).fill(draftText);
  await consent.check();
  await card.getByLabel(`Agent provider for ${secondRoom.title}`, { exact: true }).selectOption('hermes');
  assert.equal(await consent.isChecked(), false, 'Switching providers revokes previous consent');
  assert.equal(await card.getByRole('button', { name: 'Send ↗', exact: true }).isDisabled(), true);
  await card.getByLabel(`Agent provider for ${secondRoom.title}`, { exact: true }).selectOption('openai-compatible');
  await consent.check();
  await card.locator('summary').click();
  await act(`/v1/rooms/${secondRoom.id}/sources`, 'PUT', () => card.getByRole('checkbox', { name: new RegExp(note.title) }).click());
  assert.equal(await consent.isChecked(), false, 'Changing selected sources revokes previous consent');
  await act(`/v1/rooms/${secondRoom.id}/sources`, 'PUT', () => card.getByRole('checkbox', { name: new RegExp(note.title) }).click());
  await consent.check();
  await navigate('Canvas');
  assert.equal(await roomCard(secondRoom.title).getByRole('checkbox', { name: /^For this request/ }).isChecked(), false, 'Changing presentation revokes previous consent');
  await navigate('Chat');
  await selectRoom(page, secondRoom.title);
  assert.equal(await roomCard(secondRoom.title).getByRole('checkbox', { name: /^For this request/ }).isChecked(), false, 'Returning to a presentation cannot resurrect consent');
}

export async function verifyRestoredWorkspace(test) {
  const { page, navigate, roomCard, snapshot, act, state, beforeLock, workspaceEvidence, origin, ownerToken, passphrase, record } = test;
  assert.deepEqual(state.workspace, beforeLock.workspace);
  await navigate('Chat');
  await selectRoom(page, workspaceEvidence.draftRoomTitle);
  assert.equal(await roomCard(workspaceEvidence.draftRoomTitle).getByLabel(`Message ${workspaceEvidence.draftRoomTitle}`, { exact: true }).inputValue(), '');
  record('locking clears unsent drafts in every room while saved workspace metadata survives restart');
  await act('/v1/lock', 'POST', () => page.getByRole('button', { name: 'Lock Brain', exact: true }).click());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByLabel('Personal node URL').fill(origin);
  await page.getByLabel('Node access token').fill(ownerToken);
  await act('/v1/status', 'GET', () => page.getByRole('button', { name: 'Connect node →', exact: true }).click());
  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await act('/v1/unlock', 'POST', () => page.getByRole('button', { name: 'Unlock Brain →', exact: true }).click());
  assert.deepEqual((await snapshot()).workspace, beforeLock.workspace);
  for (const [panel, title] of [['Work', 'Synthetic review task'], ['Agents', 'Synthetic reader profile'], ['Library', workspaceEvidence.collections.name], ['Context presets', workspaceEvidence.manifests.name]]) {
    await navigate(panel);
    if (panel === 'Work') await page.getByRole('button', { name: 'List', exact: true }).click();
    const scope = panel === 'Agents' ? page.locator('.pn-wp-card') : page;
    await scope.getByRole('heading', { name: title, exact: true }).waitFor();
  }
  record('reload, reconnect and re-unlock recover tasks, profiles, collections and context presets');
}
