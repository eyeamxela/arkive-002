# Arkive connections and Hermes messaging

## Implemented scope

Settings → Connections & channels replaces the static availability card with a searchable master/detail channel browser in Arkive's shared charcoal, orange and violet theme. This is a management adapter for Hermes, not a second messaging runtime or a new Brain access grant.

The flow is:

1. Save a loopback dashboard origin, explicit Hermes profile and dashboard session token in Arkive's encrypted node-local settings. Saving performs no network request.
2. Explicitly load channels. Arkive calls Hermes's real `GET /api/messaging/platforms?profile=…` endpoint and renders the returned platform catalog, required/recommended/advanced fields, enabled/configured state and messaging-gateway state.
3. Enter changed credentials and allowed users. Blank secret fields preserve existing values. Clearing a saved field requires a separate selection. Save requires acknowledgement of the target profile and Hermes's independent permissions.
4. Arkive re-reads the selected platform before a mutation and checks its observed version. It forwards only that platform's reported environment keys through `PUT /api/messaging/platforms/{id}`. It does not expose a general config or URL proxy.
5. Enable/disable is a distinct action. Telegram requires numeric allowed-user IDs before enablement. Arkive does not enable public `ALLOW_ALL_USERS` values through this screen.
6. Check status uses Hermes's `POST /api/messaging/platforms/{id}/test`. A successful credential save does not mark a channel connected.
7. An explicitly approved gateway restart calls `POST /api/gateway/restart`. It clears observed status, reports only that restart was requested, and requires a later reload to verify running state.

Before a management connection has been checked, the channel list is clearly labelled a navigation preview. It cannot save credentials or claim connection status. After checking, only channels actually reported by that Hermes instance are shown.

## Two different Hermes connections

| Purpose | Upstream interface | Credential | Arkive section |
| --- | --- | --- | --- |
| Execute an agent chat | `/v1/runs`, `/v1/capabilities` | API-server bearer key | Agents & harnesses |
| Configure messaging adapters | `/api/messaging/platforms` | Dashboard session token | Connections & channels |

Hermes's Desktop UI uses the dashboard management interface. An API-server key is not interchangeable with a dashboard session token. The two origins may use different ports.

## Initial connection

Use a dashboard service you control. Hermes's `hermes serve` startup accepts `HERMES_DASHBOARD_SESSION_TOKEN` for loopback session-token authentication. Enter the actual origin/port and that token in Arkive's masked settings field; do not paste credentials into chat. Hermes Desktop-managed tokens may rotate when its service restarts.

Only loopback dashboard origins (IPv4/IPv6) are supported by this adapter. `localhost` is canonicalized to `127.0.0.1`. A separately configured local SSH tunnel can reach a remote loopback dashboard. Public Hermes deployments with OAuth/cookie authentication require a future supported authentication adapter; Arkive does not bypass their login gates.

The adapter does not auto-read Hermes's private config/token files, start a daemon, or register a Telegram/WhatsApp account. The first version stores one management origin/profile at a time. Changing either requires re-entering the token and discards observed channel state.

## Security and ownership

- All routes require an authenticated Arkive owner and unlocked Brain. Member and replica credentials are denied.
- Dashboard credentials are encrypted in `channel-settings.enc`, using the Brain passphrase and existing AES-GCM/scrypt export envelope. Atomic file replacement and mode `0600` follow the other settings stores.
- Bot credentials are forwarded only to the explicitly selected Hermes profile; Arkive does not retain them in its sidecar. Hermes controls its own credential storage and encryption policy.
- Returned secret values and redacted credential previews are not exposed to the browser. Only allowlisted user/group ID lists may be read back. Credential input is not stored in browser storage and is cleared after successful operations and channel switches.
- All upstream paths are fixed. Bounded requests, deadlines, pinned loopback destinations and no redirects prevent arbitrary proxy use. Metadata is untrusted text, not instructions.
- Save, enable and restart require explicit UI actions. Hermes can hot-apply settings on a running multiplexed gateway, so even saving is treated as an external configuration change.
- Epoch checks and abort signals prevent a cleared session from being repopulated. Upstream failures clear observed mutation state and warn that a change may already have applied; no automatic retry is performed.
- A fresh read detects many concurrent Hermes changes but is **not** an atomic upstream compare-and-swap: Hermes's PUT endpoint does not accept a version precondition. An external edit in the remaining read/write window can still race. Avoid simultaneous management from both apps.
- History records only action, platform and time; management secrets/history are not part of Brain export or peer source sync. This is a settings receipt, not a distributed transaction/audit guarantee.
- No Brain text, source selection, room token or room policy is forwarded by this module. A Telegram user interacts with Hermes's tools, local files and memory under Hermes's policy, **not** Arkive's permission compiler. Channel-to-Arkive-room binding is a separate, not-yet-implemented feature.
- Restart can affect other channels, jobs and runs in the selected Hermes gateway. Restart acknowledgement is not proof of health.

## Remaining parity

Telegram QR creation, WhatsApp pairing, pairing-request approval/revocation, webhook subscription management and other platform-specific wizards remain in Hermes. This implementation handles the generic channel environment-field configuration API, enable/disable, status and explicit gateway restart. It does not claim complete Hermes UI parity.

Voice, external calendars, push notifications, compute provisioning and app updates remain separate integrations.

## Source trace

Inspected installed Hermes source at commit `63d0b94120027d487c9a5235b9ec64b696af1b26`:

- `apps/desktop/src/api/messaging.ts`: exact platform read/update/test operations and separate QR/pairing routes.
- `apps/desktop/src/app/messaging/index.tsx`: master/detail navigation, fields, status and restart distinctions.
- `apps/desktop/src/app/messaging/telegram-qr-setup.tsx`: Nous pairing service; requires its own lifecycle and explicit apply.
- `apps/desktop/src/types/hermes.ts`: messaging platform and environment-field descriptors.
- `hermes_cli/web_routers/messaging.py`: profile-scoped read/write behavior, field allowlist, live reload and platform test.
- `hermes_cli/web_routers/actions.py`: restart submission contract.
- `hermes_cli/web_server.py`: `X-Hermes-Session-Token` and loopback versus gated deployment authentication.

Arkive's adapter and UI are independently implemented against these contracts. Existing Hermes MIT notices remain in `docs/licenses` and the app's public notices.

## Verification

Synthetic tests cover encryption, redaction, schema/ID validation, destination/profile restrictions, revision checks, uncertain writes, restart acknowledgement, lock/session clearing, owner/member/peer authorization and export exclusion. Browser tests use a temporary encrypted Brain and local mock Hermes HTTP server to exercise the real frontend/backend/transport chain; no real bot, account or private vault is touched. Desktop and 390px/320px layouts are checked.

Live authentication and end-to-end message delivery remain unverified until the owner explicitly connects a real dashboard and channel.

Verified locally on October 13, 2026: TypeScript/Vite build, **304** unit/service/model tests, **80** browser checks and the macOS Tauri app bundle passed. All **21** backend `.mjs` modules match the packaged resources byte-for-byte. Desktop and mobile screenshots are in `app/.personal-test/settings-channels-*.png`. Browser console and network checks were clean. The existing Vite bundle-size warning remains (main chunk approximately 501 kB uncompressed).

No live Hermes credentials were accessed, no real channel was connected/enabled, and no push or deployment was performed. Restarting the user's running desktop app is awaiting approval. The aggregate GitNexus change report labels the accumulated worktree critical because prior runtime/governance changes are also uncommitted; its stale/read-only index cannot resolve the new channel symbols. Direct source review and the full regression suites therefore supplement it; this is not a claim of production security certification.
