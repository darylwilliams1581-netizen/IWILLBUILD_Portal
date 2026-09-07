/**
 * Durable JSON queue for small field actions.
 *
 * Each queue is ordered, stored in localStorage, capped at 100 items, and
 * pruned after seven days. A failed item blocks newer items in the same queue
 * so actions such as sign-in then sign-out cannot be replayed out of order.
 * Photos continue to use offlinePhotoStore/usePhotoUploadQueue instead.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAppPlugin } from './capacitor-plugins';

export type OfflineQueueStatus = 'saved' | 'syncing' | 'failed';

export interface QueuedItem<T> {
  id: string;
  payload: T;
  queuedAt: string;
  updatedAt: string;
  attempts: number;
  status: OfflineQueueStatus;
  dedupeKey?: string;
  lastError?: string;
  nextAttemptAt?: string;
}

export interface EnqueueOptions {
  /** Replace an older unsent item with the same key (draft autosave). */
  dedupeKey?: string;
  /** Stable queue id when the caller already has one. */
  id?: string;
}

export class OfflineQueueSyncError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = 'OfflineQueueSyncError';
    this.retryable = retryable;
  }
}

const MAX_ATTEMPTS = 5;
const MAX_ITEMS = 100;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_SYNC_MS = 60_000;
const CHANGE_EVENT = 'iwb:offline-queue-change';
const queueLocks = new Map<string, Promise<void>>();

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function storageKeyFor(key: string): string {
  return `offline_queue_${key}`;
}

function normaliseQueue<T>(value: unknown): QueuedItem<T>[] {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value
    .filter((candidate): candidate is QueuedItem<T> => {
      if (!candidate || typeof candidate !== 'object') return false;
      const item = candidate as Partial<QueuedItem<T>>;
      const queuedAt = Date.parse(String(item.queuedAt ?? ''));
      return typeof item.id === 'string' && item.id.length > 0 && Number.isFinite(queuedAt) && now - queuedAt <= MAX_AGE_MS;
    })
    .slice(0, MAX_ITEMS)
    .map((item) => {
      const updatedAt = item.updatedAt || item.queuedAt;
      const staleSync = item.status === 'syncing' && now - Date.parse(updatedAt) > STALE_SYNC_MS;
      return {
        ...item,
        attempts: Number.isFinite(item.attempts) ? item.attempts : 0,
        status: staleSync ? 'saved' : (item.status ?? 'saved'),
        updatedAt,
      };
    });
}

export function readOfflineQueue<T>(key: string): QueuedItem<T>[] {
  if (!canUseStorage()) return [];
  try {
    return normaliseQueue<T>(JSON.parse(localStorage.getItem(storageKeyFor(key)) ?? '[]'));
  } catch {
    return [];
  }
}

function emitQueueChange(key: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key } }));
}

function writeOfflineQueue<T>(key: string, queue: QueuedItem<T>[]): void {
  if (!canUseStorage()) return;
  localStorage.setItem(storageKeyFor(key), JSON.stringify(queue));
  emitQueueChange(key);
}

function mutateOfflineQueue<T>(key: string, change: (queue: QueuedItem<T>[]) => QueuedItem<T>[]): QueuedItem<T>[] {
  const next = change(readOfflineQueue<T>(key));
  writeOfflineQueue(key, next);
  return next;
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function backoffMs(attempts: number): number {
  return Math.min(60_000, 1_000 * (2 ** Math.max(0, attempts - 1)));
}

export function useOfflineQueue<T>(key: string, syncFn: (item: T) => Promise<void>) {
  const syncFnRef = useRef(syncFn);
  syncFnRef.current = syncFn;
  const [queue, setQueue] = useState<QueuedItem<T>[]>(() => readOfflineQueue<T>(key));

  const refresh = useCallback(() => {
    setQueue(readOfflineQueue<T>(key));
  }, [key]);

  const attemptSync = useCallback(async (): Promise<void> => {
    if (!isOnline()) return;
    const storageKey = storageKeyFor(key);
    const previous = queueLocks.get(storageKey) ?? Promise.resolve();

    const run = previous.catch(() => undefined).then(async () => {
      while (isOnline()) {
        const current = readOfflineQueue<T>(key);
        const item = current[0];
        if (!item || item.status === 'failed' || item.status === 'syncing') break;

        const retryAt = item.nextAttemptAt ? Date.parse(item.nextAttemptAt) : 0;
        if (Number.isFinite(retryAt) && retryAt > Date.now()) break;

        const syncingAt = new Date().toISOString();
        mutateOfflineQueue<T>(key, (items) => items.map((candidate) => candidate.id === item.id
          ? { ...candidate, status: 'syncing', updatedAt: syncingAt, lastError: undefined }
          : candidate));

        try {
          await syncFnRef.current(item.payload);
          mutateOfflineQueue<T>(key, (items) => items.filter((candidate) => candidate.id !== item.id));
        } catch (error) {
          const retryable = !(error instanceof OfflineQueueSyncError) || error.retryable;
          const attempts = retryable ? item.attempts + 1 : MAX_ATTEMPTS;
          const failed = attempts >= MAX_ATTEMPTS;
          const changedAt = new Date().toISOString();
          mutateOfflineQueue<T>(key, (items) => items.map((candidate) => candidate.id === item.id
            ? {
                ...candidate,
                attempts,
                status: failed ? 'failed' : 'saved',
                updatedAt: changedAt,
                lastError: error instanceof Error ? error.message : 'Sync failed',
                nextAttemptAt: failed ? undefined : new Date(Date.now() + backoffMs(attempts)).toISOString(),
              }
            : candidate));
          break;
        }
      }
    });

    queueLocks.set(storageKey, run);
    try {
      await run;
    } finally {
      if (queueLocks.get(storageKey) === run) queueLocks.delete(storageKey);
      refresh();
    }
  }, [key, refresh]);

  const enqueue = useCallback((payload: T, options: EnqueueOptions = {}): string => {
    const now = new Date().toISOString();
    const current = readOfflineQueue<T>(key);
    const existingIndex = options.dedupeKey
      ? current.findIndex((item) => item.dedupeKey === options.dedupeKey && item.status !== 'syncing')
      : -1;

    let id = options.id ?? crypto.randomUUID();
    let next: QueuedItem<T>[];
    if (existingIndex >= 0) {
      id = current[existingIndex].id;
      next = current.map((item, index) => index === existingIndex
        ? {
            ...item,
            payload,
            attempts: 0,
            status: 'saved',
            updatedAt: now,
            lastError: undefined,
            nextAttemptAt: undefined,
          }
        : item);
    } else {
      if (current.length >= MAX_ITEMS) {
        throw new Error('Offline queue is full. Connect to Wi-Fi and sync before saving more work.');
      }
      next = [...current, {
        id,
        payload,
        queuedAt: now,
        updatedAt: now,
        attempts: 0,
        status: 'saved',
        dedupeKey: options.dedupeKey,
      }];
    }

    writeOfflineQueue(key, next);
    setQueue(next);
    if (isOnline()) void attemptSync();
    return id;
  }, [attemptSync, key]);

  const removeItem = useCallback((id: string) => {
    const next = mutateOfflineQueue<T>(key, (items) => items.filter((item) => item.id !== id));
    setQueue(next);
  }, [key]);

  const retryItem = useCallback((id: string) => {
    const now = new Date().toISOString();
    const next = mutateOfflineQueue<T>(key, (items) => items.map((item) => item.id === id
      ? { ...item, attempts: 0, status: 'saved', updatedAt: now, lastError: undefined, nextAttemptAt: undefined }
      : item));
    setQueue(next);
    if (isOnline()) void attemptSync();
  }, [attemptSync, key]);

  const retryAll = useCallback(() => {
    const now = new Date().toISOString();
    const next = mutateOfflineQueue<T>(key, (items) => items.map((item) => ({
      ...item,
      attempts: 0,
      status: 'saved',
      updatedAt: now,
      lastError: undefined,
      nextAttemptAt: undefined,
    })));
    setQueue(next);
    if (isOnline()) void attemptSync();
  }, [attemptSync, key]);

  useEffect(() => {
    function onQueueChange(event: Event) {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === key) refresh();
    }
    window.addEventListener(CHANGE_EVENT, onQueueChange);
    return () => window.removeEventListener(CHANGE_EVENT, onQueueChange);
  }, [key, refresh]);

  useEffect(() => {
    function onOnline() {
      void attemptSync();
    }
    function onServiceWorkerMessage(event: Event) {
      const message = event as globalThis.MessageEvent;
      if ((message.data as { type?: string })?.type === 'OFFLINE_QUEUE_FLUSH') onOnline();
    }
    function onVisible() {
      if (document.visibilityState === 'visible') onOnline();
    }

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);

    let removeAppListener: (() => Promise<void>) | undefined;
    void getAppPlugin().then(async (app) => {
      if (!app) return;
      const handle = await app.App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
        if (isActive) onOnline();
      });
      removeAppListener = () => handle.remove();
    }).catch(() => undefined);

    if (isOnline()) void attemptSync();
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
      void removeAppListener?.();
    };
  }, [attemptSync]);

  useEffect(() => {
    const first = queue[0];
    if (!first || first.status !== 'saved' || !first.nextAttemptAt || !isOnline()) return;
    const delay = Math.max(0, Date.parse(first.nextAttemptAt) - Date.now());
    const timer = window.setTimeout(() => void attemptSync(), delay);
    return () => window.clearTimeout(timer);
  }, [attemptSync, queue]);

  return {
    queue,
    pendingCount: queue.filter((item) => item.status !== 'failed').length,
    failedCount: queue.filter((item) => item.status === 'failed').length,
    enqueue,
    removeItem,
    retryItem,
    retryAll,
    attemptSync,
  };
}
