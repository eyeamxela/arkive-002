import assert from 'node:assert/strict';
import path from 'node:path';

/** Uses the isolated smoke-suite Brain and mock provider, never a real API or vault. */
export async function verifyRequestEvidence({ page, act, snapshot, navigate, createRoom, roomCard, providerRequests, outputDirectory, record, noOverflow }) {
  const room = await createRoom('Response evidence audit');
  const card = roomCard(room.title);
  const prompt = card.getByLabel(`Message ${room.title}`, { exact: true });
  const consent = card.getByRole('checkbox', { name: /^For this request/ });
  const history = card.getByRole('checkbox', { name: /^Include eligible conversation history/ });
  const send = card.getByRole('button', { name: 'Send ↗', exact: true });
  const count = providerRequests.length;
  await prompt.fill('Synthetic partial response test');
  await consent.check();
  const partial = await act(`/v1/rooms/${room.id}/messages`, 'POST', () => send.click());
  assert.equal(partial.run.state, 'incomplete');
  assert.equal(partial.run.providerReceipt.outcome, 'incomplete');
  const warning = card.locator('[data-response-outcome="incomplete"]');
  await warning.waitFor();
  assert.match(await warning.textContent(), /output limit/);
  assert.match(await warning.textContent(), /excluded from conversation history/);
  await card.getByRole('status', { name: `Live run status for ${room.title}` }).getByText(/incomplete · provider.incomplete/).waitFor();
  const receipt = card.locator('[data-provider-receipt]');
  await receipt.locator('summary').click();
  assert.deepEqual(await receipt.locator('dd').allTextContents(), [
    'synthetic-browser-model', 'chatcmpl-synthetic-browser', 'length', '30', '10', '40', 'Not reported',
  ]);
  await receipt.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDirectory, 'request-incomplete-receipt.png'), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow('incomplete response receipt 390px');
  await page.setViewportSize({ width: 1440, height: 1000 });
  record('partial answer displays an incomplete warning, live incomplete state and exact provider usage receipt');

  await prompt.fill('Synthetic followup after partial response');
  await history.check();
  await consent.check();
  const followup = await act(`/v1/rooms/${room.id}/messages`, 'POST', () => send.click());
  assert.equal(followup.run.state, 'completed');
  assert.deepEqual(followup.run.conversation.runIds, []);
  assert.equal(providerRequests.length, count + 2);
  assert.equal(providerRequests.at(-1).messages.length, 3);
  assert.equal(providerRequests.at(-1).messages.some(message => message.content === 'Synthetic partial response test'), false);
  record('opted-in history excludes the incomplete turn rather than recycling its partial answer');

  const beforeCapture = providerRequests.length;
  await navigate('Brain');
  await page.getByRole('button', { name: 'Obsidian', exact: true }).click();
  const closeSource = page.getByRole('button', { name: 'Close source details', exact: true });
  const captured = [];
  for (const suffix of ['A', 'B']) {
    if (await closeSource.isVisible()) await closeSource.click();
    const capture = page.locator('.pn-capture');
    if (await capture.getAttribute('open') === null) await capture.locator('summary').click();
    const title = `Synthetic budget evidence ${suffix}`;
    await capture.getByLabel('Title', { exact: true }).fill(title);
    await capture.getByLabel('Note', { exact: true }).fill(`${title}. `.repeat(3000).slice(0, 81000));
    const note = await act('/v1/objects', 'POST', () => capture.getByRole('button', { name: 'Save note →', exact: true }).click());
    assert.equal(note.text.length, 81000);
    captured.push(note);
  }
  assert.equal(providerRequests.length, beforeCapture);
  const budgetRoom = await createRoom('Memory budget audit');
  const budgetCard = roomCard(budgetRoom.title);
  const budgetPrompt = budgetCard.getByLabel(`Message ${budgetRoom.title}`, { exact: true });
  const budgetSend = budgetCard.getByRole('button', { name: 'Send ↗', exact: true });
  const budgetConsent = budgetCard.getByRole('checkbox', { name: /^For this request/ });
  await budgetCard.locator('.pn-cw-inline-context > summary').click();
  for (const note of captured) {
    const source = budgetCard.getByRole('checkbox', { name: new RegExp(`^${note.title}`) });
    assert.equal(await source.isChecked(), false);
    await act(`/v1/rooms/${budgetRoom.id}/sources`, 'PUT', () => source.click());
    assert.equal(await source.isChecked(), true, 'Source selection updates after the node confirms it');
  }
  await budgetPrompt.fill('Do not send while the selected memory is oversized.');
  const budgetNotice = budgetCard.locator('[data-context-budget]');
  await budgetNotice.filter({ hasText: /Too much memory for one request/ }).waitFor();
  const oversized = (await snapshot()).governance.scopes.find(scope => scope.roomId === budgetRoom.id);
  assert.equal(oversized.contextBudget.overLimit, true);
  assert.ok(oversized.contextBudget.characters > 160000);
  assert.equal(oversized.canSend, false);
  assert.equal(await budgetSend.isDisabled(), true);
  assert.equal(await budgetConsent.isDisabled(), true);
  assert.equal(providerRequests.length, beforeCapture);
  await budgetNotice.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDirectory, 'request-memory-budget-blocked.png'), fullPage: false });
  record('two real synthetic notes exceed the memory budget; visible warning and disabled send prevent provider dispatch');

  const removedSource = budgetCard.getByRole('checkbox', { name: new RegExp(`^${captured[1].title}`) });
  await act(`/v1/rooms/${budgetRoom.id}/sources`, 'PUT', () => removedSource.click());
  assert.equal(await removedSource.isChecked(), false);
  const reduced = (await snapshot()).governance.scopes.find(scope => scope.roomId === budgetRoom.id);
  assert.equal(reduced.contextBudget.overLimit, false);
  assert.equal(reduced.canSend, true);
  assert.equal(await budgetNotice.getAttribute('role'), null);
  assert.equal(await budgetConsent.isChecked(), false);
  assert.equal(await budgetConsent.isEnabled(), true);
  assert.equal(await budgetSend.isDisabled(), true, 'Removing sources must not reuse old send consent');
  await budgetConsent.check();
  assert.equal(await budgetSend.isEnabled(), true);
  await budgetConsent.uncheck();
  assert.equal(providerRequests.length, beforeCapture, 'Reducing the selection and reviewing consent sends nothing');
  record('removing a source clears the budget block but still requires fresh explicit send consent');
}
