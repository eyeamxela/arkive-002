import {
  query as baseQuery, mutation as baseMutation,
  internalQuery as baseInternalQuery, internalMutation as baseInternalMutation,
  type QueryCtx, type MutationCtx,
} from './_generated/server';
declare const process: { env: Record<string, string | undefined> };

export type WorkspaceAccess = Readonly<{
  workspaceId: string; subject: string; issuer: string; ownerIdentity: string;
}>;
const ACCESS = Symbol('verified Arkive workspace');
const unavailable = () => new Error('Resource unavailable in this workspace');

function configuredAccess(): WorkspaceAccess {
  const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN?.replace(/\/$/, '');
  const subject = process.env.ARKIVE_OWNER_SUBJECT?.trim();
  const workspaceId = process.env.ARKIVE_WORKSPACE_ID?.trim();
  if (!issuer || !subject || !workspaceId) throw new Error('Owner authentication is not configured');
  const url = new URL(issuer);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid authentication issuer configuration');
  return Object.freeze({ issuer, subject, workspaceId, ownerIdentity: JSON.stringify([issuer, subject]) });
}

// Convex validates JWT signature/audience/expiry using auth.config.ts. Never
// accept an owner, issuer or workspace supplied by a browser argument.
export async function requireOwner(ctx: Pick<QueryCtx, 'auth'>): Promise<WorkspaceAccess> {
  const access = configuredAccess();
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || identity.issuer?.replace(/\/$/, '') !== access.issuer || identity.subject !== access.subject) throw new Error('Owner authentication required');
  return access;
}

export function accessForContext(ctx: unknown): WorkspaceAccess {
  const access = (ctx as { [ACCESS]?: WorkspaceAccess })[ACCESS];
  if (!access) throw new Error('Workspace access was not verified');
  return access;
}

// Private implementation types terminate at the wrapper; exported builders
// retain Convex's generated argument/context inference.
type RawDb = QueryCtx['db'] | MutationCtx['db'];
type Row = Record<string, any>;
const owns = (row: Row | null, access: WorkspaceAccess) => !!row && row.workspaceId === access.workspaceId && row.ownerIdentity === access.ownerIdentity;

function scopedDatabase(db: RawDb, access: WorkspaceAccess): RawDb {
  const raw = db as any;
  const get = async (id: string) => {
    const row = await raw.get(id);
    // Same error for missing, legacy and foreign rows; no existence oracle.
    if (!owns(row, access)) throw unavailable();
    return row;
  };
  const inScope = (builder: any) => builder.filter((q: any) => q.and(
    q.eq(q.field('workspaceId'), access.workspaceId), q.eq(q.field('ownerIdentity'), access.ownerIdentity),
  ));
  const wrapQuery = (builder: any): any => {
    // Unknown operations are not forwarded to an unfiltered native builder.
    const result: any = {};
    for (const method of ['withIndex', 'order', 'filter', 'fullTableScan']) {
      if (typeof builder[method] === 'function') result[method] = (...args: any[]) => wrapQuery(builder[method](...args));
    }
    for (const method of ['collect', 'first', 'take', 'unique', 'paginate']) {
      if (typeof builder[method] === 'function') result[method] = (...args: any[]) => inScope(builder)[method](...args);
    }
    result[Symbol.asyncIterator] = () => inScope(builder)[Symbol.asyncIterator]();
    return result;
  };
  const assertScope = (value: Row) => {
    if ((value.workspaceId !== undefined && value.workspaceId !== access.workspaceId) || (value.ownerIdentity !== undefined && value.ownerIdentity !== access.ownerIdentity)) throw unavailable();
  };
  const validateReferences = async (value: Row) => {
    const ids: string[] = [];
    for (const key of ['sourceId', 'supersededBy', 'activeManifestId', 'objectId', 'taskId', 'runId', 'evidenceRunId', 'manifestId']) {
      if (value[key] !== undefined) ids.push(value[key]);
    }
    ids.push(...(value.objectIds ?? []), ...(value.selectionIds ?? []));
    for (const d of value.derivedFrom ?? []) ids.push(d.objectId);
    for (const r of value.relations ?? []) ids.push(r.to);
    for (const d of value.documents ?? []) ids.push(d.objectId ?? d._id);
    if (value.saw?.manifestId !== undefined) ids.push(value.saw.manifestId);
    for (const id of new Set(ids)) { if (typeof id !== 'string') throw unavailable(); await get(id); }
  };
  const stamp = (table: string, value: Row): Row => {
    assertScope(value);
    return {
      ...value, workspaceId: access.workspaceId, ownerIdentity: access.ownerIdentity,
      ...(table === 'brainObjects' && value.permissions ? { permissions: { ...value.permissions, owner: access.subject } } : {}),
      ...(table === 'auditEvents' ? { actor: access.subject } : {}),
    };
  };
  const wrapped: any = {
    get,
    query: (table: string) => { if (table.startsWith('_')) throw unavailable(); return wrapQuery(raw.query(table)); },
    normalizeId: (table: string, id: string) => raw.normalizeId(table, id),
  };
  if (typeof raw.insert === 'function') {
    wrapped.insert = async (table: string, value: Row) => {
      if (table.startsWith('_')) throw unavailable();
      const stamped = stamp(table, value);
      // Audit identifiers also contain descriptive keys and never grant access.
      await validateReferences(table === 'auditEvents' ? { ...stamped, objectIds: [] } : stamped);
      return raw.insert(table, stamped);
    };
    wrapped.patch = async (id: string, value: Row) => {
      const row = await get(id); assertScope(value);
      const merged = { ...row, ...value };
      if (row.permissions && value.permissions) merged.permissions = { ...value.permissions, owner: access.subject };
      const isAudit = typeof row.actor === 'string' && typeof row.kind === 'string' && typeof row.summary === 'string';
      // Validate changed references, not stale historical ones: revoking an
      // owned manifest must still succeed if one of its sources was deleted.
      await validateReferences(isAudit ? { ...value, objectIds: [] } : value);
      return raw.patch(id, { ...value, workspaceId: access.workspaceId, ownerIdentity: access.ownerIdentity, ...(row.permissions && value.permissions ? { permissions: merged.permissions } : {}), ...(isAudit ? { actor: access.subject } : {}) });
    };
    wrapped.replace = async () => { throw new Error('Replacing workspace records is not supported'); };
    wrapped.delete = async (id: string) => { await get(id); return raw.delete(id); };
  }
  return wrapped;
}

// No ARKIVE_DEMO_MODE bypass. Synthetic identities exist only in test harnesses.
function guarded<T>(builder: T, internal = false): T {
  return ((definition: any) => (builder as any)({
    ...definition,
    handler: async (ctx: QueryCtx | MutationCtx, args: any) => {
      const access = internal ? configuredAccess() : await requireOwner(ctx);
      const scoped = { ...ctx, db: scopedDatabase(ctx.db, access), [ACCESS]: access };
      // Reject caller-supplied foreign identifiers even if a handler would only
      // intersect them with a list and otherwise silently ignore the reference.
      for (const key of ['id', 'taskId', 'runId', 'grantId', 'snapshotId', 'manifestId']) {
        if (args[key] !== undefined) await scoped.db.get(args[key]);
      }
      for (const key of ['selectionIds', 'objectIds']) {
        for (const id of args[key] ?? []) await scoped.db.get(id);
      }
      return definition.handler(scoped, args);
    },
  })) as T;
}

export const query = guarded(baseQuery);
export const mutation = guarded(baseMutation);
export const internalQuery = guarded(baseInternalQuery, true);
export const internalMutation = guarded(baseInternalMutation, true);
