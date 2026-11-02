// Model-picker helpers adapted from Hermes model-select.tsx (MIT, Nous Research).
// See docs/licenses/HERMES-MIT.txt. Provider presets are Arkive-specific.
import { getModelCapabilities } from '../../../personal-node/model-capabilities.mjs';
export const withActive = (models, active) => active && !models.includes(active) ? [active, ...models] : models;
export const toItemValue = model => model ? `model:${model}` : '';
export const fromItemValue = item => item.startsWith('model:') ? item.slice(6) : null;

export const PROVIDERS = [
  { id: 'openai', name: 'OpenAI · API key', baseUrl: 'https://api.openai.com/v1', keyRequired: true },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyRequired: true },
  { id: 'ollama', name: 'Ollama · local', baseUrl: 'http://127.0.0.1:11434/v1', keyRequired: false },
  { id: 'lmstudio', name: 'LM Studio · local', baseUrl: 'http://127.0.0.1:1234/v1', keyRequired: false },
  { id: 'custom', name: 'Custom compatible endpoint', baseUrl: '', keyRequired: false },
];
export const providerFor = url => PROVIDERS.find(p => p.baseUrl && p.baseUrl === url.replace(/\/$/, '')) || PROVIDERS[4];

/** Keep saved values visible, but never offer known non-chat models as new choices. */
export function chatModelOptions(baseUrl, models, active = '', saved = '') {
  const retained = new Set([active, saved].filter(Boolean));
  return [...new Set([...retained, ...models])].map(id => ({ id, ...getModelCapabilities(baseUrl, id) }))
    .filter(option => option.compatibility !== 'unsupported' || retained.has(option.id));
}

export function uniqueConnectionName(baseName, connections, exceptId = '') {
  const base = baseName.trim().slice(0, 74) || 'Model connection';
  const used = new Set(connections.filter(c => c.id !== exceptId).map(c =>
    (c.name === 'Default connection' ? providerFor(c.baseUrl).name : c.name).trim().toLowerCase()));
  for (const c of connections) if (c.id !== exceptId) used.add(c.name.trim().toLowerCase());
  if (!used.has(base.toLowerCase())) return base;
  let ordinal = 2;
  while (used.has(`${base} ${ordinal}`.toLowerCase())) ordinal++;
  return `${base} ${ordinal}`;
}

export function connectionNameIssue(name, connections, exceptId = '') {
  const cleaned = name.trim();
  if (!cleaned || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) return 'Enter a connection name of 1–80 characters.';
  if (connections.some(c => c.id !== exceptId && c.name.trim().toLowerCase() === cleaned.toLowerCase())) return 'That name is already in use. Give this connection a different name.';
  return '';
}
