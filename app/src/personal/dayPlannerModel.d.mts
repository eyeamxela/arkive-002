import type { WorkspaceTask } from './api';
import type { PlannerDay } from './plannerTypes';
export type DayGroup = { title: string; sectionId?: string; tasks: WorkspaceTask[] };
export function dayPlannerGroups(date: string, day: PlannerDay | undefined, tasks: WorkspaceTask[]): DayGroup[];
