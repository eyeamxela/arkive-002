import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { Shell } from './Shell';
import { AppBoundary } from './AppBoundary';
import './App.css';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <AppBoundary><Shell /></AppBoundary>
    </ConvexProvider>
  </React.StrictMode>
);
