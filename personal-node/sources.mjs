import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { validateGithubConfig, readGithubSnapshot, prepareGithubWrite, applyGithubWrite } from './github.mjs';
import { prepareLocalWrite, applyLocalWrite } from './writeback.mjs';
import { validateCodeGraph, exportGitNexus } from './codegraph.mjs';

const fault = (code, message, status = 400) => Object.assign(new Error(message), { code, status });

/** Owner-only routes. Pending approvals are memory-only, bounded, single-use and cleared on lock. */
export function createSourceRoutes({ getStore, local, signal, request }) {
  const plans = new Map();
  const transport = (token) => ({ ...(token ? { token } : {}), ...(request ? { request } : {}), signal });
  const requireLocal = () => { if (!local) throw fault('SOURCE_LOCAL_ONLY', 'This operation is available only on a loopback node', 403); };
  async function handle(route, method, body = {}) {
    const store = getStore();
    const state = await store.snapshot();
    const connection = (id) => {
      const value = state.connections?.find((item) => item.id === id);
      if (!value) throw fault('SOURCE_NOT_FOUND', 'Connect the repository first', 404);
      return validateGithubConfig(value);
    };
    if (route === '/v1/connections' && method === 'POST') {
      return store.registerConnection(validateGithubConfig(body));
    }
    const refresh = /^\/v1\/connections\/([^/]+)\/refresh$/.exec(route);
    if (refresh && method === 'POST') {
      const snapshot = await readGithubSnapshot(connection(refresh[1]), transport(body.token));
      // One transaction: a failed validation/capacity check cannot leave a partial snapshot.
      const objects = await store.importSnapshot(snapshot.files.map(({ path: _, ...file }) => file));
      await store.updateConnection(refresh[1], { lastSyncedAt: new Date().toISOString(), lastCommitSha: snapshot.commitSha, importedCount: objects.length });
      return { imported: objects.length, skipped: snapshot.skipped, commitSha: snapshot.commitSha };
    }
    if (route === '/v1/writebacks/preview' && method === 'POST') {
      for (const [key, value] of plans) if (value.expiresAt <= Date.now()) plans.delete(key);
      if (plans.size >= 10) throw fault('PREVIEW_LIMIT', 'Cancel an existing preview before creating another', 429);
      let plan;
      if (body.kind === 'local') {
        requireLocal();
        const folder = state.folders.find((item) => item.id === body.folderId);
        if (!folder) throw fault('SOURCE_NOT_FOUND', 'Connect the Obsidian vault or folder first', 404);
        plan = await prepareLocalWrite({ rootPath: folder.path, relativePath: body.path, text: body.text });
      } else if (body.kind === 'github') {
        plan = await prepareGithubWrite(connection(body.connectionId), { path: body.path, text: body.text, ...transport(body.token) });
      } else throw fault('SOURCE_KIND', 'Choose a local or GitHub source');
      const id = randomUUID();
      const expiresAt = Date.now() + 10 * 60_000;
      plans.set(id, { plan, expiresAt, brainId: state.brainId });
      return { id, expiresAt: new Date(expiresAt).toISOString(), destination: plan.sourcePath ?? plan.target,
        beforeText: plan.beforeText, afterText: plan.afterText, existed: plan.existed,
        kind: body.kind, expectedVersion: plan.expectedSha ?? plan.expectedHash ?? null };
    }
    const approval = /^\/v1\/writebacks\/([a-f0-9-]+)\/(apply|cancel)$/.exec(route);
    if (approval && method === 'POST') {
      const pending = plans.get(approval[1]);
      if (approval[2] === 'cancel') { plans.delete(approval[1]); return { cancelled: true }; }
      if (!pending || pending.expiresAt <= Date.now() || pending.brainId !== state.brainId) {
        plans.delete(approval[1]); throw fault('PREVIEW_EXPIRED', 'Create a new write preview', 409);
      }
      if (body.confirm !== true) throw fault('APPROVAL_REQUIRED', 'Explicit confirmation of this exact preview is required', 403);
      const { plan } = pending;
      if (plan.kind !== 'github') requireLocal();
      // Consume before touching the source. An uncertain network receipt cannot be replayed.
      plans.delete(approval[1]);
      const sourcePath = plan.sourcePath ?? plan.target;
      const title = path.basename(plan.path ?? plan.relativePath);
      const beforeMetadata = plan.kind === 'github' && plan.existed ? {
        kind: 'github', repository: plan.repository, ref: plan.ref, path: plan.path,
        commitSha: plan.commitSha, blobSha: plan.expectedSha,
      } : undefined;
      if (plan.existed) await store.preserveSourceVersion({ title, text: plan.beforeText, sourcePath,
        ...(beforeMetadata ? { sourceMetadata: beforeMetadata } : {}) });
      await store.recordEvent('source.write-approved', approval[1]);
      let receipt;
      try {
        receipt = plan.kind === 'github' ? await applyGithubWrite(plan, transport(body.token)) : await applyLocalWrite(plan);
      } catch (error) {
        await store.recordEvent('source.write-failed-or-unconfirmed', approval[1]).catch(() => {});
        throw error;
      }
      try {
        const metadata = plan.kind === 'github' ? { kind: 'github', repository: plan.repository,
          ref: plan.ref, path: plan.path, commitSha: receipt.commitSha, blobSha: receipt.blobSha } : undefined;
        await store.importSnapshot([{ title, text: plan.afterText, sourcePath,
          ...(metadata ? { sourceMetadata: metadata } : {}) }]);
        await store.recordEvent('source.write-verified', approval[1]);
      } catch {
        return { ...receipt, warning: 'The source write succeeded, but the Brain cache/audit could not be updated. Refresh the source; do not repeat the write.' };
      }
      return receipt;
    }
    if ((route === '/v1/code-graphs' || route === '/v1/gitnexus/import') && method === 'POST') {
      let graph;
      if (route === '/v1/gitnexus/import') { requireLocal(); graph = await exportGitNexus(body.repository, { signal }); }
      else graph = validateCodeGraph(body.graph);
      const sourcePath = `gitnexus://${encodeURIComponent(graph.repository)}`;
      const existing = state.objects.find((item) => item.sourcePath === sourcePath);
      return store.importText({ objectId: existing?.id, title: `${graph.repository} · code graph`,
        kind: 'code_graph', text: JSON.stringify(graph), sourcePath });
    }
    throw fault('NOT_FOUND', 'Source endpoint not found', 404);
  }
  return { handle, clear: () => plans.clear() };
}
