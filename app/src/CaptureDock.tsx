import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { LocalVaultPanel } from './LocalVaultPanel';
import { makeOriginal, saveOriginals } from './localVault';
import { useLocalScope } from './LocalScopeProvider';
import { DRAFT_KEYS, EMPTY_CAPTURE_DRAFT, validateCaptureDraft } from './draftStorage';
import { useLocalDraft } from './useLocalDraft';

// port target: design/arkive-v2.html [data-screen-label='capture'] — mode seg, phone-mock recorder,
// done banner, note/task/files forms, footer disclaimer. recorder + transcript are local state
// (prototype's simulated recorder — real mic/tauri is a later phase). derived things land as
// proposals via ops.proposalsAdd, never as documents (HANDOFF §5.7/§5.8, journey A).

const O = '#ff5a1f';
const mono = "'IBM Plex Mono', monospace";

type Rec = 'idle' | 'perm' | 'recording' | 'paused' | 'processing' | 'transcribing' | 'ready' | 'failed';
type CapMode = 'voice' | 'note' | 'task' | 'files';
type CapRoute = 'inbox' | 'project' | 'journal';

const fmtT = (t: number) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');

// prototype Component.TRS — the freshly recorded (simulated) transcript segments
const TRS: [string, string, string, boolean][] = [
  ['00:04', 'you', 'aerochrome for the jrny billboard — shoot the park on infrared film, the red is the whole layout.', false],
  ['00:19', 'you', 'keep type minimal, canon voice, no exclamation marks.', false],
  ['00:31', 'you', 'someone has to call the print vendor about uv-stable inks before friday.', true],
  ['00:44', 'you', 'budget: keep it inside the usual weekly number.', false]
];

// prototype Component.RO — the published example recording's transcript
const RO: [string, string, string, boolean][] = [
  ['00:12', 'you', 'ok — aerochrome launch, thinking out loud.', false],
  ['00:41', 'you', 'infrared film turns the park red — that is the whole billboard. no product shot. let the color do it.', false],
  ['02:08', 'you', 'the second board can show the camera. first one is pure landscape.', true],
  ['03:22', 'you', 'i need to walk nezu through the moodboard before friday or the print window slips.', false],
  ['04:10', 'nezu', 'what about the press kit — same visual?', false],
  ['04:28', 'you', 'packaging idea: ship the press kit in a film-canister mailer. the object is the ad.', true]
];

// prototype Component.ROD — derived items of the example recording
const ROD: [string, string, string][] = [
  ['note', 'campaign concept — red park', '00:41'],
  ['idea', 'film-canister press mailer', '04:28'],
  ['task', 'brief nezu on the moodboard by friday', '03:22'],
  ['person', 'nezu — collaborator', '03:22'],
  ['project', 'link → aerochrome-launch', '00:12'],
  ['date', 'launch window — late october (hedged)', '04:10'],
  ['memory', 'prefers ir film in autumn light', '04:28']
];

const RO_TOPICS = ['aerochrome', 'billboard', 'packaging', 'print window', 'autumn light'];
const REC_PROP_CHIPS = ['note → curated/aerochrome-billboard.md · from 00:04', 'task → vendor-inks · from 00:31', 'memory (consent) → operator-prefs · from 00:44', 'person: nezu · 1 mention'];
const PHASE_LABEL: Record<Rec, string> = {
  idle: 'recorder demo · no microphone', perm: 'simulating permission…', recording: 'recording simulation', paused: 'demo paused · no audio captured',
  processing: 'simulating save', transcribing: 'transcribing (simulated)', ready: 'demo ready — review on the right', failed: 'simulated failure · no audio captured'
};

export function CaptureDock({ onClose, onGoInbox }: { onClose: () => void; onGoInbox: () => void }) {
  const { session } = useLocalScope();
  const [savedDraft, setSavedDraft, draftWarning] = useLocalDraft(DRAFT_KEYS.capture, validateCaptureDraft);
  const captureDraft = savedDraft ?? EMPTY_CAPTURE_DRAFT;
  const capMode = captureDraft.mode;
  const capVal = captureDraft[capMode === 'task' ? 'task' : 'note'];
  const setCapVal = (value: string) => setSavedDraft(previous => ({ ...(previous ?? EMPTY_CAPTURE_DRAFT), [capMode === 'task' ? 'task' : 'note']: value }));
  const capTitle = captureDraft.title;
  const setCapTitle = (title: string) => setSavedDraft(previous => ({ ...(previous ?? EMPTY_CAPTURE_DRAFT), title }));
  const capRoute = captureDraft.route;
  const setCapRoute = (route: CapRoute) => setSavedDraft(previous => ({ ...(previous ?? EMPTY_CAPTURE_DRAFT), route }));
  const [rec, setRec] = useState<Rec>('idle');
  const [recT, setRecT] = useState(0);
  const [recMarks, setRecMarks] = useState(0);
  const [recTv, setRecTv] = useState(1);
  const [capDone, setCapDone] = useState<string | null>(null);
  const [capError, setCapError] = useState('');
  const [capBusy, setCapBusy] = useState(false);
  const [roSeg, setRoSeg] = useState('00:41');
  const [roVer, setRoVer] = useState<'v1' | 'v2'>('v2');
  const [roCorr, setRoCorr] = useState(2);
  const proposalsAdd = useMutation(api.ops.proposalsAdd);

  const rt = useRef<number | undefined>(undefined); // recording tick
  const rp = useRef<number | undefined>(undefined); // perm delay
  const r1 = useRef<number | undefined>(undefined); // processing → transcribing
  const r2 = useRef<number | undefined>(undefined); // transcribing → ready
  useEffect(() => () => { clearInterval(rt.current); clearTimeout(rp.current); clearTimeout(r1.current); clearTimeout(r2.current); }, []);

  const tick = () => { clearInterval(rt.current); rt.current = window.setInterval(() => setRecT((t) => t + 1), 1000); };
  const recStart = () => {
    setRec('perm');
    clearTimeout(rp.current);
    rp.current = window.setTimeout(() => { setRec('recording'); setRecT(0); setRecMarks(0); tick(); }, 700);
  };
  const recMark = () => setRecMarks((m) => m + 1);
  const recPR = () => {
    if (rec === 'recording') { clearInterval(rt.current); setRec('paused'); }
    else { tick(); setRec('recording'); }
  };
  const recStop = () => {
    clearInterval(rt.current);
    setRec('processing');
    clearTimeout(r1.current);
    r1.current = window.setTimeout(() => setRec((r) => (r === 'processing' ? 'transcribing' : r)), 900);
    clearTimeout(r2.current);
    r2.current = window.setTimeout(() => setRec((r) => (r === 'transcribing' ? 'ready' : r)), 2200);
  };
  // transcription failure ≠ loss — audio intact, only the transcript state fails (HANDOFF §5.8)
  const recFail = () => { clearTimeout(r1.current); clearTimeout(r2.current); setRec('failed'); };
  const recRetry = () => { setRec('transcribing'); clearTimeout(r2.current); r2.current = window.setTimeout(() => setRec('ready'), 1400); };
  const recFix = () => setRecTv((v) => v + 1);
  const recReset = () => { clearInterval(rt.current); setRec('idle'); setRecT(0); setRecMarks(0); setRecTv(1); };
  const recPublish = async () => {
    if (capBusy) return;
    setCapBusy(true); setCapError('');
    try { await proposalsAdd({
      items: [
        { kind: 'note', conf: 0.9, sourceRef: 'from rec:today · 00:04', brief: 'aerochrome billboard: shoot the park on infrared, the red carries the layout — reads like a durable concept.', quote: '“shoot the park on infrared film, the red is the whole layout.”', diff: ['creates curated/aerochrome-billboard.md', 'tier curated', 'source: rec:today (preserved)'], targetPath: 'curated/aerochrome-billboard.md', targetTier: 'curated' },
        { kind: 'task', conf: 0.86, sourceRef: 'from rec:today · 00:31', brief: 'call the print vendor about uv-stable inks before friday — extracted as a task.', quote: '“someone has to call the print vendor about uv-stable inks before friday.”', diff: ['creates inbox/tasks/vendor-inks.md', 'tier inbox', 'assignable'], targetPath: 'inbox/tasks/vendor-inks.md', targetTier: 'inbox' },
        { kind: 'memory', conf: 0.7, sourceRef: 'from rec:today · 00:44 · recurring', brief: 'budgets phrased per-week, never per-month — proposed memory. explicit consent required.', diff: ['appends canon/ops/operator-prefs.md', 'consent required'], targetPath: 'canon/ops/operator-prefs.md', targetTier: 'canon', consent: true }
      ]
    });
    setRec('idle'); setRecT(0); setRecTv(1);
    onGoInbox();
    } catch (error) { setCapError(error instanceof Error ? error.message : 'Demo publish failed. Retry when connected.'); }
    finally { setCapBusy(false); }
  };
  const capModeSet = (mode: CapMode) => { setSavedDraft(previous => ({ ...(previous ?? EMPTY_CAPTURE_DRAFT), mode })); setCapDone(null); setCapError(''); };
  // capture never blocks on routing — default destination is inbox tier (HANDOFF §5.7)
  const capSubmit = async () => {
    const t = capVal;
    if (!t.trim() || capBusy) return;
    const kind = capMode === 'task' ? 'task' : 'note';
    const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24).replace(/^-+|-+$/g, '') || 'capture';
    setCapBusy(true); setCapError(''); setCapDone(null);
    try {
      const original = await makeOriginal(slug + '.md', t, kind);
      await saveOriginals([original], session);
      // An old save must not clear a newer draft, another mode or another mounted view.
      setSavedDraft(previous => previous && previous[kind] === t ? { ...previous, [kind]: '' } : previous);
      setCapDone(kind + ' saved locally · checksum verified · Brain registration is a separate next step');
    } catch (error) { setCapError(error instanceof Error ? error.message : 'Capture failed. Your draft is unchanged.'); }
    finally { setCapBusy(false); }
  };
  const capMic = () => {
    if (rec === 'idle') recStart();
    else if (rec === 'recording') recStop();
    else if (rec === 'paused') recPR();
    else if (rec === 'failed') recRetry();
    else if (rec === 'ready') recReset();
  };
  const roCorrect = (t: string) => { setRoCorr((c) => c + 1); setRoVer('v2'); setRoSeg(t); };
  const roFind = () => setRoSeg('04:28');

  const capIsVoice = capMode === 'voice';
  const capIsText = capMode === 'note' || capMode === 'task';
  const capIsFiles = capMode === 'files';
  const capPlaceholder = capMode === 'task' ? 'the task, as you\'d say it — “call the vendor about uv-stable inks”' : 'the thought, verbatim — routing is optional, the inbox is the default';
  const recIsLive = rec === 'recording' || rec === 'paused';
  const recIsProc = rec === 'processing' || rec === 'transcribing';
  const recTimer = fmtT(recT);
  const recMarksLabel = recMarks + ' markers';
  const recBars = Array.from({ length: 36 }, (_, i) => ({
    h: (8 + Math.abs(Math.sin(i * 1.7) * 26) + (i % 5) * 3).toFixed(0) + 'px',
    color: rec === 'paused' ? '#2a2a2a' : (i < (recT * 3) % 37 ? O : '#2a2a2a')
  }));
  const capMicBg = rec === 'recording' ? '#f0f0f0' : O;
  const capMicGlyph = rec === 'recording' ? '■' : (rec === 'paused' ? '▶' : (rec === 'ready' ? '↺' : '●'));
  const recPhaseFg = rec === 'recording' ? O : (rec === 'failed' ? '#cf4a3a' : '#5c5c5c');
  const roNewTitle = (capTitle || 'untitled recording') + ' · → ' + capRoute;
  const roNewHash = 'f' + (recT * 7919 % 0xfffff).toString(16).padStart(5, '0');
  const segIdx = RO.findIndex((x) => x[0] === roSeg);
  const frac = (segIdx + 1) / (RO.length + 1);
  const roPlayBars = Array.from({ length: 48 }, (_, i) => ({
    h: (5 + Math.abs(Math.sin(i * 2.3) * 20) + (i % 4) * 2).toFixed(0) + 'px',
    color: i / 48 < frac ? O : '#2a2a2a'
  }));
  const roVerChips: { id: 'v1' | 'v2'; label: string }[] = [
    { id: 'v1', label: 'v1 · auto' },
    { id: 'v2', label: 'v2 · corrected (' + roCorr + ') · current' }
  ];
  const procLine = rec === 'processing' ? 'simulating local save · no audio captured' : 'transcribing · then deriving proposals… (simulated)';
  const trsRows = TRS.map(([t, who, txt, low]) => ({ t, who, txt: txt + (low && recTv === 1 ? '  [low-conf: “uv-stable”]' : ''), fg: low && recTv === 1 ? O : '#c8c8c8' }));
  const routeChips: { id: CapRoute; label: string }[] = [
    { id: 'inbox', label: 'inbox (default)' }, { id: 'project', label: 'project:aerochrome-launch' }, { id: 'journal', label: 'journal' }
  ];

  return (
    <div data-screen-label="capture" className="ark-scroll" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 8, background: '#080808', padding: '0 18px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', animation: 'arkFade .16s ease-out' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 2, padding: 4, borderRadius: 9, background: '#141414' }}>
          {(['voice', 'note', 'task', 'files'] as CapMode[]).map((m) => (
            <button key={m} onClick={() => capModeSet(m)} role="tab" style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: capMode === m ? '#2a2a2a' : 'transparent', color: capMode === m ? '#f6f6f6' : '#7a7a7a' }}>{m === 'voice' ? '● voice' : m}</button>
          ))}
        </div>
        <div style={{ fontFamily: mono, fontSize: 9.5, color: '#737373', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>local originals · cloud registration pending · voice demo</div>
        <button onClick={onClose} title="back to chat · esc" style={{ width: 30, height: 30, borderRadius: 8, background: '#141414', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#8a8a8a', flex: 'none' }}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M1.5 1.5 10.5 10.5M10.5 1.5 1.5 10.5" /></svg>
        </button>
      </div>

      {!!capDone && (
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 11, background: '#12100e', border: '1px solid #2a1a12', animation: 'arkRise .14s ease-out' }}>
          <div style={{ width: 5, height: 5, borderRadius: 999, background: '#3a7a4a' }} />
          <div style={{ fontFamily: mono, fontSize: 10.5, color: '#c8c8c8', flex: 1 }}>{capDone}</div>
          <button onClick={() => capModeSet('files')} style={{ padding: '6px 12px', borderRadius: 6, background: O, border: 'none', fontFamily: mono, fontSize: 10, color: '#0a0a0a', cursor: 'pointer' }}>view originals</button>
        </div>
      )}
      {capError && <div role="alert" style={{fontSize:12,color:'#e29075'}}>{capError}</div>}
      {draftWarning && <div role="alert" style={{ fontSize: 12, color: '#e29075' }}>{draftWarning}</div>}

      <div style={{ flex: 'none', borderRadius: 14, background: '#0d0d0d', border: '1px solid #191919', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {capIsVoice && (
          <div style={{ flex: 'none', minHeight: 520, display: 'flex', flexWrap: 'wrap', gap: 14, padding: 14 }}>
            <div style={{ flex: '1 1 280px', maxWidth: 340, minWidth: 280, minHeight: 500, borderRadius: 22, background: '#0a0a0a', border: '1px solid #1c1c1c', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '12px 18px 4px 18px' }}>
                <div style={{ fontFamily: mono, fontSize: 10, color: '#c8c8c8' }}>9:41</div>
                <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 9, color: '#5c5c5c' }}>▮▮▮ ▲</div>
              </div>
              <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px 0 18px' }}>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: '#5c5c5c' }}>arkive · capture</div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 4, height: 4, borderRadius: 999, background: O }} />
                  <div style={{ fontFamily: mono, fontSize: 8.5, color: '#8a8a8a' }}>demo</div>
                </div>
              </div>
              <div style={{ flex: 'none', padding: '12px 16px 0 16px' }}>
                <input value={capTitle} onChange={(e) => setCapTitle(e.target.value)} placeholder="title (optional)" style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 9, background: '#111', border: '1px solid #232323', color: '#e8e8e8', fontFamily: mono, fontSize: 10.5, outline: 'none' }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {routeChips.map((c) => (
                    <button key={c.id} onClick={() => setCapRoute(c.id)} style={{ padding: '4px 10px', borderRadius: 5, background: capRoute === c.id ? '#161310' : '#111', border: '1px solid ' + (capRoute === c.id ? '#2a1a12' : '#1c1c1c'), fontFamily: mono, fontSize: 9, color: capRoute === c.id ? O : '#5c5c5c', cursor: 'pointer', whiteSpace: 'nowrap' }}>{c.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 16px', gap: 10 }}>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: recPhaseFg }}>{PHASE_LABEL[rec]}</div>
                <div style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', color: '#f0f0f0' }}>{recTimer}</div>
                {recIsLive && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 34, width: '100%' }}>
                      {recBars.map((b, i) => <div key={i} style={{ flex: 1, height: b.h, background: b.color, borderRadius: 1 }} />)}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={recMark} style={{ padding: '6px 12px', borderRadius: 6, background: '#171717', border: 'none', fontFamily: mono, fontSize: 9.5, color: '#c8c8c8', cursor: 'pointer' }}>◇ marker</button>
                      <button onClick={recPR} style={{ padding: '6px 12px', borderRadius: 6, background: '#171717', border: 'none', fontFamily: mono, fontSize: 9.5, color: '#c8c8c8', cursor: 'pointer' }}>{rec === 'paused' ? 'resume' : 'pause'}</button>
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 8.5, color: '#5c5c5c' }}>{recMarksLabel}</div>
                  </>
                )}
                {recIsProc && (
                  <>
                    <div style={{ fontFamily: mono, fontSize: 9.5, color: '#c8c8c8', textAlign: 'center' }}>{procLine}</div>
                    <button onClick={recFail} style={{ fontFamily: mono, fontSize: 8.5, color: '#4a4a4a', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}>simulate a transcription failure</button>
                  </>
                )}
                {rec === 'failed' && (
                  <>
                    <div style={{ fontFamily: mono, fontSize: 9.5, color: '#cf4a3a', textAlign: 'center' }}>simulated transcription failure — no audio recorded</div>
                    <button onClick={recRetry} style={{ padding: '6px 12px', borderRadius: 6, background: '#171717', border: 'none', fontFamily: mono, fontSize: 9.5, color: O, cursor: 'pointer' }}>retry transcription</button>
                  </>
                )}
                <div style={{ fontFamily: mono, fontSize: 8.5, color: '#737373', textAlign: 'center', lineHeight: 1.7 }}>·····································<br />recorder interaction demo · no microphone, audio file or recovery checkpoint</div>
              </div>
              <div style={{ flex: 'none', display: 'grid', placeItems: 'center', padding: '6px 16px 14px 16px' }}>
                <button onClick={capMic} aria-label="record" style={{ width: 72, height: 72, borderRadius: 999, background: capMicBg, border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 0 0 8px rgba(255,90,31,.07)' }}>
                  <div style={{ fontSize: 22, color: '#0a0a0a' }}>{capMicGlyph}</div>
                </button>
                <div style={{ fontFamily: mono, fontSize: 8, color: '#4a4a4a', marginTop: 10, textAlign: 'center', lineHeight: 1.6 }}>one thumb does everything · recording continues through lock + interruptions where the platform allows</div>
              </div>
            </div>
            <div style={{ flex: '1 1 320px', minWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rec === 'ready' && (
                <div style={{ borderRadius: 12, background: '#111', border: '1px solid #2a1a12', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ padding: '2px 8px', borderRadius: 4, background: O, fontFamily: mono, fontSize: 8.5, color: '#0a0a0a', textTransform: 'uppercase', letterSpacing: '.1em' }}>new · unpublished</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: '#f0f0f0' }}>{roNewTitle}</div>
                    <button onClick={recFix} style={{ marginLeft: 'auto', padding: '5px 11px', borderRadius: 6, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 9, color: '#c8c8c8', cursor: 'pointer', whiteSpace: 'nowrap' }}>correct → v{recTv + 1}</button>
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: '#5c5c5c' }}>audio demo · {recTimer} · demo-id:{roNewHash} · {recMarksLabel} · fixture transcript v{recTv}</div>
                  <div style={{ borderRadius: 9, background: '#0a0a0a', border: '1px solid #171717', overflow: 'hidden' }}>
                    {trsRows.map((r) => (
                      <div key={r.t} style={{ display: 'flex', gap: 12, padding: '9px 13px', borderBottom: '1px solid #131313' }}>
                        <div style={{ fontFamily: mono, fontSize: 9, color: O, width: 36, flex: 'none' }}>{r.t}</div>
                        <div style={{ fontFamily: mono, fontSize: 8.5, color: '#5c5c5c', width: 30, flex: 'none' }}>{r.who}</div>
                        <div style={{ fontFamily: mono, fontSize: 10, color: r.fg, lineHeight: 1.6, flex: 1 }}>{r.txt}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {REC_PROP_CHIPS.map((p) => (
                      <div key={p} style={{ padding: '4px 9px', borderRadius: 5, background: '#161310', border: '1px solid #2a1a12', fontFamily: mono, fontSize: 9, color: '#c8b4a6' }}>{p}</div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={recReset} style={{ padding: '8px 14px', borderRadius: 7, background: '#171717', border: 'none', fontFamily: mono, fontSize: 9.5, color: '#c8c8c8', cursor: 'pointer' }}>discard derivations</button>
                    <button disabled={capBusy} onClick={() => void recPublish()} style={{ padding: '8px 16px', borderRadius: 7, background: O, border: 'none', fontFamily: mono, fontSize: 9.5, color: '#0a0a0a', cursor: 'pointer' }}>{capBusy ? 'sending…' : 'send demo proposals → brain inbox'}</button>
                  </div>
                </div>
              )}
              <div style={{ borderRadius: 12, background: '#111', border: '1px solid #1c1c1c', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ padding: '2px 8px', borderRadius: 4, background: '#161310', border: '1px solid #2a1a12', fontFamily: mono, fontSize: 8.5, color: O, textTransform: 'uppercase', letterSpacing: '.1em' }}>recording · fixture example</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: '#f0f0f0' }}>aerochrome launch idea</div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                    <div style={{ padding: '3px 9px', borderRadius: 5, background: '#1c1c1c', fontFamily: mono, fontSize: 8.5, color: '#8a8a8a' }}>private · only you</div>
                    <div style={{ padding: '3px 9px', borderRadius: 5, background: '#1c1c1c', fontFamily: mono, fontSize: 8.5, color: '#8a8a8a' }}>not in any share</div>
                  </div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 9, color: '#737373', marginTop: 8, lineHeight: 1.8 }}>fixture audio metadata · 08:12 · 2.1 mb · 2 markers · no playable original<br />illustrated history: audio → transcript → corrections → extraction · not a live audit trail</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 12 }}>
                  <button onClick={roFind} aria-label="play" style={{ width: 34, height: 34, borderRadius: 999, background: O, border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}>
                    <div style={{ width: 0, height: 0, borderLeft: '10px solid #0a0a0a', borderTop: '6px solid transparent', borderBottom: '6px solid transparent', marginLeft: 2 }} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 30 }}>
                    {roPlayBars.map((b, i) => <div key={i} style={{ flex: 1, height: b.h, background: b.color, borderRadius: 1 }} />)}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: '#8a8a8a', flex: 'none' }}>{roSeg} / 08:12</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#0d0d0d', border: '1px solid #1c1c1c' }}>
                  <div style={{ fontFamily: mono, fontSize: 9.5, color: '#8a8a8a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>› play the part where i talked about packaging</div>
                  <button onClick={roFind} style={{ padding: '5px 11px', borderRadius: 5, background: '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 9, color: '#c8c8c8', cursor: 'pointer', whiteSpace: 'nowrap' }}>find + play</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, alignItems: 'start' }}>
                <div style={{ borderRadius: 12, background: '#111', border: '1px solid #1c1c1c', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderBottom: '1px solid #191919' }}>
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5c5c5c' }}>transcript · derived</div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                      {roVerChips.map((v) => (
                        <button key={v.id} onClick={() => setRoVer(v.id)} role="tab" style={{ padding: '3px 9px', borderRadius: 5, background: roVer === v.id ? '#231610' : '#1c1c1c', border: 'none', fontFamily: mono, fontSize: 8.5, color: roVer === v.id ? O : '#8a8a8a', cursor: 'pointer', whiteSpace: 'nowrap' }}>{v.label}</button>
                      ))}
                    </div>
                  </div>
                  {RO.map(([t, who, txt, low]) => {
                    const on = roSeg === t;
                    return (
                      <div key={t} onClick={() => setRoSeg(t)} tabIndex={0} role="button" style={{ display: 'flex', gap: 11, padding: '10px 14px', borderBottom: '1px solid #151515', cursor: 'pointer', background: on ? '#161310' : 'transparent', borderLeft: '2px solid ' + (on ? O : 'transparent') }}>
                        <div style={{ flex: 'none', width: 36 }}>
                          <div style={{ fontFamily: mono, fontSize: 9, color: on ? O : '#5c5c5c' }}>{t}</div>
                          <div style={{ fontFamily: mono, fontSize: 8.5, color: '#4a4a4a', marginTop: 2 }}>{who}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: low && roVer === 'v1' ? '#d9a13a' : '#c8c8c8', lineHeight: 1.55, textWrap: 'pretty' }}>{txt + (low && roVer === 'v1' ? '  [low-conf]' : '')}</div>
                          <button onClick={(e) => { e.stopPropagation(); roCorrect(t); }} style={{ display: 'inline-block', fontFamily: mono, fontSize: 8.5, color: '#4a4a4a', marginTop: 4, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}>correct</button>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ padding: '9px 14px', fontFamily: mono, fontSize: 8.5, color: '#4a4a4a', lineHeight: 1.7 }}>dotted amber = low-confidence word · click a segment to seek audio · speakers confirmed by you, never inferred as fact</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                  <div style={{ borderRadius: 12, background: '#111', border: '1px solid #1c1c1c', padding: '13px 15px' }}>
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5c5c5c' }}>summary</div>
                    <div style={{ fontSize: 12.5, color: '#c8c8c8', lineHeight: 1.6, marginTop: 8, textWrap: 'pretty' }}>one billboard, no product shot — let aerochrome's red carry it. brief nezu before friday; print window at risk. packaging idea: film-canister mailer for press. hedged on a late-october launch.</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                      {RO_TOPICS.map((t) => (
                        <div key={t} style={{ padding: '3px 8px', borderRadius: 4, background: '#1c1c1c', fontFamily: mono, fontSize: 8.5, color: '#8a8a8a' }}>{t}</div>
                      ))}
                    </div>
                  </div>
                  <div style={{ borderRadius: 12, background: '#111', border: '1px solid #1c1c1c', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderBottom: '1px solid #191919' }}>
                      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5c5c5c' }}>derived · click to trace</div>
                      <button onClick={onGoInbox} style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 8.5, color: '#c8b4a6', cursor: 'pointer', whiteSpace: 'nowrap', background: 'transparent', border: 'none', padding: 0 }}>→ inbox for review</button>
                    </div>
                    {ROD.map(([tag, title, t], i) => {
                      const on = roSeg === t;
                      return (
                        <button key={i} onClick={() => setRoSeg(t)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 14px', width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', background: on ? '#161310' : 'transparent', border: 'none', borderBottom: '1px solid #151515', borderLeft: '2px solid ' + (on ? O : 'transparent') }}>
                          <div style={{ padding: '2px 6px', borderRadius: 3, background: tag === 'task' || tag === 'memory' ? '#2a1a12' : '#1c1c1c', fontFamily: mono, fontSize: 7.5, color: tag === 'task' || tag === 'memory' ? O : '#8a8a8a', textTransform: 'uppercase', letterSpacing: '.08em', flex: 'none' }}>{tag}</div>
                          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#c8c8c8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                          <div style={{ fontFamily: mono, fontSize: 8.5, color: on ? O : '#5c5c5c', flex: 'none' }}>{t}</div>
                        </button>
                      );
                    })}
                    <div style={{ padding: '9px 14px', fontFamily: mono, fontSize: 8.5, color: '#4a4a4a', lineHeight: 1.7 }}>selecting a derived item highlights its passage and seeks the audio to the exact moment.</div>
                  </div>
                  <div style={{ borderRadius: 12, background: '#111', border: '1px solid #1c1c1c', padding: '13px 15px' }}>
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5c5c5c' }}>related</div>
                    <div style={{ fontFamily: mono, fontSize: 9.5, color: '#8a8a8a', lineHeight: 1.9, marginTop: 8 }}>projects/aerochrome-launch · person:nezu · canvas:aerochrome-moodboard · curated/campaign-notes.md</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {capIsText && (
          <div style={{ flex: 1, minHeight: 0, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <textarea aria-label="capture text" value={capVal} onChange={(e) => setCapVal(e.target.value)} placeholder={capPlaceholder} rows={6} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 9, background: '#0a0a0a', border: '1px solid #232323', color: '#e8e8e8', fontFamily: mono, fontSize: 12, outline: 'none', resize:'vertical' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button disabled={capBusy || !capVal.trim()} onClick={() => void capSubmit()} style={{ padding: '9px 18px', borderRadius: 7, background: capVal.trim() ? O : '#3a3a3a', border: 'none', fontFamily: mono, fontSize: 10.5, color: '#0a0a0a', cursor: 'pointer' }}>{capBusy ? 'saving…' : 'capture ' + capMode}</button>
              <button disabled={!capVal || capBusy} onClick={() => { if (window.confirm('Discard this unsaved ' + capMode + ' draft? Saved originals are not affected.')) setCapVal(''); }} style={{ padding: '9px 12px', borderRadius: 7, background: '#202020', border: 'none', fontFamily: mono, fontSize: 10, color: '#aaa', cursor: 'pointer' }}>discard draft</button>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: '#737373' }}>{draftWarning ? 'draft kept in this tab only · copy before reloading' : 'draft autosaved on this device · unencrypted · no cloud upload'}</div>
            </div>
          </div>
        )}
        {capIsFiles && (
          <div style={{ flex: 1, minHeight: 0, padding: 22 }}>
            <LocalVaultPanel />
          </div>
        )}
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', borderTop: '1px solid #171717' }}>
          <div style={{ width: 9, height: 9, borderRadius: 2, border: '1px dashed #4a4a4a', flex: 'none' }} />
          <div style={{ fontFamily: mono, fontSize: 9, color: '#737373' }}>notes, tasks and text-file originals are real local storage · microphone/transcription are simulated · nothing is signed or synced</div>
        </div>
      </div>
    </div>
  );
}
