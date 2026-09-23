import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Scope fields are optional only to preserve old rows during deployment. Legacy
// rows are quarantined by auth.ts; all new writes receive server-derived scope.
const scopeFields = { workspaceId: v.optional(v.string()), ownerIdentity: v.optional(v.string()) };

// mirrors docs/STATE-SCHEMA.md — one BrainObject table, everything else references it.
const tier = v.union(v.literal('canon'), v.literal('curated'), v.literal('dashboards'), v.literal('legal'), v.literal('inbox'));

export default defineSchema({
  contextSnapshots: defineTable({ ...scopeFields, room: v.string(), documents: v.array(v.object({ _id: v.id('brainObjects'), path: v.string(), title: v.string(), hash: v.string(), tier: v.string(), alwaysLoad: v.boolean() })), selectionIds: v.array(v.id('brainObjects')), manifestId: v.optional(v.id('manifests')), policyFingerprint: v.string(), scopeLabel: v.string(), createdAt: v.number(), expiresAt: v.number() }),
  brainObjects: defineTable({ ...scopeFields,
    type: v.string(), path: v.optional(v.string()), title: v.string(), tier,
    fixture: v.optional(v.boolean()), content: v.optional(v.string()), originalBytes: v.optional(v.bytes()), mimeType: v.optional(v.string()), originalName: v.optional(v.string()), byteLength: v.optional(v.number()),
    authority: v.string(), lifecycle: v.string(), provenance: v.string(), hash: v.string(),
    sourceId: v.optional(v.id('brainObjects')),
    derivedFrom: v.array(v.object({ objectId: v.id('brainObjects'), locator: v.optional(v.string()) })),
    relations: v.array(v.object({ to: v.id('brainObjects'), kind: v.string(), visualOnly: v.optional(v.boolean()) })),
    permissions: v.object({ owner: v.string(), sensitivity: v.string() }),
    reviewStatus: v.string(), starred: v.boolean(), alwaysLoad: v.boolean(),
    createdAt: v.number(), modifiedAt: v.number(), supersededBy: v.optional(v.id('brainObjects'))
  }).index('by_path', ['path']).index('by_tier', ['tier']).index('by_type', ['type']),

  proposals: defineTable({ ...scopeFields, kind: v.string(), state: v.string(), conf: v.number(), sourceRef: v.string(), brief: v.string(), quote: v.optional(v.string()), diff: v.array(v.string()), targetPath: v.optional(v.string()), targetTier: v.optional(tier), consent: v.optional(v.boolean()), dup: v.optional(v.boolean()), rel: v.optional(v.array(v.string())), createdAt: v.number() }).index('by_state', ['state']),
  rooms: defineTable({ ...scopeFields, key: v.string(), activeManifestId: v.optional(v.id('manifests')) }).index('by_key', ['key']),
  manifests: defineTable({ ...scopeFields, key: v.string(), room: v.string(), docHashes: v.array(v.string()), documents: v.optional(v.array(v.object({ objectId: v.id('brainObjects'), hash: v.string(), path: v.string(), tier: v.string() }))), n: v.number(), tiers: v.string(), ttl: v.string(), state: v.string(), brief: v.string(), createdAt: v.number(), revokedAt: v.optional(v.number()) }).index('by_room', ['room']).index('by_key', ['key']),
  messages: defineTable({ ...scopeFields, room: v.string(), role: v.string(), text: v.string(), cites: v.array(v.string()), snap: v.optional(v.string()), at: v.number() }).index('by_room', ['room']),
  contextSummaries: defineTable({ ...scopeFields, room: v.string(), version: v.string(), tokens: v.number(), on: v.boolean(), note: v.string(), at: v.number() }).index('by_room', ['room']),
  recordings: defineTable({ ...scopeFields, objectId: v.id('brainObjects'), audioRef: v.string(), checksum: v.string(), durationS: v.number(), markers: v.array(v.number()), transcript: v.object({ version: v.number(), state: v.string(), segments: v.array(v.object({ t: v.number(), who: v.string(), text: v.string(), low: v.optional(v.boolean()) })) }) }),
  tasks: defineTable({ ...scopeFields, title: v.string(), status: v.string(), assignee: v.optional(v.string()), due: v.optional(v.string()), sourceRef: v.string(), evidenceRunId: v.optional(v.id('runs')) }),
  agents: defineTable({ ...scopeFields, key: v.string(), name: v.string(), purpose: v.string(), model: v.string(), harness: v.string(), paused: v.boolean(), instructionsV: v.number(), memoryPolicy: v.string() }).index('by_key', ['key']),
  runs: defineTable({ ...scopeFields, key: v.string(), agentKey: v.string(), task: v.string(), taskId: v.optional(v.id('tasks')), state: v.string(), cost: v.optional(v.number()), saw: v.object({ instructionsV: v.number(), manifestId: v.optional(v.id('manifests')), docHashes: v.array(v.string()) }), sawText: v.string(), did: v.string(), evidence: v.array(v.string()), startedAt: v.number(), endedAt: v.optional(v.number()) }).index('by_agent', ['agentKey']).index('by_key', ['key']),
  grants: defineTable({ ...scopeFields, principal: v.string(), title: v.string(), meta: v.string(), objectIds: v.array(v.id('brainObjects')), perms: v.array(v.string()), runId: v.optional(v.id('runs')), expiresAt: v.optional(v.number()), noDownload: v.boolean(), revokedAt: v.optional(v.number()) }).index('by_principal', ['principal']),
  accessRequests: defineTable({ ...scopeFields, who: v.string(), what: v.string(), why: v.string(), state: v.string(), at: v.number() }),
  delegations: defineTable({ ...scopeFields, from: v.string(), to: v.string(), kind: v.string(), active: v.boolean() }),
  cartridges: defineTable({ ...scopeFields, key: v.string(), name: v.string(), rel: v.string(), templates: v.array(v.string()), docHashes: v.array(v.string()), meta: v.string(), exec: v.boolean(), execConsented: v.boolean(), version: v.number(), publisher: v.string(), purpose: v.string(), updatePending: v.optional(v.number()) }).index('by_key', ['key']),
  skills: defineTable({ ...scopeFields, key: v.string(), by: v.string(), on: v.boolean(), scope: v.string(), updatedAt: v.number() }).index('by_key', ['key']),
  connectors: defineTable({ ...scopeFields, key: v.string(), status: v.string(), lastSyncAt: v.optional(v.number()) }).index('by_key', ['key']),
  plugins: defineTable({ ...scopeFields, key: v.string(), on: v.boolean(), execConsented: v.boolean(), version: v.number(), publisher: v.string() }),
  capabilityGrants: defineTable({ ...scopeFields, agentKey: v.string(), capabilityId: v.string(), kind: v.string() }).index('by_agent', ['agentKey']),
  canvasLayout: defineTable({ ...scopeFields, canvasId: v.string(), objectId: v.id('brainObjects'), x: v.number(), y: v.number(), w: v.optional(v.number()), h: v.optional(v.number()), group: v.optional(v.string()) }).index('by_canvas', ['canvasId']),
  watchedFolders: defineTable({ ...scopeFields, path: v.string(), tier: v.string(), docs: v.number(), status: v.string(), primary: v.boolean() }),
  syncState: defineTable({ ...scopeFields, pending: v.number(), indexing: v.boolean(), head: v.string(), lastScanAt: v.number(), macOnline: v.boolean(), queued: v.number() }),
  tierPolicy: defineTable({ ...scopeFields, canon: v.string(), curated: v.string(), dashboards: v.string(), legal: v.string(), inbox: v.string(), dreams: v.literal('exclude') }),
  userSettings: defineTable({ ...scopeFields, theme: v.string(), density: v.string(), opt: v.any() }),
  auditEvents: defineTable({ ...scopeFields, kind: v.string(), actor: v.string(), objectIds: v.array(v.string()), summary: v.string(), raw: v.any(), at: v.number() }).index('by_at', ['at'])
});
