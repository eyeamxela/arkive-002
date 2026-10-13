import type { CodeGraphData } from './codeGraphModel.mjs';
import type { GraphModel } from './graphModel.mjs';
export type CodeNode = CodeGraphData['nodes'][number];
export type CodeDirectory = { name: string; path: string; directories: CodeDirectory[]; files: Array<{ name: string; path: string; nodes: CodeNode[] }> };
export function codeGroupColor(group: string): string;
export function buildCodeTree(nodes: CodeNode[]): { root: CodeDirectory; unlocated: CodeNode[]; fileCount: number };
export function prepareCodeExplorer(graph: CodeGraphData, options?: {
  search?: string; type?: string; community?: string; relationship?: string; grouping?: 'type' | 'community'; local?: boolean; selectedId?: string | null;
}): { model: GraphModel; nodes: CodeNode[]; edges: CodeGraphData['edges']; matchingCount: number; filteredCount: number; clipped: boolean };
export function deriveStaticCallPaths(graph: CodeGraphData, startId: string, options?: {
  maxDepth?: number; maxPaths?: number; maxVisits?: number;
}): { paths: Array<{ ids: string[]; end: 'leaf' | 'cycle' | 'depth-limit' }>; truncated: boolean; visits: number };
