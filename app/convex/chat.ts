import { internalMutation, mutation } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { assertUsableManifest, contextDocumentEligible, contextFingerprint, resolveContext, tierAllowsContext } from './lib';
import { safePath } from './integrity';

export const sendMessage = mutation({
  args: { room: v.string(), text: v.string(), deny: v.boolean(), selectionIds: v.optional(v.array(v.id('brainObjects'))), manifestId: v.optional(v.id('manifests')), ttl: v.optional(v.string()), expectedContextFingerprint: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const text = args.text.trim(); if (!text) return;
    const context = await resolveContext(ctx,args);
    if (args.expectedContextFingerprint !== undefined && args.expectedContextFingerprint !== contextFingerprint(context)) {
      throw new Error('Context changed; review the updated scope and try again');
    }
    const snapshotId = await ctx.db.insert('contextSnapshots',{...context,room:args.room,createdAt:Date.now()});
    await ctx.db.insert('messages',{room:args.room,role:'op',text,cites:[],snap:context.scopeLabel,at:Date.now()});
    await ctx.scheduler.runAfter(850,internal.chat.reply,{snapshotId});
    return snapshotId;
  }
});
export const reply = internalMutation({
  args: { snapshotId: v.id('contextSnapshots') },
  handler: async (ctx,{snapshotId}) => {
    const snapshot = await ctx.db.get(snapshotId); if (!snapshot) return;
    // Never expand a queued context. Policy or source changes cancel the simulation.
    const policy = await ctx.db.query('tierPolicy').first();
    const fingerprint = JSON.stringify(policy ? [policy.canon,policy.curated,policy.dashboards,policy.legal,policy.inbox,policy.dreams] : []);
    const manifest = snapshot.manifestId ? await ctx.db.get(snapshot.manifestId) : null;
    let invalid = snapshot.expiresAt <= Date.now() || fingerprint !== snapshot.policyFingerprint;
    if (snapshot.manifestId) {
      try { assertUsableManifest(manifest, snapshot.room); } catch { invalid = true; }
    }
    for (const d of snapshot.documents) {
      const current = await ctx.db.get(d._id);
      if (!current || !contextDocumentEligible(current) || current.hash !== d.hash || current.tier !== d.tier || current.path !== d.path || !tierAllowsContext(policy, current.tier)) invalid = true;
      try { if (!current?.path) invalid = true; else safePath(current.path); } catch { invalid = true; }
    }
    const duplicate = (await ctx.db.query('messages').withIndex('by_room',(q)=>q.eq('room',snapshot.room)).collect()).some((m)=>m.snap === String(snapshotId));
    if (duplicate) return;
    await ctx.db.insert('messages',{room:snapshot.room,role:'ag',text:invalid ? 'Simulation cancelled: pinned context expired, changed, or was revoked. Send again to review a fresh scope.' : 'Simulation only — ' + snapshot.documents.length + ' document references were pinned at send time. No model read, external send, or proposal extraction occurred. ' + snapshot.scopeLabel,cites:invalid ? [] : snapshot.documents.map((d)=>d.path),snap:String(snapshotId),at:Date.now()});
  }
});
