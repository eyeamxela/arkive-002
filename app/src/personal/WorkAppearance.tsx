import { createContext, useContext, useRef, useState } from 'react';
import type { PersonalWorkspace } from './api';
import type { WorkspacePanelsProps } from './WorkspacePanels';
import { APPEARANCE_PRESETS, DEFAULT_APPEARANCE, WORK_PALETTE, presetAppearance, workMaterial, type WorkAppearanceSettings } from './workAppearanceModel.mjs';
import './WorkAppearance.css';

export const WorkAppearanceContext = createContext<WorkAppearanceSettings | null>(null);
export function useWorkMaterial() {
  const settings = useContext(WorkAppearanceContext);
  return (color: string) => workMaterial(color, settings);
}
type Props = { saved: PersonalWorkspace['appearance']; busy: boolean; run: WorkspacePanelsProps['act']; onPreview: (settings: WorkAppearanceSettings | null) => void; onClose: () => void };
export function WorkAppearanceEditor({ saved, busy, run, onPreview, onClose }: Props) {
  const [draft, setDraft] = useState<WorkAppearanceSettings | null>(() => saved?.settings ?? null);
  const [base] = useState(saved?.updatedAt ?? null);
  const [preset, setPreset] = useState('Custom');
  const lock = useRef(false);
  const values = draft ?? DEFAULT_APPEARANCE;
  const change = (next: WorkAppearanceSettings | null) => { setDraft(next); onPreview(next); };
  const patch = (next: Partial<WorkAppearanceSettings>) => { setPreset('Custom'); change({ ...values, ...next }); };
  const save = async () => {
    if (lock.current) return; lock.current = true;
    try { if (await run('Saving workspace appearance', client => client.request('/v1/workspace/appearance', 'POST', { settings: draft, expectedUpdatedAt: base }), 'Workspace appearance saved in your encrypted Brain.')) onClose(); }
    finally { lock.current = false; }
  };
  return <section className="pn-appearance" aria-label="Workspace appearance">
    <header><div><p className="fc-eyebrow">YOUR WORKSPACE / YOUR MATERIALS</p><h2>Make it feel like you.</h2><p>Live preview · Planner, Templates, Stacked, Board and List. Save to keep your palette.</p></div><button disabled={busy} onClick={onClose} aria-label="Cancel appearance preview">✕</button></header>
    <fieldset disabled={busy}>
      <legend className="pn-sr">Workspace appearance controls</legend>
      <div className="pn-appearance-presets" aria-label="Neutral palettes">{APPEARANCE_PRESETS.map(p => <button key={p.name} aria-pressed={preset === p.name} onClick={() => { setPreset(p.name); change(presetAppearance(p.name)); }}><span aria-hidden="true">{p.palette.slice(0, 5).map((color, i) => <i key={i} style={{ background: color }} />)}</span>{p.name}</button>)}</div>
      <div className="pn-appearance-columns">
        <section><h3>Folder palette</h3><p>Seven standard slots. Each folder still has its own color picker; non-palette colors stay unchanged.</p><div className="pn-appearance-swatches">{values.palette.map((color, i) => <label key={i}><input type="color" aria-label={`Folder palette ${i + 1}`} value={color} onChange={e => patch({ palette: values.palette.map((c, j) => j === i ? e.target.value : c) })} /><span>{WORK_PALETTE[i].name}</span></label>)}</div>
        <h3>Surfaces</h3><div className="pn-appearance-colors">{(['button', 'box'] as const).map(key => <label key={key}>{key === 'button' ? 'Buttons' : 'Boxes & inputs'}<input type="color" value={values[key]} onChange={e => patch({ [key]: e.target.value })} /></label>)}</div>
        <label className="pn-appearance-range">Corner softness <output>{values.roundness}px</output><input type="range" min="0" max="24" value={values.roundness} onChange={e => patch({ roundness: Number(e.target.value) })} /></label></section>
        <section><h3>Paper & texture</h3><label>Paper pattern<select aria-label="Paper pattern" value={values.pattern} onChange={e => patch({ pattern: e.target.value as WorkAppearanceSettings['pattern'] })}>{['grid', 'dots', 'diamonds', 'lines', 'plain'].map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></label>
          <label>Pattern color<input type="color" value={values.patternColor} onChange={e => patch({ patternColor: e.target.value })} /></label>
          <label className="pn-appearance-range">Pattern scale <output>{values.patternSize}px</output><input type="range" min="16" max="64" value={values.patternSize} onChange={e => patch({ patternSize: Number(e.target.value) })} /></label>
          <label className="pn-appearance-range">Pattern intensity <output>{values.patternOpacity}%</output><input type="range" min="0" max="18" value={values.patternOpacity} onChange={e => patch({ patternOpacity: Number(e.target.value) })} /></label>
        </section>
        <section><h3>Color flow</h3><label>Gradient<select aria-label="Gradient" value={values.gradient} onChange={e => patch({ gradient: e.target.value as WorkAppearanceSettings['gradient'] })}><option value="none">Solid paper</option><option value="linear">Soft sweep</option><option value="radial">Organic glow</option></select></label>
          <label>Gradient tint<input type="color" value={values.gradientColor} onChange={e => patch({ gradientColor: e.target.value })} /></label>
          <label className="pn-appearance-range">Flow intensity <output>{values.gradientStrength}%</output><input type="range" min="0" max="20" value={values.gradientStrength} onChange={e => patch({ gradientStrength: Number(e.target.value) })} /></label>
          <p>Text contrast adjusts automatically. Tint and texture are softened when needed to keep your writing readable.</p>
        </section>
      </div>
      <footer><p>Presentation only. Tasks, journals and vault files stay unchanged.</p><div><button onClick={() => { setPreset('Original'); change(null); }}>Reset to original</button><button onClick={onClose}>Cancel</button><button className="pn-primary" onClick={() => void save()}>Save appearance</button></div></footer>
    </fieldset>
  </section>;
}
