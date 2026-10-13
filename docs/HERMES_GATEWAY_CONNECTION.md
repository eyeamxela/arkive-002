# Hermes gateway connection — read-only beta

13 October 2026. Local Arkive Personal build. No real gateway has been configured or verified by this work.

## What it does

Arkive can save multiple dedicated Hermes API gateways and explicitly inspect each gateway's API support, installed skills and toolsets. This is not yet a chat execution route. Chat/Canvas still use Arkive's governed plain-model adapter and existing per-room saved-model pins.

## Connect an existing dedicated gateway

1. Open **Settings → Agents & harnesses → Add Hermes gateway**.
2. Enter a descriptive name and the **API-server origin**, not the desktop/web-chat URL. The inspected Hermes documentation lists `127.0.0.1:8642` as its default local listener; use the actual origin from your gateway configuration. Do not append `/v1` or a profile path.
3. Enter that gateway's dedicated bearer key directly in the password field. Never paste it into a chat, source note or screenshot. Arkive does not read or reuse your existing Hermes credential files.
4. Confirm **Save this gateway encrypted on this node**. Saving does not connect or execute anything.
5. Review the destination and confirm **Allow read-only capability, skill and toolset requests**. Click **Check gateway capabilities**.
6. Open **Settings → Capabilities** and choose the gateway. Browse Skills or Toolsets, search descriptions, and expand an entry. Enabled/configured labels are what Hermes reports, not permissions granted by Arkive.

If you do not have a dedicated API gateway yet, leave this disconnected. The official [API-server guide at the inspected revision](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/website/docs/user-guide/features/api-server.md) documents `API_SERVER_ENABLED`, `API_SERVER_HOST`, `API_SERVER_PORT`, `API_SERVER_KEY` and gateway startup. Do not casually enable the API on an unrestricted personal profile: it exposes that runtime's capabilities to clients holding its key. A contained deployment is a prerequisite for Arkive execution in the next slice.

### Network constraints

- Loopback HTTP or publicly reachable HTTPS origins only. Private LAN, link-local/cloud-metadata destinations, URL-embedded credentials, queries, fragments and path-prefixed profiles are unsupported.
- Each real metadata request is bounded to 10 seconds, including DNS, and 1 MiB. Redirects are rejected. The node, not the frontend browser, contacts Hermes.
- A gateway hosted on another device cannot be reached using that other device's `localhost` address. Remote routing/TLS must be explicitly set up; this build does not do it.
- A reachable catalog does not prove a model, tool, browser or provider account works. A malicious gateway's own labels are not a containment guarantee.

## Secret storage and recovery

Gateway settings are stored in `harness-settings.enc` beside the node's Brain, encrypted with its passphrase. The service needs the readable key only while unlocked. API responses show `hasToken`, not the key. This sidecar is not in Brain sync or encrypted Brain recovery exports: re-enter credentials on a restored/new node. Protect the node and passphrase; encryption does not protect an already compromised unlocked process.

Changing origins cannot silently reuse a saved key: provide a replacement, or disable and explicitly clear it. Disable metadata checks before clearing a key. Removing a connection does not revoke its key on the remote server or erase historical encrypted backups; revoke externally if compromise is suspected.

## Status and troubleshooting

| State | Meaning / next check |
|---|---|
| Not checked | No current observation; saving/editing or reopening does not auto-probe |
| Reachable | Expected capabilities contract and both catalogs returned valid metadata |
| Partial | Capabilities matched, but one or both catalogs failed or were malformed |
| Failed | Check origin, key, network and supported Hermes API version; no old catalog is presented as current |
| Settings changed | Reload; another settings edit changed the revision |
| Catalog limited | More rows were reported than the display limit, or invalid/duplicate rows were omitted |

No automatic retries, polling, model prompts or Brain content transfer occur. Refreshing Arkive's saved registry is not a remote check. No installation, shell, plugin, tool, MCP, model-execution or browser action can be triggered from this catalog.

## Implementation boundary

The independent Arkive implementation uses the inspected API contract; it does not vendor Hermes code. A future execution bridge must enforce runtime isolation, context permissions, action-specific approval, durable session/run correlation, cancellation, reconnect and safe artifacts before offering Hermes in the chat harness picker. Voice, channels, jobs and droplets remain separate subsequent adapters.
