/** Optional device-local suggestions, never the authoritative journey record. */
const LIMIT = 5;
function storageKey(companyId: number, userId: string): string | null {
  return Number.isSafeInteger(companyId) && companyId > 0 && userId.trim()
    ? `iwb:recent-destinations:v1:${JSON.stringify([companyId, userId])}` : null;
}
function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length >= 2 && text.length <= 500 ? text : null;
}
function unique(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = clean(value);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    result.push(text);
    if (result.length === LIMIT) break;
  }
  return result;
}
export function readRecentDestinations(companyId: number, userId: string): string[] {
  const key = storageKey(companyId, userId);
  if (!key) return [];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(saved) ? unique(saved) : [];
  } catch { return []; }
}
/** Call only after a business trip has been durably saved/queued. */
export function rememberDestination(companyId: number, userId: string, value: unknown): void {
  const key = storageKey(companyId, userId), destination = clean(value);
  if (!key || !destination) return;
  try {
    localStorage.setItem(key, JSON.stringify(unique([
      destination, ...readRecentDestinations(companyId, userId),
    ])));
  } catch { /* A full/unavailable suggestion cache must never fail a trip save. */ }
}
