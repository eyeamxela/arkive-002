import { query, internalMutation, internalQuery } from './auth';
import type { MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { safePath, sha256 } from './integrity';

// useDocuments(): brainObjects that are file-backed. sealed tier never has rows (excluded at indexing).
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('brainObjects').collect();
    return rows.filter((r) => { try { return r.path && safePath(r.path) && !r.supersededBy && ['active','inbox'].includes(r.lifecycle) && (r.type === 'source' || r.type === 'note'); } catch { return false; } });
  }
});

const sourceArgs = {
  path:v.string(), title:v.optional(v.string()), content:v.string(),
  originalBytes:v.optional(v.bytes()), mimeType:v.optional(v.string()), originalName:v.optional(v.string()), expectedHash:v.optional(v.string())
};
type SourceInput = {path:string;title?:string;content:string;originalBytes?:ArrayBuffer;mimeType?:string;originalName?:string;expectedHash?:string};
async function storeSource(ctx: MutationCtx, input: SourceInput) {
  const path = safePath(input.path);
  // Original ingestion always begins in inbox; review promotes derived records.
  if (!path.startsWith('inbox/')) throw new Error('Sources must enter inbox');
  const encoded = new TextEncoder().encode(input.content);
  if (!encoded.length || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.content)) throw new Error('Only nonempty UTF-8 text originals are supported');
  if (input.mimeType && !input.mimeType.startsWith('text/') && input.mimeType !== 'application/json') throw new Error('Binary originals remain local; text import only');
  const bytes = input.originalBytes ? new Uint8Array(input.originalBytes) : encoded;
  if (bytes.length !== encoded.length || bytes.some((byte,index)=>byte !== encoded[index])) throw new Error('Original bytes must exactly match UTF-8 content');
  if (bytes.byteLength > 262144 || new TextEncoder().encode(input.content).byteLength > 262144) throw new Error('Source too large; local original remains authoritative');
  const hash = 'sha256:' + await sha256(bytes);
  if (input.expectedHash && input.expectedHash !== hash) throw new Error('Original checksum mismatch');
  const versions = await ctx.db.query('brainObjects').withIndex('by_path',(q)=>q.eq('path',path)).collect();
  const existing = versions.find((d)=>d.hash === hash && !d.supersededBy);
  if (existing) return {_id:existing._id,path,hash};
  const now = Date.now();
  const id = await ctx.db.insert('brainObjects',{
    type:'source',path,title:input.title ?? input.originalName ?? path.split('/').pop()!,tier:'inbox',content:input.content,
    originalBytes:bytes.buffer as ArrayBuffer,byteLength:bytes.byteLength,mimeType:input.mimeType ?? 'text/plain',originalName:input.originalName ?? path.split('/').pop()!,
    fixture:false,authority:'original',lifecycle:'active',provenance:'original',hash,
    derivedFrom:[],relations:[],permissions:{owner:'you',sensitivity:'private'},reviewStatus:'unreviewed',starred:false,alwaysLoad:false,createdAt:now,modifiedAt:now
  });
  for (const previous of versions.filter((d)=>!d.supersededBy)) await ctx.db.patch(previous._id,{supersededBy:id,lifecycle:'superseded',modifiedAt:now});
  await ctx.db.insert('auditEvents',{kind:'capture',actor:'owner',objectIds:[id],summary:'original source ingested '+path,raw:{hash,byteLength:bytes.byteLength},at:now});
  return {_id:id,path,hash};
}

// Original ingestion/recovery stays internal until the separate Brain registration
// slice is approved. These handlers still require the configured workspace scope;
// no public endpoint accepts business originals or exports private originals.
export const ingest = internalMutation({args:sourceArgs,handler:storeSource});
export const exportSources = internalQuery({args:{},handler:async(ctx)=>{
  const rows = (await ctx.db.query('brainObjects').collect()).filter((d)=>d.type==='source' && !d.fixture && d.originalBytes && !d.supersededBy);
  if(rows.length > 100) throw new Error('Export batch exceeds 100 sources');
  return {format:'arkive-sources-v1' as const, sources:rows.map((d)=>({path:d.path!,title:d.title,content:d.content ?? '',originalBytes:d.originalBytes!,mimeType:d.mimeType,originalName:d.originalName,expectedHash:d.hash}))};
}});
export const restoreSources = internalMutation({args:{format:v.literal('arkive-sources-v1'),sources:v.array(v.object(sourceArgs))},handler:async(ctx,{sources})=>{
  if(sources.length > 100) throw new Error('Restore batch exceeds 100 sources');
  const results=[];
  for(const source of sources) results.push(await storeSource(ctx,source));
  return results;
}});
