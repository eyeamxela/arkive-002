/** Only this bounded, non-content metadata may enter a durable provider receipt. */
const OUTCOMES = new Set(['complete', 'incomplete', 'refused', 'filtered', 'unsupported', 'unknown']);
const FINISH_REASONS = new Set(['stop', 'length', 'content_filter', 'tool_calls', 'function_call']);
const bad = () => { throw Object.assign(new Error('Invalid provider receipt metadata'), { code: 'PROVIDER_RECEIPT_INVALID', status: 400 }); };
function record(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).some(key => typeof key !== 'string' || !fields.includes(key) || !Object.getOwnPropertyDescriptor(value, key)?.enumerable || !('value' in Object.getOwnPropertyDescriptor(value, key)))) bad();
  if (Object.values(value).some(part => part === undefined)) bad();
}
export function validateProviderReceipt(value) {
  record(value, ['outcome', 'finishReason', 'responseId', 'returnedModel', 'usage']);
  if (!OUTCOMES.has(value.outcome)) bad();
  if (value.finishReason !== undefined && !FINISH_REASONS.has(value.finishReason)) bad();
  if (value.outcome === 'complete' && value.finishReason !== undefined && value.finishReason !== 'stop') bad();
  for (const field of ['responseId', 'returnedModel']) if (value[field] !== undefined &&
      (typeof value[field] !== 'string' || !/^[A-Za-z0-9._:/-]{1,160}$/.test(value[field]))) bad();
  if (value.usage !== undefined) {
    record(value.usage, ['inputTokens', 'outputTokens', 'totalTokens', 'reasoningTokens']);
    for (const tokens of Object.values(value.usage)) if (!Number.isSafeInteger(tokens) || tokens < 0 || tokens > 1_000_000_000) bad();
    const { inputTokens, outputTokens, totalTokens, reasoningTokens } = value.usage;
    if (reasoningTokens !== undefined && outputTokens !== undefined && reasoningTokens > outputTokens) bad();
    if (totalTokens !== undefined && ((inputTokens ?? 0) > totalTokens || (outputTokens ?? 0) > totalTokens ||
        (inputTokens !== undefined && outputTokens !== undefined && inputTokens + outputTokens > totalTokens))) bad();
  }
  return structuredClone(value);
}
