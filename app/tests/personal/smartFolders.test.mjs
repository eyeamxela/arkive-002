import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSmartFolders } from '../../src/personal/smartFolders.mjs';
const object = (id, path, title = id, text = '') => ({ id, title, text, kind: 'note', sourcePath: path, sourceIds: [] });
test('approved cabinet categories retain reference order and materials without overriding saved colors', () => {
  const objects = ['business','personal','projects','creative'].map(name=>object(name,`/vault/${name}/note.md`));
  objects.push(object('loose'));
  const model = buildSmartFolders(objects,[{path:'/vault'}]);
  assert.deepEqual(model.folders.map(({name,color})=>[name,color]),[
    ['Inbox','#f4bc59'],['Creative','#f2f3ee'],['Projects','#999d7e'],['Personal','#080d09'],['Business','#a3b7a8'],
  ]);
  assert.equal(buildSmartFolders(objects,[{path:'/vault'}],{colors:[{folder:'Inbox',color:'#123456'}]}).folders[0].color,'#123456');
});
test('automatically groups every imported source by root-relative folder without stored collections or writes', () => {
  const objects = [object('a','/vault/projects/arkive/a.md'),object('b','/vault/resources/b.md'),object('c','/vault/root.md'),object('d','/vault/projects/other/d.md')];
  const before = structuredClone(objects), model = buildSmartFolders(objects, [{ id:'v', path:'/vault' }]);
  assert.deepEqual(model.folders.map(item => [item.name,item.sourceIds]), [['Inbox',['c']],['Projects',['a','d']],['Resources',['b']]]);
  assert.deepEqual(objects,before); assert.equal(model.assignments.size,4);
});
test('nested roots win; GitHub paths group; unknown local roots cannot become source folders', () => {
  const sources = [object('a','/vault/nested/projects/a.md'),object('b','/unregistered/private/a.md'), { ...object('c'), sourceMetadata:{path:'resources/c.md'} }];
  const model = buildSmartFolders(sources,[{path:'/vault'},{path:'/vault/nested'}]);
  assert.equal(model.assignments.get('a').folder,'Projects'); assert.equal(model.assignments.get('b').folder,'Inbox'); assert.equal(model.assignments.get('c').folder,'Resources');
});
test('loose notes use conservative local rules, ambiguous notes go to Inbox and refinements override rescans', () => {
  const objects = [object('a',undefined,'Project roadmap'),object('b',undefined,'Research resources'),object('c','/vault/projects/c.md')];
  const model = buildSmartFolders(objects,[{path:'/vault'}],{overrides:[{sourceId:'c',folder:'My work'}],colors:[{folder:'My work',color:'#123456'}]});
  assert.equal(model.assignments.get('a').folder,'Projects'); assert.equal(model.assignments.get('b').folder,'Inbox');
  assert.equal(model.assignments.get('c').folder,'My work'); assert.match(model.assignments.get('c').reason,/refinement/); assert.equal(model.folders.find(item=>item.name==='My work').color,'#123456');
});
test('smart folders have no 1,000-source truncation, exclude code snapshots and expose nothing to members', () => {
  const objects = Array.from({length:1205},(_,i)=>object(String(i),`/vault/projects/${i}.md`));
  objects.push({...object('code'),kind:'code_graph'});
  assert.equal(buildSmartFolders(objects,[{path:'/vault'}]).folders[0].sourceIds.length,1205);
  assert.deepEqual(buildSmartFolders(objects,[{path:'/vault'}],undefined,true).folders,[]);
});
