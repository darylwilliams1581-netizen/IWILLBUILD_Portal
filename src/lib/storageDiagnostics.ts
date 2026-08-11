/**
 * storageDiagnostics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Safe, non-blocking storage health checks.
 *
 * Provides:
 *   - Available quota / usage via StorageManager API (where supported)
 *   - Queue item count + total byte size from IndexedDB
 *   - Last upload failure timestamp
 *   - A human-readable storage warning level
 *
 * All functions are non-throwing — they return null/defaults on any error.
 * Safe to call on iOS WKWebView, Android WebView, and desktop browsers.
 */

import { openPhotoStoreReadonly } from './offlinePhotoStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export type StorageWarningLevel = 'ok' | 'low' | 'critical' | 'unknown';

export interface StorageQuota {
  /** Bytes used by this origin */
  usageBytes: number;
  /** Total quota available to this origin */
  quotaBytes: number;
  /** Percentage used (0–100) */
  usedPercent: number;
  /** Human-readable warning level */
  level: StorageWarningLevel;
}

export interface QueueStorageSummary {
  /** Number of items currently in the IDB queue */
  queuedItemCount: number;
  /** Total bytes of queued photo blobs */
  totalQueuedBytes: number;
  /** ISO timestamp of the last recorded upload failure, or null */
  lastUploadFailureAt: string | null;
  /** Human-readable size string, e.g. "4.2 MB" */
  totalQueuedSizeLabel: string;
}

export interface StorageDiagnostics {
  quota: StorageQuota | null;
  queue: QueueStorageSummary;
  /** True if the StorageManager API is available */
  storageManagerSupported: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Warn when less than 50 MB free */
const LOW_FREE_BYTES     = 50 * 1024 * 1024;
/** Critical when less than 10 MB free */
const CRITICAL_FREE_BYTES = 10 * 1024 * 1024;

// ── Last failure tracking ─────────────────────────────────────────────────────

const LAST_FAILURE_KEY = 'sos:lastUploadFailureAt';

/** Call this when an upload fails — records the timestamp in localStorage */
export function recordUploadFailure(): void {
  try {
    localStorage.setItem(LAST_FAILURE_KEY, new Date().toISOString());
  } catch { /* non-fatal */ }
}

/** Clear the last failure record (call on successful upload) */
export function clearUploadFailure(): void {
  try {
    localStorage.removeItem(LAST_FAILURE_KEY);
  } catch { /* non-fatal */ }
}

function getLastUploadFailure(): string | null {
  try {
    return localStorage.getItem(LAST_FAILURE_KEY);
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function warningLevel(usageBytes: number, quotaBytes: number): StorageWarningLevel {
  if (quotaBytes === 0) return 'unknown';
  const freeBytes = quotaBytes - usageBytes;
  if (freeBytes < CRITICAL_FREE_BYTES) return 'critical';
  if (freeBytes < LOW_FREE_BYTES)      return 'low';
  return 'ok';
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Query the StorageManager API for quota/usage. Returns null if unsupported. */
export async function queryStorageQuota(): Promise<StorageQuota | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const usedPercent = quota > 0 ? Math.round((usage / quota) * 100) : 0;
    return {
      usageBytes:  usage,
      quotaBytes:  quota,
      usedPercent,
      level: warningLevel(usage, quota),
    };
  } catch {
    return null;
  }
}

/** Count queued items and sum their blob sizes from IDB. */
export async function queryQueueSummary(): Promise<QueueStorageSummary> {
  let queuedItemCount  = 0;
  let totalQueuedBytes = 0;

  try {
    const items = await openPhotoStoreReadonly();
    queuedItemCount  = items.length;
    totalQueuedBytes = items.reduce((sum, item) => sum + (item.file?.size ?? 0), 0);
  } catch { /* IDB unavailable — return zeros */ }

  return {
    queuedItemCount,
    totalQueuedBytes,
    totalQueuedSizeLabel: formatBytes(totalQueuedBytes),
    lastUploadFailureAt:  getLastUploadFailure(),
  };
}

/** Full diagnostics snapshot — safe to call at any time. */
export async function getStorageDiagnostics(): Promise<StorageDiagnostics> {
  const [quota, queue] = await Promise.all([
    queryStorageQuota(),
    queryQueueSummary(),
  ]);
  return {
    quota,
    queue,
    storageManagerSupported: !!navigator.storage?.estimate,
  };
}

/** Returns a user-facing warning message, or null if storage is healthy. */
export async function getStorageWarningMessage(): Promise<string | null> {
  try {
    const { quota, queue } = await getStorageDiagnostics();

    if (quota?.level === 'critical') {
      return `Your device storage is almost full (${formatBytes(quota.quotaBytes - quota.usageBytes)} free). Photos may not save correctly. Free up space and try again.`;
    }
    if (quota?.level === 'low') {
      return `Device storage is getting low (${formatBytes(quota.quotaBytes - quota.usageBytes)} free). Consider freeing up space.`;
    }
    if (queue.queuedItemCount >= 20) {
      return `${queue.queuedItemCount} photos (${queue.totalQueuedSizeLabel}) are waiting to upload. Connect to Wi-Fi to sync.`;
    }
    return null;
  } catch {
    return null;
  }
}
