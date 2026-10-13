import { defaultFolderColor } from './fileCabinetModel.mjs';
// The approved cabinet's materials; saved owner colors always win.
const referenceColors = new Map([['Inbox','#f4bc59'],['Creative','#f2f3ee'],['Projects','#999d7e'],['Personal','#080d09'],['Business','#a3b7a8']]);
const rules = [
  ['Projects', ['project','projects','roadmap','milestone','deliverable']],
  ['Resources', ['resource','resources','reference','references','tutorial','guide']],
  ['Research', ['research','study','studies','findings','experiment']],
  ['People', ['people','person','contact','contacts','relationships']],
  ['Business', ['business','client','clients','invoice','operations']],
  ['Creative', ['creative','design','designs','inspiration','artwork']],
  ['Personal', ['personal','health','journal','routine','travel']],
];
const words = value => new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
export function smartFolderName(value) {
  const clean = value.replace(/^\d+[-_ ]+/, '').replace(/[-_]+/g, ' ').trim();
  return clean ? clean[0].toLocaleUpperCase() + clean.slice(1) : 'Inbox';
}
function classify(object, roots) {
  const root = object.sourcePath && roots.find(path => object.sourcePath.startsWith(path + '/'));
  const relative = root ? object.sourcePath.slice(root.length + 1) : object.sourceMetadata?.path;
  if (relative?.includes('/')) return { folder: smartFolderName(relative.split('/')[0]), reason: `Source folder: ${relative.split('/')[0]}` };
  const title = words(object.title), body = words(object.text.slice(0, 8000));
  const scored = rules.map(([folder, terms]) => ({ folder, score: terms.reduce((sum, term) => sum + (title.has(term) ? 3 : 0) + (body.has(term) ? 1 : 0), 0) })).sort((a,b) => b.score - a.score);
  return scored[0].score >= 3 && scored[0].score > scored[1].score
    ? { folder: scored[0].folder, reason: 'Local title/content match · automatic' }
    : { folder: 'Inbox', reason: 'No clear folder match · ready to refine' };
}
/** A complete derived view: no 1,000-source collection limit and no filesystem writes. */
export function buildSmartFolders(objects, roots = [], filing, member = false) {
  if (member) return { folders: [], assignments: new Map() };
  const paths = roots.map(root => root.path.replace(/\/+$/, '')).sort((a,b) => b.length - a.length);
  const overrides = new Map((filing?.overrides || []).map(item => [item.sourceId, item.folder]));
  const colors = new Map((filing?.colors || []).map(item => [item.folder, item.color]));
  const groups = new Map(), assignments = new Map();
  for (const object of objects) {
    if (object.kind === 'code_graph' || assignments.has(object.id)) continue;
    const assignment = overrides.has(object.id) ? { folder: overrides.get(object.id), reason: 'Your saved refinement · kept on refresh' } : classify(object, paths);
    assignments.set(object.id, assignment);
    if (!groups.has(assignment.folder)) groups.set(assignment.folder, { id: `smart:${assignment.folder}`, name: assignment.folder, color: colors.get(assignment.folder) || referenceColors.get(assignment.folder) || defaultFolderColor(assignment.folder), sourceIds: [], system: true, collectionId: null });
    groups.get(assignment.folder).sourceIds.push(object.id);
  }
  const priority = ['Inbox', 'Creative', 'Projects', 'Personal', 'Business', 'Resources', 'Research', 'People'];
  const rank = name => priority.includes(name) ? priority.indexOf(name) : 100;
  return { folders: [...groups.values()].sort((a,b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)), assignments };
}
