import type { BrainObject, BrainCollection } from './api';
export type FileSort = 'name-asc' | 'name-desc' | 'recent' | 'type' | 'manual';
export type FilingRow = { object: BrainObject; collectionId: string; accepted: boolean; reason: string };
export type FilingOperation = { collectionId: string; expected: BrainCollection; add: { sourceId: string; revisionId?: string }[]; removeIds: string[]; order?: string[] };
export function fileType(object: BrainObject): string;
export function sortCabinetFiles(objects: BrainObject[], sort?: FileSort, revisions?: unknown[], sourceIds?: string[]): BrainObject[];
export function suggestFiling(objects: BrainObject[], collections: BrainCollection[]): { object: BrainObject; collection: BrainCollection | null; reason: string }[];
export function filingOperations(rows: FilingRow[], collections: BrainCollection[], remove?: boolean): FilingOperation[];
export function reorderCollection(collection: BrainCollection, sourceId: string, direction: number): FilingOperation | null;
