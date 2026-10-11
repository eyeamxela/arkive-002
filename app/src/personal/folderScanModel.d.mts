import type { FolderScan, FolderScanResult, PersonalNodeClient } from './api';
export type FolderScanView = { scan: FolderScan; requestPending: boolean; cancelling: boolean; cancelRequested: boolean; statusError: string; requestError: string };
export type FolderScanMonitor = { done: Promise<FolderScanResult>; dispose(): void; cancel(): Promise<void> };
export function initialFolderScan(scanId: string, folderId: string): FolderScan;
export function mergeFolderScan(previous: FolderScan, incoming: Partial<FolderScan> | null | undefined): FolderScan;
export function folderScanSummary(scan: FolderScan): string;
export function transferLimitBytes(value?: number): number;
export function createFolderScanMonitor(options: {
  client: PersonalNodeClient; scanId: string; folderId: string; isCurrent: () => boolean;
  onUpdate: (view: FolderScanView) => void; intervalMs?: number;
}): FolderScanMonitor;
