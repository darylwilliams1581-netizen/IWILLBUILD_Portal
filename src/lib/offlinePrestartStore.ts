const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PER_JOB = 20;

interface CachedPrestart<T> {
  savedAt: string;
  value: T;
}

function keyFor(jobId: number): string {
  return `iwb_site_prestarts_${jobId}`;
}

function readEntries<T extends { id: number }>(jobId: number): CachedPrestart<T>[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(jobId)) ?? '[]') as CachedPrestart<T>[];
    const now = Date.now();
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry?.value?.id > 0 && now - Date.parse(entry.savedAt) <= MAX_AGE_MS)
      : [];
  } catch {
    return [];
  }
}

export function readCachedSitePrestarts<T extends { id: number }>(jobId: number): T[] {
  return readEntries<T>(jobId).map((entry) => entry.value);
}

export function readCachedSitePrestart<T extends { id: number }>(jobId: number, id: number): T | null {
  return readEntries<T>(jobId).find((entry) => entry.value.id === id)?.value ?? null;
}

export function cacheSitePrestart<T extends { id: number }>(jobId: number, value: T): void {
  if (typeof localStorage === 'undefined' || !Number.isInteger(jobId) || jobId <= 0) return;
  const current = readEntries<T>(jobId);
  const previous = current.find((entry) => entry.value.id === value.id)?.value;
  const merged = previous ? { ...previous, ...value } : value;
  const entries = current.filter((entry) => entry.value.id !== value.id);
  const next = [{ savedAt: new Date().toISOString(), value: merged }, ...entries].slice(0, MAX_PER_JOB);
  localStorage.setItem(keyFor(jobId), JSON.stringify(next));
}
