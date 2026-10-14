// Upgrade legacy task-only templates in an unsaved draft, never during reading/storage.
export function createTemplateDraft(template, date) {
  const titles = template
    ? [...new Set(template.items.map(item => item.section.trim()).filter(Boolean))]
    : ['Morning Flow', 'Afternoon Flow', 'Evening Flow', 'LIFE', 'FRTL', 'XELAB', 'MYST', 'Daily Journal'];
  const sections = template?.sections?.map(section => ({ ...section })) ?? (titles.length ? titles : ['Personal']).map(title => ({
    id: `section_${crypto.randomUUID()}`, title, kind: !template && title === 'Daily Journal' ? 'journal' : 'tasks',
  }));
  return {
    ...(template ? { id: template.id, expectedUpdatedAt: template.updatedAt } : {}),
    name: template?.name ?? '', repeat: template?.repeat ?? 'daily', enabled: template?.enabled ?? true,
    startsOn: template?.startsOn ?? date, color: template?.color ?? '#f4bc59', sections,
    items: template?.items.map(item => ({ ...item })) ?? [],
  };
}

export function templateSaveInput(draft) {
  return {
    ...draft, name: draft.name.trim(),
    sections: draft.sections?.map(section => ({ ...section, title: section.title.trim() })),
    // Optional blank rows are editing affordances, not tasks or validation errors.
    items: draft.items.filter(item => item.title.trim()).map(item => ({ title: item.title.trim(), section: item.section.trim() })),
  };
}
