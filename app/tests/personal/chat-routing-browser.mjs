import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyChatRouting({ page, act, navigate, createRoom, roomCard, providerRequests, outputDirectory, record, noOverflow }) {
  await navigate('Chat');
  const first = await createRoom('Pinned research chat');
  const second = await createRoom('Independent planning chat');
  const active = page.getByLabel('Active chat room', { exact: true });
  const selectRoom = async room => { await active.selectOption(room.id); const card = roomCard(room.title); await card.getByLabel(`Model connection for ${room.title}`, { exact: true }).waitFor(); return card; };
  let card = await selectRoom(first);
  const count = providerRequests.length;
  const picker = card.getByLabel(`Model connection for ${first.title}`, { exact: true });
  assert.equal(await picker.inputValue(), '');
  const secondary = await picker.locator('option').filter({ hasText: 'Secondary test connection' }).getAttribute('value');
  await card.getByRole('checkbox', { name: /^Include eligible conversation history/ }).check();
  await act(`/v1/rooms/${first.id}/execution`, 'PUT', () => picker.selectOption(secondary));
  await card.getByText(/Pinned to this chat on this node/).waitFor();
  assert.equal(await picker.inputValue(), secondary);
  assert.equal(await card.getByRole('checkbox', { name: /^Include eligible conversation history/ }).isChecked(), false);
  assert.equal(providerRequests.length, count);
  card = await selectRoom(second);
  assert.equal(await card.getByLabel(`Model connection for ${second.title}`, { exact: true }).inputValue(), '');
  await act(`/v1/rooms/${second.id}/execution`, 'PUT', () => card.getByLabel(`Model connection for ${second.title}`, { exact: true }).selectOption('default'));
  await card.getByText(/Pinned to this chat on this node/).waitFor();
  await navigate('Settings'); await navigate('Chat');
  card = await selectRoom(first);
  assert.equal(await card.getByLabel(`Model connection for ${first.title}`, { exact: true }).inputValue(), secondary);
  await page.screenshot({ path: path.join(outputDirectory, 'chat-pinned-connection-desktop.png'), fullPage: false });
  record('two chats retain independent saved connections; selecting a route sends nothing and clears history consent');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(`chat connection picker ${width}px`);
    await page.screenshot({ path: path.join(outputDirectory, `chat-pinned-connection-${width}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await act(`/v1/rooms/${first.id}/execution`, 'PUT', () => card.getByLabel(`Model connection for ${first.title}`, { exact: true }).selectOption(''));
  await card.getByText(/Follows node default/).waitFor();
  assert.equal(providerRequests.length, count);
  record('chat connection UI supports mobile widths and explicit return to node default');
}
