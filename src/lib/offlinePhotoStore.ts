/**
 * offlinePhotoStore
 * ─────────────────────────────────────────────────────────────────────────────
 * IndexedDB persistence for the photo upload queue.
 *
 * Photos are written here immediately when captured — before any network
 * attempt. This means a photo is NEVER lost due to:
 *   - App close / browser refresh
 *   - Network failure during upload
 *   - Device going offline mid-session
 *
 * The File blob is stored directly in IDB (supported in all modern browsers
 * and WKWebView / Android WebView). On reload, the queue hook reads all
 * pending/failed items back and resumes uploading.
 *
 * DB name:  sos-photo-queue
 * Store:    pending_photos
 * Key:      clientId (string)
 */

export interface StoredPhoto {
  clientId: string;
  jobId: number;
  fileName: string;
  mimeType: string;
  /** The raw File blob — stored in IDB, recreated on reload */
  file: File;
  /** Timestamp when the photo was captured / selected */
  capturedAt: number;
  /** How many upload attempts have been made */
  attempts: number;
}

const DB_NAME    = 'sos-photo-queue';
const STORE_NAME = 'pending_photos';
const DB_VERSION = 1;

// ── Safety limits ─────────────────────────────────────────────────────────────

/** Maximum number of pending items per job before new enqueues are rejected.
 *
 * WHY 12:
 * Each offline photo is a full-resolution JPEG blob held in WKWebView's JS
 * heap via IndexedDB. On a 12MP iPhone at quality 84 that's ~2–4 MB per photo.
 * 12 photos × 4 MB = ~48 MB peak heap pressure — well within the ~200 MB
 * WKWebView budget before iOS starts sending memory warnings.
 *
 * The previous limit of 50 allowed up to ~200 MB of blobs in the queue at
 * once, which could trigger JETSAM kills on older iPhones (6s/7 with 2 GB RAM)
 * when combined with the rest of the app's memory footprint.
 *
 * Users who need more than 12 offline photos should connect to Wi-Fi to sync
 * the queue before capturing more. The error message below explains this.
 */
export const QUEUE_MAX_ITEMS = 12;
/** Maximum total bytes stored across ALL jobs before new enqueues are rejected */
export const QUEUE_MAX_BYTES = 200 * 1024 * 1024; // 200 MB
/** Items older than this (ms) with > 5 failed attempts are pruned on open */
const STALE_ITEM_AGE_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days
const STALE_MAX_ATTEMPTS = 5;

// ── Open / init ───────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'clientId' });
        store.createIndex('jobId', 'jobId', { unique: false });
        store.createIndex('capturedAt', 'capturedAt', { unique: false });
      }
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      // Prune stale items on open — non-blocking
      void pruneStaleItems(_db);
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): { store: IDBObjectStore; done: Promise<void> } {
  const t = db.transaction(STORE_NAME, mode);
  const store = t.objectStore(STORE_NAME);
  const done = new Promise<void>((res, rej) => {
    t.oncomplete = () => res();
    t.onerror    = () => rej(t.error);
    t.onabort    = () => rej(new Error('IDB transaction aborted'));
  });
  return { store, done };
}

function req2promise<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}

// ── Stale item pruning ────────────────────────────────────────────────────────

/** Remove items that are very old AND have exceeded the max retry attempts. */
async function pruneStaleItems(db: IDBDatabase): Promise<void> {
  try {
    const { store, done } = tx(db, 'readwrite');
    const cutoff = Date.now() - STALE_ITEM_AGE_MS;
    const allReq = store.getAll() as IDBRequest<StoredPhoto[]>;
    allReq.onsuccess = () => {
      const all = allReq.result ?? [];
      for (const item of all) {
        if (item.capturedAt < cutoff && item.attempts >= STALE_MAX_ATTEMPTS) {
          store.delete(item.clientId);
        }
      }
    };
    await done;
  } catch { /* non-fatal */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read all stored photos (all jobs) — used by storageDiagnostics.
 * Returns an empty array on any error.
 */
export async function openPhotoStoreReadonly(): Promise<StoredPhoto[]> {
  try {
    const db = await openDb();
    const { store } = tx(db, 'readonly');
    return await req2promise<StoredPhoto[]>(store.getAll() as IDBRequest<StoredPhoto[]>);
  } catch {
    return [];
  }
}

/**
 * Check whether adding `newBytes` would exceed the queue limits.
 * Returns an error string if rejected, or null if OK to proceed.
 */
export async function checkQueueCapacity(
  jobId: number,
  newBytes: number,
): Promise<string | null> {
  try {
    const all = await openPhotoStoreReadonly();
    const jobItems  = all.filter(i => i.jobId === jobId);
    const totalSize = all.reduce((s, i) => s + (i.file?.size ?? 0), 0);

    if (jobItems.length >= QUEUE_MAX_ITEMS) {
      return `Queue full — ${QUEUE_MAX_ITEMS} photos already waiting to upload. Connect to Wi-Fi to sync before taking more.`;
    }
    if (totalSize + newBytes > QUEUE_MAX_BYTES) {
      const mbUsed = (totalSize / (1024 * 1024)).toFixed(0);
      return `Device storage limit reached (${mbUsed} MB queued). Connect to Wi-Fi to upload before adding more photos.`;
    }
    return null;
  } catch {
    return null; // If we can't check, allow the save — fail gracefully
  }
}

/** Save a photo to the offline store immediately on capture. */
export async function savePhoto(photo: StoredPhoto): Promise<void> {
  try {
    const db = await openDb();
    const { store, done } = tx(db, 'readwrite');
    store.put(photo);
    await done;
  } catch (e) {
    // IDB unavailable (private browsing on some iOS) — degrade gracefully
    console.warn('[offlinePhotoStore] savePhoto failed:', e);
  }
}

/** Load all pending photos for a job (survives app restart). */
export async function loadPendingPhotos(jobId: number): Promise<StoredPhoto[]> {
  try {
    const db = await openDb();
    const { store } = tx(db, 'readonly');
    const index = store.index('jobId');
    const results = await req2promise<StoredPhoto[]>(
      index.getAll(IDBKeyRange.only(jobId)) as IDBRequest<StoredPhoto[]>
    );
    // Sort oldest-first so uploads resume in capture order
    return results.sort((a, b) => a.capturedAt - b.capturedAt);
  } catch (e) {
    console.warn('[offlinePhotoStore] loadPendingPhotos failed:', e);
    return [];
  }
}

/** Remove a photo once it has been successfully uploaded. */
export async function removePhoto(clientId: string): Promise<void> {
  try {
    const db = await openDb();
    const { store, done } = tx(db, 'readwrite');
    store.delete(clientId);
    await done;
  } catch (e) {
    console.warn('[offlinePhotoStore] removePhoto failed:', e);
  }
}

/** Increment attempt counter (called before each upload attempt). */
export async function incrementAttempts(clientId: string): Promise<void> {
  try {
    const db = await openDb();
    const { store, done } = tx(db, 'readwrite');
    const getReq = store.get(clientId) as IDBRequest<StoredPhoto | undefined>;
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (item) store.put({ ...item, attempts: item.attempts + 1 });
    };
    await done;
  } catch (e) {
    console.warn('[offlinePhotoStore] incrementAttempts failed:', e);
  }
}

/** Remove all photos for a job (e.g. after confirmed full sync). */
export async function clearJobPhotos(jobId: number): Promise<void> {
  try {
    const db = await openDb();
    const { store, done } = tx(db, 'readwrite');
    const index = store.index('jobId');
    const keys = await req2promise<IDBValidKey[]>(
      index.getAllKeys(IDBKeyRange.only(jobId)) as IDBRequest<IDBValidKey[]>
    );
    keys.forEach((k) => store.delete(k));
    await done;
  } catch (e) {
    console.warn('[offlinePhotoStore] clearJobPhotos failed:', e);
  }
}
