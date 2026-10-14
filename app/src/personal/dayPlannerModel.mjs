/** A day is the primary view. Merge headings, never copy tasks or change provenance. */
export function dayPlannerGroups(date, day, tasks) {
  const groups = new Map(), sectionTitles = new Map();
  const ensure = title => {
    if (!groups.has(title)) groups.set(title, { title, sectionId: undefined, tasks: [] });
    return groups.get(title);
  };
  for (const entry of day?.entries ?? []) for (const section of entry.sections) {
    if (section.kind !== 'tasks') continue;
    const group = ensure(section.title);
    group.sectionId ??= section.id;
    sectionTitles.set(section.id, section.title);
  }
  const seen = new Set();
  for (const task of tasks) {
    if (task.dueDate !== date || seen.has(task.id)) continue;
    seen.add(task.id);
    ensure(sectionTitles.get(task.plannerSectionId) ?? task.section ?? 'Personal').tasks.push(task);
  }
  if (!groups.size) ensure('Personal');
  return [...groups.values()];
}
