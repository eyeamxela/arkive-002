import { accessForContext, mutation, query } from './auth';

// A session is a verified owner in one explicitly configured workspace. Missing
// scope fields on legacy/demo rows are never interpreted as belonging to it.
export const current = query({
  args: {},
  handler: async (ctx) => {
    const access = await accessForContext(ctx);
    const [settings, policy, room] = await Promise.all([
      ctx.db.query('userSettings').first(),
      ctx.db.query('tierPolicy').first(),
      ctx.db.query('rooms').withIndex('by_key', (q) => q.eq('key', 'dm:hermes')).first(),
    ]);
    return { ...access, initialized: Boolean(settings && policy && room) };
  },
});

// Owner-triggered, idempotent bootstrap: configuration and one empty room only.
// This does not seed agents/content, adopt old rows, connect a model, or import files.
export const initialize = mutation({
  args: {},
  handler: async (ctx) => {
    const access = await accessForContext(ctx);
    let changed = false;
    if (!(await ctx.db.query('userSettings').first())) {
      await ctx.db.insert('userSettings', {
        theme: 'near-black', density: 'comfortable',
        opt: { approvalGate: true, shareNoDl: true },
      });
      changed = true;
    }
    if (!(await ctx.db.query('tierPolicy').first())) {
      await ctx.db.insert('tierPolicy', {
        canon: 'include', curated: 'exclude', dashboards: 'exclude',
        legal: 'exclude', inbox: 'exclude', dreams: 'exclude',
      });
      changed = true;
    }
    if (!(await ctx.db.query('rooms').withIndex('by_key', (q) => q.eq('key', 'dm:hermes')).first())) {
      await ctx.db.insert('rooms', { key: 'dm:hermes' });
      changed = true;
    }
    if (changed) {
      await ctx.db.insert('auditEvents', {
        kind: 'workspace', actor: access.ownerIdentity, objectIds: [],
        summary: 'Initialized empty owner workspace; no source data, agents, or external services connected',
        raw: { workspaceId: access.workspaceId }, at: Date.now(),
      });
    }
    return { ...access, initialized: true };
  },
});
