// Civil dates, not instants: never convert a user's chosen day through a timezone.
export function validPlannerDate(value) {
  return typeof value === 'string' && /^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function shiftPlannerDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function templateDue(template, date) {
  return validPlannerDate(date) && template.enabled && date >= template.startsOn &&
    (template.repeat === 'daily' || (template.repeat === 'weekdays' && ![0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())));
}
export function plannerMonth(date) {
  const first = `${date.slice(0, 7)}-01`;
  const start = shiftPlannerDate(first, -((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => shiftPlannerDate(start, index));
}
