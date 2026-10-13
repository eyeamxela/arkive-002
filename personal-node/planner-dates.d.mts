export function validPlannerDate(value: unknown): boolean;
export function shiftPlannerDate(value: string, days: number): string;
export function templateDue(template: { enabled: boolean; startsOn: string; repeat: string }, date: string): boolean;
export function plannerMonth(date: string): string[];
