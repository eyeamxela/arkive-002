import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import type { Brain, BrainObject, PersonalNodeClient, Room } from './api';
import { ALL_FILES, CABINET_PALETTE, buildCabinetVault, cabinetFiles, cabinetFolders, cabinetGroups, cabinetPage, cabinetReadableObjects, cabinetVaultBreadcrumbs, cabinetVaultChildren, cabinetVaultContainingFolder, cabinetVaultFolder, collectionPatch, folderMaterial, reconcileCabinetSelection, validFolderColor } from './fileCabinetModel.mjs';
import './FileCabinet.css';
import { CollectionOrganizer } from './CollectionOrganizer';
import { sortCabinetFiles, reorderCollection, type FileSort } from './organizationModel.mjs';
import { buildSmartFolders } from './smartFolders.mjs';
import { SmartFolderTools } from './SmartFolderTools';
import { FolderChatContext } from './FolderChatContext';

export type FileCabinetProps = {
  brain: Brain;
  busy: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  activeRoom?: Room;
  act: (label: string, action: (client: PersonalNodeClient) => Promise<unknown>, success?: string) => Promise<boolean>;
  onUseSource: (id: string) => Promise<boolean>;
  onOpenChat: () => void;
  onProposeMemory: (id: string) => void;
  onEditNote: (object: BrainObject) => void;
  onOpenSources: () => void;
};
const EMPTY_COLLECTIONS: NonNullable<Brain['workspace']>['collections'] = [];
const TAB_OFFSETS = [2, 29, 57, 40, 12];
const MOBILE_OFFSETS = [2, 31, 9, 30, 4];
const digits = (count: number) => String(count).padStart(2, '0');

function Palette({ value, onChange, disabled = false }: { value: string; onChange: (color: string) => void; disabled?: boolean }) {
  return <div className="fc-palette" role="group" aria-label="Reference folder palette">
    {CABINET_PALETTE.map(preset => <button type="button" key={preset.color} aria-label={`${preset.name} color`} aria-pressed={value.toLowerCase() === preset.color} disabled={disabled} onClick={() => onChange(preset.color)}>
      <span className="fc-swatch" style={folderMaterial(preset.color) as CSSProperties} aria-hidden="true">{value.toLowerCase() === preset.color ? '✓' : ''}</span><span>{preset.name}</span>
    </button>)}
  </div>;
}

/** A projection of the encrypted Brain, not a second storage system or filesystem browser. */
export function FileCabinet(props: FileCabinetProps) {
  const { brain, selectedId, onSelect } = props;
  const member = brain.access?.kind === 'member';
  const cabinetObjects = useMemo(() => cabinetReadableObjects(brain.objects, member), [brain.objects, member]);
  const collections = member ? EMPTY_COLLECTIONS : brain.workspace?.collections ?? EMPTY_COLLECTIONS;
  const collectionFolders = useMemo(() => cabinetFolders(cabinetObjects, collections, member), [cabinetObjects, collections, member]);
  const vaultModel = useMemo(() => buildCabinetVault(cabinetObjects, brain.folders, member), [cabinetObjects, brain.folders, member]);
  const vaultRoots = useMemo(() => vaultModel.rootIds.flatMap(id => { const folder = cabinetVaultFolder(vaultModel, id); return folder ? [folder] : []; }), [vaultModel]);
  const smart = useMemo(() => buildSmartFolders(cabinetObjects, brain.folders, brain.workspace?.filing, member), [cabinetObjects, brain.folders, brain.workspace?.filing, member]);
  const [modeChoice, setModeChoice] = useState<'smart' | 'vault' | 'collections' | null>(null);
  const [smartFolderId, setSmartFolderId] = useState('');
  const [vaultFolderId, setVaultFolderId] = useState('');
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [childQuery, setChildQuery] = useState('');
  const [childLimit, setChildLimit] = useState(12);
  const [folderId, setFolderId] = useState(ALL_FILES);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [limit, setLimit] = useState(100);
  const [sort, setSort] = useState<FileSort>('name-asc');
  const [checked, setChecked] = useState<{ scope: string; ids: string[] }>({ scope: '', ids: [] });
  const [destinationId, setDestinationId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CABINET_PALETTE[0].color);
  const [colorDraft, setColorDraft] = useState<{ folderId: string; value: string } | null>(null);
  const [pending, setPending] = useState(false);
  const actionLock = useRef(false);
  const previousSelection = useRef<string | null>(null);
  const sessionState = useRef(`${brain.brainId}:${member}`);
  const colorButton = useRef<HTMLButtonElement>(null);
  const newFolderButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const ids = useId();
  const busy = props.busy || pending;
  const mode = member ? 'collections' : modeChoice === 'vault' && vaultRoots.length ? 'vault' : modeChoice === 'collections' ? 'collections' : 'smart';
  const defaultVaultId = vaultRoots.find(folder => folder.totalCount > 0)?.vaultId ?? vaultRoots[0]?.vaultId ?? '';
  const vaultFolder = useMemo(() => cabinetVaultFolder(vaultModel, vaultFolderId, includeSubfolders) ?? cabinetVaultFolder(vaultModel, defaultVaultId, includeSubfolders), [vaultModel, vaultFolderId, defaultVaultId, includeSubfolders]);
  const folders = mode === 'vault' ? vaultRoots : mode === 'smart' && smart.folders.length ? smart.folders : collectionFolders;
  const activeFolder = mode === 'smart' ? smart.folders.find(folder => folder.id === smartFolderId) ?? folders[0] : mode === 'vault' && vaultFolder ? vaultFolder : collectionFolders.find(folder => folder.id === folderId) ?? collectionFolders[0];
  const stackSelectedId = mode === 'vault' && vaultFolder ? `vault:${vaultFolder.rootId}` : activeFolder.id;
  const collection = collections.find(item => item.id === activeFolder.collectionId);
  const allFiles = useMemo(() => cabinetFiles(cabinetObjects, collectionFolders[0]), [cabinetObjects, collectionFolders]);
  const childFolders = useMemo(() => vaultFolder ? cabinetVaultChildren(vaultModel, vaultFolder.vaultId) : [], [vaultModel, vaultFolder?.vaultId]);
  const matchingChildren = childFolders.filter(folder => folder.name.toLocaleLowerCase().includes(childQuery.trim().toLocaleLowerCase()));
  const breadcrumbs = mode === 'vault' && vaultFolder ? cabinetVaultBreadcrumbs(vaultModel, vaultFolder.vaultId) : [];
  const searchMatches = useMemo(() => cabinetFiles(cabinetObjects, activeFolder, query), [cabinetObjects, activeFolder, query]);
  const effectiveSort = sort === 'manual' && !collection ? 'name-asc' : sort;
  const visible = useMemo(() => sortCabinetFiles(cabinetFiles(searchMatches, activeFolder, '', group), effectiveSort, brain.revisions, activeFolder.sourceIds), [searchMatches, activeFolder, group, effectiveSort, brain.revisions]);
  const selectionScope = JSON.stringify([brain.brainId, member, mode, activeFolder.id, query, group, includeSubfolders]);
  const checkedIds = new Set(checked.scope === selectionScope ? checked.ids : []);
  const checkedObjects = member ? [] : visible.filter(object => checkedIds.has(object.id));
  const groups = useMemo(() => cabinetGroups(searchMatches), [searchMatches]);
  const selected = visible.find(object => object.id === selectedId);
  const page = cabinetPage(folders, stackSelectedId);
  // Keep the tabs mounted in canonical order, as in the original animated concept.
  // Only their visual depth changes: keyboard focus and horizontal offsets stay put.
  const stackFolders = folders.slice(page.start, page.end);
  const draft = !member && colorDraft?.folderId === activeFolder.id ? colorDraft : null;
  const material = folderMaterial(draft && validFolderColor(draft.value) ? draft.value : activeFolder.color);
  const destination = collections.find(item => item.id === destinationId);
  const inDestination = !!selected && !!destination?.sourceIds.includes(selected.id);
  const inChat = !!selected && !!props.activeRoom?.selectedSourceIds.includes(selected.id);

  useLayoutEffect(() => {
    const node = sheet.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!node?.animate || reducedMotion.matches) return;
    const animation = node.animate([
      { transform: 'translateY(28px)', opacity: .5 },
      { transform: 'translateY(0)', opacity: 1 },
    ], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    const stop = () => { if (reducedMotion.matches) animation.cancel(); };
    reducedMotion.addEventListener('change', stop);
    return () => { animation.cancel(); reducedMotion.removeEventListener('change', stop); };
  }, [brain.brainId, mode, activeFolder.id]);

  useEffect(() => { setChecked({ scope: selectionScope, ids: [] }); }, [selectionScope]);

  useEffect(() => {
    // An action may select a newly created source before its refreshed Brain arrives.
    // Do not reject that ID or advance the external-selection marker mid-refresh.
    if (props.busy) return;
    const next = reconcileCabinetSelection(selectedId, previousSelection.current, allFiles, visible, limit);
    previousSelection.current = selectedId;
    if (next.selectedId !== selectedId) onSelect(next.selectedId);
    if (next.resetView) {
      const containingFolder = !member && selectedId ? cabinetVaultContainingFolder(vaultModel, selectedId) : null;
      if (mode === 'smart' && selectedId && smart.assignments.has(selectedId)) { setSmartFolderId(`smart:${smart.assignments.get(selectedId)!.folder}`); }
      else if (containingFolder) { setModeChoice('vault'); setVaultFolderId(containingFolder); }
      else { setModeChoice('collections'); setFolderId(ALL_FILES); }
      setQuery(''); setGroup(''); setColorDraft(null); setChildQuery(''); setChildLimit(12);
    }
    if (next.limit !== limit) setLimit(next.limit);
  }, [selectedId, allFiles, visible, limit, onSelect, props.busy, member, vaultModel, mode, smart]);
  useEffect(() => {
    const sessionKey = `${brain.brainId}:${member}`;
    if (sessionState.current === sessionKey) return;
    sessionState.current = sessionKey;
    setFolderId(ALL_FILES); setQuery(''); setGroup(''); setColorDraft(null); setCreateOpen(false);
    setNewName(''); setDestinationId(''); setLimit(100);
    setModeChoice(null); setVaultFolderId(''); setIncludeSubfolders(true); setChildQuery(''); setChildLimit(12);
  }, [brain.brainId, member]);

  function chooseFolder(id: string) {
    if (mode === 'smart') setSmartFolderId(id);
    else if (mode === 'vault' && id.startsWith('vault:')) setVaultFolderId(id.slice(6));
    else setFolderId(id);
    setGroup(''); setQuery(''); setLimit(100); setColorDraft(null); setChildQuery(''); setChildLimit(12); onSelect(null);
  }
  function chooseVaultFolder(id: string) { setVaultFolderId(id); setGroup(''); setQuery(''); setChildQuery(''); setChildLimit(12); setLimit(100); onSelect(null); }
  function chooseMode(next: 'smart' | 'vault' | 'collections') { setModeChoice(next); setGroup(''); setQuery(''); setColorDraft(null); setCreateOpen(false); setLimit(100); onSelect(null); }
  function clearFilters() { setQuery(''); setGroup(''); setLimit(100); }
  async function run(label: string, action: (client: PersonalNodeClient) => Promise<unknown>, success?: string) {
    if (member || busy || actionLock.current) return false;
    actionLock.current = true; setPending(true);
    try { return await props.act(label, action, success); }
    finally { actionLock.current = false; setPending(false); }
  }
  async function updateCollection(id: string, change: { addId?: string; removeId?: string; color?: string }, label: string, success: string) {
    return run(label, async client => {
      // Read current membership before an upsert: a stale color editor must not revert filing changes.
      const current = await client.brain();
      const latest = current.access?.kind !== 'member' && current.workspace?.collections.find(item => item.id === id);
      if (!latest) throw new Error('This folder is no longer available. Refresh the Brain before trying again.');
      if (change.addId && !current.objects.some(object => object.id === change.addId && object.kind !== 'code_graph')) throw new Error('This source is no longer available. Refresh the Brain before filing it.');
      return client.request('/v1/workspace/collections', 'POST', collectionPatch(latest, change));
    }, success);
  }
  async function createFolder(event: FormEvent) {
    event.preventDefault(); const name = newName.trim(); if (!name) return;
    const saved = await run('Creating Arkive folder', client => {
      if (new TextEncoder().encode(name).length > 160) throw new Error('Use a shorter folder name (up to 160 UTF-8 bytes).');
      if (!validFolderColor(newColor)) throw new Error('Choose a valid folder color.');
      return client.request('/v1/workspace/collections', 'POST', { name, description: '', sourceIds: [], color: newColor });
    }, 'Arkive folder saved on your node. Original files and access permissions are unchanged.');
    if (saved) { setCreateOpen(false); setNewName(''); newFolderButton.current?.focus(); }
  }
  async function saveColor(event: FormEvent) {
    event.preventDefault(); if (!collection || !draft || !validFolderColor(draft.value)) return;
    if (await updateCollection(collection.id, { color: draft.value }, 'Saving folder color', 'Folder color saved on your node. Membership and original files are unchanged.')) {
      setColorDraft(null); colorButton.current?.focus();
    }
  }
  async function useSource() {
    if (!selected || member || busy || actionLock.current) return;
    actionLock.current = true; setPending(true);
    try { await props.onUseSource(selected.id); }
    finally { actionLock.current = false; setPending(false); }
  }
  async function moveReference(object: BrainObject, direction: number) {
    if (!collection) return;
    const operation = reorderCollection(collection, object.id, direction);
    if (operation) await run('Saving collection order', client => client.request('/v1/workspace/collections/organize', 'POST', { operations: [operation] }), 'Manual order saved in Arkive. Original files are unchanged.');
  }

  return <section className="pn-file-cabinet" aria-label="Files">
    <header className="fc-toolbar">
      <div><p className="fc-eyebrow">{member ? 'PERMITTED SOURCES / READ ONLY' : 'YOUR BRAIN / FILE ORGANIZATION'}</p><h2>A place for everything.</h2></div>
      <label className="fc-search"><span className="pn-sr">Search this Arkive folder</span><span aria-hidden="true">⌕</span><input type="search" value={query} placeholder="Find a file in this folder…" onChange={event => { setQuery(event.target.value); setLimit(100); }} /></label>
    </header>
    {!member && <div className="fc-organization-bar"><div className="fc-modes" role="group" aria-label="File organization views"><button type="button" aria-pressed={mode === 'smart'} onClick={() => chooseMode('smart')}>Smart folders <span>{smart.folders.length}</span></button><button type="button" aria-pressed={mode === 'vault'} disabled={!vaultRoots.length} onClick={() => chooseMode('vault')}>Vault folders <span>{vaultRoots.length}</span></button><button type="button" aria-pressed={mode === 'collections'} onClick={() => chooseMode('collections')}>Collections <span>{collections.length}</span></button></div><p>{mode === 'smart' ? 'Automatically organized. Refine whenever you like. Originals stay in place.' : mode === 'vault' ? 'Original imported hierarchy. No files moved or copied.' : 'Your saved groups, separate from source folders and room permissions.'}</p></div>}
    <div className="fc-folder-tools">
      <label><span>{mode === 'vault' ? 'Vault' : 'Folder'}</span><select aria-label={mode === 'vault' ? 'Choose source vault' : 'Choose Arkive folder'} value={stackSelectedId} onChange={event => chooseFolder(event.target.value)}>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}{mode !== 'vault' && folder.system ? ' · system view' : ''} ({folder.sourceIds.length})</option>)}</select></label>
      {folders.length > 5 && <div className="fc-pages"><button type="button" aria-label="Previous folder sheets" disabled={!page.previousId} onClick={() => page.previousId && chooseFolder(page.previousId)}>←</button><span>{page.start + 1}–{page.end} of {folders.length}</span><button type="button" aria-label="Next folder sheets" disabled={!page.nextId} onClick={() => page.nextId && chooseFolder(page.nextId)}>→</button></div>}
      {!member && <button type="button" ref={newFolderButton} disabled={busy} aria-expanded={createOpen} aria-controls={`${ids}-new-folder`} onClick={() => { if (mode !== 'collections') { chooseMode('collections'); setFolderId(ALL_FILES); setCreateOpen(true); } else setCreateOpen(value => !value); }}>{mode !== 'collections' ? '＋ New collection' : '＋ New folder'}</button>}
    </div>
    {!member && createOpen && <form id={`${ids}-new-folder`} className="fc-new-folder" onSubmit={event => void createFolder(event)}>
      <div><h3>New Arkive folder</h3><p>Group sources without moving or duplicating the original files. Room access stays separate.</p></div>
      <fieldset disabled={busy}><label>Folder name<input autoFocus value={newName} maxLength={160} required onChange={event => setNewName(event.target.value)} placeholder="e.g. Project research" /></label>
        <Palette value={newColor} onChange={setNewColor} disabled={busy} />
        <label className="fc-custom-color">Custom folder color<input type="color" value={newColor} onChange={event => setNewColor(event.target.value)} /></label>
        <div className="fc-form-actions"><button type="button" onClick={() => { setCreateOpen(false); newFolderButton.current?.focus(); }}>Cancel</button><button type="submit" disabled={!newName.trim()}>Create folder</button></div>
      </fieldset>
    </form>}
    <div className="fc-cabinet">
      <div className="fc-deck" aria-label="Folder sheets" style={{ '--fc-layers': page.folders.length } as CSSProperties}>
        {stackFolders.map((folder, index) => <div key={folder.id} className="fc-layer" data-folder-id={folder.id} data-front={folder.id === stackSelectedId} style={{ ...folderMaterial(folder.id === stackSelectedId && draft && validFolderColor(draft.value) ? draft.value : folder.color), '--fc-order': page.folders.findIndex(item => item.id === folder.id), '--fc-offset': `${TAB_OFFSETS[index % 5]}%`, '--fc-mobile-offset': `${MOBILE_OFFSETS[index % 5]}%` } as CSSProperties}>
          <div className="fc-rail" aria-hidden="true" /><button type="button" className="fc-tab" aria-controls={`${ids}-sheet`} aria-label={`${folder.name}, ${folder.sourceIds.length} files${mode === 'vault' ? ', connected vault' : folder.system ? ', system view' : ''}`} aria-pressed={folder.id === stackSelectedId} onClick={() => chooseFolder(folder.id)} title={folder.name}><span className="fc-tab-count">{digits(folder.sourceIds.length)}</span><span className="fc-tab-name">{folder.name}</span></button>
        </div>)}
      </div>
      <section ref={sheet} id={`${ids}-sheet`} className="fc-sheet" style={material as CSSProperties} aria-label={`${activeFolder.name} contents`}>
        <header className="fc-sheet-heading">
          <div><p className="fc-location">{mode === 'vault' && vaultFolder ? vaultFolder.rootPath : `${member ? 'Shared sources' : brain.name} / ${mode === 'smart' ? 'Smart folders' : activeFolder.system ? 'system view' : 'Arkive folder'}`}</p><h2>{activeFolder.name}</h2><p className="fc-folder-description">{mode === 'smart' ? `${activeFolder.sourceIds.length} files automatically grouped or refined by you. New imports join automatically; your corrections take priority.` : mode === 'vault' && vaultFolder ? `${vaultFolder.totalCount} imported files in this branch · ${vaultFolder.directCount} directly in this folder. Counts reflect imported sources, not unscanned disk contents.` : collection?.description || (activeFolder.id === ALL_FILES ? (member ? 'Only sources permitted by your room access.' : 'All your notes, documents and memory. Code snapshots have their own view.') : activeFolder.system ? 'Sources not filed in any Arkive folder.' : 'A saved collection of original source references.')}</p></div>
          <div className="fc-sheet-controls"><span className="fc-scope">{member ? 'Read only' : mode === 'smart' ? 'Auto-sorted · refinable' : mode === 'vault' ? 'Source folder · read only' : activeFolder.system ? 'System view' : 'Saved on your node'}</span><span className="fc-index">{digits(folders.findIndex(folder => folder.id === stackSelectedId) + 1)} / {digits(folders.length)}</span>
            {collection && !member && <div className="fc-color-control"><button type="button" ref={colorButton} className="fc-color-toggle" disabled={busy} aria-expanded={!!draft} aria-controls={`${ids}-colors`} onClick={() => setColorDraft(draft ? null : { folderId: activeFolder.id, value: activeFolder.color })}>◉ Folder color <span aria-hidden="true">⌄</span></button>
              {draft && <form id={`${ids}-colors`} className="fc-color-panel" onSubmit={event => void saveColor(event)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setColorDraft(null); colorButton.current?.focus(); } }}>
                <h3>{activeFolder.name} color</h3><Palette value={draft.value} disabled={busy} onChange={value => setColorDraft({ ...draft, value })} />
                <div className="fc-color-inputs"><label>Custom color<input type="color" disabled={busy} value={validFolderColor(draft.value) ? draft.value : activeFolder.color} onChange={event => setColorDraft({ ...draft, value: event.target.value })} /></label><label>Hex color<input type="text" value={draft.value} maxLength={7} disabled={busy} spellCheck={false} aria-invalid={!validFolderColor(draft.value)} aria-describedby={`${ids}-color-help`} onChange={event => setColorDraft({ ...draft, value: event.target.value })} /></label></div>
                <p id={`${ids}-color-help`}>{validFolderColor(draft.value) ? 'Preview only. Save to keep this color on your node.' : 'Enter six hex digits, for example #A3B7A8.'}</p>
                <div className="fc-form-actions"><button type="button" disabled={busy} onClick={() => { setColorDraft(null); colorButton.current?.focus(); }}>Cancel</button><button type="submit" disabled={busy || !validFolderColor(draft.value)}>Save color</button></div>
              </form>}
            </div>}
          </div>
        </header>
        {mode === 'vault' && vaultFolder && <div className="fc-vault-navigation">
          <nav className="fc-breadcrumbs" aria-label="Vault folder path">{breadcrumbs.map((part, index) => <span key={part.id}>{index > 0 && <span aria-hidden="true"> / </span>}<button type="button" title={part.path} aria-current={part.id === vaultFolder.vaultId ? 'page' : undefined} onClick={() => chooseVaultFolder(part.id)}>{part.name}</button></span>)}</nav>
          <label className="fc-subtree-toggle"><input type="checkbox" checked={includeSubfolders} onChange={event => { setIncludeSubfolders(event.target.checked); setLimit(100); }} />Include subfolders <span>{includeSubfolders ? 'Entire branch' : 'This folder only'}</span></label>
          {childFolders.length > 0 && <div className="fc-subfolder-section"><div className="fc-subfolder-heading"><h3>Subfolders <span>{childFolders.length}</span></h3>{childFolders.length > 12 && <label><span className="pn-sr">Find a subfolder</span><input type="search" value={childQuery} placeholder="Find a subfolder…" onChange={event => { setChildQuery(event.target.value); setChildLimit(12); }} /></label>}</div><div className="fc-subfolders">{matchingChildren.slice(0, childLimit).map(folder => <button key={folder.id} type="button" className="fc-subfolder" data-vault-folder-id={folder.id} title={folder.path} aria-label={`Open folder ${folder.name}, ${folder.count} imported files`} onClick={() => chooseVaultFolder(folder.id)}><span aria-hidden="true">▱</span><span><strong>{folder.name}</strong><small>{folder.count} files · {folder.directCount} here</small></span><span aria-hidden="true">↗</span></button>)}</div>{!matchingChildren.length && <p className="fc-subfolder-empty">No subfolder names match.</p>}{matchingChildren.length > childLimit && <button type="button" className="fc-more-subfolders" onClick={() => setChildLimit(value => value + 24)}>Show more subfolders · {matchingChildren.length - childLimit} remaining</button>}</div>}
        </div>}
        <div className="fc-groups" aria-label="Source type filters">{groups.map(item => <button className="fc-group" type="button" key={item.id} aria-pressed={group === item.id} aria-label={`${item.name}, ${item.count} files`} onClick={() => { setGroup(group === item.id ? '' : item.id); setLimit(100); }}>
          <span className="fc-disc"><span>{digits(item.count)}</span></span><span className="fc-group-label"><span aria-hidden="true">•</span> {item.name}</span>
        </button>)}</div>
        <div className="fc-list-bar"><span>{group ? groups.find(item => item.id === group)?.name : 'All files'}{query ? ' · search results' : ''} {(query || group) && <button type="button" onClick={clearFilters}>Clear filters</button>}</span><label>Sort <select aria-label="Sort files" value={effectiveSort} onChange={event => { setSort(event.target.value as FileSort); setLimit(100); }}><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="recent">Latest Brain revision</option><option value="type">File type</option>{collection && <option value="manual">Manual collection order</option>}</select></label></div>
        {effectiveSort === 'recent' && <p className="fc-organizer-help">Latest saved/imported revision on this node, not the original file’s modification date. Unavailable dates sort last.</p>}
        {effectiveSort === 'manual' && <p className="fc-organizer-help">Order is saved for this collection. Clear search and type filters to move references up or down.</p>}
        {!member && (mode === 'smart' ? <SmartFolderTools key={`${selectionScope}:${activeFolder.color}`} selected={checkedObjects} visible={visible} folders={folders} active={activeFolder} filing={brain.workspace?.filing} busy={busy} run={run} onSelectAll={() => setChecked({ scope: selectionScope, ids: visible.slice(0, 1000).map(object => object.id) })} onClear={() => setChecked({ scope: selectionScope, ids: [] })} /> : <CollectionOrganizer key={selectionScope} selected={checkedObjects} visible={visible} collections={collections} collection={collection} busy={busy} run={run} onSelectAll={() => setChecked({ scope: selectionScope, ids: visible.slice(0, 1000).map(object => object.id) })} onClear={() => setChecked({ scope: selectionScope, ids: [] })} />)}
        {!member && <FolderChatContext key={`${brain.brainId}:${mode}:${activeFolder.id}:${includeSubfolders}`} brain={brain} folder={activeFolder} objects={cabinetObjects} activeRoomId={props.activeRoom?.id} busy={busy} run={run} onOpenChat={props.onOpenChat} />}
        <div className="fc-content">
          <div className="fc-file-list" aria-label="Files in this folder">
            {visible.slice(0, limit).map(object => <div key={object.id} className="fc-file-row">
              {!member && <input className="fc-select-file" type="checkbox" aria-label={`Select file ${object.title}`} disabled={busy || (!checkedIds.has(object.id) && checkedObjects.length >= 1000)} checked={checkedIds.has(object.id)} onChange={event => setChecked({ scope: selectionScope, ids: event.target.checked ? [...checkedObjects.map(item => item.id), object.id] : checkedObjects.filter(item => item.id !== object.id).map(item => item.id) })} />}
              <button type="button" className="pn-file fc-file" data-object-id={object.id} aria-pressed={selected?.id === object.id} onClick={() => onSelect(object.id)}>
              <span className="fc-file-icon" aria-hidden="true">{object.kind === 'memory' ? '◇' : '▤'}</span><span><strong>{object.title}</strong><small>{object.kind} · {object.sourcePath || (object.sourceMetadata ? `${object.sourceMetadata.repository}/${object.sourceMetadata.path}` : 'Saved on this node')}</small></span><span className="fc-file-arrow" aria-hidden="true">↗</span>
              </button>
              {!member && collection && effectiveSort === 'manual' && !query && !group && <div className="fc-order-buttons"><button type="button" aria-label={`Move ${object.title} up`} disabled={busy || collection.sourceIds.indexOf(object.id) === 0} onClick={() => void moveReference(object, -1)}>↑</button><button type="button" aria-label={`Move ${object.title} down`} disabled={busy || collection.sourceIds.indexOf(object.id) === collection.sourceIds.length - 1} onClick={() => void moveReference(object, 1)}>↓</button></div>}
            </div>)}
            {!visible.length && <div className="fc-empty"><h3>{query || group ? 'No matching files.' : member ? 'No permitted sources yet.' : mode === 'vault' ? 'No imported files in this view.' : 'Room for something useful.'}</h3><p>{query || group ? 'Try a different name, source path or type filter.' : member ? 'The owner can share sources through your room access.' : mode === 'vault' ? 'Open a subfolder, include its files, or refresh this connected folder in Sources & sync. Unscanned files are not guessed.' : activeFolder.system ? 'Capture a note above or connect your own source files.' : 'Choose a source in All files, then file it here. Its original stays in place.'}</p>{(query || group) ? <button type="button" onClick={clearFilters}>Clear filters</button> : !member && <button type="button" onClick={activeFolder.system ? props.onOpenSources : () => chooseFolder(ALL_FILES)}>{mode === 'vault' ? 'Open Sources & sync' : activeFolder.system ? 'Connect sources' : 'Browse all files'}</button>}</div>}
            {visible.length > limit && <button className="fc-show-more" type="button" onClick={() => setLimit(value => value + 100)}>Show more files · {visible.length - limit} remaining</button>}
          </div>
          <aside className="fc-inspector" aria-label="File preview">
            <div className="fc-preview-kicker"><span>Source preview</span><span>{selected?.kind || 'No selection'}</span></div>
            {selected ? <><h3>{selected.title}</h3><pre className="fc-preview-text">{selected.text}</pre>
              {mode === 'smart' && <p className="fc-source-boundary">{smart.assignments.get(selected.id)?.reason}</p>}
              <dl className="fc-metadata"><dt>Kind</dt><dd>{selected.kind}</dd><dt>Revision</dt><dd>{selected.revisionId || 'Not recorded'}</dd><dt>Source</dt><dd>{selected.sourcePath || (selected.sourceMetadata ? `${selected.sourceMetadata.repository} / ${selected.sourceMetadata.path}` : 'Saved on this node')}</dd><dt>Source ID</dt><dd>{selected.id}</dd><dt>References</dt><dd>{selected.sourceIds.length} source links</dd></dl>
              {!member && <>
                <div className="fc-chat-actions">{props.activeRoom ? <button type="button" className="fc-primary" disabled={busy || inChat} onClick={() => void useSource()}>{inChat ? 'Selected for' : 'Use in'} {props.activeRoom.title} {inChat ? '✓' : '↗'}</button> : <p>Create or choose a chat before selecting context.</p>}<button type="button" onClick={props.onOpenChat}>Open chat →</button><p>Use in chat selects this file alongside existing context. Open chat only navigates. Nothing is sent to a model until you send a message.</p></div>
                <form className="fc-file-form" onSubmit={event => { event.preventDefault(); if (destination && !inDestination) void updateCollection(destination.id, { addId: selected.id }, 'Filing source in Arkive folder', 'Original source filed in the Arkive folder. No filesystem move, copy or access change was made.'); }}>
                  <label>File in Arkive folder<select value={destination?.id || ''} disabled={busy || !collections.length} onChange={event => setDestinationId(event.target.value)}><option value="">Choose a saved folder</option>{collections.map(item => <option value={item.id} key={item.id}>{item.name}{item.sourceIds.includes(selected.id) ? ' · already filed' : ''}</option>)}</select></label><button type="submit" disabled={busy || !destination || inDestination}>{inDestination ? 'Already filed' : 'File here'}</button>
                  <p>{collections.length ? 'Adds this source reference. The original and its other folders stay unchanged.' : 'Create an Arkive folder above to start organizing.'}</p>
                </form>
                {collection && <button type="button" className="fc-unfile" disabled={busy} onClick={() => void updateCollection(collection.id, { removeId: selected.id }, 'Removing source from Arkive folder', 'Folder reference removed. The source and original file are unchanged.')}>Remove from this folder</button>}
                <div className="fc-secondary-actions"><button type="button" disabled={busy} onClick={() => props.onProposeMemory(selected.id)}>Propose memory</button>{selected.kind === 'note' && !selected.sourcePath && !selected.sourceMetadata && <button type="button" disabled={busy} onClick={() => props.onEditNote(selected)}>Edit note</button>}</div>
              </>}
              <p className="fc-source-boundary">{member ? 'Read-only source access. The owner manages context and sharing.' : 'Filing never promotes a source to Canon. Originals and review history remain unchanged.'}</p>
            </> : <div className="fc-preview-empty"><h3>Follow the source.</h3><p>Select a file to read its content, inspect its revision and organize its references.</p></div>}
          </aside>
        </div>
        <footer className="fc-footer"><div><span className="fc-total">{digits(visible.length)}</span> <span>{query || group ? `of ${activeFolder.sourceIds.length} files` : 'files'}</span></div><p>{member ? 'Permission-filtered sources only' : 'One source. Many views.'}<br />{member ? 'No owner folder metadata is shown' : 'Original files stay in place'}</p></footer>
      </section>
    </div>
  </section>;
}
