import { query as baseQuery, mutation as baseMutation, QueryCtx, MutationCtx } from './_generated/server';
declare const process: { env: Record<string, string | undefined> };

export async function requireOwner(ctx: QueryCtx | MutationCtx, demoAllowed = true) {
  const identity = await ctx.auth.getUserIdentity();
  const owner = process.env.ARKIVE_OWNER_SUBJECT;
  if (owner && identity && identity.subject === owner) return identity.subject;
  if (demoAllowed && process.env.ARKIVE_DEMO_MODE === 'true') {
    const records = await ctx.db.query('brainObjects').collect();
    if (records.every((r) => r.fixture === true)) return 'demo';
  }
  throw new Error('Owner authentication required. Configure ARKIVE_OWNER_SUBJECT; demo mode is fixture-only.');
}

// Keep Convex argument inference while applying the same guard to every public handler.
function guarded(builder: typeof baseQuery | typeof baseMutation) {
  return ((definition: any) => (builder as any)({ ...definition, handler: async (ctx: any, args: any) => {
    await requireOwner(ctx);
    return definition.handler(ctx, args);
  } })) as typeof baseQuery;
}
export const query = guarded(baseQuery);
export const mutation = guarded(baseMutation) as unknown as typeof baseMutation;
