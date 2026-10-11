import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildGraphModel, extractNoteLinks, graphNeighbors, layoutGraph, GRAPH_NODE_LIMIT } from '../../src/personal/graphModel.mjs';

const folders = [{ id: 'vault', path: '/vault' }];
const note = (id, title, text = '', path = `/vault/${title}.md`, extra = {}) => ({
  id, title, text, kind: 'note', revisionId: `rev-${id}`, sourceIds: [], sourcePath: path, ...extra,
});
const targets = (model, id) => model.edges.filter(edge => edge.source === id || edge.target === id)
  .map(edge => edge.source === id ? edge.target : edge.source).sort();

test('wikilinks, display aliases, headings, block references and embeds become real edges', () => {
  const model = buildGraphModel([
    note('home', 'Home', '[[Alpha|display]] [[Beta#Heading]] ![[Gamma#^block]] [[#Local heading]]'),
    note('a', 'Alpha'), note('b', 'Beta'), note('c', 'Gamma'),
  ], { folders });
  assert.deepEqual(targets(model, 'home'), ['a', 'b', 'c']);
  assert.equal(model.edges.find(edge => edge.target === 'c').kinds[0], 'embed');
  assert.deepEqual(model.diagnostics, []);
});

test('relative Markdown destinations resolve against note directories, including escaped spaces and nested parentheses', () => {
  const model = buildGraphModel([
    note('home', 'Home', '[A](../Alpha.md#Heading) [B](<../Beta%20Note.md>) [C](./Nested\(name\).md "title")', '/vault/sub/Home.md'),
    note('a', 'Alpha'), note('b', 'Beta Note'), note('c', 'Nested(name)', '', '/vault/sub/Nested(name).md'),
  ], { folders });
  assert.deepEqual(targets(model, 'home'), ['a', 'b', 'c']);
});

test('ignores fenced code, inline code, comments, external URLs, images and same-note headings', () => {
  const parsed = extractNoteLinks([
    '```md', '[[In fence]]', '[Code](Code.md)', '```',
    '~~~', '![[In tilde fence]]', '~~~',
    '`[[Inline]]` and ``[inline](No.md)``', '<!-- [[Comment]] -->',
    '[external](https://example.com/External.md)', '[mail](mailto:test@example.com)',
    '[external](//example.com/External.md)', '![image](photo.png)', '[[Actual]]',
  ].join('\n'));
  assert.deepEqual(parsed.links, [{ target: 'Actual', kind: 'wikilink' }]);
  const model = buildGraphModel([note('a', 'A', '[[https://example.com/x]] [[#Heading]]')], { folders });
  assert.deepEqual(model.edges, []);
  assert.deepEqual(model.diagnostics, []);
});

test('odd escaped link delimiters are ignored, while even backslashes preserve real links', () => {
  const backslash = '\\';
  const parsed = extractNoteLinks([
    `${backslash}[[Escaped]]`, `${backslash.repeat(3)}[[Also escaped]]`,
    `${backslash.repeat(2)}[[Real]]`, `${backslash.repeat(4)}[[Also real]]`,
    `${backslash}[escaped](Hidden.md)`, `${backslash.repeat(3)}[escaped](Hidden2.md)`,
    `${backslash.repeat(2)}[real](Visible.md)`, `${backslash.repeat(4)}[real](Visible2.md)`,
    `!${backslash}[[Escaped embed]]`, `[[Escaped closing${backslash}]]`,
    `[escaped closing${backslash}](Hidden3.md)`, `${backslash}![[Not an embed]]`,
  ].join('\n'));
  assert.deepEqual(parsed.links, [
    { target: 'Real', kind: 'wikilink' }, { target: 'Also real', kind: 'wikilink' },
    { target: 'Not an embed', kind: 'wikilink' },
    { target: 'Visible.md', kind: 'markdown' }, { target: 'Visible2.md', kind: 'markdown' },
  ]);
});

test('frontmatter aliases are scoped lookup keys; tags are metadata rather than invented edges', () => {
  const model = buildGraphModel([
    note('home', 'Home', '[[First name]] [[Second name]] [[Third name]]'),
    note('a', 'Alpha', '---\naliases: ["First name", Second name]\ntags: [garden, reference]\n---\nBody'),
    note('b', 'Beta', '---\naliases:\n  - Third name\ntags:\n  - systems\n---\nBody'),
  ], { folders });
  assert.deepEqual(targets(model, 'home'), ['a', 'b']);
  assert.deepEqual(model.nodes.find(node => node.id === 'a').tags, ['garden', 'reference']);
  assert.deepEqual(model.nodes.find(node => node.id === 'b').aliases, ['Third name']);
});

test('matching root uses the longest registered folder, never a sibling or enclosing vault', () => {
  const model = buildGraphModel([
    note('outer', 'Outer', '[[Same]]', '/vault/Outer.md'),
    note('inner', 'Inner', '[[Same]]', '/vault/nested/Inner.md'),
    note('a', 'Same', '', '/vault/Same.md'), note('b', 'Same', '', '/vault/nested/Same.md'),
    note('other', 'Same', '', '/other/Same.md'),
  ], { folders: [...folders, { id: 'nested', path: '/vault/nested' }, { id: 'other', path: '/other' }] });
  assert.deepEqual(targets(model, 'outer'), ['a']);
  assert.deepEqual(targets(model, 'inner'), ['b']);
  assert.equal(model.nodes.find(node => node.id === 'inner').scope, 'folder:/vault/nested');
});

test('folder boundary cannot accidentally match a similarly named sibling', () => {
  const model = buildGraphModel([
    note('home', 'Home', '[[Target]]', '/vault-other/Home.md'),
    note('a', 'Target', '', '/vault/Target.md'),
  ], { folders });
  assert.deepEqual(model.edges, []);
  assert.equal(model.diagnostics[0].status, 'unresolved');
});

test('duplicate basenames or aliases are diagnosed rather than arbitrarily connected', () => {
  const model = buildGraphModel([
    note('home', 'Home', '[[Same]] [[Shared alias]] [[sub/Same]]'),
    note('a', 'Same', '---\naliases: Shared alias\n---', '/vault/sub/Same.md'),
    note('b', 'Same', '---\naliases: Shared alias\n---', '/vault/other/Same.md'),
  ], { folders });
  assert.deepEqual(targets(model, 'home'), ['a']);
  assert.equal(model.diagnostics.length, 2);
  assert.ok(model.diagnostics.every(item => item.status === 'ambiguous'));
  assert.deepEqual(model.diagnostics[0].candidateIds, ['a', 'b']);
});

test('explicit relative wikilinks disambiguate; ambiguous root-versus-relative paths stay unresolved', () => {
  const model = buildGraphModel([
    note('home', 'Home', '[[./Target]] [[sub/Target]]', '/vault/sub/Home.md'),
    note('a', 'Target', '', '/vault/sub/Target.md'), note('b', 'Target', '', '/vault/sub/sub/Target.md'),
  ], { folders });
  assert.deepEqual(targets(model, 'home'), ['a']);
  assert.equal(model.diagnostics[0].status, 'ambiguous');
});

test('unregistered directories do not gain cross-directory basename fallback', () => {
  const model = buildGraphModel([
    note('home', 'Home', '[[Target]] [escape](../other/Target.md)', '/unknown/Home.md'),
    note('a', 'Target', '', '/other/Target.md'),
  ]);
  assert.deepEqual(model.edges, []);
  assert.equal(model.diagnostics.length, 2);
});

test('relative traversal outside a registered vault never resolves against another root', () => {
  const model = buildGraphModel([
    note('home', 'Home', '[escape](../../outside/Target.md)'),
    note('a', 'Target', '', '/outside/Target.md'),
  ], { folders: [...folders, { id: 'outside', path: '/outside' }] });
  assert.deepEqual(model.edges, []);
  assert.equal(model.diagnostics[0].status, 'unresolved');
});

test('GitHub links remain scoped to repository and ref, even for refs containing slashes', () => {
  const github = (id, repository, ref, path, text = '') => note(id, path.split('/').at(-1), text,
    `github://${repository}/${ref}/${path}`, {
      sourceMetadata: { kind: 'github', repository, ref, path, commitSha: 'a'.repeat(40), blobSha: 'b'.repeat(40) },
    });
  const model = buildGraphModel([
    github('home', 'org/repo', 'feature/notes', 'docs/Home.md', '[[Target]] [relative](./Target.md)'),
    github('right', 'org/repo', 'feature/notes', 'docs/Target.md'),
    github('other-ref', 'org/repo', 'main', 'docs/Target.md'),
    github('other-repo', 'org/other', 'feature/notes', 'docs/Target.md'),
    note('local', 'Target'),
  ], { folders });
  assert.deepEqual(targets(model, 'home'), ['right']);
  assert.deepEqual(model.edges[0].kinds, ['wikilink', 'markdown']);
});

test('GitHub display URIs without provenance are not guessed into a repository/ref scope', () => {
  const model = buildGraphModel([
    note('home', 'Home', '[[Target]]', 'github://org/repo/feature/notes/Home.md'),
    note('target', 'Target', '', 'github://org/repo/feature/notes/Target.md'),
  ]);
  assert.deepEqual(model.edges, []);
  assert.equal(model.diagnostics[0].status, 'unresolved');
});

test('native notes link by title only within the native-note scope', () => {
  const model = buildGraphModel([
    note('home', 'Home', '[[Target]]', undefined, { sourcePath: undefined }),
    note('native', 'Target', '', undefined, { sourcePath: undefined }),
    note('local', 'Target'),
  ], { folders });
  assert.deepEqual(targets(model, 'home'), ['native']);
});

test('stored source IDs are explicit cross-scope references; missing IDs are diagnosed', () => {
  const model = buildGraphModel([
    note('home', 'Home', '[[Target]]', undefined, { sourcePath: undefined, sourceIds: ['a', 'missing', 'home'] }),
    note('a', 'Target'),
  ], { folders });
  assert.deepEqual(targets(model, 'home'), ['a']);
  assert.deepEqual(model.edges[0].kinds, ['source']);
  assert.equal(model.diagnostics.length, 2);
});

test('repeated and reciprocal note links deduplicate with correct degree; no self edges', () => {
  const model = buildGraphModel([
    note('a', 'Alpha', '[[Beta]] ![[Beta]] [[Alpha]]', '/vault/Alpha.md', { sourceIds: ['b'] }),
    note('b', 'Beta', '[[Alpha]]'),
    note('orphan', 'Lonely'),
  ], { folders });
  assert.equal(model.edges.length, 1);
  assert.deepEqual(model.edges[0].kinds, ['source', 'wikilink', 'embed']);
  assert.deepEqual(model.nodes.map(node => node.degree), [1, 1, 0]);
});

test('one and two hop neighborhoods are based only on real edges', () => {
  const model = buildGraphModel([note('a', 'A', '[[B]]'), note('b', 'B', '[[C]]'), note('c', 'C'), note('d', 'D')], { folders });
  assert.deepEqual([...graphNeighbors(model.edges, 'a', 1)].sort(), ['a', 'b']);
  assert.deepEqual([...graphNeighbors(model.edges, 'a', 2)].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...graphNeighbors(model.edges, null)], []);
  assert.deepEqual(layoutGraph(model, { selectedId: 'a', focusDepth: 1 }).nodes.map(node => node.id), ['a', 'b']);
  assert.equal(layoutGraph(model, { showOrphans: false }).nodes.length, 3);
});

test('layout is deterministic, finite, bounded and leaves the input untouched', () => {
  const model = buildGraphModel(Array.from({ length: 80 }, (_, index) => note(`n${index}`, `Note ${index}`, index ? `[[Note ${index - 1}]]` : '')), { folders });
  const original = JSON.stringify(model);
  const layout = layoutGraph(model, { width: 600, height: 360 });
  assert.deepEqual(layout, layoutGraph(model, { width: 600, height: 360 }));
  assert.equal(JSON.stringify(model), original);
  assert.ok(layout.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y) && node.x >= 30 && node.x <= 570 && node.y >= 30 && node.y <= 330));
  assert.ok(new Set(layout.nodes.map(node => `${node.x},${node.y}`)).size > 70);
  assert.ok(layout.nodes.find(node => node.id === 'n1').radius > layout.nodes.find(node => node.id === 'n79').radius);
});

test('folder-cluster layout retains the exact same relationship graph', () => {
  const model = buildGraphModel([
    note('a', 'Alpha', '[[Beta]]', '/vault/ideas/Alpha.md'), note('b', 'Beta', '', '/vault/projects/Beta.md'),
  ], { folders });
  const force = layoutGraph(model);
  const clustered = layoutGraph(model, { mode: 'structure' });
  assert.deepEqual(force.edges, clustered.edges);
  assert.equal(clustered.groups.length, 2);
  assert.ok(clustered.groups.every(group => /^#/.test(group.color)));
});

test('render cap is hard, selected neighbors survive it and large input does not cause quadratic layout growth', () => {
  const objects = Array.from({ length: 4000 }, (_, index) => note(`n${index}`, `N ${index}`,
    index === 3999 ? '[[N 3998]]' : ''));
  const start = performance.now();
  const model = buildGraphModel(objects, { folders });
  const layout = layoutGraph(model, { maxNodes: 100000, selectedId: 'n3999' });
  assert.equal(layout.nodes.length, GRAPH_NODE_LIMIT);
  assert.equal(layout.omittedNodes, 3700);
  assert.ok(layout.nodes.some(node => node.id === 'n3999'));
  assert.ok(layout.nodes.some(node => node.id === 'n3998'));
  assert.ok(performance.now() - start < 5000, 'bounded graph preparation should finish comfortably within five seconds');
});

test('text, link and object scan limits are explicit diagnostics, not silent completeness claims', () => {
  const model = buildGraphModel([note('a', 'A', `${'x'.repeat(33000)}[[Missing]]`)]);
  assert.equal(model.diagnostics[0].status, 'truncated');
  const links = extractNoteLinks('[[A]] '.repeat(200));
  assert.equal(links.links.length, 128);
  assert.equal(links.truncated, true);
  const large = buildGraphModel(Array.from({ length: 10002 }, (_, index) => note(`n${index}`, `N${index}`)));
  assert.equal(large.nodes.length, 10000);
  assert.equal(large.omittedObjects, 2);
});

test('empty, singleton and invalid layout dimensions stay safe', () => {
  assert.deepEqual(layoutGraph(buildGraphModel([])).nodes, []);
  const layout = layoutGraph(buildGraphModel([note('a', 'A')]), { width: NaN, height: Infinity, maxNodes: NaN });
  assert.equal(layout.nodes.length, 1);
  assert.ok(Number.isFinite(layout.nodes[0].x));
  assert.ok(Number.isFinite(layout.nodes[0].y));
});
