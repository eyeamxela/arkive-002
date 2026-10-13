import type { BrainObject } from './api';

export type GraphLinkKind = 'source' | 'wikilink' | 'embed' | 'markdown';
export type GraphNode = {
  id: string; title: string; kind: string; sourcePath?: string;
  scope: string; path: string; group: string; allowNames: boolean;
  aliases: string[]; tags: string[]; degree: number;
};
export type GraphEdge = { id: string; source: string; target: string; kinds: string[] };
export type GraphDiagnostic = {
  sourceId: string; target: string; kind: GraphLinkKind | 'scan';
  status: 'ambiguous' | 'unresolved' | 'truncated'; candidateIds: string[];
};
export type GraphModel = {
  nodes: GraphNode[]; edges: GraphEdge[]; diagnostics: GraphDiagnostic[]; diagnosticCount: number;
  /** Directed note/source links. Optional for non-note adapters; edges remain undirected rendering pairs. */
  relationships?: GraphEdge[];
  totalObjects: number; omittedObjects: number; edgeLimitReached: boolean;
};
export type PositionedGraphNode = GraphNode & { x: number; y: number; radius: number; color: string };
export type GraphLayout = {
  nodes: PositionedGraphNode[]; edges: GraphEdge[];
  groups: Array<{ name: string; color: string; x: number; y: number }>;
  width: number; height: number; omittedNodes: number; filteredNodes: number;
};
export const GRAPH_NODE_LIMIT: number;
export function extractNoteLinks(text: string): {
  links: Array<{ target: string; kind: GraphLinkKind }>;
  aliases: string[]; tags: string[]; truncated: boolean;
};
export function buildGraphModel(objects: BrainObject[], options?: {
  folders?: Array<{ id: string; path: string }>;
}): GraphModel;
export function graphNeighbors(edges: GraphEdge[], selectedId: string | null, depth?: number): Set<string>;
export function graphGroupColor(group: string): string;
export function layoutGraph(model: GraphModel, options?: {
  mode?: 'obsidian' | 'structure'; maxNodes?: number; selectedId?: string | null;
  focusDepth?: number; showOrphans?: boolean; width?: number; height?: number;
}): GraphLayout;
