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

// ── Public API ────────────────────────────────────────────────────────────────

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
