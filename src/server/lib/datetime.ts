/**
 * datetime.ts — MySQL-safe datetime helpers.
 *
 * toMySQLDatetime(value) converts a Date object or ISO-8601 string to the
 * UTC string format MySQL DATETIME columns expect: "YYYY-MM-DD HH:mm:ss".
 * Returns null for any invalid, empty, or unparseable input so callers can
 * safely fall back to NOW() / CURRENT_TIMESTAMP.
 *
 * NEVER use Date.toISOString() for MySQL writes — it produces the "Z" suffix
 * which MySQL rejects in strict mode.
 */

export function toMySQLDatetime(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    d = new Date(value as string | number);
  } else {
    return null;
  }

  // isNaN check works on Date objects via valueOf()
  if (isNaN(d.getTime())) return null;

  // Format as UTC "YYYY-MM-DD HH:mm:ss" — no trailing Z, no milliseconds
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}
