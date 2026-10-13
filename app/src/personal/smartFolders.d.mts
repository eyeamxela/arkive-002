import type { BrainObject, Folder, PersonalWorkspace } from './api';
import type { CabinetFolder } from './fileCabinetModel.mjs';
export function smartFolderName(value: string): string;
export function buildSmartFolders(objects: BrainObject[], roots?: Folder[], filing?: PersonalWorkspace['filing'], member?: boolean): { folders: CabinetFolder[]; assignments: Map<string, { folder: string; reason: string }> };
