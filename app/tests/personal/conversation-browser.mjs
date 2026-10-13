import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyConversation({ page, act, navigate, createRoom, roomCard, providerRequests, outputDirectory, record }) {
  await navigate('Chat');
  const room = await createRoom('History and live events'); const card = roomCard(room.title);
  const prompt = card.getByLabel(`Message ${room.title}`, { exact: true });
  const consent = card.getByRole('checkbox', { name: /^For this request/ });
  const history = card.getByRole('checkbox', { name: /^Include eligible conversation history/ });
  const status = card.getByRole('status', { name: `Live run status for ${room.title}` });
  assert.equal(await history.isChecked(), false);
  await prompt.fill('Synthetic conversation seed'); await consent.check();
  const first = await act(`/v1/rooms/${room.id}/messages`, 'POST', () => card.getByRole('button', { name: 'Send ↗', exact: true }).click());
  await prompt.fill('Synthetic delayed history followup'); await consent.check(); await history.check();
  assert.equal(await consent.isChecked(), false, 'Enabling history requires renewed send consent');
  await consent.check();
  const sending = act(`/v1/rooms/${room.id}/messages`, 'POST', () => card.getByRole('button', { name: 'Send ↗', exact: true }).click());
  await status.getByText(/running · provider.started/).waitFor();
  await page.screenshot({ path: path.join(outputDirectory, 'conversation-running.png'), fullPage: false });
  const second = await sending;
  assert.deepEqual(second.run.conversation.runIds, [first.run.id]);
  assert.equal(providerRequests.at(-1).messages.length, 5);
  assert.equal(providerRequests.at(-1).messages[2].content, 'Synthetic conversation seed');
  await status.getByText(/completed · provider.completed/).waitFor();
  assert.equal(await history.isChecked(), false, 'History opt-in resets after send');
  const count = providerRequests.length;
  await navigate('Canvas'); await navigate('Chat');
  assert.equal(await history.isChecked(), false);
  assert.equal(providerRequests.length, count);
  await page.screenshot({ path: path.join(outputDirectory, 'conversation-completed.png'), fullPage: false });
  record('conversation history is opt-in, pinned in the receipt, resets after sending and is shared by Chat and Canvas');
  record('live run stream shows provider.started before completion, then provider.completed without exposing partial output');
}
