export const MAX_SPATIAL_CONNECTIONS: number;
export type SpatialEdge = { id?: string; source: string; target: string; label: string;
  status?: 'neutral' | 'active' | 'waiting' | 'failed' | 'complete'; detail?: string };
export function spatialConnections(rectangles: Array<{ id: string; x: number; y: number; width: number; height: number }>,
  edges: SpatialEdge[]): Array<SpatialEdge & { id: string; status: NonNullable<SpatialEdge['status']>; x: number; y: number; path: string }>;
