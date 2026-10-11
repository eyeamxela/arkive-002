import type { BrainObject } from './api';
export function objectTimeline(objects: BrainObject[], revisions: unknown[], query?: string): { object: BrainObject; updatedAt: string | null }[];
