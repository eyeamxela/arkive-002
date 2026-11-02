export type ModelCapabilities = {
  compatibility: 'supported' | 'unsupported' | 'unknown';
  reason: string;
  supportsTemperature: boolean;
  tokenParameter: 'max_completion_tokens' | 'max_tokens';
};
export function getModelCapabilities(baseUrl: string, model: string): ModelCapabilities;
