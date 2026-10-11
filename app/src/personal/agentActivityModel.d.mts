import type { AgentRun, Brain, MemoryLayer, Provider, SourceBinding } from './api';
import type { SpatialEdge } from './spatialConnections.mjs';
export const ACTIVITY_RUN_LIMIT: number;
export const ACTIVITY_ROOM_LIMIT: number;
export function runTone(state: string): NonNullable<SpatialEdge['status']>;
export function roomAskLayers(brain: Brain, roomId: string, bindings?: SourceBinding[]): MemoryLayer[];
export function roomAuthorizationScope(brain: Brain, roomId: string): string;
export function runApprovalScope(brain: Brain, run: AgentRun, provider?: Provider, approvedLayerIds?: string[]): string;
export function activityRuns(brain: Brain, roomId?: string | null, state?: string): AgentRun[];
export function activityNetwork(brain: Brain, roomId?: string | null, state?: string): { nodes: Array<{
  id: string; title: string; kind: string; detail: string; status?: SpatialEdge['status'];
  runId?: string; roomId: string; x: number; y: number; width: number;
}>; edges: SpatialEdge[]; omittedRooms: number };
