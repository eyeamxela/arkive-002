// Provider bodies, URLs, exception messages and credentials are never UI diagnostics.
const MESSAGES = Object.freeze({
  PROVIDER_AUTH: 'The provider rejected authentication. Check the API key in Models & connections.',
  PROVIDER_PERMISSION: 'The provider denied access. Check your project permissions and model access.',
  PROVIDER_QUOTA: 'The provider reports insufficient quota or credit. Check billing and project limits.',
  PROVIDER_RATE_LIMIT: 'The provider rate limit was reached. Wait briefly and try again.',
  PROVIDER_MODEL: 'The selected model is unavailable or incompatible with this chat adapter. Choose another model.',
  PROVIDER_PARAMETERS: 'The provider rejected the request parameters. Check the model and generation settings.',
  PROVIDER_CONTEXT: 'The provider rejected the context size. Select fewer sources or shorten the conversation.',
  PROVIDER_TIMEOUT: 'The provider request timed out. Try again or check the connection.',
  PROVIDER_NETWORK: 'The provider could not be reached. Check the connection, endpoint and network.',
  PROVIDER_INVALID_RESPONSE: 'The provider did not return a valid text-chat response.',
  PROVIDER_RESPONSE_LIMIT: 'The provider response exceeds Arkive’s size limit.',
  PROVIDER_CANCELLED: 'The provider request was cancelled.',
  PROVIDER_UNAVAILABLE: 'The provider is temporarily unavailable. Try again later.',
  PROVIDER_REQUEST_FAILED: 'The provider request failed. Check the connection and try again.',
});

export function providerError(code) {
  const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'PROVIDER_REQUEST_FAILED';
  return Object.assign(new Error(MESSAGES[safeCode]), { code: safeCode, status: 502 });
}

export function describeProviderError(error) {
  if (Object.hasOwn(MESSAGES, error?.code)) return { code: error.code, message: MESSAGES[error.code] };
  if (error?.name === 'AbortError') return { code: 'PROVIDER_CANCELLED', message: MESSAGES.PROVIDER_CANCELLED };
  if (['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(error?.code)) return { code: 'PROVIDER_TIMEOUT', message: MESSAGES.PROVIDER_TIMEOUT };
  if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error?.code)) {
    return { code: 'PROVIDER_NETWORK', message: MESSAGES.PROVIDER_NETWORK };
  }
  return { code: 'PROVIDER_REQUEST_FAILED', message: MESSAGES.PROVIDER_REQUEST_FAILED };
}

/** Only allowlisted machine codes are inspected; provider messages are discarded. */
export function providerHttpError(status, responseBody) {
  let upstream;
  try { upstream = JSON.parse(responseBody)?.error; } catch { /* Non-JSON error pages are never exposed. */ }
  const codes = [upstream?.code, upstream?.type];
  let code;
  if (status === 401) code = 'PROVIDER_AUTH';
  else if (status === 403) code = 'PROVIDER_PERMISSION';
  else if (status === 408 || status === 504) code = 'PROVIDER_TIMEOUT';
  else if (status === 429 && codes.some(value => ['insufficient_quota', 'billing_hard_limit_reached', 'billing_not_active'].includes(value))) code = 'PROVIDER_QUOTA';
  else if (status === 429) code = 'PROVIDER_RATE_LIMIT';
  else if (status >= 500) code = 'PROVIDER_UNAVAILABLE';
  else if (codes.includes('model_not_found') || codes.includes('unsupported_model')) code = 'PROVIDER_MODEL';
  else if (status === 413 || codes.includes('context_length_exceeded')) code = 'PROVIDER_CONTEXT';
  else if ([400, 404, 422].includes(status)) code = 'PROVIDER_PARAMETERS';
  else code = 'PROVIDER_REQUEST_FAILED';
  return providerError(code);
}
