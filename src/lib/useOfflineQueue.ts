/**
 * useOfflineQueue
 *
 * Generic offline-first queue backed by localStorage.
 * Items are stored locally when offline and synced when the connection
 * is restored. Each item carries a `pendingSend` flag visible in the UI.
 *
 * Usage:
 *   const { enqueue, pendingCount } = useOfflineQueue<EmergencyAlertPayload>(
 *     'emergency-alerts',
 *     async (item) => {
 *       const res = await fetch('/api/emergency-alerts', { ... body: JSON.stringify(item) });
 *       if (!res.ok) throw new Error('Failed');
 *     }
 *   );
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export interface QueuedItem<T> {
  id: string;
  payload: T;
  queuedAt: string;
  attempts: number;
}

const MAX_ATTEMPTS = 5;

export function useOfflineQueue<T>(
  key: string,
  syncFn: (item: T) => Promise<void>,
) {
  const storageKey = `offline_queue_${key}`;
  const syncFnRef  = useRef(syncFn);
  syncFnRef.current = syncFn;

  function readQueue(): QueuedItem<T>[] {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as QueuedItem<T>[];
    } catch {
      return [];
    }
  }

  function writeQueue(q: QueuedItem<T>[]) {
    localStorage.setItem(storageKey, JSON.stringify(q));
  }

  const [queue, setQueue] = useState<QueuedItem<T>[]>(() => readQueue());

  // Sync queue state with localStorage
  function updateQueue(fn: (prev: QueuedItem<T>[]) => QueuedItem<T>[]) {
    setQueue((prev) => {
      const next = fn(prev);
      writeQueue(next);
      return next;
    });
  }

  /** Add an item to the queue and attempt immediate sync if online */
  function enqueue(payload: T): string {
    const id: string = crypto.randomUUID();
    const item: QueuedItem<T> = {
      id,
      payload,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    };
    updateQueue((prev) => [...prev, item]);
    // Try to sync immediately if online
    if (navigator.onLine) {
      void attemptSync([item]);
    }
    return id;
  }

  /** Remove a successfully synced item */
  function removeItem(id: string) {
    updateQueue((prev) => prev.filter((i) => i.id !== id));
  }

  /** Attempt to sync a list of items */
  const attemptSync = useCallback(async (items: QueuedItem<T>[]) => {
    for (const item of items) {
      if (item.attempts >= MAX_ATTEMPTS) continue;
      try {
        await syncFnRef.current(item.payload);
        removeItem(item.id);
      } catch {
        updateQueue((prev) =>
          prev.map((i) => i.id === item.id ? { ...i, attempts: i.attempts + 1 } : i)
        );
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Sync all pending items when coming back online */
  useEffect(() => {
    function onOnline() {
      const pending = readQueue();
      if (pending.length > 0) void attemptSync(pending);
    }
    window.addEventListener('online', onOnline);
    // Also try on mount in case we're already online with stale items
    if (navigator.onLine) onOnline();
    return () => window.removeEventListener('online', onOnline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptSync]);

  return {
    queue,
    pendingCount: queue.length,
    enqueue,
    removeItem,
  };
}
