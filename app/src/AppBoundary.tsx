import { Component, type ReactNode } from 'react';

// Presentation-only failure state. This does not authenticate, authorize, retry
// writes, change credentials, or alter the configured backend.
export class AppBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:24,background:'#080808',color:'#e8e8e4'}}>
      <section style={{maxWidth:520,padding:28,border:'1px solid #292925',borderRadius:14,background:'#10100f'}}>
        <h1 style={{fontSize:23,fontWeight:500}}>Arkive needs a matching backend</h1>
        <p style={{color:'#aaa',lineHeight:1.7}}>This screen could not load. The local frontend may be newer than the deployed backend, or the connection may have failed. No deployment or authentication changes are made automatically.</p>
        <p style={{color:'#c8b4a6',lineHeight:1.6}}>For the isolated UI preview, run <code>npm run test:ui</code> from the app folder and open <code>http://127.0.0.1:1421</code>. It uses synthetic data only.</p>
        <button onClick={() => window.location.reload()} style={{border:0,borderRadius:7,padding:'10px 16px',background:'#ff5a1f',color:'#111',cursor:'pointer'}}>retry loading</button>
        <p style={{fontSize:11,color:'#888',lineHeight:1.6}}>This owner beta requires matching Clerk and Convex configuration. No workspace opens without server verification. Complete the setup guide and live access-control checks before importing private business data.</p>
      </section>
    </main>;
  }
}
