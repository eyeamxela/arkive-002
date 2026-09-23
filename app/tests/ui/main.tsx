import React from 'react';
import ReactDOM from 'react-dom/client';
import { Shell } from '../../src/Shell';
import '../../src/App.css';
import { failNextSend, failNextMutation, fixtureSnapshot, initializeFixture } from './fixture';

declare global { interface Window { __arkiveFixture: { snapshot: typeof fixtureSnapshot; failNextSend: typeof failNextSend; failNextMutation: typeof failNextMutation } } }
window.__arkiveFixture = { snapshot: fixtureSnapshot, failNextSend, failNextMutation };
await initializeFixture();
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <div style={{ height: 25, background: '#432915', color: '#ffca98', display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px', font: '10px monospace' }}>
    <span>ISOLATED FIXTURES · memory only · no cloud/model connection</span>
    <button onClick={() => { failNextSend(); }} style={{ marginLeft: 'auto', fontSize: 10 }}>fail next send</button>
  </div>
  <Shell />
</React.StrictMode>);
