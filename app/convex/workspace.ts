import { query } from './auth';
import { v } from 'convex/values';
import { contextFingerprint, ContextResolutionError, effectiveManifestId, resolveContext, TIER_TOK } from './lib';

// everything the chat header + scope bar reads: manifest pointer, vault head, ctx versions, scope shape.
export const get = query({
  args: { room: v.string(), deny: v.boolean(), selectionIds: v.optional(v.array(v.id('brainObjects'))), manifestId: v.optional(v.id('manifests')) },
  handler: async (ctx, args) => {
    const {room} = args;
    const manifestId = await effectiveManifestId(ctx, args);
    const candidate = manifestId ? await ctx.db.get(manifestId) : null;
    const manifest = candidate?.room === room ? candidate : null;
    const sync = await ctx.db.query('syncState').first();
    const ctxVersions = await ctx.db.query('contextSummaries').withIndex('by_room', (q) => q.eq('room', room)).collect();
    let context: Awaited<ReturnType<typeof resolveContext>>;
    let contextError: string | null = null;
    try { context = await resolveContext(ctx,args); }
    catch (error) {
      if (!(error instanceof ContextResolutionError)) throw error;
      contextError = error.message;
      context = { documents: [], selectionIds: args.selectionIds ?? [], ...(manifestId ? { manifestId } : {}), policyFingerprint: '', scopeLabel: 'Context unavailable — select a fresh scope', expiresAt: 0 };
    }
    const scope = context.documents;
    const counts: Record<string, number> = {};
    scope.forEach((d) => { counts[d.tier] = (counts[d.tier] || 0) + 1; });
    const tokens = scope.reduce((a, d) => a + (TIER_TOK[d.tier] || 0), 0);
    return {
      manifestKey: manifest?.key ?? null,
      manifestState: manifest?.state ?? null,
      vaultHead: sync?.head ?? '—',
      ctxVersions: ctxVersions.map((c) => ({ version: c.version, tokens: c.tokens, on: c.on })),
      scopeCount: scope.length,
      counts,
      tokens, context, contextError, contextFingerprint: contextError ? null : contextFingerprint(context)
    };
  }
});
