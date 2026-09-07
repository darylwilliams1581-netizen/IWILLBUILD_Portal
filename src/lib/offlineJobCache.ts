import type { Job } from './jobs-api';

export type CachedJobSummary = Pick<Job, 'id' | 'jobNumber' | 'name' | 'status'> & Partial<Job>;

interface CachedRecord<T> {
  id: number;
  cachedAt: number;
  value: T;
}

const DB_NAME = 'iwb-field-cache';
const DB_VERSION = 1;
const FULL_STORE = 'jobs';
const ACTIVE_STORE = 'active-jobs';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Device cache request failed'));
  });
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FULL_STORE)) db.createObjectStore(FULL_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ACTIVE_STORE)) db.createObjectStore(ACTIVE_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Device cache could not open'));
  });
}

async function writeMany<T extends { id: number }>(storeName: string, values: T[], replace = false): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    if (replace) store.clear();
    const cachedAt = Date.now();
    for (const value of values) store.put({ id: value.id, cachedAt, value } satisfies CachedRecord<T>);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Device cache write failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Device cache write aborted'));
  });
  db.close();
}

async function readAll<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  if (!db) return [];
  try {
    const records = await requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).getAll()) as CachedRecord<T>[];
    const cutoff = Date.now() - MAX_AGE_MS;
    return records.filter((record) => record.cachedAt >= cutoff).map((record) => record.value);
  } finally {
    db.close();
  }
}

export function cacheJobs(jobs: Job[]): Promise<void> {
  return writeMany(FULL_STORE, jobs);
}

export async function cacheJob(job: Job): Promise<void> {
  await writeMany(FULL_STORE, [job]);
}

export function readCachedJobs(): Promise<Job[]> {
  return readAll<Job>(FULL_STORE);
}

export async function readCachedJob(id: number): Promise<Job | null> {
  return (await readCachedJobs()).find((job) => job.id === id) ?? null;
}

export function cacheActiveJobs(jobs: CachedJobSummary[]): Promise<void> {
  return writeMany(ACTIVE_STORE, jobs, true);
}

export function readCachedActiveJobs(): Promise<CachedJobSummary[]> {
  return readAll<CachedJobSummary>(ACTIVE_STORE);
}
