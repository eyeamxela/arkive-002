import { internalMutation } from './auth';

// Keep the old command address as a safe failure instead of deleting/replacing
// live data. Synthetic fixtures exist only in the isolated local UI test harness.
export const run = internalMutation({
  args: {},
  handler: async () => {
    throw new Error('Remote demo seeding is disabled. Use npm run test:ui for isolated sample data; use session.initialize for an authenticated empty workspace.');
  },
});
