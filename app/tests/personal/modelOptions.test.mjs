import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withActive, toItemValue, fromItemValue, PROVIDERS, providerFor, chatModelOptions, uniqueConnectionName, connectionNameIssue } from '../../src/personal/modelOptions.mjs';

test('model picker preserves custom saved IDs without confusing action values', () => {
  assert.deepEqual(withActive(['one'], 'custom'), ['custom', 'one']);
  assert.deepEqual(withActive(['one'], 'one'), ['one']);
  for (const id of ['custom', 'add', 'model:one', 'vendor/model']) assert.equal(fromItemValue(toItemValue(id)), id);
  assert.equal(fromItemValue('custom'), null);
});
test('provider presets match exact endpoints, never lookalike hosts', () => {
  for (const p of PROVIDERS.filter(p => p.baseUrl)) assert.equal(providerFor(`${p.baseUrl}/`).id, p.id);
  assert.equal(providerFor('https://api.openai.com.evil.invalid/v1').id, 'custom');
  assert.equal(providerFor(''), PROVIDERS[4]);
  assert.equal(PROVIDERS.find(p => p.id === 'openai').keyRequired, true);
});

test('chat model options filter known non-chat IDs but expose unknown compatibility', () => {
  const result = chatModelOptions('https://api.openai.com/v1', ['gpt-4.1', 'text-embedding-3-small', 'whisper-1', 'future-model', 'gpt-4.1']);
  assert.deepEqual(result.map(option => [option.id, option.compatibility]), [['gpt-4.1', 'supported'], ['future-model', 'unknown']]);
  assert.equal(result[1].supportsTemperature, false);
  assert.equal(result[0].tokenParameter, 'max_completion_tokens');
});

test('saved and manually typed unsupported IDs stay visible for correction, never certified', () => {
  const options = chatModelOptions('https://api.openai.com/v1', ['gpt-4.1'], 'whisper-1', 'text-embedding-3-small');
  assert.deepEqual(options.map(option => [option.id, option.compatibility]), [
    ['whisper-1', 'unsupported'], ['text-embedding-3-small', 'unsupported'], ['gpt-4.1', 'supported'],
  ]);
  assert.equal(chatModelOptions('http://127.0.0.1:1234/v1', ['custom-chat'])[0].compatibility, 'unknown');
});

test('connection suggestions distinguish repeated providers including the displayed default alias', () => {
  const baseUrl = 'https://api.openai.com/v1';
  const connections = [{ id: 'default', name: 'Default connection', baseUrl }];
  assert.equal(uniqueConnectionName('OpenAI · API key', connections), 'OpenAI · API key 2');
  connections.push({ id: 'second', name: 'OPENAI · API KEY 2', baseUrl });
  assert.equal(uniqueConnectionName('OpenAI · API key', connections), 'OpenAI · API key 3');
  assert.equal(uniqueConnectionName('OpenAI · API key', connections, 'default'), 'OpenAI · API key');
  assert.equal(connectionNameIssue(' OPENAI · API KEY 2 ', connections), 'That name is already in use. Give this connection a different name.');
  assert.equal(connectionNameIssue('OPENAI · API KEY 2', connections, 'second'), '');
  assert.match(connectionNameIssue(' ', connections), /1–80/);
  assert.match(connectionNameIssue('invalid\u0000name', connections), /1–80/);
});
