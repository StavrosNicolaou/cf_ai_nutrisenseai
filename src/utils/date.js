export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeDate(value) {
  if (!value) return todayISO();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todayISO();
}