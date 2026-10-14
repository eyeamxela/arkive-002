const fail = (message, code = 'WORKSPACE_INVALID', status = 400) => { throw Object.assign(new Error(message), { code, status }); };
const hex = v => typeof v === 'string' && /^#[a-f\d]{6}$/i.test(v);
export function validateWorkAppearance(value) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['settings', 'updatedAt'].includes(k)) || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)) || new Date(value.updatedAt).toISOString() !== value.updatedAt) fail('Invalid appearance record');
  const s = value.settings;
  if (s === null) return;
  const keys = ['palette', 'button', 'box', 'patternColor', 'pattern', 'patternSize', 'patternOpacity', 'gradient', 'gradientColor', 'gradientStrength', 'roundness'];
  if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).length !== keys.length || Object.keys(s).some(k => !keys.includes(k)) || !Array.isArray(s.palette) || s.palette.length !== 7 || !s.palette.every(hex) || !['button', 'box', 'patternColor', 'gradientColor'].every(k => hex(s[k])) || !['grid', 'dots', 'diamonds', 'lines', 'plain'].includes(s.pattern) || !['none', 'linear', 'radial'].includes(s.gradient)) fail('Invalid appearance settings');
  for (const [key, min, max] of [['patternSize', 16, 64], ['patternOpacity', 0, 18], ['gradientStrength', 0, 20], ['roundness', 0, 24]]) if (!Number.isInteger(s[key]) || s[key] < min || s[key] > max) fail('Appearance value out of range');
}
export function saveWorkAppearance(state, input) {
  if (!input || typeof input !== 'object' || Object.keys(input).some(k => !['settings', 'expectedUpdatedAt'].includes(k))) fail('Invalid appearance update');
  const previous = state.workspace.appearance;
  if ((previous?.updatedAt ?? null) !== input.expectedUpdatedAt) fail('Appearance changed elsewhere. Reopen the editor before saving.', 'WORKSPACE_STALE', 409);
  const record = { settings: structuredClone(input.settings), updatedAt: new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString() };
  validateWorkAppearance(record);
  state.workspace.appearance = record;
  return record;
}
