import { QueryCtx } from './_generated/server';
import { Doc, Id } from './_generated/dataModel';
import { expiry, safePath } from './integrity';

// prototype TIERS tok values — tokens per doc by tier
export const TIER_TOK: Record<string, number> = { canon: 4.6, curated: 3.1, dashboards: 1.4, legal: 5.2, inbox: 0.7 };

export class ContextResolutionError extends Error {}

type ContextArgs = { room: string; deny: boolean; selectionIds?: Id<'brainObjects'>[]; manifestId?: Id<'manifests'>; ttl?: string };

// This is prototype tier filtering, not identity/grant enforcement. "ask" stays
// closed until a real scoped consent flow exists; always-load cannot override it.
export function tierAllowsContext(policy: Doc<'tierPolicy'> | null, tier: string) {
  if (!['canon', 'curated', 'dashboards', 'legal', 'inbox'].includes(tier)) return false;
  return !policy || ['index', 'include'].includes((policy as unknown as Record<string, string>)[tier]);
}

export function contextDocumentEligible(doc: Doc<'brainObjects'>) {
  try {
    return !!doc.path && !!safePath(doc.path) && !doc.supersededBy
      && ['active', 'inbox'].includes(doc.lifecycle) && ['source', 'note', 'memory'].includes(doc.type);
  } catch { return false; }
}

export function assertUsableManifest(manifest: Doc<'manifests'> | null, room: string) {
  if (!manifest || manifest.room !== room) throw new ContextResolutionError('Manifest does not belong to this room');
  if (!['active', 'superseded'].includes(manifest.state) || manifest.revokedAt !== undefined) throw new ContextResolutionError('Manifest no longer authorizes context');
  let expiresAt: number;
  try { expiresAt = expiry(manifest.ttl, manifest.createdAt); }
  catch { throw new ContextResolutionError('Manifest uses an unsupported TTL; create a new context'); }
  if (expiresAt <= Date.now()) throw new ContextResolutionError('Manifest expired; create a new context');
  return expiresAt;
}

// An explicit selection, including [], intentionally replaces the room default.
// A revoked room pointer is retained: omitting context must never broaden access.
export async function effectiveManifestId(ctx: QueryCtx, args: ContextArgs) {
  if (args.manifestId) return args.manifestId;
  if (args.selectionIds !== undefined) return undefined;
  const room = await ctx.db.query('rooms').withIndex('by_key', (q) => q.eq('key', args.room)).first();
  return room?.activeManifestId;
}

export async function scopeDocs(ctx: QueryCtx, deny: boolean) {
  const policy = await ctx.db.query('tierPolicy').first();
  const docs = (await ctx.db.query('brainObjects').collect())
    .filter(contextDocumentEligible)
    .filter((r) => tierAllowsContext(policy, r.tier));
  return deny ? docs.filter((d) => d.tier === 'canon' || d.alwaysLoad) : docs;
}

export async function resolveContext(ctx: QueryCtx, args: ContextArgs) {
  const policy = await ctx.db.query('tierPolicy').first();
  const manifestId = await effectiveManifestId(ctx, args);
  const manifest = manifestId ? await ctx.db.get(manifestId) : null;
  const manifestExpiry = manifestId ? assertUsableManifest(manifest, args.room) : undefined;
  const selection = args.selectionIds;
  let docs = await scopeDocs(ctx,selection !== undefined || manifest ? false : args.deny);
  if (selection !== undefined) docs = docs.filter((d)=>selection.includes(d._id));
  if (manifest?.documents) {
    // A new object with the same content hash is not the signed object. Reject
    // stale bindings rather than silently substituting it or dropping a source.
    for (const binding of manifest.documents) {
      const doc = await ctx.db.get(binding.objectId);
      if (!doc || !contextDocumentEligible(doc) || doc.hash !== binding.hash || doc.path !== binding.path || doc.tier !== binding.tier) {
        throw new ContextResolutionError('Manifest source changed; create a new context');
      }
    }
    docs = docs.filter((doc) => manifest.documents!.some((binding) => binding.objectId === doc._id && binding.hash === doc.hash));
  } else if (manifest) {
    // Compatibility for old prototype manifests; path refs only match fixtures.
    docs = docs.filter((d)=>manifest.docHashes.includes(d.hash) || (d.fixture && manifest.docHashes.includes(d.path!)));
  }
  const scopeLabel = `${docs.length} docs · ${selection !== undefined ? 'explicit selection' : manifest ? 'manifest scope' : args.deny ? 'canon + always-load' : 'policy scope'}${manifest ? ' · manifest ' + manifest.key : ''}`;
  return { documents: docs.map((d)=>({_id:d._id,path:d.path!,title:d.title,hash:d.hash,tier:d.tier,alwaysLoad:d.alwaysLoad})), selectionIds: selection ?? [], ...(manifestId ? {manifestId} : {}), policyFingerprint: JSON.stringify(policy ? [policy.canon,policy.curated,policy.dashboards,policy.legal,policy.inbox,policy.dreams] : []), scopeLabel, expiresAt: Math.min(expiry(args.ttl),manifestExpiry ?? Infinity) };
}

// A comparison token, not a signature or authorization credential. Sort by exact
// object ID so query ordering cannot create spurious conflicts. Do not include
// the rolling expiresAt: the same preview must remain comparable at send time.
export function contextFingerprint(context: Pick<Awaited<ReturnType<typeof resolveContext>>, 'manifestId' | 'documents' | 'policyFingerprint'>) {
  const documents = context.documents.map((doc) => [String(doc._id), doc.hash, doc.path, doc.tier])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify([context.manifestId ?? null, documents, context.policyFingerprint]);
}
