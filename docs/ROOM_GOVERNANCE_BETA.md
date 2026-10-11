# Arkive room governance and agent activity

The Personal beta restores the original relationship between memory, rooms, people and agent activity in the cleaner interface. Rooms are private until their owner grants access. The local node enforces member access before returning data or compiling model context; canvas layout is only a view of those records.

This is a local beta with one administering owner and separately issued member credentials. It does not provide verified human identity, organization SSO, email invitations, a public sharing service, autonomous specialist teams or a connected Hermes runtime.

## Use the room inspector

1. Create a room in Chat and explicitly select its sources.
2. Open the room governance inspector. Its effective-context section shows the node's included and blocked source assessment.
3. Create and attach memory layers, such as Canon, project knowledge or restricted research. A layer groups explicit source IDs. Include permits selected sources; ask requires authorization; exclude removes them. Attaching a layer does not automatically select its files.
4. Assign a saved agent profile and, optionally, a task. The profile's source set is an additional context limit. Assignment does not start a worker or approve an action.
5. Optionally pin a context manifest. Review the sources and any ask-layer approval, then choose an expiry. The manifest binds exact source revisions. Changed scope, expired authority or revocation blocks its use until the owner explicitly reviews and re-pins.

Existing rooms keep their original selected sources and remain owner-only. Named context presets in the Library are still organizational source sets; they are distinct from pinned room manifests. Neither kind grants another person access.

Permission and layer editors retain drafts across unchanged refreshes, but a changed policy or layer invalidates the edit. Cancel and reopen a conflicting form to review the latest permissions. The UI sends the reviewed version to the node, which rejects stale writes instead of restoring access removed in another window.

## Grant a person access

In Shared, create a separate member credential. Save it privately when it is shown; it cannot be read back later. A new member has no rooms or sources. The owner must then add that member to a room and choose exact permitted sources.

| Role | Permitted behavior |
| --- | --- |
| Owner | Manage the Brain, room policies, sources, credentials, approvals, backup and sync |
| Reader | Read the room content and sources permitted by the current grant |
| Participant | Read permitted content and submit a request for owner approval |

A member connects using the normal node address and their member credential, not the owner token or encryption passphrase. The owner must have unlocked the node. Remote access requires an independently configured HTTPS endpoint and allowed browser origin; these controls do not provision a droplet or open the local computer to the Internet.

Credentials are bearer secrets: anyone holding one acts as that member. The encrypted store retains only their digests, and API snapshots do not return those digests. Revoke a credential in Shared to remove future node access. The interface rechecks access while visible and clears a member session when authorization fails. Revocation cannot recall data already read, copied, photographed or downloaded.

## Enforced data boundaries

Member responses contain only permitted rooms and source content. Owner audit history, local folder paths, private workspace records, other members, source revision history and raw code-graph snapshots are not delivered to member sessions. Unauthorized management, export, sync and source-write requests are rejected by the node, even if a client constructs the API request directly.

Source selection controls model context; it is not itself a membership grant. A shared model request must be readable by every active room member. Derived objects cannot bypass excluded or unauthorized evidence through their source relationships. Adding a member does not publish previous private transcripts. Membership changes are rechecked when reading stored results and when approving pending work.

These boundaries govern stored source relationships, not the meaning of arbitrary text. An owner can still paste sensitive information into a shared source or prompt. Review the content and audience before sharing. An authorized source may contain text or links referring to other material; permission filtering cannot automatically sanitize those words.

## Follow actual agent activity

The Agents screen offers a network and a request list. A request inspector shows its room, requesting principal, assigned profile/task, provider/model, exact source revisions, prompt, recorded events and result. Older messages without run receipts remain historical transcripts; the application does not invent missing attribution.

The current execution adapter performs a single model completion. A profile is not an independently authenticated remote agent or an autonomous tool-using worker. The app does not manufacture CEO-to-specialist delegation, tool activity or progress percentages.

An assigned profile must match the selected execution provider. An unsupported Hermes or other harness profile cannot silently run through the generic completion adapter under that profile's name.

```text
Selected memory and layer rules
               |
        Room and member grants
               |
     Profile scope and pinned inputs
               |
       Recorded model request
          /             \
Owner send          Member request
    |                    |
Explicit consent    Awaiting owner approval
          \             /
          Provider execution
                  |
        Result and durable receipt
```

Member requests wait without contacting a model. Approval reviews the stored prompt and inputs, requires external-send consent, and revalidates the member grant, provider, source revisions and room policy. A stale request must be replaced, not silently recomputed against broader context. Rejecting a request makes no provider call.

Running, completed, failed, rejected and awaiting-approval states come from stored events. Interrupted running requests become failed on node reopen; they are not silently retried. A failed network request may already have reached a provider, so inspect before retrying.

Member-origin requests are bounded: three pending per member, ten retained per member in a room, twenty retained per member overall, and two hundred member-origin receipts across the Brain, with a separate storage budget. Exceeding a limit does not call a provider or append a request. In a terminal member request's inspector, the owner can explicitly prune its receipt and associated messages to recover capacity. Pruning is never automatic; it retains audit evidence and does not remove downloaded copies or earlier backups. Owner-origin, pending and running receipts cannot be pruned through this control. Member body uploads have concurrency limits and an absolute deadline and are read outside the mutation queue, so an incomplete upload cannot hold up owner revocation or locking.

Memory review, model-request approval and connected-file write approval are separate operations. Completing a request does not promote its answer to Canon, change a task to Done, or authorize a filesystem/GitHub write.

## Canvas projections

Chat, Infinite, Radial and Multi-room share room state and transcripts. Memory and activity companions expose context boundaries and actual run records. Labeled connections are derived from those records and follow canvas positions. Hiding or moving a card does not alter a grant or model context.

The agent activity network is separate from the Brain's note-link graph and GitNexus code graph. A source relationship, code dependency and execution relationship are different kinds of evidence and are not converted into each other for appearance.

## Storage and portability

Governance records and run receipts live in optional encrypted Brain state. Existing Brains without these fields remain readable. Update every cooperating node before exchanging the newer format; an older binary may reject fields it does not recognize.

Reopening the same node retains its member credentials. Portable recovery exports strip credential digests and revoke exported member credentials, so restoring a backup does not silently activate access on another machine. Restore retains historical records, but the owner must issue new member credentials and grants. Existing folder and connection grants also remain subject to the recovery rules in the Personal node guide.

Peer replication remains source/revision replication. It does not export or adopt membership authority, manifests, room transcripts, approvals, agent runs or workspace organization. A peer credential still represents broad source-replication authority and must not be given to an ordinary room member.

## Implementation map

| Module | Responsibility |
| --- | --- |
| `personal-node/governance.mjs` | Validation, credential lookup, room scopes, member projections, manifests and run lifecycle |
| `personal-node/brain.mjs` | Encrypted transactions, atomic run completion, recovery and replica boundaries |
| `personal-node/server.mjs` | Owner/member authentication, route permissions and read-only activity polling |
| `personal-node/execution.mjs` | Explicit provider calls and recorded execution outcomes |
| `app/src/personal/RoomGovernance.tsx` | Memory, membership and pinned-context inspector; member credential management |
| `app/src/personal/AgentActivity.tsx` | Network/list and input/result/event inspection |
| `app/src/personal/ChatWorkspace.tsx` | Shared chat/canvas state and request-specific consent |
| `app/src/personal/PersonalApp.tsx` | Session isolation, access refresh and role-appropriate navigation |

## Verification

Use only synthetic Brains and a local mock provider for automated tests. Validate owner and member UI separately, cross-room denial, reader restrictions, pending approval without execution, stale/revoked context, late joins, credential revocation, encrypted reopen/export/restore and replica isolation. Browser checks should also cover canvas continuity, run inspection, mobile bounds and clearing readable data after access loss.

Release results are recorded in `PERSONAL_NODE_VERIFICATION.md`. A successful mock-provider test is not proof that a real provider, remote server, TLS deployment or Hermes adapter is connected.
