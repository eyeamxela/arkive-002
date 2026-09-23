import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { FIXTURE_ENV, FIXTURE_IDENTITY, FIXTURE_SCOPE, filterRows } from './fixtureSupport.mjs';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';

Object.assign(process.env, FIXTURE_ENV);
const root = fileURLToPath(new URL('../', import.meta.url));
const built = await build({stdin:{contents:`export * as chat from './convex/chat'; export * as workspace from './convex/workspace'; export * as ops from './convex/ops'; export * as proposals from './convex/proposals'; export * as documents from './convex/documents'; export * as auth from './convex/auth'; export * as integrity from './convex/integrity'; export * as panels from './convex/panels'; export * as messages from './convex/messages'; export * as session from './convex/session'; export * as seed from './convex/seed';`,resolveDir:root},bundle:true,write:false,platform:'node',format:'esm'});
const modules = await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));

function fixture({policy=true}={}) {
  const tables = new Map(); const queued=[]; let seq=0;
  const table=(name)=>{if(!tables.has(name))tables.set(name,[]);return tables.get(name);};
  const db={
    async get(id){return [...tables.values()].flat().find((r)=>r._id===id)??null;},
    async insert(name,value){const id=name+':'+(++seq);table(name).push({...FIXTURE_SCOPE,...structuredClone(value),_id:id,_creationTime:Date.now()});return id;},
    async patch(id,value){const row=await this.get(id);if(!row)throw Error('Missing '+id);Object.assign(row,structuredClone(value));},
    async delete(id){for(const rows of tables.values()){const i=rows.findIndex((r)=>r._id===id);if(i>=0)rows.splice(i,1);}},
    query(name){let rows=table(name);const q={filter(predicate){rows=filterRows(rows,predicate);return q;},withIndex(_name,filter){if(filter){const criteria=[];const eq={eq(k,v){criteria.push([k,v]);return eq;}};filter(eq);rows=rows.filter((r)=>criteria.every(([k,v])=>r[k]===v));}return q;},order(){rows=[...rows].reverse();return q;},async collect(){return structuredClone(rows);},async first(){return structuredClone(rows[0]??null);},async take(n){return structuredClone(rows.slice(0,n));}};return q;}
  };
  const ctx={db,auth:{async getUserIdentity(){return FIXTURE_IDENTITY;}},scheduler:{async runAfter(delay,fn,args){queued.push({delay,fn,args});}}};
  async function invoke(fn,args={}) {const before=structuredClone(tables),beforeQueue=queued.length;try{return await fn._handler(ctx,args);}catch(e){tables.clear();for(const [key,value]of before)tables.set(key,value);queued.length=beforeQueue;throw e;}}
  const addDoc=(overrides={})=>db.insert('brainObjects',{type:'source',path:'inbox/a.md',title:'A',tier:'inbox',authority:'original',lifecycle:'active',provenance:'fixture',fixture:true,hash:'sha256:a',derivedFrom:[],relations:[],permissions:{owner:'you',sensitivity:'private'},reviewStatus:'unreviewed',starred:false,alwaysLoad:false,createdAt:1,modifiedAt:1,...overrides});
  if(policy)table('tierPolicy').push({...FIXTURE_SCOPE,_id:'tierPolicy:default',canon:'index',curated:'index',dashboards:'index',legal:'index',inbox:'index',dreams:'exclude'});
  return {db,ctx,invoke,queued,addDoc,table};
}

test('send snapshot equals preview; later selection cannot leak; replay is idempotent',async()=>{
  const f=fixture();const a=await f.addDoc(),b=await f.addDoc({path:'inbox/b.md',hash:'sha256:b'});
  const args={room:'xela',deny:false,selectionIds:[a]};
  const preview=await f.invoke(modules.workspace.get,args);
  const id=await f.invoke(modules.chat.sendMessage,{...args,text:'hello'});
  const snapshot=await f.db.get(id);assert.deepEqual(snapshot.documents,preview.context.documents);
  await f.addDoc({path:'inbox/c.md',hash:'sha256:c'});
  await f.invoke(modules.chat.reply,{snapshotId:id});await f.invoke(modules.chat.reply,{snapshotId:id});
  const replies=f.table('messages').filter((m)=>m.role==='ag');assert.equal(replies.length,1);assert.deepEqual(replies[0].cites,['inbox/a.md']);assert.match(replies[0].text,/Simulation only/);assert(!replies[0].cites.includes(b));
});

test('policy revocation cancels queued reply instead of silently recomputing',async()=>{
  const f=fixture();await f.addDoc();
  const p='tierPolicy:default';await f.db.patch(p,{canon:'index',curated:'index',dashboards:'index',legal:'index',inbox:'index',dreams:'exclude'});
  const id=await f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,text:'test'});
  await f.db.patch(p,{inbox:'exclude'});await f.invoke(modules.chat.reply,{snapshotId:id});
  assert.deepEqual(f.table('messages')[1].cites,[]);assert.match(f.table('messages')[1].text,/cancelled/);
});

test('explicit curated selection and manifest override default canon scope, never policy exclusions',async()=>{
  const f=fixture();const curated=await f.addDoc({path:'curated/a.md',tier:'curated'});
  assert.equal((await f.invoke(modules.workspace.get,{room:'xela',deny:true})).scopeCount,0);
  assert.equal((await f.invoke(modules.workspace.get,{room:'xela',deny:true,selectionIds:[curated]})).scopeCount,1);
  await f.invoke(modules.ops.manifestSign,{room:'xela',docPaths:['curated/a.md'],tiers:'curated',ttl:'session',brief:'pin'});
  const manifestId=f.table('manifests')[0]._id;
  assert.equal((await f.invoke(modules.workspace.get,{room:'xela',deny:true,manifestId})).scopeCount,1);
  await f.db.patch('tierPolicy:default',{canon:'index',curated:'exclude',dashboards:'index',legal:'index',inbox:'index',dreams:'exclude'});
  assert.equal((await f.invoke(modules.workspace.get,{room:'xela',deny:true,selectionIds:[curated]})).scopeCount,0);
});

test('archiving or moving pinned document cancels reply and excludes later scope',async()=>{
  for(const change of [{lifecycle:'archived'},{tier:'legal'},{path:'dreams/a.md'}]){
    const f=fixture();const doc=await f.addDoc();const snapshotId=await f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,text:'hello'});
    await f.db.patch(doc,change);await f.invoke(modules.chat.reply,{snapshotId});assert.match(f.table('messages')[1].text,/cancelled/);
    if(change.lifecycle || change.path)assert.equal((await f.invoke(modules.workspace.get,{room:'xela',deny:false})).scopeCount,0);
  }
});

test('manifest hashes, cross-room isolation and explicit empty selection',async()=>{
  const f=fixture();const a=await f.addDoc();await f.addDoc({path:'canon/z.md',tier:'canon',hash:'sha256:z',alwaysLoad:true});
  const key=await f.invoke(modules.ops.manifestSign,{room:'xela',docPaths:['inbox/a.md'],tiers:'inbox',ttl:'session',brief:'pin'});
  const m=f.table('manifests')[0];assert.equal(m.key,key);assert.deepEqual(m.docHashes,['sha256:a']);
  const w=await f.invoke(modules.workspace.get,{room:'xela',deny:false,selectionIds:[a],manifestId:m._id});assert.deepEqual(w.context.documents.map((d)=>d._id),[a]);
  const foreign = await f.invoke(modules.workspace.get,{room:'other',deny:false,manifestId:m._id});
  assert.match(foreign.contextError,/belong/);assert.equal(foreign.scopeCount,0);assert.equal(foreign.manifestKey,null);
  await assert.rejects(f.invoke(modules.chat.sendMessage,{room:'other',deny:false,manifestId:m._id,text:'no foreign room'}),/belong/);
  assert.equal((await f.invoke(modules.workspace.get,{room:'xela',deny:false,selectionIds:[]})).scopeCount,0);
});

test('loaded room manifest governs preview, snapshot and queued response without explicit manifest parameter',async()=>{
  const f=fixture();const a=await f.addDoc();await f.addDoc({path:'inbox/b.md',hash:'sha256:b'});
  await f.invoke(modules.ops.manifestSign,{room:'xela',objectIds:[a],docPaths:['inbox/a.md'],tiers:'inbox',ttl:'session',brief:'A'});
  const manifest=f.table('manifests')[0];
  const preview=await f.invoke(modules.workspace.get,{room:'xela',deny:true});
  assert.equal(preview.manifestKey,manifest.key);assert.equal(preview.context.manifestId,manifest._id);assert.equal(preview.contextError,null);
  assert.deepEqual(preview.context.documents.map(doc=>doc._id),[a]);
  const snapshotId=await f.invoke(modules.chat.sendMessage,{room:'xela',deny:true,text:'same scope'});
  const snapshot=await f.db.get(snapshotId);assert.deepEqual(snapshot.documents,preview.context.documents);assert.equal(snapshot.manifestId,manifest._id);
  await f.invoke(modules.chat.reply,{snapshotId});assert.deepEqual(f.table('messages').at(-1).cites,['inbox/a.md']);
});

test('persistent manifest revocation blocks queued and new uses and is audited only once',async()=>{
  const f=fixture();const a=await f.addDoc();const b=await f.addDoc({path:'canon/b.md',tier:'canon',hash:'sha256:b',alwaysLoad:true});
  await f.invoke(modules.ops.manifestSign,{room:'xela',objectIds:[a],docPaths:['inbox/a.md'],tiers:'inbox',ttl:'session',brief:'A'});
  const id=f.table('manifests')[0]._id;
  const snapshotId=await f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,text:'queued'});
  await f.invoke(modules.ops.manifestRevoke,{id});const auditCount=f.table('auditEvents').length;
  await f.invoke(modules.ops.manifestRevoke,{id});assert.equal(f.table('auditEvents').length,auditCount);
  assert.equal((await f.db.get(id)).state,'revoked');assert((await f.db.get(id)).revokedAt);assert.equal(f.table('auditEvents').at(-1).kind,'revoke');
  assert.equal(f.table('rooms')[0].activeManifestId,id);
  const preview=await f.invoke(modules.workspace.get,{room:'xela',deny:false});assert.equal(preview.scopeCount,0);assert.match(preview.contextError,/no longer/);assert.equal(preview.manifestState,'revoked');
  await assert.rejects(f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,text:'blocked default'}),/no longer/);
  await assert.rejects(f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,manifestId:id,selectionIds:[b],text:'blocked explicit manifest'}),/no longer/);
  await assert.rejects(f.invoke(modules.ops.manifestRollback,{id}),/no longer/);
  await f.invoke(modules.chat.reply,{snapshotId});assert.match(f.table('messages').at(-1).text,/cancelled/);assert.deepEqual(f.table('messages').at(-1).cites,[]);
  // Choosing an explicit fresh scope is deliberate; merely revoking is not.
  const fresh=await f.invoke(modules.workspace.get,{room:'xela',deny:false,selectionIds:[b]});assert.equal(fresh.contextError,null);assert.equal(fresh.manifestKey,null);assert.deepEqual(fresh.context.documents.map(doc=>doc._id),[b]);
  const empty=await f.invoke(modules.workspace.get,{room:'xela',deny:false,selectionIds:[]});assert.equal(empty.scopeCount,0);assert.equal(empty.contextError,null);
  const emptySnapshotId=await f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,selectionIds:[],text:'explicit no sources'});assert.deepEqual((await f.db.get(emptySnapshotId)).documents,[]);assert.equal((await f.db.get(emptySnapshotId)).manifestId,undefined);
});

test('rollback restores a valid exact scope and rejects expired, revoked, missing and unsupported TTL manifests without pointer mutation',async()=>{
  const f=fixture();const a=await f.addDoc();const b=await f.addDoc({path:'inbox/b.md',hash:'sha256:b'});
  for(const [doc,path]of [[a,'inbox/a.md'],[b,'inbox/b.md']])await f.invoke(modules.ops.manifestSign,{room:'xela',objectIds:[doc],docPaths:[path],tiers:'inbox',ttl:'session',brief:path});
  const [old,current]=f.table('manifests');await f.invoke(modules.ops.manifestRollback,{id:old._id});
  assert.equal(f.table('rooms')[0].activeManifestId,old._id);
  const preview=await f.invoke(modules.workspace.get,{room:'xela',deny:false});assert.deepEqual(preview.context.documents.map(doc=>doc._id),[a]);
  const snapshotId=await f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,text:'loaded rollback scope'});assert.deepEqual((await f.db.get(snapshotId)).documents,preview.context.documents);assert.equal((await f.db.get(snapshotId)).manifestId,old._id);
  const audits=f.table('auditEvents').length;await f.invoke(modules.ops.manifestRollback,{id:old._id});assert.equal(f.table('auditEvents').length,audits);
  for(const changes of [{createdAt:1},{state:'expired'},{state:'revoked'},{ttl:'until-revoked'},{revokedAt:1}]){
    await f.db.patch(current._id,{createdAt:Date.now(),state:'active',ttl:'session',revokedAt:undefined,...changes});
    await assert.rejects(f.invoke(modules.ops.manifestRollback,{id:current._id}));assert.equal(f.table('rooms')[0].activeManifestId,old._id);
    const invalid=await f.invoke(modules.workspace.get,{room:'xela',deny:false,manifestId:current._id});assert(invalid.contextError);assert.equal(invalid.scopeCount,0);
  }
  await assert.rejects(f.invoke(modules.ops.manifestRollback,{id:'manifests:missing'}),/unavailable/);
  await assert.rejects(f.invoke(modules.workspace.get,{room:'xela',deny:false,manifestId:'manifests:missing'}),/unavailable/);
});

test('new manifest object bindings never expand to other objects sharing the hash and detect source drift',async()=>{
  const f=fixture();const a=await f.addDoc();await f.addDoc({path:'legal/same-content.md',tier:'legal',hash:'sha256:a'});
  await f.invoke(modules.ops.manifestSign,{room:'xela',objectIds:[a],docPaths:['inbox/a.md'],tiers:'inbox',ttl:'session',brief:'one exact object'});
  const manifest=f.table('manifests')[0];assert.deepEqual(manifest.documents,[{objectId:a,hash:'sha256:a',path:'inbox/a.md',tier:'inbox'}]);
  assert.deepEqual((await f.invoke(modules.workspace.get,{room:'xela',deny:false})).context.documents.map(doc=>doc._id),[a]);
  await f.db.patch(a,{hash:'sha256:changed'});
  const preview=await f.invoke(modules.workspace.get,{room:'xela',deny:false});assert.match(preview.contextError,/source changed/);assert.equal(preview.scopeCount,0);
  await assert.rejects(f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,text:'do not replace my source'}),/source changed/);
  await assert.rejects(f.invoke(modules.ops.manifestRollback,{id:manifest._id}),/source changed/);
});

test('sign validates exact path/object correspondence, active source eligibility and ambiguous path fallback',async()=>{
  const f=fixture();const a=await f.addDoc();const b=await f.addDoc({path:'inbox/b.md',hash:'sha256:b'});
  const args={room:'xela',objectIds:[a],docPaths:['inbox/b.md'],tiers:'inbox',ttl:'session',brief:'invalid'};
  await assert.rejects(f.invoke(modules.ops.manifestSign,args),/do not match/);assert.equal(f.table('manifests').length,0);
  await f.db.patch(b,{lifecycle:'archived'});await assert.rejects(f.invoke(modules.ops.manifestSign,{...args,objectIds:[b]}),/unavailable/);
  await f.addDoc();await assert.rejects(f.invoke(modules.ops.manifestSign,{...args,objectIds:undefined,docPaths:['inbox/a.md']}),/ambiguous/);
  await f.invoke(modules.ops.manifestSign,{...args,objectIds:[a,a],docPaths:['inbox/a.md']});assert.equal(f.table('manifests')[0].n,1);
});

test('ask policy fails closed despite always-load and selection; include re-enables eligible memory context',async()=>{
  const f=fixture();const a=await f.addDoc({type:'memory',tier:'curated',path:'curated/memory.md',alwaysLoad:true});
  await f.db.patch('tierPolicy:default',{canon:'index',curated:'exclude',dashboards:'index',legal:'index',inbox:'index',dreams:'exclude'});
  const args={room:'xela',deny:true,selectionIds:[a]};
  assert.equal((await f.invoke(modules.workspace.get,args)).scopeCount,0);
  await f.invoke(modules.ops.policySet,{tier:'curated',mode:'include'});assert.equal((await f.invoke(modules.workspace.get,args)).scopeCount,1);
  const snapshotId=await f.invoke(modules.chat.sendMessage,{...args,text:'memory'});
  await f.invoke(modules.ops.policySet,{tier:'curated',mode:'ask'});assert.equal((await f.invoke(modules.workspace.get,args)).scopeCount,0);
  await assert.rejects(f.invoke(modules.ops.manifestSign,{room:'xela',objectIds:[a],docPaths:['curated/memory.md'],tiers:'curated',ttl:'session',brief:'blocked'}),/ask tier/);
  await f.invoke(modules.chat.reply,{snapshotId});assert.match(f.table('messages').at(-1).text,/cancelled/);
  await assert.rejects(f.invoke(modules.ops.policySet,{tier:'curated',mode:'allow'}),/Unsupported/);
  await f.invoke(modules.ops.policySet,{tier:'curated',mode:'include'});assert.equal((await f.invoke(modules.workspace.get,args)).scopeCount,1);
});

test('legacy fixture manifests still resolve fixture paths without matching unmarked real documents',async()=>{
  const f=fixture();const a=await f.addDoc();await f.addDoc({path:'inbox/real.md',fixture:false,hash:'sha256:real'});
  const id=await f.db.insert('manifests',{key:'legacy',room:'xela',docHashes:['inbox/a.md','inbox/real.md'],n:2,tiers:'inbox',ttl:'session',state:'active',brief:'legacy fixture',createdAt:Date.now()});
  await f.db.insert('rooms',{key:'xela',activeManifestId:id});
  const preview=await f.invoke(modules.workspace.get,{room:'xela',deny:false});assert.deepEqual(preview.context.documents.map(doc=>doc._id),[a]);
});

test('preview fingerprint prevents a room pointer change from expanding scope before send',async()=>{
  const f=fixture();const a=await f.addDoc();const b=await f.addDoc({path:'legal/b.md',tier:'legal',hash:'sha256:b'});
  await f.invoke(modules.ops.manifestSign,{room:'xela',objectIds:[a],docPaths:['inbox/a.md'],tiers:'inbox',ttl:'session',brief:'A'});
  const preview=await f.invoke(modules.workspace.get,{room:'xela',deny:false});assert.equal(typeof preview.contextFingerprint,'string');
  await f.invoke(modules.ops.manifestSign,{room:'xela',objectIds:[a,b],docPaths:['inbox/a.md','legal/b.md'],tiers:'inbox+legal',ttl:'session',brief:'B'});
  const before={messages:f.table('messages').length,snapshots:f.table('contextSnapshots').length,queued:f.queued.length,audits:f.table('auditEvents').length};
  await assert.rejects(f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,text:'reviewed only A',expectedContextFingerprint:preview.contextFingerprint}),/Context changed; review/);
  assert.deepEqual({messages:f.table('messages').length,snapshots:f.table('contextSnapshots').length,queued:f.queued.length,audits:f.table('auditEvents').length},before);
  const fresh=await f.invoke(modules.workspace.get,{room:'xela',deny:false});assert.notEqual(fresh.contextFingerprint,preview.contextFingerprint);
  const id=await f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,text:'reviewed updated scope',expectedContextFingerprint:fresh.contextFingerprint});assert.deepEqual((await f.db.get(id)).documents,fresh.context.documents);
});

test('preview fingerprints reject changed content, source membership and policies before send with no partial writes',async()=>{
  for(const kind of ['hash','policy','membership']){
    const f=fixture();const a=await f.addDoc();
    const policy='tierPolicy:default';await f.db.patch(policy,{canon:'index',curated:'index',dashboards:'index',legal:'index',inbox:'index',dreams:'exclude'});
    const preview=await f.invoke(modules.workspace.get,{room:'xela',deny:false});
    if(kind==='hash')await f.db.patch(a,{hash:'sha256:revised'});
    else if(kind==='policy')await f.db.patch(policy,{legal:'exclude'});
    else await f.addDoc({path:'inbox/new.md',hash:'sha256:new'});
    await assert.rejects(f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,text:'stale preview',expectedContextFingerprint:preview.contextFingerprint}),/Context changed; review/);
    assert.equal(f.table('messages').length,0);assert.equal(f.table('contextSnapshots').length,0);assert.equal(f.queued.length,0);
  }
});

test('preview fingerprint is stable across query order and rolling expiry; invalid context has no usable fingerprint',async()=>{
  const f=fixture();await f.addDoc();await f.addDoc({path:'inbox/b.md',hash:'sha256:b'});
  const preview=await f.invoke(modules.workspace.get,{room:'xela',deny:false});
  f.table('brainObjects').reverse();
  const reordered=await f.invoke(modules.workspace.get,{room:'xela',deny:false});assert.equal(reordered.contextFingerprint,preview.contextFingerprint);
  const id=await f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,text:'same reviewed scope',ttl:'24h',expectedContextFingerprint:preview.contextFingerprint});assert(id);
  await assert.rejects(f.invoke(modules.workspace.get,{room:'xela',deny:false,manifestId:'manifests:missing'}),/unavailable/);
});

test('sealed normalized paths rejected before proposal/source writes',async()=>{
  for(const path of ['dreams/a.md','inbox/../dreams/a','inbox/DREAMS/a','inbox\\dreams\\x','/inbox/a','inbox/ＤＲＥＡＭＳ/a']) assert.throws(()=>modules.integrity.safePath(path));
  const f=fixture();await assert.rejects(f.invoke(modules.ops.proposalsAdd,{items:[{kind:'note',conf:1,sourceRef:'x',brief:'x',diff:[],targetPath:'dreams/a.md'}]}));assert.equal(f.table('proposals').length,0);
  await assert.rejects(f.invoke(modules.documents.ingest,{path:'dreams/a.md',content:'secret'}));assert.equal(f.table('brainObjects').length,0);
});

test('proposal consent, task materialization, provenance and supersession are atomic',async()=>{
  const f=fixture();const source=await f.addDoc();const prior=await f.addDoc({path:'curated/task.md',type:'note'});
  const p=await f.db.insert('proposals',{kind:'task',state:'pending',consent:true,conf:1,sourceRef:'inbox/a.md',brief:'Do thing',diff:[],targetPath:'curated/task.md',targetTier:'curated',createdAt:1});
  await assert.rejects(f.invoke(modules.proposals.accept,{id:p}),/consent/);assert.equal(f.table('tasks').length,0);
  const objectId=await f.invoke(modules.proposals.accept,{id:p,consent:true});
  const object=await f.db.get(objectId);assert.equal(object.content,'Do thing');assert.equal(object.derivedFrom[0].objectId,source);assert.equal((await f.db.get(prior)).supersededBy,objectId);assert.equal(f.table('tasks').length,1);
  await f.invoke(modules.proposals.accept,{id:p,consent:true});assert.equal(f.table('tasks').length,1);
});

test('paused assignments, duplicate dispatch, lease revocation and ownership checks',async()=>{
  const f=fixture();const agent=await f.db.insert('agents',{key:'hermes',paused:true,instructionsV:9});const task=await f.db.insert('tasks',{title:'T',status:'todo',sourceRef:'inbox/a.md'});await f.addDoc();
  await assert.rejects(f.invoke(modules.ops.workAssign,{taskId:task}),/paused/);
  await f.db.patch(agent,{paused:false});await f.invoke(modules.ops.workAssign,{taskId:task});await f.invoke(modules.ops.workAssign,{taskId:task});assert.equal(f.queued.length,1);
  const args=f.queued[0].args;const other=await f.db.insert('tasks',{title:'Other',status:'running',assignee:'hermes',sourceRef:'x'});
  await f.invoke(modules.ops.workComplete,{...args,taskId:other});assert.equal((await f.db.get(args.runId)).state,'running');
  await f.invoke(modules.ops.grantRevoke,{id:args.grantId});const auditCount=f.table('auditEvents').length;await f.invoke(modules.ops.grantRevoke,{id:args.grantId});assert.equal(f.table('auditEvents').length,auditCount);
  await f.invoke(modules.ops.workComplete,args);assert.equal((await f.db.get(args.runId)).state,'failed');assert.equal((await f.db.get(task)).status,'queued');
});

test('relation proposal materializes actual endpoint edge; missing endpoints roll back',async()=>{
  const f=fixture();const a=await f.addDoc(),b=await f.addDoc({path:'inbox/b.md'});
  const proposal=await f.db.insert('proposals',{kind:'relation',state:'pending',sourceRef:'co-citation',brief:'A relates to B',rel:['inbox/a.md','inbox/b.md'],diff:[],createdAt:1});
  await f.invoke(modules.proposals.accept,{id:proposal});assert((await f.db.get(a)).relations.some((e)=>e.to===b));
  const missing=await f.db.insert('proposals',{kind:'relation',state:'pending',sourceRef:'x',brief:'Missing relation',rel:['missing','inbox/a.md'],diff:[],createdAt:1});
  const count=f.table('brainObjects').length;await assert.rejects(f.invoke(modules.proposals.accept,{id:missing}),/two resolvable/);assert.equal(f.table('brainObjects').length,count);assert.equal((await f.db.get(missing)).state,'pending');
});

test('approval affects only selected run; grant request is idempotent; always-load audited',async()=>{
  const f=fixture();const a=await f.db.insert('runs',{key:'#a',state:'waiting'}),b=await f.db.insert('runs',{key:'#b',state:'waiting'});
  const grant=await f.db.insert('grants',{runId:a,principal:'hermes'});await f.invoke(modules.ops.approvalDecide,{runId:a,approve:true});assert.equal((await f.db.get(b)).state,'waiting');assert((await f.db.get(grant)).revokedAt);
  const request=await f.db.insert('accessRequests',{state:'pending',who:'A',what:'B',why:'C'});await f.invoke(modules.ops.requestDecide,{id:request,approve:true});await f.invoke(modules.ops.requestDecide,{id:request,approve:true});assert.equal(f.table('grants').length,2);
  const doc=await f.addDoc();await f.invoke(modules.ops.alwaysToggle,{id:doc});assert.equal(f.table('auditEvents').at(-1).kind,'policy');
});

test('approval completes only its owned linked task and does not clobber a competing run',async()=>{
  const f=fixture();const task=await f.db.insert('tasks',{title:'T',status:'running',assignee:'hermes'});
  const run=await f.db.insert('runs',{key:'#a',state:'waiting',agentKey:'hermes',taskId:task});
  await f.invoke(modules.ops.approvalDecide,{runId:run,approve:true});assert.equal((await f.db.get(task)).status,'done');assert.equal((await f.db.get(task)).evidenceRunId,run);
  const otherTask=await f.db.insert('tasks',{title:'Concurrent',status:'running',assignee:'hermes'});
  const waiting=await f.db.insert('runs',{key:'#b',state:'waiting',agentKey:'hermes',taskId:otherTask});await f.db.insert('runs',{key:'#c',state:'running',agentKey:'hermes',taskId:otherTask});
  await f.invoke(modules.ops.approvalDecide,{runId:waiting,approve:false});assert.equal((await f.db.get(otherTask)).status,'running');
});

test('normal simulated completion revokes lease and is idempotent',async()=>{
  const f=fixture();await f.db.insert('agents',{key:'hermes',paused:false,instructionsV:4});const task=await f.db.insert('tasks',{title:'T',status:'queued',sourceRef:'inbox/a.md'});await f.addDoc();
  await f.invoke(modules.ops.workAssign,{taskId:task});const args=f.queued[0].args;await f.invoke(modules.ops.workComplete,args);const audits=f.table('auditEvents').length;await f.invoke(modules.ops.workComplete,args);
  assert.equal(f.table('auditEvents').length,audits);assert.equal((await f.db.get(task)).evidenceRunId,args.runId);assert.equal((await f.db.get(args.runId)).cost,0);assert((await f.db.get(args.grantId)).revokedAt);
});

test('internal source original hash/export/restore and failed checksum rollback',async()=>{
  const f=fixture();const bytes=new TextEncoder().encode('abc').buffer;
  const row=await f.invoke(modules.documents.ingest,{path:'inbox/a.txt',content:'abc',originalBytes:bytes});assert.equal(row.hash,'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const exported=await f.invoke(modules.documents.exportSources);const restored=fixture();await restored.invoke(modules.documents.restoreSources,exported);await restored.invoke(modules.documents.restoreSources,exported);assert.equal(restored.table('brainObjects').length,1);assert.deepEqual(new Uint8Array(restored.table('brainObjects')[0].originalBytes),new Uint8Array(bytes));
  await assert.rejects(f.invoke(modules.documents.ingest,{path:'inbox/wrong.txt',content:'bad',expectedHash:row.hash}),/checksum/);assert.equal(f.table('brainObjects').length,1);
  assert.equal(modules.documents.ingest.isInternal,true);assert.equal(modules.documents.exportSources.isInternal,true);
});

test('source rejects mismatched text/bytes, empty/binary; library hides superseded originals',async()=>{
  const f=fixture();const bytes=new TextEncoder().encode('abc').buffer;
  await assert.rejects(f.invoke(modules.documents.ingest,{path:'inbox/a.txt',content:'different',originalBytes:bytes}),/exactly match/);
  await assert.rejects(f.invoke(modules.documents.ingest,{path:'inbox/a.txt',content:''}),/nonempty/);
  await assert.rejects(f.invoke(modules.documents.ingest,{path:'inbox/a.txt',content:'abc',mimeType:'application/pdf'}),/Binary/);
  const old=await f.invoke(modules.documents.ingest,{path:'inbox/a.txt',content:'old'});
  const current=await f.invoke(modules.documents.ingest,{path:'inbox/a.txt',content:'new'});
  assert.equal((await f.db.get(old._id)).supersededBy,current._id);assert.deepEqual((await f.invoke(modules.documents.list)).map((d)=>d._id),[current._id]);
});

test('every public endpoint denies anonymous and different verified principals before database access',async()=>{
  let checked=0;
  for(const module of Object.values(modules))for(const fn of Object.values(module)){
    if(typeof fn?._handler!=='function'||fn.isInternal)continue;
    for(const identity of [null,{...FIXTURE_IDENTITY,subject:'other'},{...FIXTURE_IDENTITY,issuer:'https://other.invalid'}]){
      const ctx={auth:{getUserIdentity:async()=>identity},db:new Proxy({},{get(){throw Error('Database reached before authentication');}})};
      await assert.rejects(fn._handler(ctx,{}),/Owner authentication required/);
    }
    checked++;
  }
  assert(checked>40, 'inventory must include all public entry points');
});

test('all server entry points use guarded builders; no action or HTTP bypass',()=>{
  for(const file of readdirSync(root+'convex').filter(f=>f.endsWith('.ts')&&!['auth.ts','auth.config.ts','schema.ts'].includes(f))){
    const source=readFileSync(root+'convex/'+file,'utf8');
    assert(!/import\s*\{[^}]*\b(query|mutation|action|httpAction|internalMutation|internalQuery)\b[^}]*\}\s*from\s*['"](?:\.\/_generated\/server|convex\/server)['"]/.test(source),file);
    assert(!/export\s+(const|function)\s+\w+\s*=\s*(?:action|httpAction)\s*\(/.test(source),file);
  }
});

test('missing configuration denies access and obsolete demo mode cannot bypass owner verification',async()=>{
  const before={...process.env};
  try{
    process.env.ARKIVE_DEMO_MODE='true';
    const f=fixture();f.ctx.auth.getUserIdentity=async()=>null;
    await assert.rejects(f.invoke(modules.session.current),/authentication required/);
    for(const key of Object.keys(FIXTURE_ENV)){
      Object.assign(process.env,FIXTURE_ENV);delete process.env[key];
      await assert.rejects(f.invoke(modules.session.current),/not configured/);
    }
  }finally{
    for(const key of [...Object.keys(FIXTURE_ENV),'ARKIVE_DEMO_MODE']){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
  }
});

test('owner reads and previews exclude foreign workspace, foreign owner and unscoped legacy rows',async()=>{
  const f=fixture();const own=await f.addDoc({tier:'canon',path:'canon/owned.md'});
  const foreign=[];
  for(const override of [{workspaceId:'different-workspace'},{ownerIdentity:'different-owner'},{workspaceId:undefined,ownerIdentity:undefined}]){
    foreign.push(await f.addDoc({path:'inbox/hidden.md',content:'foreign secret',...override}));
    await f.db.insert('messages',{room:'xela',text:'foreign secret',...override});
    await f.db.insert('auditEvents',{summary:'foreign secret',at:99,...override});
  }
  assert.deepEqual((await f.invoke(modules.documents.list)).map(x=>x._id),[own]);
  assert.deepEqual((await f.invoke(modules.panels.brainObjects)).map(x=>x._id),[own]);
  assert.deepEqual(await f.invoke(modules.messages.list,{room:'xela'}),[]);
  assert.deepEqual(await f.invoke(modules.panels.auditEvents,{limit:1}),[]);
  const preview=await f.invoke(modules.workspace.get,{room:'xela',deny:false});
  assert.deepEqual(preview.context.documents.map(x=>x._id),[own]);
  for(const id of foreign){
    await assert.rejects(f.invoke(modules.workspace.get,{room:'xela',deny:false,selectionIds:[id]}),/unavailable/);
    await assert.rejects(f.invoke(modules.ops.starToggle,{id}),/unavailable/);
    await assert.rejects(f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,selectionIds:[id],text:'do not send'}),/unavailable/);
  }
  assert.equal(f.queued.length,0);
});

test('cross-workspace direct IDs cannot approve runs, revoke grants, accept proposals or load manifests',async()=>{
  const f=fixture();
  for(const [table,fn,key,extra] of [
    ['runs',modules.ops.approvalDecide,'runId',{approve:true}],
    ['grants',modules.ops.grantRevoke,'id',{}],
    ['proposals',modules.proposals.accept,'id',{consent:true}],
    ['manifests',modules.ops.manifestRollback,'id',{}],
    ['contextSnapshots',modules.chat.reply,'snapshotId',{}],
  ]){
    const id=await f.db.insert(table,{workspaceId:'foreign',state:'waiting'});
    assert(fn,'expected endpoint '+table);
    await assert.rejects(f.invoke(fn,{[key]:id,...extra}),/unavailable/);
    assert.equal((await f.db.get(id)).state,'waiting');
  }
});

test('workspace initialization is explicit, idempotent, scoped, restrictive and never adopts legacy data',async()=>{
  const f=fixture({policy:false});const legacy=await f.addDoc({workspaceId:undefined,ownerIdentity:undefined});
  assert.equal((await f.invoke(modules.session.current)).initialized,false);
  assert.equal(f.table('userSettings').length,0);
  const access=await f.invoke(modules.session.initialize);
  assert.equal(access.initialized,true);assert.equal(access.subject,FIXTURE_IDENTITY.subject);
  await f.invoke(modules.session.initialize);
  assert.equal(f.table('userSettings').length,1);assert.equal(f.table('tierPolicy').length,1);
  assert.equal(f.table('auditEvents').length,1);assert.equal(f.table('agents').length,0);
  assert.equal(f.table('tierPolicy')[0].inbox,'exclude');
  assert.equal(f.table('tierPolicy')[0].canon,'include');
  assert.equal((await f.db.get(legacy)).workspaceId,undefined);
  assert.deepEqual(await f.invoke(modules.documents.list),[]);
  for(const table of ['userSettings','tierPolicy','rooms','auditEvents'])for(const row of f.table(table)){
    assert.equal(row.workspaceId,FIXTURE_SCOPE.workspaceId);assert.equal(row.ownerIdentity,FIXTURE_SCOPE.ownerIdentity);
  }
  assert.equal(f.table('auditEvents')[0].actor,FIXTURE_IDENTITY.subject);
});

test('missing retrieval policy cannot be bypassed by explicit selection or always-load',async()=>{
  const f=fixture({policy:false});const id=await f.addDoc({tier:'canon',path:'canon/a.md',alwaysLoad:true});
  for(const selectionIds of [undefined,[id]]){
    const preview=await f.invoke(modules.workspace.get,{room:'xela',deny:false,selectionIds});
    assert.equal(preview.scopeCount,0);
  }
});

test('writes stamp actual identity and prevent cross-workspace relation references',async()=>{
  const f=fixture();const original=await f.invoke(modules.documents.ingest,{path:'inbox/new.txt',content:'owned'});
  assert.equal((await f.db.get(original._id)).permissions.owner,FIXTURE_IDENTITY.subject);
  assert.equal((await f.db.get(original._id)).workspaceId,FIXTURE_SCOPE.workspaceId);
  const other=await f.addDoc({workspaceId:'foreign'});
  // Exercise the same guarded builder as all production mutations.
  const relation=modules.auth.mutation({args:{},handler:(ctx)=>ctx.db.patch(original._id,{relations:[{to:other,kind:'link'}]})});
  await assert.rejects(f.invoke(relation),/unavailable/);
  assert.deepEqual((await f.db.get(original._id)).relations,[]);
  const forged=modules.auth.mutation({args:{},handler:(ctx)=>ctx.db.insert('rooms',{key:'forged',workspaceId:'foreign'})});
  await assert.rejects(f.invoke(forged),/unavailable/);
});

test('deleted source or manifest cancels queued replies without citations, while stale manifests remain revocable',async()=>{
  for(const deleted of ['source','manifest']){
    const f=fixture();const doc=await f.addDoc();
    await f.invoke(modules.ops.manifestSign,{room:'xela',objectIds:[doc],docPaths:['inbox/a.md'],tiers:'inbox',ttl:'session',brief:'pin'});
    const manifest=f.table('manifests')[0]._id;
    const snapshotId=await f.invoke(modules.chat.sendMessage,{room:'xela',deny:false,text:'test'});
    await f.db.delete(deleted==='source'?doc:manifest);
    await f.invoke(modules.chat.reply,{snapshotId});
    assert.match(f.table('messages').at(-1).text,/cancelled/);
    assert.deepEqual(f.table('messages').at(-1).cites,[]);
    if(deleted==='source'){await f.invoke(modules.ops.manifestRevoke,{id:manifest});assert.equal((await f.db.get(manifest)).state,'revoked');}
  }
});

test('remote seed cannot delete or create any rows',async()=>{
  const f=fixture();await f.addDoc();const before=structuredClone(f.table('brainObjects'));
  await assert.rejects(f.invoke(modules.seed.run),/seeding is disabled/);
  assert.deepEqual(f.table('brainObjects'),before);
});
