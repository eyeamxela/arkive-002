import { query } from './auth';
import { v } from 'convex/values';

// read layer for every screen — one small query per table. writes live in ops.ts.

export const manifests = query({ args: {}, handler: (ctx) => ctx.db.query('manifests').collect() });
export const rooms = query({ args: {}, handler: (ctx) => ctx.db.query('rooms').collect() });
export const agents = query({ args: {}, handler: (ctx) => ctx.db.query('agents').collect() });
export const runs = query({ args: {}, handler: (ctx) => ctx.db.query('runs').collect() });
export const delegations = query({ args: {}, handler: (ctx) => ctx.db.query('delegations').collect() });
export const tasks = query({ args: {}, handler: (ctx) => ctx.db.query('tasks').collect() });
export const cartridges = query({ args: {}, handler: (ctx) => ctx.db.query('cartridges').collect() });
export const grants = query({ args: {}, handler: (ctx) => ctx.db.query('grants').collect() });
export const accessRequests = query({ args: {}, handler: (ctx) => ctx.db.query('accessRequests').collect() });
export const skills = query({ args: {}, handler: (ctx) => ctx.db.query('skills').collect() });
export const connectors = query({ args: {}, handler: (ctx) => ctx.db.query('connectors').collect() });
export const plugins = query({ args: {}, handler: (ctx) => ctx.db.query('plugins').collect() });
export const watchedFolders = query({ args: {}, handler: (ctx) => ctx.db.query('watchedFolders').collect() });
export const syncState = query({ args: {}, handler: (ctx) => ctx.db.query('syncState').first() });
export const tierPolicy = query({ args: {}, handler: (ctx) => ctx.db.query('tierPolicy').first() });
export const userSettings = query({ args: {}, handler: (ctx) => ctx.db.query('userSettings').first() });
export const proposals = query({ args: {}, handler: (ctx) => ctx.db.query('proposals').collect() });
export const contextSummaries = query({ args: { room: v.string() }, handler: (ctx, { room }) => ctx.db.query('contextSummaries').withIndex('by_room', (q) => q.eq('room', room)).collect() });
export const brainObjects = query({ args: {}, handler: (ctx) => ctx.db.query('brainObjects').collect() });

export const auditEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: (ctx, { limit }) => ctx.db.query('auditEvents').withIndex('by_at').order('desc').take(limit ?? 50)
});
