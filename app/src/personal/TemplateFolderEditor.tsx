import type { CSSProperties, Dispatch, FormEvent, SetStateAction } from 'react';
import type { TaskTemplate } from './api';
import { useWorkMaterial } from './WorkAppearance';

export type TemplateDraft = Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; expectedUpdatedAt?: string };
type Props = {
  draft: TemplateDraft;
  setDraft: Dispatch<SetStateAction<TemplateDraft | null>>;
  busy: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
};

export function TemplateFolderEditor({ draft, setDraft, busy, onSave }: Props) {
  const folderMaterial = useWorkMaterial();
  const sections = draft.sections ?? [];
  const presetTasks = draft.items.filter(item => item.title.trim());
  const material = folderMaterial(draft.color ?? '#f4bc59');
  const patch = (value: Partial<TemplateDraft>) => setDraft(current => current ? { ...current, ...value } : current);
  const invalid = !draft.name.trim() || !sections.length || sections.some(section => !section.title.trim()) || presetTasks.some(item => !item.section.trim());
  return <form className="pn-template-folder" aria-label={draft.id ? 'Edit template' : 'New template'} style={{ ...material, '--fc-preview-tint': ['#f8faf5', '#ffffff'].includes(material['--fc-ink']) ? '#000000' : '#ffffff' } as CSSProperties} onSubmit={onSave}>
    <div className="pn-template-folder-tab"><span>{String(sections.length || draft.items.length).padStart(2, '0')}</span><span>Template</span></div>
    <fieldset disabled={busy} className="pn-template-folder-sheet">
      <legend className="pn-sr">{draft.id ? 'Edit template' : 'New template'}</legend>
      <div className="pn-template-folder-layout">
        <div className="pn-template-folder-fields">
          <label>Template name<input required maxLength={160} value={draft.name} placeholder="Name your day" onChange={event => patch({ name: event.target.value })} /></label>
          <p className="pn-template-help">Save your section headings now. Add to-dos in Planner for today or any future date—no preset tasks needed.</p>
          {draft.sections && <section aria-label="Template sections">
            <header className="pn-template-section-heading"><h3>Sections</h3><span>In your own order</span></header>
            <div className="pn-template-title-list">{sections.map((section, index) => <div key={section.id}>
              <span className="pn-template-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <label><span className="pn-sr">Section title {index + 1}</span><input required maxLength={80} value={section.title} onChange={event => patch({ sections: sections.map(item => item.id === section.id ? { ...item, title: event.target.value } : item) })} /></label>
              <button type="button" aria-label={`Move section ${index + 1} up`} disabled={index === 0} onClick={() => { const reordered = [...sections]; [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]]; patch({ sections: reordered }); }}>↑</button>
              <button type="button" aria-label={`Remove section ${index + 1}`} disabled={sections.length === 1} onClick={() => patch({ sections: sections.filter(item => item.id !== section.id) })}>×</button>
            </div>)}</div>
            <div className="pn-template-folder-actions">
              <button type="button" disabled={sections.length >= 50} onClick={() => patch({ sections: [...sections, { id: `section_${crypto.randomUUID()}`, title: 'New section', kind: 'tasks' }] })}>＋ Add section</button>
              {!sections.some(section => section.kind === 'journal') && <button type="button" disabled={sections.length >= 50} onClick={() => patch({ sections: [...sections, { id: `section_${crypto.randomUUID()}`, title: 'Daily Journal', kind: 'journal' }] })}>＋ Add journal</button>}
            </div>
          </section>}
          <details className="pn-template-options" open={!draft.sections || draft.items.length > 0 ? true : undefined}>
            <summary>More options · recurrence, color &amp; preset tasks</summary>
            <div className="pn-template-options-fields">
              <div className="pn-wp-form-row"><label>Repeat<select aria-label="Template repeat" value={draft.repeat} onChange={event => patch({ repeat: event.target.value as TemplateDraft['repeat'] })}><option value="manual">Only when I apply it</option><option value="daily">Every day</option><option value="weekdays">Weekdays (Mon–Fri)</option></select></label><label>Starts on<input type="date" required min="1900-01-01" max="2199-12-31" value={draft.startsOn} onChange={event => patch({ startsOn: event.target.value })} /></label></div>
              <label className="pn-check"><input type="checkbox" checked={draft.enabled} onChange={event => patch({ enabled: event.target.checked })} />Enable automatic recurrence</label>
              <label className="pn-template-color">Folder color<input type="color" value={material['--fc-fill']} onChange={event => patch({ color: event.target.value })} /></label>
              <div className="pn-template-items">{draft.items.map((item, index) => <div key={index}><label>Section / project {index + 1}<input required={!!item.title.trim()} maxLength={80} value={item.section} onChange={event => patch({ items: draft.items.map((row, i) => i === index ? { ...row, section: event.target.value } : row) })} /></label><label>Task {index + 1}<input maxLength={160} placeholder="Optional preset task" value={item.title} onChange={event => patch({ items: draft.items.map((row, i) => i === index ? { ...row, title: event.target.value } : row) })} /></label><button type="button" aria-label={`Remove template task ${index + 1}`} onClick={() => patch({ items: draft.items.filter((_, i) => i !== index) })}>×</button></div>)}</div>
              <button type="button" disabled={draft.items.length >= 50} onClick={() => patch({ items: [...draft.items, { title: '', section: draft.items[draft.items.length - 1]?.section || 'Personal' }] })}>＋ Add template task</button>
              <p>Up to 50 sections and 50 preset tasks. Recurring templates create a separate day when you open an eligible date. No background reminders or external calendar sync.</p>
            </div>
          </details>
          <footer className="pn-template-folder-footer"><p>{presetTasks.length ? `${presetTasks.length} preset tasks included.` : 'Sections only · no preset tasks.'}<br />Blank task rows are not saved. Existing days stay unchanged.</p><div className="pn-template-folder-actions"><button type="button" onClick={() => setDraft(null)}>Cancel</button><button className="pn-template-save" disabled={invalid}>Save template</button></div></footer>
        </div>
        <aside className="pn-template-day-preview" aria-label="Day preview">
          <p className="pn-template-preview-eyebrow">DAY PREVIEW / {presetTasks.length ? 'WITH PRESET TASKS' : 'BLANK BY DESIGN'}</p>
          <h3>{draft.name.trim() || 'Your day'}</h3>
          {sections.map(section => <div className="pn-template-preview-section" key={section.id}><h4>{section.title.trim() || 'Untitled section'}</h4>{section.kind === 'journal' ? <div className="pn-template-preview-journal" aria-label="Blank journal" /> : <p><span aria-hidden="true">□</span> Add a to-do…</p>}</div>)}
          {presetTasks.length > 0 && <div className="pn-template-preview-presets"><h4>Preset tasks</h4>{presetTasks.map((item, index) => <p key={index}><span aria-hidden="true">□</span> {item.title} <small>· {item.section || 'Personal'}</small></p>)}</div>}
        </aside>
      </div>
    </fieldset>
  </form>;
}
