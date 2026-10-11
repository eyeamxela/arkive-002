import type { BrainObject } from './api';
export type VaultTreeNode = {
  id: string; kind: 'folder' | 'file'; label: string; path: string;
  parentId: string | null; rootId: string; children: string[]; childrenDesc: string[];
  count: number; scope: string; objectId?: string; searchText?: string;
};
export type VaultTree = {
  nodes: Map<string, VaultTreeNode>; roots: string[]; rootsDesc: string[];
  objectNodes: Map<string, string>; count: number;
};
export type VaultTreeRow = { id: string; node: VaultTreeNode; level: number; position: number; setSize: number; expanded: boolean };
export function vaultTreeSignature(objects: BrainObject[], folders?: { id: string; path: string }[]): string;
export function buildVaultTree(objects: BrainObject[], folders?: { id: string; path: string }[]): VaultTree;
export function vaultAncestors(model: VaultTree, id: string): string[];
export function flattenVaultTree(model: VaultTree, expanded: Set<string>, options?: { query?: string; order?: 'asc' | 'desc' }): VaultTreeRow[];
export function vaultFolderObjectIds(model: VaultTree, id: string): string[];
