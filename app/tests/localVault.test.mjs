import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({entryPoints:[new URL('../src/localVault.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const vault = await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('original SHA256 is content-derived and text is kept verbatim',async()=>{
  const original=await vault.makeOriginal('a.txt','abc');
  assert.equal(original.hash,'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const text='\uFEFFline one\r\nline two\n';
  const file=new File([new TextEncoder().encode(text)],'exact.md');
  const row=await vault.decodeOriginal(file);assert.equal(row.content,text);assert.equal(row.bytes,file.size);
  assert.deepEqual(new TextEncoder().encode(row.content),new Uint8Array(await file.arrayBuffer()));
});
test('portable bundle round trip retains originals and rejects altered content',async()=>{
  const original=await vault.makeOriginal('task.md','Do this\n','task');
  const bundle={format:'arkive-local-originals',version:1,originals:[original]};
  assert.deepEqual(await vault.validateBundle(JSON.parse(JSON.stringify(bundle))),bundle);
  await assert.rejects(vault.validateBundle({...bundle,originals:[{...original,content:'different'}]}),/Checksum/);
  await assert.rejects(vault.validateBundle({...bundle,originals:[original,original]}),/duplicate/);
  await assert.rejects(vault.validateBundle({...bundle,version:2}),/Unsupported/);
});
test('reject binary, malformed UTF8, paths, empty and oversized source',async()=>{
  await assert.rejects(vault.decodeOriginal(new File(['abc'],'bad.pdf')),/\.md/);
  await assert.rejects(vault.decodeOriginal(new File([new Uint8Array([0xff])],'invalid.txt')));
  for(const name of ['../bad.md','a/b.md','a\\b.md','bad\0.txt']) await assert.rejects(vault.makeOriginal(name,'abc'));
  await assert.rejects(vault.makeOriginal('empty.md',''));
  await assert.rejects(vault.makeOriginal('large.md','x'.repeat(vault.MAX_ORIGINAL_BYTES+1)));
});
