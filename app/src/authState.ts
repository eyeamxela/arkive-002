export type AppConfig = { convexUrl: string; clerkKey: string };
export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; issues: string[] };
function validPublishableKey(key: string): boolean {
  if (!/^pk_(test|live)_[A-Za-z0-9+/]+={0,2}$/.test(key)) return false;
  try {
    const decoded = atob(key.slice(8));
    if (!decoded.endsWith('$')) return false;
    const host = decoded.slice(0, -1);
    return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) && host.includes('.') && !host.includes('..');
  } catch { return false; }
}
export function readAppConfig(env: Record<string, unknown>): ConfigResult {
  const convexUrl = typeof env.VITE_CONVEX_URL === 'string' ? env.VITE_CONVEX_URL.trim() : '';
  const clerkKey = typeof env.VITE_CLERK_PUBLISHABLE_KEY === 'string' ? env.VITE_CLERK_PUBLISHABLE_KEY.trim() : '';
  const issues: string[] = [];
  let canonicalUrl = '';
  try {
    const url = new URL(convexUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('invalid');
    canonicalUrl = url.origin;
  } catch { issues.push('VITE_CONVEX_URL must be the HTTPS URL of your Arkive Convex deployment.'); }
  if (!validPublishableKey(clerkKey)) issues.push('VITE_CLERK_PUBLISHABLE_KEY must be the publishable key from your Arkive Clerk project.');
  return issues.length ? { ok: false, issues } : { ok: true, config: { convexUrl: canonicalUrl, clerkKey } };
}
export type AuthGateState = 'loading' | 'signed-out' | 'verifying' | 'denied' | 'initialize' | 'ready';
export function authGateState(input: {
  clerkLoaded: boolean; signedIn: boolean; userId: string | null | undefined;
  convexLoading: boolean; convexAuthenticated: boolean;
  access?: { subject: string; initialized: boolean };
}): AuthGateState {
  if (!input.clerkLoaded) return 'loading';
  if (!input.signedIn || !input.userId) return 'signed-out';
  if (input.convexLoading || !input.convexAuthenticated) return 'verifying';
  if (!input.access) return 'loading';
  if (input.access.subject !== input.userId) return 'denied';
  return input.access.initialized ? 'ready' : 'initialize';
}
