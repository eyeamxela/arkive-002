import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { safePath, textHash } from './integrity';

const tiers = ['canon','curated','dashboards','legal','inbox'] as const;
export const pending = query({ args: {}, handler: (ctx) => ctx.db.query('proposals').withIndex('by_state', (q) => q.eq('state', 'pending')).collect() });

// A proposal is evidence/candidate data until this atomic reviewed materialization.
export const accept = mutation({
  args: { id: v.id('proposals'), saveToTier: v.optional(v.string()), editedBrief: v.optional(v.string()), consent: v.optional(v.boolean()) },
  handler: async (ctx, { id, saveToTier, editedBrief, consent }) => {
    const p = await ctx.db.get(id); if (!p || p.state !== 'pending') return;
    if ((p.consent || p.kind === 'memory') && consent !== true) throw new Error('Explicit memory consent required');
    const tier = saveToTier ?? p.targetTier ?? 'inbox';
    if (!tiers.includes(tier as any)) throw new Error('Unsupported tier');
    const content = editedBrief ?? p.brief;
    const originalPath = p.targetPath ? safePath(p.targetPath) : undefined;
    const path = originalPath ? safePath(saveToTier && saveToTier !== p.targetTier ? saveToTier + '/' + originalPath.split('/').pop() : originalPath) : undefined;
    const source = (await ctx.db.query('brainObjects').collect()).find((d)=>d.path === p.sourceRef || d.hash === p.sourceRef || String(d._id) === p.sourceRef);
    const previous = path ? await ctx.db.query('brainObjects').withIndex('by_path',(q)=>q.eq('path',path)).collect() : [];
    const now = Date.now();
    const objectId = await ctx.db.insert('brainObjects',{
      type:p.kind === 'task' ? 'task' : p.kind === 'memory' ? 'memory' : 'note',
      ...(path ? {path} : {}), title:path?.split('/').pop() ?? content.slice(0,100),
      tier:tier as typeof tiers[number], content, authority:'reviewed', lifecycle:'active',
      provenance:'proposal:' + id, fixture:source?.fixture ?? false, hash:await textHash(content),
      ...(source ? {sourceId:source._id} : {}), derivedFrom:source ? [{objectId:source._id,locator:p.sourceRef}] : [],
      relations:source ? [{to:source._id,kind:'derived-from'}] : [],
      permissions:{owner:'you',sensitivity:tier === 'legal' ? 'restricted' : 'private'},
      reviewStatus:'accepted',starred:false,alwaysLoad:false,createdAt:now,modifiedAt:now
    });
    for (const prior of previous.filter((d)=>!d.supersededBy)) await ctx.db.patch(prior._id,{supersededBy:objectId,lifecycle:'superseded',modifiedAt:now});
    if (p.kind === 'task') await ctx.db.insert('tasks',{title:content,status:'queued',sourceRef:p.sourceRef});
    if (p.rel?.length) {
      const all = await ctx.db.query('brainObjects').collect();
      const targets = all.filter((d)=>p.rel!.includes(d.path ?? '') || p.rel!.includes(String(d._id)));
      if (p.kind === 'relation') {
        if (targets.length !== 2) throw new Error('Relation requires two resolvable objects');
        const [from,to] = targets;
        if (!from.relations.some((edge)=>edge.to === to._id && edge.kind === 'related')) await ctx.db.patch(from._id,{relations:[...from.relations,{to:to._id,kind:'related'}],modifiedAt:now});
      }
      await ctx.db.patch(objectId,{relations:[...(source ? [{to:source._id,kind:'derived-from'}] : []),...targets.map((d)=>({to:d._id,kind:'related'}))]});
    }
    await ctx.db.patch(id,{state:editedBrief ? 'edited' : 'accepted',brief:content});
    await ctx.db.insert('auditEvents',{kind:'accept',actor:'you',objectIds:[objectId],summary:'accepted '+p.kind+(path ? ' → '+path : ''),raw:{proposal:p,consent:consent === true,saveToTier},at:now});
    return objectId;
  }
});
export const dismiss = mutation({args:{id:v.id('proposals'),reason:v.string()},handler:async(ctx,{id,reason})=>{
  const p=await ctx.db.get(id);if(!p || p.state !== 'pending')return;
  await ctx.db.patch(id,{state:'dismissed'});
  await ctx.db.insert('auditEvents',{kind:'dismiss',actor:'you',objectIds:[id],summary:'dismissed · '+reason,raw:{reason},at:Date.now()});
}});
