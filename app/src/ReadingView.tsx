import type { CSSProperties } from 'react';
import type { Doc } from '../convex/_generated/dataModel';

// port target: design/arkive-v2.html [data-screen-label='vault'] reading pane (lines 745–795):
// breadcrumb + header actions (★ / always / promote / add to scope / ✕), title, metadata strip,
// rendered body rows (h/p/li/q/tag/link), linked mentions. bodies: Component.DOCBODIES (2730–2782)
// + docBody() generator (2783–2832), ported verbatim. bindings: renderVals ~4209–4278, 5039–5042.

const O = '#ff5a1f';
const mono = "'IBM Plex Mono', monospace";
const grotesk = "'Space Grotesk', system-ui, sans-serif";
const TIER_OP: Record<string, number> = { canon: 1, curated: 0.66, dashboards: 0.46, legal: 0.4, inbox: 0.26 };

type BrainDoc = Doc<'brainObjects'>;
type BodyRow = { t: string; v: string };

const btnReset: CSSProperties = { background: 'transparent', border: 'none', margin: 0, padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' };

// — Component.DOCBODIES, verbatim —
const DOCBODIES: Record<string, BodyRow[]> = {
  'canon/xela.md': [
    { t: 'p', v: 'operator identity file. loaded before every prompt in every room — the first thing any agent reads, the last word in any conflict.' },
    { t: 'h', v: 'who' },
    { t: 'p', v: 'xela. builds systems that outlive their tools. treats attention as the scarcest resource on the desk and every automation as staff, not magic.' },
    { t: 'li', v: 'timezone: europe/lisbon · working window 09:00–01:00' },
    { t: 'li', v: 'primary surfaces: arkive desk, night desk, #xela room' },
    { t: 'li', v: 'agents address the operator as “you”, never by name' },
    { t: 'h', v: 'standing posture' },
    { t: 'p', v: 'sovereignty first: originals on own disk, references signed, everything revocable. speed second. polish third.' },
    { t: 'q', v: 'if a tool can’t be walked away from in an afternoon, it isn’t a tool — it’s a landlord.' },
    { t: 'link', v: 'canon/voice.md' },
    { t: 'link', v: 'canon/standing-rules.md' },
    { t: 'tag', v: 'identity · always-on · authority: canonical' }
  ],
  'canon/voice.md': [
    { t: 'p', v: 'how anything written on this desk sounds — agents inherit this file wholesale.' },
    { t: 'h', v: 'rules' },
    { t: 'li', v: 'lowercase by default. capitals are for proper nouns that earned them.' },
    { t: 'li', v: 'two-line briefs. no exclamation marks. no filler openers.' },
    { t: 'li', v: 'numbers over adjectives — “4 docs, 46k tokens”, never “a lot”.' },
    { t: 'li', v: 'when unsure, say unsure. hedging in confident language is lying politely.' },
    { t: 'h', v: 'banned' },
    { t: 'p', v: 'exciting news · game-changer · leverage (as a verb) · circle back · any emoji outside #xela banter.' },
    { t: 'q', v: 'the voice is the product. everything else is plumbing.' },
    { t: 'link', v: 'canon/xela.md' },
    { t: 'tag', v: 'voice · always-on · authority: canonical' }
  ],
  'curated/graph-brain-architecture.md': [
    { t: 'p', v: 'the spec this desk is built from: sovereign relay + spatial context selection + a voice you can talk to.' },
    { t: 'h', v: 'three planes' },
    { t: 'li', v: 'storage — originals in the vault, immutable, checksummed on write.' },
    { t: 'li', v: 'reference — signed events pointing at content by hash. nothing moves, everything is cited.' },
    { t: 'li', v: 'selection — manifests: a lasso on the graph becomes the exact context an agent may read.' },
    { t: 'h', v: 'the bet' },
    { t: 'p', v: 'context selection is a spatial act. a graph you can grab beats a dropdown of folders. trust tiers are brightness, not bureaucracy.' },
    { t: 'q', v: 'the manifest is the product: scope, as an artifact you can sign, share and revoke.' },
    { t: 'link', v: 'canon/three-brains.md' },
    { t: 'link', v: 'curated/manifest-primitive.md' },
    { t: 'tag', v: 'architecture · reviewed · origin: spec import' }
  ],
  'legal/msa-jrny.md': [
    { t: 'p', v: 'master services agreement — jrny engagement. summary view; the executed pdf is the original.' },
    { t: 'h', v: 'terms that matter' },
    { t: 'li', v: 'scope: campaign systems + creative ops. anything else is a change order.' },
    { t: 'li', v: 'ip: work-for-hire on delivery, tooling stays ours.' },
    { t: 'li', v: 'net-30 · late fee after 45 · kill fee 40% post-kickoff.' },
    { t: 'h', v: 'retention' },
    { t: 'p', v: 'client materials sealed to tier legal — share-gated, steward approval required, excluded from agent scope by default.' },
    { t: 'q', v: 'tier legal exists so a lasso can never accidentally include a contract.' },
    { t: 'tag', v: 'contract · restricted · lifecycle: active' }
  ]
};

// — Component.docBody(), verbatim (d.path + d.tier → generated body) —
export function docBody(d: { path: string; tier: string }): BodyRow[] {
  if (DOCBODIES[d.path]) return DOCBODIES[d.path];
  const f = (d.path.split('/').pop() ?? '').replace('.md', '').replace(/-/g, ' ');
  const seed = d.path.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  if (d.tier === 'canon') return [
    { t: 'p', v: 'standing guidance — part of the operator canon. loaded whenever its glob matches a manifest; the brightest ring on the graph.' },
    { t: 'h', v: f },
    { t: 'li', v: 'authority: canonical — supersede it, never edit history.' },
    { t: 'li', v: 'cited ' + (3 + seed % 9) + '× this month across briefs and answers.' },
    { t: 'q', v: 'canon is small on purpose: nine files outrank nine thousand.' },
    { t: 'link', v: 'canon/xela.md' },
    { t: 'tag', v: 'canon · always eligible · signed' }
  ];
  if (d.tier === 'curated') return [
    { t: 'p', v: 'working knowledge — reviewed once, promoted out of the inbox, now a stable reference for answers and agent runs.' },
    { t: 'h', v: 'what it holds' },
    { t: 'p', v: f + ' — the settled version of a thing that used to live in ' + (2 + seed % 3) + ' raw captures. the originals stay in history; this is the citable surface.' },
    { t: 'li', v: 'promoted via inbox review · ' + (seed % 2 ? 'edited at accept' : 'accepted as extracted') },
    { t: 'li', v: 'freshness: rescanned with the vault head · drift would flag here as ↯' },
    { t: 'q', v: 'a curated doc is a decision: this is what we think, until superseded.' },
    { t: 'link', v: 'curated/graph-brain-architecture.md' },
    { t: 'tag', v: 'curated · reviewed · hash-pinned' }
  ];
  if (d.tier === 'dashboards') return [
    { t: 'p', v: 'generated surface — written by the night desk on schedule, read by the 21:30 brief. numbers, not prose.' },
    { t: 'h', v: 'this window' },
    { t: 'li', v: 'fleet uptime ' + (97 + seed % 3) + '.' + (seed % 9) + '% · 0 escalations' },
    { t: 'li', v: 'captures ' + (30 + seed % 40) + ' · accepted ' + (10 + seed % 20) + ' · dismissed ' + (seed % 8) },
    { t: 'li', v: 'token spend $' + (3 + seed % 14) + '.' + (10 + seed % 80) + ' · within budget' },
    { t: 'q', v: 'dashboards are disposable — the pipeline that writes them is the asset.' },
    { t: 'tag', v: 'dashboards · generated · superseded weekly' }
  ];
  if (d.tier === 'legal') return [
    { t: 'p', v: 'restricted document — tier legal. share-gated; excluded from agent scope unless a steward grants it explicitly.' },
    { t: 'h', v: f },
    { t: 'li', v: 'visibility: operator + steward only' },
    { t: 'li', v: 'never eligible for lasso selection by default' },
    { t: 'q', v: 'the gate counts its denials — three this week, all correct.' },
    { t: 'tag', v: 'legal · restricted · policy-bound' }
  ];
  return [
    { t: 'p', v: 'raw capture — quarantined in the inbox tier until reviewed. dimmest on the graph, never cited into canon answers.' },
    { t: 'h', v: 'verbatim' },
    { t: 'q', v: '“' + f.replace(/\d+/g, '').trim() + ' — grabbed mid-stream, unedited. the point was not to lose it.”' },
    { t: 'li', v: 'source: watcher · ' + (seed % 2 ? 'voice note' : 'quick capture') },
    { t: 'li', v: 'extraction ' + (seed % 3 ? 'proposed — waiting in brain inbox' : 'not yet run') },
    { t: 'p', v: 'accept its proposal to promote it; dismiss to leave it as history. either way the original stays.' },
    { t: 'tag', v: 'inbox · unreviewed · original preserved' }
  ];
}

// — renderVals docBodyRows style map, verbatim —
const M: Record<string, CSSProperties> = {
  h: { fontFamily: grotesk, fontSize: '15.5px', fontWeight: 500, color: '#f0f0f0', lineHeight: '1.4', marginTop: '22px', paddingLeft: '0', borderLeft: 'none', letterSpacing: '0', textTransform: 'none' },
  p: { fontFamily: grotesk, fontSize: '13.5px', fontWeight: 400, color: '#c0c0c0', lineHeight: '1.75', marginTop: '10px', paddingLeft: '0', borderLeft: 'none', letterSpacing: '0', textTransform: 'none' },
  li: { fontFamily: grotesk, fontSize: '13.5px', fontWeight: 400, color: '#c0c0c0', lineHeight: '1.7', marginTop: '6px', paddingLeft: '14px', borderLeft: 'none', letterSpacing: '0', textTransform: 'none' },
  q: { fontFamily: mono, fontSize: '11.5px', fontWeight: 400, color: '#c8b4a6', lineHeight: '1.8', marginTop: '14px', paddingLeft: '14px', borderLeft: '2px solid #2a1a12', letterSpacing: '0', textTransform: 'none' },
  tag: { fontFamily: mono, fontSize: '9.5px', fontWeight: 400, color: '#5c5c5c', lineHeight: '1.6', marginTop: '14px', paddingLeft: '0', borderLeft: 'none', letterSpacing: '.08em', textTransform: 'uppercase' }
};

export function ReadingView({ doc, docs, inScope, promoted, onStar, onAlways, onPromote, onToggleScope, onClose, onOpenDoc }: {
  doc: BrainDoc;
  docs: BrainDoc[];
  inScope: boolean;
  promoted: boolean;
  onStar: () => void;
  onAlways: () => void;
  onPromote: () => void;
  onToggleScope: () => void;
  onClose: () => void;
  onOpenDoc: (doc: BrainDoc) => void;
}) {
  const path = doc.path ?? '';
  const byId = new Map<string, BrainDoc>(docs.map((d) => [d._id as string, d]));

  const docCrumb = '~/vault-xela / ' + path.split('/').join(' / ');
  const docTitle = (path.split('/').pop() ?? '').replace('.md', '');
  const review = doc.reviewStatus === 'accepted' ? 'reviewed' : '';
  const docFields = [
    { k: 'content', v: doc.content !== undefined ? 'preserved source' : 'demo preview · no source body', color: O },
    { k: 'kind', v: 'vault-ref', color: '#a8a8a8' },
    { k: 'tier', v: doc.tier, color: '#e8e8e8' },
    { k: 'hash', v: doc.hash, color: '#a8a8a8' },
    { k: 't', v: doc.tier === 'canon' ? 'identity · voice' : doc.tier === 'legal' ? 'contract · retention' : 'capture · draft', color: '#a8a8a8' },
    { k: 'links', v: 'canon/brands.md', color: '#a8a8a8' },
    { k: 'emb', v: 'local:nomic/embed-text', color: '#a8a8a8' },
    { k: 'authority', v: review === 'reviewed' ? 'reviewed · via inbox' : (doc.tier === 'canon' ? 'canonical' : 'draft'), color: doc.tier === 'canon' || review ? '#e8e8e8' : '#a8a8a8' },
    { k: 'lifecycle', v: 'active', color: '#a8a8a8' },
    { k: 'origin', v: doc.provenance, color: '#a8a8a8' }
  ];

  // linked mentions — graph edges touching the open doc (doc.relations out + other docs' relations in)
  const outs: BrainDoc[] = [];
  const push = (n: BrainDoc | undefined) => { if (n && n.path !== path && !outs.some((o) => o.path === n.path)) outs.push(n); };
  doc.relations.forEach((r) => push(byId.get(r.to as string)));
  docs.forEach((n) => { if (n._id !== doc._id && n.relations.some((r) => r.to === doc._id)) push(n); });
  const docBacklinks = outs.slice(0, 5).map((n) => ({
    doc: n, path: n.path ?? '', meta: n.tier + ' · ' + n.hash.slice(7, 12),
    dot: 'rgba(255,255,255,' + Math.max(0.16, (TIER_OP[n.tier] ?? 0.26) * 0.7) + ')'
  }));
  const docBackCount = String(doc.relations.length + docs.reduce((a, n) => a + (n._id === doc._id ? 0 : n.relations.filter((r) => r.to === doc._id).length), 0));

  const docStarFg = doc.starred ? O : '#3a3a3a';
  const docAlwaysFg = doc.alwaysLoad ? O : '#5c5c5c';
  const docAlwaysRing = doc.alwaysLoad ? '#5a2a16' : '#242424';
  const docPromoteShow = doc.tier !== 'canon';
  const docPromoteLabel = promoted ? 'proposed · review in inbox' : 'promote → canon · via inbox';
  const docPromoteFg = promoted ? '#5c5c5c' : '#c8b4a6';

  return (
    <>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderBottom: '1px solid #171717', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <div style={{ fontFamily: mono, fontSize: 9.5, color: '#5c5c5c', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{docCrumb}</div>
        <div style={{ flex: 1 }} />
        <button onClick={onStar} title="star" style={{ ...btnReset, width: 24, height: 24, borderRadius: 5, display: 'grid', placeItems: 'center', fontSize: 12, lineHeight: 1, color: docStarFg, background: '#141414', flex: 'none' }}>★</button>
        <button onClick={onAlways} title="loads in every session — like a claude.md" style={{ ...btnReset, height: 24, padding: '0 9px', borderRadius: 5, display: 'grid', placeItems: 'center', fontFamily: mono, fontSize: 8.5, color: docAlwaysFg, background: '#141414', border: '1px solid ' + docAlwaysRing, flex: 'none' }}>always</button>
        {docPromoteShow && (
          <button onClick={onPromote} style={{ ...btnReset, height: 24, padding: '0 9px', borderRadius: 5, display: 'grid', placeItems: 'center', fontFamily: mono, fontSize: 8.5, color: docPromoteFg, background: '#141414', flex: 'none' }}>{docPromoteLabel}</button>
        )}
        <button onClick={onToggleScope} style={{ ...btnReset, height: 24, padding: '0 10px', borderRadius: 5, display: 'grid', placeItems: 'center', fontFamily: mono, fontSize: 8.5, background: inScope ? O : '#171717', color: inScope ? '#0a0a0a' : '#c8c8c8', flex: 'none' }}>{inScope ? 'remove from scope' : 'add to scope'}</button>
        <button onClick={onClose} aria-label="close doc" style={{ ...btnReset, width: 24, height: 24, borderRadius: 5, background: '#141414', display: 'grid', placeItems: 'center', color: '#8a8a8a', flex: 'none' }}>
          <svg width="9" height="9" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2"><path d="M1.5 1.5 10.5 10.5M10.5 1.5 1.5 10.5" /></svg>
        </button>
      </div>
      <div className="ark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 26px 30px 26px' }}>
        <div style={{ maxWidth: 640 }}>
          <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-.02em', lineHeight: 1.2 }}>{docTitle}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10, paddingBottom: 14, borderBottom: '1px solid #171717' }}>
            {docFields.map((f) => (
              <div key={f.k} style={{ display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
                <div style={{ fontFamily: mono, fontSize: 8.5, color: '#4a4a4a' }}>{f.k}</div>
                <div style={{ fontFamily: mono, fontSize: 9.5, color: f.color }}>{f.v}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            {doc.content !== undefined ? <pre style={{fontFamily:mono,fontSize:12,lineHeight:1.7,whiteSpace:'pre-wrap',overflowWrap:'anywhere',color:'#d8d8d4'}}>{doc.content}</pre> : docBody({ path, tier: doc.tier }).map((b, i) => {
              if (b.t === 'link') {
                const target = docs.find((n) => n.path === b.v);
                return (
                  <button key={i} onClick={() => { if (target) onOpenDoc(target); }} style={{ ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 6, margin: '4px 8px 4px 0', padding: '4px 10px', borderRadius: 5, background: '#161310', border: '1px solid #2a1a12' }}>
                    <div style={{ fontFamily: mono, fontSize: 9, color: '#c8b4a6' }}>⧉</div>
                    <div style={{ fontFamily: mono, fontSize: 9.5, color: O }}>{b.v}</div>
                  </button>
                );
              }
              const m = M[b.t] || M.p;
              return <div key={i} style={{ ...m, textWrap: 'pretty' }}>{b.t === 'li' ? '·  ' + b.v : b.v}</div>;
            })}
          </div>
          <div style={{ marginTop: 26, borderRadius: 11, background: '#0a0a0a', border: '1px solid #171717', overflow: 'hidden' }}>
            <div style={{ padding: '9px 14px', borderBottom: '1px solid #151515', fontFamily: mono, fontSize: 8.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5c5c5c' }}>linked mentions · {docBackCount}</div>
            {docBacklinks.map((l) => (
              <button key={l.path} onClick={() => onOpenDoc(l.doc)} style={{ ...btnReset, width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 14px', borderBottom: '1px solid #131313' }}>
                <div style={{ width: 4, height: 4, borderRadius: 999, background: l.dot, flex: 'none' }} />
                <div style={{ fontFamily: mono, fontSize: 10, color: '#c8c8c8', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.path}</div>
                <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 8.5, color: '#4a4a4a', flex: 'none' }}>{l.meta}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
