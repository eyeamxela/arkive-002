# Step 2 — owner identity and workspace boundary

23 September 2026. Local implementation record; not a security certification.

## Source and checkpoint

- Repository: `/Users/xela/Documents/GITHUB/arkive-002`.
- Branch: `codex/arkive-step2-auth`.
- Pre-auth checkpoint: `73d4483`, preserving canvas and Step 1 stabilization.
- No Git push, provider account creation, cloud deployment or private-data import performed.
- Setup and pending live acceptance: [ARKIVE_OWNER_BETA_SETUP.md](ARKIVE_OWNER_BETA_SETUP.md).

## Implemented contract

The production React entry requires a valid browser-safe configuration, Clerk sign-in,
Convex authentication, and a successful server owner check before mounting the Shell.
An explicit initialization action creates an empty workspace; signing up never claims
legacy data. Sign-out and identity loss unmount the private view.

All current public Convex queries/mutations use the guarded builders in
`app/convex/auth.ts`. The server chooses issuer, owner subject and workspace from its
deployment configuration. Every collection terminal applies owner/workspace filtering,
and direct object reads, writes, argument IDs and newly written typed references are
checked. New rows receive server-derived scope; BrainObject ownership and audit actors
use the configured verified principal. Missing, legacy and foreign IDs share a generic
unavailable error.

Schema scope fields remain optional solely to allow existing unscoped rows to remain
stored without destructive migration. The application cannot retrieve or adopt them.
Internal handlers are not browser-callable and use the configured server scope.
Changing owner/workspace configuration does not transfer old rows or scheduled work.

Missing retrieval policy denies all compiled source context. Initialization allows
canon and excludes the other tiers. Owners may inspect their own Vault rows; retrieval
policy is not a ban on the owner's own inspection. Explicit source selections cannot
override exclusions. Deleted/unavailable pinned sources cancel queued simulated replies
without citations; stale manifests can still be revoked.

Drafts and local originals use separate deployment/issuer/owner/workspace namespaces.
Old global browser data is preserved and unread. Stale async writes retain their old
session and are rejected or aborted on deactivation. This is not encryption, a secure
device boundary, or cross-tab cooperative editing.

## Verification performed

| Check | Result and limit |
| --- | --- |
| Automated suite | 83 tests passed, including direct calls to actual exported handlers against a synthetic database |
| Denial inventory | Every exported public endpoint rejects anonymous, other-subject and other-issuer identities before database access |
| Negative scope cases | Foreign workspace/owner and unscoped rows excluded; foreign selections, manifests, proposals, runs and grants rejected |
| Write integrity | Server scope/actor stamping, cross-workspace reference rejection, transaction rollback in the fixture harness |
| Session/local storage | Missing setup, auth-state transitions, stale-result denial, account/fixture draft separation, original database namespaces |
| Production build | `npm run build` passed |
| Convex types | `npx tsc --noEmit -p convex/tsconfig.json` passed |
| Isolated fixture build | `npm run test:ui -- --build` passed |
| Browser: production entry | Setup screen rendered without private Shell; no captured console errors |
| Browser: synthetic preview | Infinite, Radial 2c and Multi-room 2d rendered; switching views preserved a synthetic room draft |
| Source hygiene | `git diff --check` passed; no real environment file included |
| Production dependency audit | `npm audit --omit=dev` reported zero known advisories; this is not a security guarantee |

Handler tests substitute a synthetic identity already regarded as verified by Convex.
They do **not** exercise JWT signatures, issuer discovery, expiry, provider session
revocation, deployment configuration or actual Convex persistence/transactions.
The rollback harness is a test model, not proof of hosted transactional behavior.
Live checks in the setup guide remain unchecked.

The UI preview deliberately imports real backend handler definitions into an isolated
browser fixture; Convex emits browser-import compatibility warnings. No such handler
imports are used by the production entry. A future test-harness cleanup should move
this execution into a supported test runtime; these warnings were not suppressed.

## Explicit remaining gates

1. Create dedicated Clerk/Convex development projects and pass live owner, anonymous,
   different-account, stale-token, direct-ID and logout checks using synthetic data.
2. Review and upgrade the existing Vite development toolchain before internet exposure.
   The npm audit found Vite high-severity advisory exposure and its esbuild moderate
   dependency advisory (two affected packages). These pre-existing tooling issues are
   not fixed by adding authentication.
3. Implement controlled local-original-to-Brain registration; ingest/export/restore
   are still internal, not a completed user-facing cloud import workflow.
4. Enforce Context Compiler and capabilities at a real harness execution boundary.
   Current runs, approvals and grants are prototype/simulation state, not an
   independently authenticated agent runtime. No Hermes/model/node connection exists.
5. Add real team membership/roles, deployment hardening, paginated/index-optimized
   workspace queries, operational limits, encryption/sync and native auth acceptance
   as separate scoped work. Current filtering is fail-closed but large scans are not
   a scalability claim.

No external penetration test, production deployment or native desktop sign-in was
performed. Keep real business data out until the live authorization checklist passes.
