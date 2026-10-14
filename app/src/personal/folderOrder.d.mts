export function orderedFolders<T>(items: readonly T[], saved: string[] | undefined, key: (item: T) => string): T[];
export function moveFolderOrder(visible: string[], saved: string[] | undefined, id: string, position: number): string[];
