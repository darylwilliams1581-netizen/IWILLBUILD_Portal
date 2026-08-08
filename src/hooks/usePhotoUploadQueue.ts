/**
 * usePhotoUploadQueue
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages a queue of pending photo uploads with:
 *
 * OFFLINE-FIRST:
 *   - Photos are saved to IndexedDB immediately on capture (before any upload)
 *   - Queue is restored from IDB on mount — survives app close / refresh
 *   - Network-aware: pauses when offline, auto-resumes when connection returns
 *   - Manual retry available at any time
 *
 * SYNC STATES (field-friendly):
 *   saved      — on device, not yet attempted (was: pending)
 *   preparing  — resizing/normalising locally
 *   uploading  — actively sending to server
 *   synced     — confirmed on server (was: uploaded)
 *   failed     — upload failed, retry available
 *
 * CONCURRENCY: max 2 simultaneous uploads
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  savePhoto,
  removePhoto,
  loadPendingPhotos,
  incrementAttempts,
} from '@/lib/offlinePhotoStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UploadStatus = 'saved' | 'preparing' | 'uploading' | 'synced' | 'failed';

export interface PendingPhoto {
  clientId: string;
  fileName: string;
  mimeType: string;
  /** Blob URL for local preview — null for HEIC/unknown types */
  localPreviewUrl: string | null;
  status: UploadStatus;
  /** 0–100 */
  progress: number;
  /** Set on success */
  serverPhotoId: number | null;
  /** Set on failure */
  error: string | null;
  /** The prepared File ready to upload */
  _file: File | null;
  /** Whether this item was restored from IDB on mount */
  restoredFromDevice: boolean;
}

interface UsePhotoUploadQueueOptions {
  jobId: number;
  onBatchComplete?: (uploaded: number, failed: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _clientIdCounter = 0;
function nextClientId(): string {
  return `tmp_${Date.now()}_${++_clientIdCounter}`;
}

const PREVIEW_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const HEIC_MIMES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
const HEIC_EXTS = ['heic', 'heif'];
const MAX_PX = 1920;
const JPEG_QUALITY = 0.88;
const CONCURRENCY = 2;

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iP(hone|od|ad)/.test(navigator.userAgent);
}

function canPreview(file: File): boolean {
  return PREVIEW_TYPES.includes(file.type);
}

async function normaliseToJpeg(file: File): Promise<File | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  let { width, height } = bitmap;
  if (width > MAX_PX || height > MAX_PX) {
    if (width >= height) { height = Math.round((height / width) * MAX_PX); width = MAX_PX; }
    else                 { width  = Math.round((width  / height) * MAX_PX); height = MAX_PX; }
  }

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');
  } catch {
    bitmap.close();
    return null;
  }

  if (!ctx) { bitmap.close(); return file; }

  try {
    ctx.drawImage(bitmap, 0, 0, width, height);
  } catch {
    bitmap.close();
    return null;
  }
  bitmap.close();

  return await new Promise<File>((resolve) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        const stem = file.name.replace(/\.[^.]+$/, '');
        resolve(new File([blob], `${stem}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
      }, 'image/jpeg', JPEG_QUALITY);
    } catch {
      resolve(file);
    }
  });
}

async function prepareFile(file: File): Promise<File> {
  if (isIos()) return file;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isHeic = HEIC_EXTS.includes(ext) || HEIC_MIMES.includes(file.type);
  if (isHeic || PREVIEW_TYPES.includes(file.type)) {
    const normalised = await normaliseToJpeg(file);
    return normalised ?? file;
  }
  return file;
}

function uploadFileXhr(
  jobId: number,
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ id: number }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('photos', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/jobs/${jobId}/photos`);
    xhr.withCredentials = true;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText) as { photos?: { id: number }[]; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && data.photos?.[0]) {
          resolve(data.photos[0]);
        } else {
          reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('No connection — saved on device')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.send(fd);
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePhotoUploadQueue({ jobId, onBatchComplete }: UsePhotoUploadQueueOptions) {
  const [queue, setQueue] = useState<PendingPhoto[]>([]);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [restoredFromDevice, setRestoredFromDevice] = useState(false);

  const activeRef  = useRef(0);
  const queueRef   = useRef<PendingPhoto[]>([]);
  queueRef.current = queue;

  // ── Network listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    const handleOnline  = () => { setIsOnline(true);  setTimeout(() => processNext(), 500); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Restore from IDB on mount ──────────────────────────────────────────────

  useEffect(() => {
    if (!jobId || isNaN(jobId)) return;

    void (async () => {
      const stored = await loadPendingPhotos(jobId);
      if (stored.length === 0) { setRestoredFromDevice(true); return; }

      const restored: PendingPhoto[] = stored.map((s) => ({
        clientId:          s.clientId,
        fileName:          s.fileName,
        mimeType:          s.mimeType,
        localPreviewUrl:   canPreview(s.file) ? URL.createObjectURL(s.file) : null,
        status:            'saved' as UploadStatus,
        progress:          0,
        serverPhotoId:     null,
        error:             null,
        _file:             s.file,
        restoredFromDevice: true,
      }));

      setQueue(restored);
      setRestoredFromDevice(true);

      // Kick off uploads if online
      if (navigator.onLine) setTimeout(() => processNext(), 200);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // ── Mutators ───────────────────────────────────────────────────────────────

  const updateItem = useCallback((clientId: string, patch: Partial<PendingPhoto>) => {
    setQueue((prev) => prev.map((item) =>
      item.clientId === clientId ? { ...item, ...patch } : item
    ));
  }, []);

  const removeItem = useCallback((clientId: string) => {
    setQueue((prev) => {
      const item = prev.find((i) => i.clientId === clientId);
      if (item?.localPreviewUrl) URL.revokeObjectURL(item.localPreviewUrl);
      return prev.filter((i) => i.clientId !== clientId);
    });
    // Remove from IDB too
    void removePhoto(clientId);
  }, []);

  // ── Process queue (concurrency-controlled, network-aware) ─────────────────

  const processNext = useCallback(() => {
    if (!navigator.onLine) return; // Don't attempt when offline

    const current = queueRef.current;
    const pending = current.filter((i) => i.status === 'saved' || i.status === 'preparing');
    if (pending.length === 0 || activeRef.current >= CONCURRENCY) return;

    const next = current.find((i) => i.status === 'saved');
    if (!next) return;

    activeRef.current += 1;
    const { clientId } = next;

    // Step 1: preparing (normalise/resize locally)
    updateItem(clientId, { status: 'preparing', progress: 0 });
    void incrementAttempts(clientId);

    void (async () => {
      let file: File | null = next._file;
      if (!file) {
        updateItem(clientId, { status: 'failed', error: 'File missing — please retry' });
        activeRef.current -= 1;
        processNext();
        return;
      }

      try {
        file = await prepareFile(file);
      } catch {
        // If prepare fails, use raw file
      }

      // Step 2: uploading
      updateItem(clientId, { status: 'uploading', progress: 0, _file: file });

      try {
        const result = await uploadFileXhr(
          jobId,
          file,
          (pct) => updateItem(clientId, { progress: pct }),
        );

        // Revoke blob URL — server is now the source of truth
        const item = queueRef.current.find((i) => i.clientId === clientId);
        if (item?.localPreviewUrl) URL.revokeObjectURL(item.localPreviewUrl);

        // Remove from IDB — confirmed synced
        void removePhoto(clientId);

        updateItem(clientId, {
          status:            'synced',
          progress:          100,
          serverPhotoId:     result.id,
          localPreviewUrl:   null,
          error:             null,
          restoredFromDevice: false,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upload failed';
        updateItem(clientId, {
          status: 'failed',
          error:  msg,
        });
        // Keep in IDB — will retry on next session or manual retry
      } finally {
        activeRef.current -= 1;

        // Check if batch is complete
        const updated = queueRef.current;
        const stillActive = updated.filter(
          (i) => i.status === 'saved' || i.status === 'preparing' || i.status === 'uploading'
        );
        if (stillActive.length === 0) {
          const syncedCount = updated.filter((i) => i.status === 'synced').length;
          const failedCount = updated.filter((i) => i.status === 'failed').length;
          if (syncedCount > 0 || failedCount > 0) {
            onBatchComplete?.(syncedCount, failedCount);
          }
        }

        processNext();
      }
    })();

    // Note: do NOT call processNext() here again — the finally block above already
    // chains the next item. Calling it here races against the async state update
    // and causes the same item to be picked up twice (double-upload).
  }, [jobId, updateItem, onBatchComplete]);

  // ── Enqueue files ──────────────────────────────────────────────────────────

  const enqueueFiles = useCallback((files: File[]) => {
    const now = Date.now();

    const newItems: PendingPhoto[] = files.map((file, i) => {
      const clientId = nextClientId();
      const isPreviewable = canPreview(file);
      const localPreviewUrl = isPreviewable ? URL.createObjectURL(file) : null;

      // Save to IDB immediately — photo is safe on device before any upload
      void savePhoto({
        clientId,
        jobId,
        fileName:   file.name,
        mimeType:   file.type || 'application/octet-stream',
        file,
        capturedAt: now + i,
        attempts:   0,
      });

      return {
        clientId,
        fileName:          file.name,
        mimeType:          file.type || 'application/octet-stream',
        localPreviewUrl,
        status:            'saved' as UploadStatus,
        progress:          0,
        serverPhotoId:     null,
        error:             null,
        _file:             file,
        restoredFromDevice: false,
      };
    });

    setQueue((prev) => [...prev, ...newItems]);

    // Only kick off upload if online — fire up to CONCURRENCY slots
    if (navigator.onLine) {
      for (let i = 0; i < Math.min(files.length, CONCURRENCY); i++) {
        setTimeout(() => processNext(), i * 50);
      }
    }
  }, [jobId, processNext]);

  // ── Retry a failed item ────────────────────────────────────────────────────

  const retryItem = useCallback((clientId: string) => {
    setQueue((prev) => prev.map((item) =>
      item.clientId === clientId && item.status === 'failed'
        ? { ...item, status: 'saved', progress: 0, error: null }
        : item
    ));
    if (navigator.onLine) setTimeout(() => processNext(), 0);
  }, [processNext]);

  // ── Clear synced items ─────────────────────────────────────────────────────

  const clearUploaded = useCallback(() => {
    setQueue((prev) => {
      prev.filter((i) => i.status === 'synced' && i.localPreviewUrl)
        .forEach((i) => URL.revokeObjectURL(i.localPreviewUrl!));
      return prev.filter((i) => i.status !== 'synced');
    });
  }, []);

  const clearAll = useCallback(() => {
    setQueue((prev) => {
      prev.filter((i) => i.localPreviewUrl).forEach((i) => URL.revokeObjectURL(i.localPreviewUrl!));
      return [];
    });
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────

  const isUploading   = queue.some((i) => i.status === 'uploading' || i.status === 'preparing');
  const uploadedCount = queue.filter((i) => i.status === 'synced').length;
  const failedCount   = queue.filter((i) => i.status === 'failed').length;
  const savedCount    = queue.filter((i) => i.status === 'saved').length;
  const pendingCount  = queue.filter(
    (i) => i.status === 'saved' || i.status === 'preparing' || i.status === 'uploading'
  ).length;
  const totalCount = queue.length;

  return {
    queue,
    isUploading,
    isOnline,
    restoredFromDevice,
    uploadedCount,
    failedCount,
    savedCount,
    pendingCount,
    totalCount,
    enqueueFiles,
    retryItem,
    removeItem,
    clearUploaded,
    clearAll,
  };
}
