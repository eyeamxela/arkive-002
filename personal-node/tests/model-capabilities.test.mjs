import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getModelCapabilities } from '../model-capabilities.mjs';

const official = 'https://api.openai.com/v1';
test('known non-chat OpenAI models are rejected by the text-chat adapter', () => {
  for (const model of ['text-embedding-3-small', 'gpt-image-1', 'dall-e-3', 'whisper-1', 'tts-1', 'omni-moderation-latest',
    'gpt-4o-mini-transcribe', 'gpt-4o-mini-tts', 'gpt-4o-realtime-preview', 'gpt-5-codex', 'o3-deep-research', 'o3-pro', 'gpt-5-pro', 'davinci-002', 'o1-mini', 'o1-preview', 'o1-mini-2024-09-12', 'o1-preview-2024-09-12']) {
    assert.equal(getModelCapabilities(official, model).compatibility, 'unsupported', model);
  }
});
test('official OpenAI output limits use max_completion_tokens and temperature is conservative', () => {
  for (const model of ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini-2025-04-14', 'gpt-3.5-turbo']) {
    const caps = getModelCapabilities(official, model);
    assert.equal(caps.compatibility, 'supported', model);
    assert.equal(caps.tokenParameter, 'max_completion_tokens');
    assert.equal(caps.supportsTemperature, true);
  }
  for (const model of ['o1', 'o3-mini', 'o4-mini', 'gpt-5', 'gpt-5-mini', 'gpt-6.1-sol']) {
    const caps = getModelCapabilities(official, model);
    assert.equal(caps.compatibility, 'supported', model);
    assert.equal(caps.tokenParameter, 'max_completion_tokens');
    assert.equal(caps.supportsTemperature, false);
  }
});
test('unknown official models are explicit and generic endpoints keep compatible parameters', () => {
  assert.deepEqual(getModelCapabilities(official, 'future-unknown').compatibility, 'unknown');
  assert.equal(getModelCapabilities(official, 'future-unknown').supportsTemperature, false);
  for (const endpoint of ['http://127.0.0.1:11434/v1', 'https://openrouter.ai/api/v1', 'https://api.openai.com.evil.invalid/v1', 'not a URL']) {
    const caps = getModelCapabilities(endpoint, 'org/my-model');
    assert.equal(caps.compatibility, 'unknown');
    assert.equal(caps.tokenParameter, 'max_tokens');
    assert.equal(caps.supportsTemperature, true);
  }
});
