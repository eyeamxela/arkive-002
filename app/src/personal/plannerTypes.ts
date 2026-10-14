export type PlannerSection = { id: string; title: string; kind: 'tasks' | 'journal' };
export type PlannerEntry = { id: string; name: string; sections: PlannerSection[]; journal: string; color: string };
export type BoardBlock = { id: string; kind: 'note' | 'link' | 'comment' | 'column' | 'task' | 'drawing'; text: string; x: number; y: number; url?: string; taskId?: string; parentId?: string; points?: number[][] };
export type PlannerDay = { date: string; entries: PlannerEntry[]; blocks: BoardBlock[]; updatedAt: string; journal?: string; color?: string };
