import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { executeChat, requestJson } from '../execution.mjs';
import { describeProviderError, providerError } from '../provider-diagnostics.mjs';

const originalSecret = 'synthetic-api-secret-never-expose';
function fixture(result, overrides = {}) {
  const calls = [], completed = [], failed = [];
  const store = {
    beginRun: async value => ({ run: { id: 'run-synthetic', prompt: value.prompt }, context: [{ objectId: 'source-selected', text: 'Only this source.' }], history: [] }),
    completeRun: async (...args) => { completed.push(args); return { run: { id: args[0] }, answer: args[1], providerReceipt: args[2] }; },
    failRun: async (...args) => { failed.push(args); },
  };
  const config = { baseUrl: 'https://api.openai.com/v1', model: 'gpt-6.1-sol', apiKey: originalSecret,
    request: async (url, options) => { calls.push({ url, options }); if (result instanceof Error) throw result; return result; }, ...overrides };
  return { calls, completed, failed, send: () => executeChat(store, 'room-synthetic', { text: 'Synthetic prompt.', allowExternal: true }, config) };
}
const response = (finish_reason = 'stop', content = 'Synthetic answer.', extra = {}) => ({ choices: [{ finish_reason, message: { content, ...extra } }] });

test('OpenAI chat sends selected evidence with model-aware controls and records actual provider usage', async () => {
  const f = fixture({ ...response(), id: 'chatcmpl-synthetic', model: 'gpt-6.1-sol-2026-10-01',
    usage: { prompt_tokens: 250, completion_tokens: 51, total_tokens: 301, completion_tokens_details: { reasoning_tokens: 20 } } }, { temperature: 0.4, maxTokens: 4096 });
  const result = await f.send();
  assert.equal(f.calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(f.calls[0].options.body.max_completion_tokens, 4096);
  assert.equal('max_tokens' in f.calls[0].options.body, false);
  assert.equal('temperature' in f.calls[0].options.body, false);
  assert.match(f.calls[0].options.body.messages[1].content, /source-selected/);
  assert.deepEqual(result.providerReceipt, { outcome: 'complete', finishReason: 'stop', responseId: 'chatcmpl-synthetic', returnedModel: 'gpt-6.1-sol-2026-10-01', usage: { inputTokens: 250, outputTokens: 51, totalTokens: 301, reasoningTokens: 20 } });
});
test('compatible endpoints retain max_tokens and their temperature setting', async () => {
  const f = fixture(response(), { baseUrl: 'http://127.0.0.1:11434/v1', model: 'synthetic/local', maxTokens: 100, temperature: 0.2 });
  await f.send();
  assert.equal(f.calls[0].options.body.max_tokens, 100);
  assert.equal(f.calls[0].options.body.temperature, 0.2);
  assert.equal('max_completion_tokens' in f.calls[0].options.body, false);
});
test('known non-chat models fail before dispatch with a useful safe receipt', async () => {
  const f = fixture(response(), { model: 'text-embedding-3-small' });
  await assert.rejects(f.send(), { code: 'PROVIDER_MODEL' });
  assert.equal(f.calls.length, 0);
  assert.equal(f.completed.length, 0);
  assert.equal(f.failed[0][1].code, 'PROVIDER_MODEL');
});
test('incomplete, refusal, filter, tool and missing finish reasons never become complete outcomes', async () => {
  const cases = [
    [response('length', 'A partial answer'), 'incomplete'],
    [response('length', null), 'incomplete'],
    [response('stop', null, { refusal: 'Provider-private explanation is not copied.' }), 'refused'],
    [response('content_filter', null), 'filtered'],
    [response('tool_calls', null, { tool_calls: [{ id: 't', function: { name: 'shell', arguments: '{}' } }] }), 'unsupported'],
    [{ choices: [{ message: { content: 'Provider omitted status' } }] }, 'unknown'],
    [response('unexpected-secret-status', 'Unknown status answer'), 'unknown'],
  ];
  for (const [input, expected] of cases) {
    const f = fixture(input), result = await f.send();
    assert.equal(result.providerReceipt.outcome, expected);
    assert.ok(result.answer.length > 0);
    assert.doesNotMatch(result.answer, /Provider-private/);
    assert.doesNotMatch(JSON.stringify(result.providerReceipt), /unexpected-secret/);
  }
});
test('malformed, empty and oversized text fails without preserving raw provider output', async () => {
  for (const value of [{}, { choices: { 0: { message: { content: 'Not an array' } } } }, response('stop', ''), response('stop', ['not text']), response('stop', 'x'.repeat(128001)), response('stop', 'Not an assistant', { role: 'user' })]) {
    const f = fixture(value);
    await assert.rejects(f.send(), { code: 'PROVIDER_INVALID_RESPONSE' });
    assert.equal(f.completed.length, 0);
    assert.equal(f.failed[0][1].code, 'PROVIDER_INVALID_RESPONSE');
  }
});
test('receipt metadata is bounded, allowlisted and excludes credentials and invalid counts', async () => {
  const f = fixture({ ...response(), id: originalSecret, model: '<script>secret</script>', usage: { prompt_tokens: -1, completion_tokens: 1.4, total_tokens: Infinity, completion_tokens_details: { reasoning_tokens: 'secret' } } });
  assert.deepEqual((await f.send()).providerReceipt, { outcome: 'complete', finishReason: 'stop' });
  const unsafe = fixture({ ...response(), id: 'x'.repeat(200), model: 'sk-secret', usage: { prompt_tokens: 2_000_000_000, completion_tokens: 2, completion_tokens_details: { reasoning_tokens: 5 } } });
  assert.deepEqual((await unsafe.send()).providerReceipt, { outcome: 'complete', finishReason: 'stop', usage: { outputTokens: 2 } });
  const inconsistent = fixture({ ...response(), usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 5 } });
  assert.deepEqual((await inconsistent.send()).providerReceipt, { outcome: 'complete', finishReason: 'stop' });
});
test('raw exception messages never escape into API errors or failure receipts', async () => {
  for (const [code, expected] of [['ENOTFOUND', 'PROVIDER_NETWORK'], ['ETIMEDOUT', 'PROVIDER_TIMEOUT'], ['unknown', 'PROVIDER_REQUEST_FAILED'], ['PROVIDER_AUTH', 'PROVIDER_AUTH']]) {
    const f = fixture(Object.assign(new Error(`raw body ${originalSecret}`), { code }));
    await assert.rejects(f.send(), error => error.code === expected && !error.message.includes(originalSecret));
    assert.equal(f.failed[0][1].code, expected);
    assert.doesNotMatch(JSON.stringify(f.failed), /raw body|synthetic-api-secret/);
  }
  assert.equal(describeProviderError(new DOMException('secret', 'AbortError')).code, 'PROVIDER_CANCELLED');
  assert.equal(providerError('unknown').code, 'PROVIDER_REQUEST_FAILED');
});
test('HTTP status and allowlisted provider codes produce actionable secret-free diagnostics', async (t) => {
  let status = 401, body = {};
  const server = http.createServer((_req, res) => { res.writeHead(status); res.end(JSON.stringify({ error: { ...body, message: `Do not expose ${originalSecret}` } })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
  for (const [nextStatus, nextBody, expected] of [[401, {}, 'PROVIDER_AUTH'], [403, {}, 'PROVIDER_PERMISSION'], [429, { code: 'insufficient_quota' }, 'PROVIDER_QUOTA'],
    [429, {}, 'PROVIDER_RATE_LIMIT'], [400, { code: 'model_not_found' }, 'PROVIDER_MODEL'], [400, { code: 'context_length_exceeded' }, 'PROVIDER_CONTEXT'],
    [400, { code: originalSecret }, 'PROVIDER_PARAMETERS'], [503, {}, 'PROVIDER_UNAVAILABLE'], [504, {}, 'PROVIDER_TIMEOUT']]) {
    status = nextStatus; body = nextBody;
    await assert.rejects(requestJson(url), error => error.code === expected && error.status === 502 && !error.message.includes(originalSecret));
  }
});
