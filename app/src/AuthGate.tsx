import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { SignIn, useAuth, useClerk } from '@clerk/react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { LocalScopeProvider } from './LocalScopeProvider';
import { workspaceStorageScope } from './localScope';
import { authGateState } from './authState';

const Shell = lazy(() => import('./Shell').then(module => ({ default: module.Shell })));

export function AccessScreen({ title, children }: { title: string; children: ReactNode }) {
  return <main style={{ minHeight: '100dvh', boxSizing: 'border-box', display: 'grid', placeItems: 'center', padding: 24, background: '#080808', color: '#e8e8e4' }}>
    <section style={{ width: '100%', maxWidth: 540, boxSizing: 'border-box', padding: 28, border: '1px solid #292925', borderRadius: 14, background: '#10100f' }}>
      <div style={{ color: '#ff5a1f', font: '11px monospace', letterSpacing: '0.12em' }}>ARKIVE · OWNER BETA</div>
      <h1 style={{ fontSize: 23, fontWeight: 500 }}>{title}</h1>
      <div style={{ color: '#aaa', lineHeight: 1.7 }}>{children}</div>
    </section>
  </main>;
}
const button = { border: '1px solid #3a3029', borderRadius: 7, padding: '10px 16px', background: '#241b15', color: '#ffb78f', cursor: 'pointer' };

export function AuthGate({ deployment }: { deployment: string }) {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const { signOut } = useClerk();
  const [closing, setClosing] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  useEffect(() => { if (isLoaded && !isSignedIn) setClosing(false); }, [isLoaded, isSignedIn]);
  const exit = () => {
    setClosing(true); setSignOutError('');
    // Do not reopen the old Shell just because the signOut promise resolved;
    // wait until Clerk actually reports that this session is signed out.
    void signOut().catch(() => setSignOutError('Sign-out did not finish. The workspace remains locked; retry signing out.'));
  };
  if (closing) return <AccessScreen title="Workspace locked"><p role="status">{signOutError || 'Signing out…'}</p>{signOutError && <button style={button} onClick={exit}>retry sign out</button>}</AccessScreen>;
  if (!isLoaded) return <AccessScreen title="Loading sign-in"><p role="status">No workspace data is loaded before identity verification.</p></AccessScreen>;
  if (!isSignedIn || !userId) return <AccessScreen title="Sign in to your Arkive"><p>This beta is restricted to the owner configured on the server. Signing up does not grant workspace access.</p><SignIn routing="hash" /></AccessScreen>;
  return <OwnerAccessBoundary key={sessionId ?? userId} onSignOut={exit}>
    <VerifiedSession deployment={deployment} userId={userId} onSignOut={exit} />
  </OwnerAccessBoundary>;
}

class OwnerAccessBoundary extends Component<{ children: ReactNode; onSignOut: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <AccessScreen title="Workspace access unavailable"><p role="alert">This account is not authorized, the owner configuration is incomplete, or the backend could not verify access. No workspace data is shown.</p><p>Only the configured Arkive owner can enter this beta. Follow the setup guide if this is your first connection.</p><button style={button} onClick={this.props.onSignOut}>sign out</button>{' '}<button style={button} onClick={() => window.location.reload()}>retry verification</button></AccessScreen>;
  }
}
function VerifiedSession({ deployment, userId, onSignOut }: { deployment: string; userId: string; onSignOut: () => void }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  // Only this one guarded endpoint is queried before server authorization.
  const access = useQuery(api.session.current, !isLoading && isAuthenticated ? {} : 'skip');
  const initialize = useMutation(api.session.initialize);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const state = authGateState({ clerkLoaded: true, signedIn: true, userId, convexLoading: isLoading, convexAuthenticated: isAuthenticated, access });
  if (state === 'ready' && access) return <LocalScopeProvider scope={workspaceStorageScope(deployment, access)} onSignOut={onSignOut}><Suspense fallback={<AccessScreen title="Opening your workspace"><p role="status">Owner access verified.</p></AccessScreen>}><Shell /></Suspense></LocalScopeProvider>;
  if (state === 'initialize') return <AccessScreen title="Create your private workspace"><p>Your owner identity is verified. Initialize an empty workspace with safe default policies. This does not import legacy demo rows, local files, drafts or sample data.</p>{error && <p role="alert">{error}</p>}<button style={button} disabled={busy} onClick={() => {
    if (busy) return; setBusy(true); setError('');
    void initialize({}).catch(() => setError('Workspace initialization failed. Nothing was imported. Retry after checking backend configuration.')).finally(() => setBusy(false));
  }}>{busy ? 'initializing…' : 'initialize private workspace'}</button>{' '}<button style={button} onClick={onSignOut}>sign out</button></AccessScreen>;
  return <AccessScreen title={state === 'denied' ? 'Workspace access denied' : 'Verifying workspace access'}><p role={state === 'denied' ? 'alert' : 'status'}>{state === 'denied' ? 'The verified workspace does not match the signed-in account. Sign out and reconnect.' : 'Waiting for Convex to verify your identity and configured owner access. Workspace queries and local drafts remain locked.'}</p><p>For a first connection, verify the Clerk JWT template, Convex authentication provider and owner settings in the setup guide.</p><button style={button} onClick={onSignOut}>sign out</button></AccessScreen>;
}
