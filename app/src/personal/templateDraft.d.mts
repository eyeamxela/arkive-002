import type { TaskTemplate } from './api';
import type { TemplateDraft } from './TemplateFolderEditor';
export function createTemplateDraft(template: TaskTemplate | undefined, date: string): TemplateDraft;
export function templateSaveInput(draft: TemplateDraft): TemplateDraft;
