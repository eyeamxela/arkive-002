import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { CanvasLayers } from './roomCanvas';
import { useRoomField } from './RoomSession';
import { useWorkspace } from './hooks';
import type { CtxVersionRow } from './Tray';
import { useMutationFeedback } from './useMutationFeedback';

export type RoomCanvasProps = {
  room: string;
  layers: CanvasLayers;
  onOpenChat: () => void;
  onOpenCapture: () => void;
  onOpenDoc: (path: string) => void;
  onOpenVault: () => void;
  onOpenContext: () => void;
  onOpenGraph: () => void;
  onOpenRun: (key: string) => void;
  onOpenSettings: () => void;
  onOpenLibrary: () => void;
  onOpenAudit: () => void;
};

// Canvas layouts are alternate projections of the same room state. Keep the
// room's scope, context and prototype actions shared across every projection.
export function useRoomCanvasModel(roomKey: string) {
  const [deny] = useRoomField(roomKey, 'deny', true);
  const [selection] = useRoomField<ReadonlySet<string> | null>(roomKey, 'selection', null);
  const [manifestId] = useRoomField<string | null>(roomKey, 'manifest', null);
  const [, setContextOpen] = useRoomField(roomKey, 'ctxOpen', false);
  const [ctxOverrides] = useRoomField<Record<string, boolean>>(roomKey, 'ctxOverrides', {});
  const [ctxLocal] = useRoomField<CtxVersionRow[]>(roomKey, 'ctxLocal', []);
  const workspace = useWorkspace(roomKey, deny, selection, manifestId);
  const rooms = useQuery(api.panels.rooms, {}) ?? [];
  const manifests = useQuery(api.panels.manifests, {}) ?? [];
  const context = useQuery(api.panels.contextSummaries, { room: roomKey }) ?? [];
  const agents = useQuery(api.panels.agents, {}) ?? [];
  const runs = useQuery(api.panels.runs, {}) ?? [];
  const grants = useQuery(api.panels.grants, {}) ?? [];
  const skills = useQuery(api.panels.skills, {}) ?? [];
  const cartridges = useQuery(api.panels.cartridges, {}) ?? [];
  const audit = useQuery(api.panels.auditEvents, { limit: 100 }) ?? [];
  const policy = useQuery(api.panels.tierPolicy, {});
  const setPaused = useMutation(api.ops.agentSetPaused);
  const approve = useMutation(api.ops.approvalDecide);
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const pauseFeedback = useMutationFeedback();

  const room = rooms.find((r) => r.key === roomKey);
  // The backend resolution is authoritative for display, including local overrides.
  const manifest = manifests.find((m) => workspace?.context.manifestId && String(m._id) === String(workspace.context.manifestId));
  const scopedDocs = workspace?.context.documents ?? [];
  const canon = scopedDocs.filter((d) => d.tier === 'canon' && d.alwaysLoad);
  const scopedTierCounts = Object.entries(scopedDocs.reduce<Record<string, number>>((counts, doc) => ({ ...counts, [doc.tier]: (counts[doc.tier] ?? 0) + 1 }), {}));
  const ctxOn = context.map((c) => ({ ...c, on: ctxOverrides[c.version] ?? c.on })).concat(ctxLocal as typeof context).filter((c) => c.on);
  const denied = audit.filter((e) => e.kind === 'deny').length;
  const roomRuns = runs.filter((run) => {
    const runManifest = run.saw.manifestId ? manifests.find((m) => String(m._id) === String(run.saw.manifestId)) : undefined;
    return runManifest?.room === roomKey || (!run.saw.manifestId && roomKey === 'dm:' + run.agentKey);
  });
  const running = roomRuns.find((r) => r.state === 'running');
  const waiting = roomRuns.find((r) => r.state === 'waiting');
  const currentRun = running ?? waiting ?? roomRuns[0];
  const agentKey = currentRun?.agentKey ?? (roomKey.startsWith('dm:') ? roomKey.slice(3) : 'hermes');
  const agent = agents.find((a) => a.key === agentKey);
  const currentGrant = grants.find((g) => currentRun && String(g.runId) === String(currentRun._id) && !g.revokedAt);
  const roomSkills = skills.filter((s) => s.on && (s.scope === 'all' || s.scope === agentKey));
  const mounted = cartridges.filter((c) => c.rel === 'installed' || c.rel === 'temp');
  const latestPack = mounted.find((c) => c.updatePending) ?? mounted[0];
  const runningReadsScope = !!running && scopedDocs.some((d) => running.saw.docHashes.includes(d.hash));
  // This legacy boolean detects content-hash overlap, not object identity or a live read.
  const runningScopeNote = runningReadsScope ? 'Overlapping pinned references by content hash · not proof of current reads' : 'No overlapping pinned content hashes · current room selection only';
  const approveWaitingRun = async () => {
    if (!waiting || approvalPending) return;
    setApprovalPending(true);
    setApprovalError(null);
    try { await approve({ approve: true, runId: waiting._id }); }
    catch (error) { setApprovalError(error instanceof Error ? error.message : 'Approval failed. Please retry.'); }
    finally { setApprovalPending(false); }
  };
  const toggleAgentPaused = async () => {
    if (!agent) return;
    await pauseFeedback.run(() => setPaused({ key: agent.key, paused: !agent.paused }));
  };

  return {
    room, manifest, scopedDocs, canon, scopedTierCounts, ctxOn, context,
    denied, policy, roomRuns, running, waiting, currentRun, agentKey, agent,
    currentGrant, roomSkills, mounted, latestPack, runningReadsScope, runningScopeNote, workspace,
    audit, approvalPending, approvalError, approveWaitingRun, setContextOpen,
    toggleAgentPaused, pausePending: pauseFeedback.pending, pauseError: pauseFeedback.error,
  };
}
