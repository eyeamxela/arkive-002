// Logical browser-storage isolation, not encryption or an authorization boundary.
// Only AuthGate supplies a production scope after a server-verified owner session.
export const FIXTURE_STORAGE_SCOPE = 'arkive-fixtures-v2';
export type VerifiedWorkspace = { workspaceId: string; subject: string; issuer: string; ownerIdentity: string };

export function workspaceStorageScope(deployment: string, access: VerifiedWorkspace): string {
  const values = [deployment, access.issuer, access.subject, access.workspaceId, access.ownerIdentity];
  if (values.some(value => typeof value !== 'string' || !value.trim())) throw new Error('A verified workspace is required for local storage.');
  return 'arkive-owner-v2:' + values.map(encodeURIComponent).join(':');
}

export function scopedDraftKey(scope: string, draftKey: string): string {
  if (!scope || !draftKey) throw new Error('A storage namespace is required.');
  return scope + ':' + draftKey;
}

export function originalsDatabaseName(scope: string): string {
  if (!scope) throw new Error('A storage namespace is required.');
  // Never opens the legacy unscoped arkive-local-originals-v1 database.
  return 'arkive-local-originals-v2:' + scope;
}

export type LocalStorageSession = {
  readonly scope: string;
  active: boolean;
  readonly onDeactivate: Set<() => void>;
};
export function createLocalStorageSession(scope: string): LocalStorageSession {
  if (!scope) throw new Error('A storage namespace is required.');
  return { scope, active: true, onDeactivate: new Set() };
}
export function assertStorageSession(session: LocalStorageSession): void {
  if (!session.active) throw new Error('Your workspace session changed. Reopen the action after signing in.');
}
export function deactivateStorageSession(session: LocalStorageSession): void {
  session.active = false;
  session.onDeactivate.forEach(listener => listener());
  session.onDeactivate.clear();
}
