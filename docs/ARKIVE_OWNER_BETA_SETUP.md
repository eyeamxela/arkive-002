# Arkive owner-beta setup

Updated: 23 September 2026. Scope: Step 2 identity and workspace isolation, not a production launch.

## Status and purpose

Arkive now has code for Clerk sign-in, Convex-verified owner access, workspace-scoped database operations and separate browser-storage namespaces. This guide connects that code to **new, dedicated development projects** that you create and control.

No Clerk or Convex account/project was created or connected during this implementation. No cloud deployment, live sign-in or live authorization test has been performed. Do not interpret successful local tests as proof that a hosted deployment is secure.

The existing canvas and Step 1 work is preserved in local Git checkpoint `73d4483` (`Checkpoint Arkive canvas and Step 1 stabilization`). The working branch is `codex/arkive-step2-auth`. That checkpoint is local, not pushed; it precedes this authentication implementation.

## Before connecting anything

- Work from `/Users/xela/Documents/GITHUB/arkive-002/app`.
- Use Node.js 20.9 or newer for the installed Clerk React package.
- Use dedicated Arkive **development** projects. Do not connect another product's database, Clerk application, users or credentials.
- Keep all data synthetic until the live acceptance checklist below passes.
- Do not run `npm run seed`. Remote demo seeding is deliberately disabled. Do not re-enable it to make the UI look populated.
- Do not run `npx convex deploy` as part of this guide. That is a separate production operation.

**Toolchain release gate:** the existing Vite 5.4.21 development toolchain has two reported advisories, one high and one moderate. A reviewed toolchain upgrade and a fresh security audit are required before exposing development/preview services to the internet. Do not tunnel the current dev server or bind it publicly. The authentication work does not remediate those advisories. No dependency-upgrade command is prescribed here because an automatic major upgrade needs its own compatibility checks.

## 1. Create the Clerk development identity project

Create a dedicated Arkive application in the Clerk Dashboard and choose your sign-in method. Keep development and production credentials separate. The React SDK and provider integration are already installed in Arkive; do not scaffold a replacement app. The relevant official reference is the [Clerk React quickstart](https://clerk.com/docs/react/getting-started/quickstart).

Create your own test user through that application's hosted account portal, or its user-management tools. In Clerk's user details, copy the actual `user_...` identifier for your account. This is **not** your email, application ID or Clerk organization ID. You can obtain it without giving any account access to Arkive data. Signing up does not automatically make an account an Arkive owner.

Collect these non-secret configuration values privately in your setup notes:

- The development publishable key (`pk_test_...`).
- The Clerk Frontend API URL, including `https://`.
- Your Clerk user ID (`user_...`).

Do not paste secret keys or tokens into chat. This frontend does not need a Clerk secret key.

## 2. Enable the Clerk-to-Convex token integration

In Clerk, activate the Convex integration. Confirm that the token issued for Convex has audience `convex`. Where the dashboard uses JWT templates, use the Convex template named exactly `convex`; do not substitute an unrelated generic token. Arkive's installed Convex adapter requests that template.

The current official [Convex and Clerk guide](https://docs.convex.dev/auth/clerk) describes integration activation, the issuer URL and `applicationID: "convex"`. Follow the React section, not Next.js instructions. Arkive already implements the provider nesting and server auth configuration.

## 3. Create and select a dedicated Convex development project

Open a terminal in the app directory:

```sh
cd /Users/xela/Documents/GITHUB/arkive-002/app
npx convex dev
```

Sign into your own Convex account when prompted. Select/create the dedicated Arkive cloud development project. Confirm the selected project and deployment before accepting code synchronization; this command is an external setup operation, not a dry run.

The CLI may add deployment configuration to the app's `.env.local`. Preserve those entries. If you stop the process while setting dashboard variables, restart it after completing the next section. Before the owner configuration is complete, endpoints should reject access; do not weaken the guard to get past that state.

## 4. Put each configuration value in the correct place

| Variable | Where it belongs | Meaning |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | App `.env.local` | Arkive Clerk development publishable key |
| `VITE_CONVEX_URL` | App `.env.local` | HTTPS URL of the selected Arkive Convex development deployment |
| `CLERK_JWT_ISSUER_DOMAIN` | Environment variables for that Convex development deployment | Exact Clerk Frontend API URL used as token issuer |
| `ARKIVE_OWNER_SUBJECT` | Same Convex deployment's environment variables | Your approved Clerk `user_...` ID |
| `ARKIVE_WORKSPACE_ID` | Same Convex deployment's environment variables | Stable, non-empty identifier for this owner workspace |

Edit `.env.local` locally in your editor. The two frontend entries have this form; the placeholders are deliberately not working values:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_WITH_YOUR_PUBLISHABLE_KEY
VITE_CONVEX_URL=https://REPLACE_WITH_YOUR_DEPLOYMENT.convex.cloud
```

`VITE_` values are compiled into browser code. **Never put `CLERK_SECRET_KEY`, deployment admin credentials, access tokens, model API keys or other secrets in a `VITE_` variable.** Keep `.env.local` ignored by Git, and check file names—not secret contents—before staging changes.

For `ARKIVE_WORKSPACE_ID`, choose a stable identifier such as `arkive-owner-dev-001` and record it. This value is application configuration, not a browser-selected workspace or a Convex dashboard project ID. Changing it later selects a different data scope; it is not a migration. Changing the configured owner likewise does not transfer existing records.

Set the three server variables in the **development deployment's** Convex Dashboard, not merely in Vite's `.env.local`. The browser cannot nominate itself as owner. Restart/run `npx convex dev` to synchronize the authentication configuration, as described in the [Convex setup guide](https://docs.convex.dev/auth/clerk).

## 5. Start the real entry point and initialize explicitly

Keep `npx convex dev` running in one terminal. In another:

```sh
cd /Users/xela/Documents/GITHUB/arkive-002/app
npm run dev -- --host 127.0.0.1
```

Open the URL printed by Vite. The application normally uses port **1420**. Keep one consistent local origin and configure that origin in Clerk where required. Port **1421** is the isolated fixture preview, not evidence of a live connection.

Expected flow:

1. Without valid frontend configuration, Arkive shows the setup screen and does not create a Convex client.
2. With configuration but no identity, it shows sign-in.
3. After Clerk sign-in, it waits for Convex authentication and the guarded `session.current` check. It does not load the private Shell based on Clerk status alone.
4. A signed-in user other than the configured owner is denied. There is no “first person to sign up becomes owner” rule.
5. The verified owner sees **initialize private workspace** if setup is incomplete. Click it intentionally.
6. `session.initialize` creates safe default settings, tier policy, one empty room and an audit entry. It is idempotent. It does not import local originals, adopt historical records, seed documents or connect any agent.
7. The private Shell opens only after initialization is confirmed.

An initially empty business workspace is expected. UI examples do not constitute registered business data. Do not repopulate it using an old demo-seed command.

## 6. What the access boundary does—and does not do

This is a **single-owner workspace beta**, not team RBAC. The server verifies the configured issuer and subject, and applies owner/workspace scope to reads, writes and reference resolution. Browser UI controls, user-supplied object IDs and stored grant metadata do not grant authority.

The design's teams, roles and sharing controls are not a multi-user authorization service. A second Clerk user is a denial-test account, not a collaborator. Team membership, agent identities and per-role capabilities require a separate implementation.

Internal functions are not publicly callable browser APIs. Source ingestion, source export and restore remain internal until the dedicated Brain-registration workflow is implemented. Do not use an admin console as a substitute for that product workflow or as evidence that ordinary users can perform those operations.

Agent responses remain simulations. No Hermes connection, model-provider execution, droplet, worker credential, live channel, external publishing or autonomous deployment has been enabled by this setup.

## 7. Local originals, drafts and legacy data

The authenticated workspace's browser-storage namespace includes its deployment, issuer, owner and workspace identity. Chat drafts, capture drafts, cartridge drafts and original-file storage are separate from the fixture preview and other principals/workspaces. Sign-out or loss of authorization unmounts private UI; pending local writes remain bound to their original session and are rejected/aborted when that session closes.

This is **logical isolation, not encryption**. A person with access to the browser profile or its developer tools may inspect locally stored data. Use a private device/profile and treat exported archives as unencrypted sensitive files.

Legacy global draft keys and the old unscoped originals database are left intact, but are not automatically loaded into the new namespace. Existing server rows without the required owner/workspace fields also remain unadopted and inaccessible through the guarded app. “Quarantined” here means excluded from this application's access scope—not deleted, encrypted, moved or made inaccessible to a deployment administrator.

Do not mass-stamp legacy records with the new owner or erase old browser storage. Any migration needs an explicit source inventory, ownership review, backup and approved import plan. New local imports are still originals-only; full Brain registration and portable whole-Brain recovery are later work.

## 8. Local checks versus live acceptance

These commands check the implementation without claiming successful external integration:

```sh
cd /Users/xela/Documents/GITHUB/arkive-002/app
npm test
npm run build
npx tsc --noEmit -p convex/tsconfig.json
```

For canvas and interaction testing with synthetic data:

```sh
npm run test:ui
```

The fixture preview supplies a synthetic identity in its separate test harness. It is not an authentication bypass in the production entry point, and it cannot prove real JWT verification, Clerk lifecycle behavior or Convex deployment configuration.

Before private-data use, record the date, development deployment, tested commit, result and non-sensitive evidence for **every** live check below:

- [ ] Correct owner can sign in, initialize exactly once and reopen the empty workspace after reload.
- [ ] Anonymous requests to public queries/mutations fail before returning or changing workspace data. Test the endpoints directly, not only hidden buttons.
- [ ] A different Clerk test account can authenticate with Clerk but cannot open this workspace or use its endpoints. Do not change the allowlisted owner merely to make that account pass.
- [ ] Missing configuration, invalid issuer/audience, expired/revoked token and token loss deny access; no stale private Shell remains visible.
- [ ] Owner sign-out immediately hides the workspace. Switching accounts cannot restore the previous account's draft/original UI.
- [ ] Foreign owner/workspace IDs and unscoped legacy IDs are rejected for retrieval, explicit selections, manifests, proposals, approval actions and writes. Rejected mutations leave data unchanged.
- [ ] Test only fabricated foreign/legacy rows in a dedicated test deployment. Never use another person's real data to test isolation.
- [ ] Server-created records receive the verified scope; clients cannot override owner/workspace fields or attach foreign references.
- [ ] Fixture drafts/originals do not appear in the authenticated app, and authenticated local data does not appear in the fixture preview.
- [ ] No URL parameter, localStorage flag, development environment flag, hidden UI route or directly invoked public endpoint bypasses authorization.
- [ ] Source ingest/export/restore cannot be invoked as public browser functions; remote seed remains disabled.
- [ ] Development tooling advisories are remediated and audited before any public exposure. Production auth, deployment and desktop sign-in have separate review gates.

These boxes start unchecked intentionally. Passing the local suite is not a substitute for signing into the actual providers and exercising the deployed boundary.

## Troubleshooting without weakening security

| What you see | Check |
| --- | --- |
| Setup screen | Both frontend variables are present, structurally valid and from the dedicated projects; restart Vite after editing them. |
| Clerk works but verification never finishes | Convex integration/token audience, issuer URL, selected deployment and synchronized `auth.config.ts`. |
| Access unavailable/denied | Exact owner user ID, issuer and workspace configuration; a valid Clerk account alone is insufficient. |
| Empty workspace | Expected before initialization/import. Verify which scope is configured; do not adopt legacy rows automatically. |
| Old drafts/originals appear absent | New namespaces intentionally exclude legacy storage. Preserve the old storage and plan migration separately. |
| Initialization fails | Backend logs and deployment configuration. Retry after correcting configuration; do not disable the guard. |
| Sign-out fails | The UI remains locked. Retry sign-out; do not reopen the previous workspace automatically. |

The next product milestone after live authorization acceptance is controlled Brain registration and retrieval—not team invitations, a production launch or autonomous agent deployment.
