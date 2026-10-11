import type { BrainObject, Folder } from './api';
import type { GraphModel, GraphNode } from './graphModel.mjs';
export function graphInputKey(objects: BrainObject[], folders?: Folder[]): string;
export function matchesGraphSearch(node: GraphNode, query: string): boolean;
export function filterObsidianGraph(model: GraphModel, options?: { query?: string; selectedId?: string | null; depth?: number; showOrphans?: boolean; folderIds?: string[] | null; showSources?: boolean }): GraphModel;
export function graphSearchColors(nodes: GraphNode[], groups: { query: string; color: string }[]): Record<string, string>;
