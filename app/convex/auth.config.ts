import type { AuthConfig } from 'convex/server';
declare const process: { env: Record<string, string | undefined> };

// No configured issuer means no accepted provider; endpoints independently
// reject missing owner/workspace configuration as well.
const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
export default { providers: issuer ? [{ domain: issuer, applicationID: 'convex' }] : [] } satisfies AuthConfig;
