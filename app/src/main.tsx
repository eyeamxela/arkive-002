import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/react';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { AccessScreen, AuthGate } from './AuthGate';
import { readAppConfig } from './authState';
import { AppBoundary } from './AppBoundary';
import './App.css';

const config = readAppConfig(import.meta.env);
// Missing configuration never creates a client or falls back to demo auth.
const convex = config.ok ? new ConvexReactClient(config.config.convexUrl) : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {config.ok && convex ? <AppBoundary><ClerkProvider publishableKey={config.config.clerkKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <AuthGate deployment={config.config.convexUrl} />
      </ConvexProviderWithClerk>
    </ClerkProvider></AppBoundary> : <AccessScreen title="Set up your Arkive workspace">
      <p>Live sign-in is not configured. Create dedicated Clerk and Convex projects, then follow <code>docs/ARKIVE_OWNER_BETA_SETUP.md</code>.</p>
      <ul>{!config.ok && config.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
      <p>Never place secret keys in Vite variables. No data, authentication or cloud service is connected by this screen.</p>
      <p>The isolated UI preview is separate: <code>npm run test:ui</code>. It uses synthetic data and cannot grant production access.</p>
    </AccessScreen>}
  </React.StrictMode>
);
