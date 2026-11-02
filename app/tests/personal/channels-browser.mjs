import assert from 'node:assert/strict';
import path from 'node:path';

export function createChannelFixture() {
  const requests = [];
  const telegram = { id: 'telegram', name: 'Telegram', description: 'Run Hermes from Telegram DMs, groups and topics.', enabled: false, configured: false, gateway_running: false, state: 'disabled', env_vars: [
    { key: 'TELEGRAM_BOT_TOKEN', prompt: 'Bot token', description: 'Create a bot with @BotFather, then paste the token.', required: true, is_password: true, is_set: false },
    { key: 'TELEGRAM_ALLOWED_USERS', prompt: 'Allowed Telegram user IDs', description: 'Only these users may use this bot.', is_list: true, is_set: false, value: '' },
    { key: 'TELEGRAM_WEBHOOK_SECRET', prompt: 'Webhook secret', description: 'Only needed when a webhook is configured.', is_password: true, is_set: false },
  ] };
  const platforms = [telegram, { id: 'discord', name: 'Discord', description: 'Hermes in Discord.', enabled: false, configured: false, gateway_running: false, state: 'disabled', env_vars: [] }, { id: 'slack', name: 'Slack', description: 'Hermes in Slack.', enabled: false, configured: false, gateway_running: false, state: 'disabled', env_vars: [] }];
  return { requests, async handle(request, response) {
    const url = new URL(request.url, 'http://localhost');
    assert.equal(url.searchParams.get('profile'), 'default'); assert.equal(request.headers['x-hermes-session-token'], 'synthetic-dashboard-token');
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined; requests.push({ path: url.pathname, method: request.method, body });
    let result;
    if (url.pathname === '/api/messaging/platforms' && request.method === 'GET') result = { platforms };
    else if (url.pathname === '/api/messaging/platforms/telegram' && request.method === 'PUT') {
      for (const [key, value] of Object.entries(body.env ?? {})) { const field = telegram.env_vars.find(field => field.key === key); assert.ok(field); field.is_set = true; if (field.is_list) field.value = value; }
      telegram.configured = telegram.env_vars[0].is_set;
      if (body.enabled !== undefined) telegram.enabled = body.enabled;
      telegram.state = telegram.enabled ? 'gateway_stopped' : 'disabled';
      result = { ok: true, platform: 'telegram', hot_served: false };
    } else if (url.pathname === '/api/messaging/platforms/telegram/test') result = { ok: telegram.state === 'connected', state: telegram.state, auth_posture: 'allowlist' };
    else if (url.pathname === '/api/gateway/restart') { telegram.gateway_running = true; telegram.state = 'connected'; result = { ok: true }; }
    else throw new Error('Unexpected synthetic Hermes channel route');
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result));
  } };
}

export async function verifyChannels({ page, act, snapshot, navigate, fixture, endpoint, outputDirectory, record, noOverflow }) {
  const before = await snapshot(); await navigate('Settings');
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Connections & channels' }).click();
  const ui = page.getByRole('region', { name: 'Channel connections', exact: true });
  await ui.getByLabel('Dashboard origin', { exact: true }).fill(endpoint);
  await ui.getByLabel('Dashboard session token', { exact: true }).fill('synthetic-dashboard-token');
  const configured = await act('/v1/settings/channels', 'POST', () => ui.getByRole('button', { name: 'Save management connection', exact: true }).click());
  assert.equal(configured.connection.hasToken, true); assert.equal(fixture.requests.length, 0);
  const loaded = await act('/v1/settings/channels/refresh', 'POST', () => ui.getByRole('button', { name: 'Reload channels', exact: true }).click());
  assert.equal(loaded.catalog.platforms.length, 3);
  const detail = ui.getByRole('region', { name: 'Channel setup', exact: true });
  await detail.getByLabel('Bot token', { exact: true }).fill('synthetic-bot-secret');
  await detail.getByLabel('Allowed Telegram user IDs', { exact: true }).fill('123456789');
  await ui.getByRole('navigation', { name: 'Messaging channels' }).getByRole('button', { name: /Discord/ }).click();
  await ui.getByRole('navigation', { name: 'Messaging channels' }).getByRole('button', { name: /Telegram/ }).click();
  assert.equal(await detail.getByLabel('Bot token', { exact: true }).inputValue(), '', 'Switching channels clears secrets and drafts');
  await detail.getByLabel('Bot token', { exact: true }).fill('synthetic-bot-secret');
  await detail.getByLabel('Allowed Telegram user IDs', { exact: true }).fill('123456789');
  assert.equal(await detail.getByRole('button', { name: 'Save channel settings', exact: true }).isEnabled(), false);
  await detail.getByRole('checkbox', { name: /Apply to this Hermes profile/ }).check();
  const saved = await act('/v1/settings/channels/action', 'POST', () => detail.getByRole('button', { name: 'Save channel settings', exact: true }).click());
  assert.equal(saved.result.saved, true); assert.equal(saved.catalog.platforms[0].enabled, false);
  assert.equal(await detail.getByLabel('Bot token', { exact: true }).inputValue(), '');
  assert.equal(await detail.getByLabel('Allowed Telegram user IDs', { exact: true }).inputValue(), '123456789');
  assert.ok(!JSON.stringify(saved).includes('synthetic-bot-secret'));
  await detail.getByRole('checkbox', { name: /Apply to this Hermes profile/ }).check();
  const enabled = await act('/v1/settings/channels/action', 'POST', () => detail.getByRole('button', { name: 'Enable channel', exact: true }).click());
  assert.equal(enabled.catalog.platforms[0].gatewayRunning, false);
  const checked = await act('/v1/settings/channels/action', 'POST', () => detail.getByRole('button', { name: 'Check status', exact: true }).click());
  assert.equal(checked.result.ok, false);
  record('Hermes messaging: real HTTP catalog, credential save, separate enable and gateway status; no automatic provider calls');
  await ui.getByText('HERMES / MESSAGING', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDirectory, 'settings-channels-desktop.png'), fullPage: false });
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await noOverflow(`channel setup ${width}px`); await detail.getByRole('heading', { name: 'Telegram', exact: true, level: 3 }).scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(outputDirectory, `settings-channels-${width}.png`), fullPage: false }); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await detail.getByText('Manage messaging gateway', { exact: true }).click();
  await detail.getByRole('checkbox', { name: /I approve restarting/ }).check();
  const restarted = await act('/v1/settings/channels/restart', 'POST', () => detail.getByRole('button', { name: 'Request gateway restart', exact: true }).click());
  assert.equal(restarted.catalog, null); assert.equal(restarted.result.restartRequested, true);
  const refreshed = await act('/v1/settings/channels/refresh', 'POST', () => ui.getByRole('button', { name: 'Reload channels', exact: true }).click());
  assert.equal(refreshed.catalog.platforms[0].state, 'connected');
  await ui.getByLabel('Search channels', { exact: true }).fill('slack');
  assert.equal(await ui.getByRole('navigation', { name: 'Messaging channels' }).getByRole('button').count(), 1);
  await ui.getByLabel('Search channels', { exact: true }).fill('');
  assert.ok(!JSON.stringify(await page.evaluate(() => ({ ...localStorage, ...sessionStorage }))).includes('synthetic-dashboard-token'));
  assert.deepEqual((await snapshot()).objects, before.objects); assert.deepEqual((await snapshot()).rooms, before.rooms);
  record('Messaging restart is explicitly approved and verified by a later read; channel setup never changes Brain objects or rooms');
}
