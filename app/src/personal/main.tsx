import React from 'react';
import ReactDOM from 'react-dom/client';
import { PersonalApp } from './PersonalApp';
import './PersonalApp.css';

class PersonalBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="pn-gate"><section className="pn-setup"><h1>Arkive could not render this view.</h1><p>Reload to reconnect. Your encrypted Brain remains on the personal node.</p><button onClick={() => window.location.reload()}>Reload</button></section></main> : this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><PersonalBoundary><PersonalApp /></PersonalBoundary></React.StrictMode>,
);
