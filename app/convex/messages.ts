import { query } from './auth';
import { v } from 'convex/values';

export const list = query({
  args: { room: v.string() },
  handler: (ctx, { room }) => ctx.db.query('messages').withIndex('by_room', (q) => q.eq('room', room)).collect()
});
