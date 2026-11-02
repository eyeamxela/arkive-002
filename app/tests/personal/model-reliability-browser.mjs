import assert from 'node:assert/strict';

/** Synthetic catalog intercept: never contacts OpenAI and never requests a completion. */
export async function verifyModelReliability({ page, models, act, record, providerRequests }) {
  const initialRequests = providerRequests.length;
  let catalogChecks = 0;
  const checkRoute = '**/v1/settings/provider/check';
  const interceptCatalog = async route => {
    const body = route.request().postDataJSON();
    if (body.draft?.baseUrl !== 'https://api.openai.com/v1') return route.continue();
    assert.equal(body.allowExternal, true);
    assert.equal(Object.hasOwn(body, 'messages'), false);
    assert.equal(Object.hasOwn(body, 'sources'), false);
    catalogChecks++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      models: ['gpt-4.1', 'text-embedding-3-small', 'whisper-1', 'future-chat-model', 'gpt-5'], completionVerified: false,
    }) });
  };
  await page.route(checkRoute, interceptCatalog);
  try {
    await models.getByRole('button', { name: '＋ Add provider', exact: true }).click();
    await models.getByLabel('Provider type', { exact: true }).selectOption('openai');
    assert.equal(await models.getByLabel('Connection name', { exact: true }).inputValue(), 'OpenAI · API key');
    await models.getByLabel('API key', { exact: true }).fill('synthetic-openai-key-not-real');
    await act('/v1/settings/provider/check', 'POST', () => models.getByRole('button', { name: 'Load models', exact: true }).click());
    await models.getByText(/2 known non-chat or unsupported models hidden/).waitFor();
    assert.equal(await models.getByLabel('Model', { exact: true }).locator('option[value="model:text-embedding-3-small"]').count(), 0);
    assert.equal(await models.getByLabel('Model', { exact: true }).locator('option[value="model:whisper-1"]').count(), 0);
    await models.getByLabel('Model', { exact: true }).selectOption('model:future-chat-model');
    await models.getByText(/This model’s text-chat compatibility is unverified/).waitFor();
    assert.equal(await models.getByRole('button', { name: 'Save connection', exact: true }).isEnabled(), true);
    await models.getByLabel('Model', { exact: true }).selectOption('custom');
    await models.getByLabel('Model ID', { exact: true }).fill('whisper-1');
    await models.getByText(/not supported by Arkive’s text Chat Completions adapter/).waitFor();
    assert.equal(await models.getByRole('button', { name: 'Save connection', exact: true }).isEnabled(), false);
    await models.getByRole('button', { name: 'Choose from list', exact: true }).click();
    // Playwright retargets isDisabled() through the wrapping label to the select.
    // Verify the actual option property; the select must remain usable to fix it.
    assert.equal(await models.getByLabel('Model', { exact: true }).locator('option[value="model:whisper-1"]').evaluate(option => option.disabled), true);
    assert.equal(await models.getByRole('button', { name: 'Save connection', exact: true }).isEnabled(), false);
    await models.getByLabel('Model', { exact: true }).selectOption('model:gpt-4.1');
    await models.getByText('Advanced', { exact: true }).click();
    await models.getByLabel('Temperature', { exact: true }).fill('0.4');
    await models.getByLabel('Model', { exact: true }).selectOption('model:gpt-5');
    assert.equal(await models.getByLabel('Temperature', { exact: true }).isDisabled(), true);
    assert.equal(await models.getByLabel('Temperature', { exact: true }).inputValue(), '0.4');
    assert.equal(await models.getByRole('button', { name: 'Save connection', exact: true }).isEnabled(), false);
    await models.getByLabel('Completion token budget (answer + reasoning)', { exact: true }).fill('4096');
    await models.getByRole('button', { name: 'Clear Temperature', exact: true }).click();
    assert.equal(await models.getByRole('button', { name: 'Save connection', exact: true }).isEnabled(), true);
    const first = await act('/v1/settings/connections', 'POST', () => models.getByRole('button', { name: 'Save connection', exact: true }).click());
    const firstOpenAI = first.connections.find(c => c.name === 'OpenAI · API key');
    assert.ok(firstOpenAI);
    assert.equal(firstOpenAI.temperature, null); assert.equal(firstOpenAI.maxTokens, 4096);
    assert.equal(first.activeId, 'default');
    record('mixed catalog filters non-chat models; manual unsupported IDs block save; unknown models remain explicitly unverified');
    record('model changes preserve incompatible temperature visibly and require explicit clearing; OpenAI budget includes reasoning');

    await models.getByRole('button', { name: '＋ Add provider', exact: true }).click();
    await models.getByLabel('Provider type', { exact: true }).selectOption('openai');
    assert.equal(await models.getByLabel('Connection name', { exact: true }).inputValue(), 'OpenAI · API key 2');
    await models.getByLabel('API key', { exact: true }).fill('another-synthetic-openai-key');
    await models.getByLabel('Model', { exact: true }).selectOption('custom');
    await models.getByLabel('Model ID', { exact: true }).fill('gpt-4.1');
    await models.getByLabel('Connection name', { exact: true }).fill(' OPENAI · API KEY ');
    await models.getByText(/That name is already in use/).waitFor();
    assert.equal(await models.getByRole('button', { name: 'Save connection', exact: true }).isEnabled(), false);
    await models.getByLabel('Connection name', { exact: true }).fill('OpenAI · API key 2');
    const second = await act('/v1/settings/connections', 'POST', () => models.getByRole('button', { name: 'Save connection', exact: true }).click());
    assert.equal(second.activeId, 'default');
    assert.equal(second.connections.filter(c => c.baseUrl === 'https://api.openai.com/v1').length, 2);
    assert.equal(second.connections.find(c => c.id === firstOpenAI.id).model, 'gpt-5');
    assert.equal(providerRequests.length, initialRequests);
    assert.equal(catalogChecks, 1);
    await models.getByLabel('Provider', { exact: true }).selectOption('default');
    record('multiple OpenAI connections get unique editable names and remain separate without activation or paid generation');
  } finally { await page.unroute(checkRoute, interceptCatalog); }
}
