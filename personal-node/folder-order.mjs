const fail = (message, code = 'WORKSPACE_INVALID', status = 400) => { throw Object.assign(new Error(message), { code, status }); };
const scopes = ['sections', 'statuses'];
function validOrder(scope, order) {
  return Array.isArray(order) && order.length <= 500 && new Set(order).size === order.length && order.every(key => typeof key === 'string' && key.trim() === key && key.length > 0 && Buffer.byteLength(key) <= 160 && !/[\x00-\x1f]/.test(key) && (scope !== 'statuses' || ['todo', 'doing', 'review', 'done'].includes(key)));
}
export function validateFolderOrder(value) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !scopes.includes(key)) || Object.entries(value).some(([key, order]) => !validOrder(key, order))) fail('Invalid folder order');
}
export function saveFolderOrder(state, input) {
  if (!input || Object.keys(input).some(key => !['scope', 'order', 'expectedOrder'].includes(key)) || !scopes.includes(input.scope) || !validOrder(input.scope, input.order) || !validOrder(input.scope, input.expectedOrder)) fail('Invalid folder ordering request');
  const previous = state.workspace.folderOrder?.[input.scope] ?? [];
  if (JSON.stringify(previous) !== JSON.stringify(input.expectedOrder)) fail('Folder order changed elsewhere. Refresh and try again.', 'WORKSPACE_STALE', 409);
  state.workspace.folderOrder = { ...state.workspace.folderOrder, [input.scope]: [...input.order] };
  return state.workspace.folderOrder;
}
