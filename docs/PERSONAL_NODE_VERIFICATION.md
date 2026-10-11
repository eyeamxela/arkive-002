# Arkive Personal Beta Verification

Verified on 10 October 2026 on macOS arm64 with Node 22.23.2. This is a local implementation and test result, not a deployed-service or external-provider certification.

## Checkout and application

Worktree: `/Users/xela/Documents/Codex/2026-08-17/referenced-chatgpt-conversation-this-is-an/arkive-personal-node`

Branch: `codex/arkive-personal-node`, based on `03b26a36ecec56376b4d8dee68ea6de3dd0aab53` from `codex/arkive-step2-auth`.

The canonical `/Users/xela/Documents/GITHUB/arkive-002` checkout remains unchanged. Open the new worktree in Cursor to work on this beta. Existing white papers, the original cloud entry point and its canvas components were not changed. No GitHub push or deployment was performed.

Application: `app/src-tauri/target/release/bundle/macos/Arkive Personal.app`. The bundle contains the Node runtime and all personal-node modules. Native startup was observed at `tauri://localhost/local.html`, automatically connected to its local node and showing **Start with your world**. No real Brain or folder grant was created; the app was left for its owner to choose a passphrase.

## Results

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Existing application tests | 83 passed | Existing cloud handlers, local vault, canvas models, auth and UI fixtures |
| New store and service tests | 28 passed | Synthetic encrypted repositories, temporary folders, loopback APIs and mock provider |
| Browser smoke | 12 checks passed | Built Personal UI through real local API and encrypted storage; synthetic model responses |
| App and Convex TypeScript | Passed | `tsc --noEmit` and Convex project check |
| Existing cloud production build | Passed | Vite build; not a verified Clerk or Convex account connection |
| Personal production build | Passed | 35 transformed modules; no remote assets needed |
| Rust check | Passed | `cargo check --offline` |
| macOS application bundle | Passed | `npm run bundle:personal`; local development distribution |
| Native startup | Observed | Real window and local bridge reached empty-Brain setup |
| Docker engine | Not running | Container and TLS examples are prepared but not runtime-tested |
| Live model, Hermes, Telegram, droplet | Not connected | No real credentials, provider requests, messages or cloud resources used |

The browser checks covered note creation, explicit folder import and refresh, preservation of original files, selected-source-only context, per-request disclosure consent, manual memory proposal and approval, Graph/Files views, independent second chat, encrypted download, lock and service restart recovery. There were no console errors, failed requests or page-level horizontal overflow in the tested 1512px desktop and 390px mobile layouts. Tokens and passphrases were absent from browser storage.

The browser evidence is saved locally in the ignored `app/.personal-test/desktop.png`, `mobile.png` and smoke outputs. Reproduce it from `app` after `npm run build:personal`. The smoke script accepts `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE_PATH` for an existing Playwright installation and browser; it does not install dependencies or call a live provider.

## Security and recovery checks

Owner and peer credentials have separate authority. Tests reject missing credentials, unauthorized browser origins, peer access to owner routes and locked-Brain reads. Wrong passphrases and altered ciphertext fail closed. Recovery into an existing Brain is refused and restored folder grants are cleared.

Replication tests cover identical-Brain pairing, foreign-Brain rejection before sending local data, fast-forward histories, preserved divergent heads and simultaneous reciprocal sync. Local-only rooms, proposals, audit claims and folder grants do not appear in the replica payload.

Outbound requests reject private and metadata network addresses, plaintext remote URLs, credentials embedded in URLs and redirects. Context tests confirm that unselected sources and prior chat history are not sent. Missing adapters and invalid model responses cannot invent successful chat results.

Desktop EOF shutdown was tested during a stalled mock provider request. The process cancelled the request, exited successfully, released the writer lock and left no phantom messages. Normal exit now closes the private pipe instead of immediately killing the child. Forced termination and machine crashes still require stale-lock recovery as described in the setup guide.

Independent review caught and corrected malformed-URL crashes, backup-envelope size mismatch, missing inter-module contracts and abrupt native shutdown. The importer rejects hardlinks and checks path and inode stability after reading. These checks are not a complete filesystem sandbox against malicious same-user races.

GitNexus impact analysis reported low indexed risk for the existing native startup symbol. After indexing and staging all new modules, its complete diff classified the addition as critical impact: 27 files, 620 symbols and 58 affected execution flows. This broad change is isolated on the beta branch, not merged into the original checkout. The classification is a change-impact signal, not a finding that a particular vulnerability exists; the new modules were separately reviewed and tested. The final outbound URL correction has one indexed direct caller and low impact.

## Remaining release gates

1. Complete the first user-controlled session with a non-sensitive folder and a recoverable passphrase. Native picker and native download interaction have not been exercised with a real user Brain; browser equivalents have been tested.
2. Configure an actual model endpoint and run an explicitly approved, non-sensitive request. This verifies provider credentials and its response format beyond the mock adapter.
3. Start Docker locally, build and scan the prepared container, then verify persistent-volume restore and TLS before considering a personal-server deployment.
4. Choose and approve a server host, domain, cost limit and backup plan. Test access from a physical phone after deployment; a mobile browser viewport alone does not prove this.
5. Add scoped device pairing, credential rotation, conflict resolution, memory invalidation and real harness/channel adapters before team or unattended use.

This release does not claim enterprise multi-user permissions, arbitrary agent tool execution, automatic synchronization, a signed immutable ledger, P2P storage, Hermes integration, Telegram delivery or a created DigitalOcean droplet.
