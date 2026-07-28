/**
 * drayl/date.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Date helpers used by persona.ts (annette.ts).
 */

/**
 * Returns the number of days until the given date string (positive = future,
 * negative = past, 0 = today). Returns null if the value is falsy or unparseable.
 */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  // Compare date-only (strip time)
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetMs = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24));
}

/**
 * Returns true if the given date string is strictly before today (i.e. overdue).
 */
export function isBeforeToday(dateStr: string | null | undefined): boolean {
  const days = daysUntil(dateStr);
  return days !== null && days < 0;
}
