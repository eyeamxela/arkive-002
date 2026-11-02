/** Conservative, browser-safe capabilities for Arkive's text Chat Completions adapter.
 * A model being listed by a provider is not a promise that this adapter can run it.
 * Unknown/custom models remain usable, but the UI must show the unverified status.
 */
export function getModelCapabilities(baseUrl, model) {
  let official = false;
  try {
    const url = new URL(baseUrl);
    official = url.protocol === 'https:' && url.hostname === 'api.openai.com' && (!url.port || url.port === '443');
  } catch { /* Endpoint validation is performed separately, on the node. */ }
  const tokenParameter = official ? 'max_completion_tokens' : 'max_tokens';
  const id = typeof model === 'string' ? model.trim().toLowerCase() : '';
  if (!official) return { compatibility: 'unknown', reason: 'Custom or compatible provider: text-chat support must be verified with that provider.', supportsTemperature: true, tokenParameter };
  const undated = id.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  if (['o1-mini', 'o1-preview'].includes(undated)) return { compatibility: 'unsupported', reason: 'This model does not support the system instructions required by Arkive’s source-grounded chat adapter. Choose a newer chat model.', supportsTemperature: false, tokenParameter };
  if (/^(?:text-embedding|embedding|tts-|whisper-|dall-e|gpt-image|sora|omni-moderation|text-moderation|computer-use)/.test(id)
    || /^gpt-(?:4o|audio|realtime)(?:-|$).*(?:realtime|transcribe|tts)/.test(id)
    || /^gpt-realtime(?:-|$)/.test(id)
    || /^(?:o3|o4-mini)-deep-research(?:-|$)/.test(id)
    || /^(?:codex-mini|gpt-5(?:\.[123])?-codex)(?:-|$)/.test(id)
    || /^(?:o1|o3|gpt-5(?:\.\d+)?)-pro(?:-|$)/.test(id)
    || /^(?:babbage|davinci|text-davinci|text-curie|text-babbage|text-ada)(?:-|$)/.test(id)) {
    return { compatibility: 'unsupported', reason: 'This model is not supported by Arkive’s text Chat Completions adapter. Choose a chat model.', supportsTemperature: false, tokenParameter };
  }
  const standardChat = ['gpt-3.5-turbo', 'gpt-3.5-turbo-16k', 'gpt-4', 'gpt-4-32k', 'gpt-4-turbo', 'gpt-4-turbo-preview',
    'gpt-4o', 'gpt-4o-mini', 'chatgpt-4o-latest', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'].includes(undated);
  const reasoningChat = ['o1', 'o3', 'o3-mini', 'o4-mini', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-6.1-sol'].includes(undated);
  if (standardChat || reasoningChat) return { compatibility: 'supported', reason: 'Supported text-chat model family. Availability still depends on your provider account.', supportsTemperature: standardChat, tokenParameter };
  return { compatibility: 'unknown', reason: 'This model’s text-chat compatibility is unverified. Optional temperature is omitted; check the connection before relying on it.', supportsTemperature: false, tokenParameter };
}
