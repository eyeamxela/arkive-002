/** Versioned boundary between room governance and execution adapters. No credentials in descriptors. */
export const RUNTIME_CONTRACT_VERSION = 1;

export function resolveExecutionRoute(config = {}) {
  if ((config.harness && config.harness !== 'arkive-text') ||
      (config.apiMode && config.apiMode !== 'chat-completions')) {
    throw Object.assign(new Error('This execution adapter is not implemented; connection changes cannot enable tools or another harness'), { code: 'RUNTIME_UNAVAILABLE', status: 400 });
  }
  return { contractVersion: RUNTIME_CONTRACT_VERSION, harnessId: 'arkive-text', adapterId: 'openai-compatible',
    apiMode: 'chat-completions', connectionId: config.connectionId || 'environment',
    model: config.model || null, scope: 'node-default', configured: config.enabled !== false && Boolean(config.baseUrl && config.model),
    capabilities: { text: true, streaming: false, runEventStream: true, governedConversation: true, tools: false, persistentRuntimeSession: false, artifacts: false, backgroundJobs: false },
    policy: { externalConsent: 'per-send', memory: 'compiled-room-sources', memberExecution: 'owner-approval', history: 'opt-in-exact-scope-last-8-turns-32000-characters' } };
}

export function describeExecutionSystem(config = {}) {
  return { contractVersion: RUNTIME_CONTRACT_VERSION, effective: resolveExecutionRoute(config),
    scopeRules: { connection: 'node-default', credentials: 'node-local-encrypted', memory: 'room-policy',
      overrides: 'Owner can pin a saved connection per chat on this node; unpinned chats explicitly follow the node default. Pins never grant source or tool access.',
      permissionExpansion: 'Settings cannot grant source or tool access' },
    adapters: [
      { id: 'arkive-text', name: 'Arkive text adapter', implemented: true, reason: 'Source-grounded text with per-send consent' },
      { id: 'hermes', name: 'Hermes', implemented: false, reason: 'Requires isolated runtime, event transport and policy-bound tool approvals' },
      { id: 'acp', name: 'ACP harness', implemented: false, reason: 'Requires process lifecycle, authentication and permission bridge' },
    ] };
}
