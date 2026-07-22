/**
 * usePhotoUploadQueue
 *
 * Manages a queue of pending photo uploads with:
 * - Optimistic thumbnail cards (local blob URLs for JPEG/PNG/WebP)
 * - XHR-based upload for real progress events
 * - Controlled concurrency (max 2 simultaneous uploads)
 * - Per-item status: pending → preparing → uploading → uploaded | failed
 * - Retry individual failed items
 * - Remove pending/failed items
 * - Automatic blob URL revocation after upload
 */

import { useState, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UploadStatus = 'pending' | 'preparing' | 'uploading' | 'uploaded' | 'failed';

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
const ALLOWED_TYPES = [...PREVIEW_TYPES, ...HEIC_MIMES];
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
  // createImageBitmap + canvas.toBlob is not supported for HEIC in WKWebView
  // and can throw "The operation is not supported". Guard every step.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Cannot decode — return null so the caller falls back to raw upload
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

  if (!ctx) {
    bitmap.close();
    return file;
  }

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
      // toBlob can throw on some iOS versions — fall back to raw file
      resolve(file);
    }
  });
}

async function prepareFile(file: File): Promise<File> {
  if (isIos()) return file; // iOS: upload raw, server handles HEIC
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

    xhr.addEventListener('error', () => reject(new Error('Network error — please try again')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.send(fd);
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePhotoUploadQueue({ jobId, onBatchComplete }: UsePhotoUploadQueueOptions) {
  const [queue, setQueue] = useState<PendingPhoto[]>([]);
  // Track active upload count without triggering re-renders on every tick
  const activeRef = useRef(0);
  // Ref to queue so callbacks inside processNext always see latest state
  const queueRef = useRef<PendingPhoto[]>([]);
  queueRef.current = queue;

  // ── Mutators ───────────────────────────────────────────────────────────────

  const updateItem = useCallback((clientId: string, patch: Partial<PendingPhoto>) => {
    setQueue((prev) => prev.map((item) => item.clientId === clientId ? { ...item, ...patch } : item));
  }, []);

  const removeItem = useCallback((clientId: string) => {
    setQueue((prev) => {
      const item = prev.find((i) => i.clientId === clientId);
      if (item?.localPreviewUrl) URL.revokeObjectURL(item.localPreviewUrl);
      return prev.filter((i) => i.clientId !== clientId);
    });
  }, []);

  // ── Process queue (concurrency-controlled) ─────────────────────────────────

  const processNext = useCallback(() => {
    const current = queueRef.current;
    const pending = current.filter((i) => i.status === 'pending' || i.status === 'preparing');
    if (pending.length === 0 || activeRef.current >= CONCURRENCY) return;

    // Pick the first truly pending item (not already being prepared)
    const next = current.find((i) => i.status === 'pending');
    if (!next) return;

    activeRef.current += 1;
    const { clientId } = next;

    // Step 1: preparing (normalise/resize)
    updateItem(clientId, { status: 'preparing', progress: 0 });

    void (async () => {
      let file: File | null = next._file;
      if (!file) {
        updateItem(clientId, { status: 'failed', error: 'File missing' });
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

        // Revoke blob URL — server photo is now the source of truth
        const item = queueRef.current.find((i) => i.clientId === clientId);
        if (item?.localPreviewUrl) URL.revokeObjectURL(item.localPreviewUrl);

        updateItem(clientId, {
          status: 'uploaded',
          progress: 100,
          serverPhotoId: result.id,
          localPreviewUrl: null,
          error: null,
        });
      } catch (e) {
        updateItem(clientId, {
          status: 'failed',
          error: e instanceof Error ? e.message : 'Upload failed',
        });
      } finally {
        activeRef.current -= 1;
        // Check if batch is complete
        const updated = queueRef.current;
        const stillActive = updated.filter((i) => i.status === 'pending' || i.status === 'preparing' || i.status === 'uploading');
        if (stillActive.length === 0) {
          const uploadedCount = updated.filter((i) => i.status === 'uploaded').length;
          const failedCount   = updated.filter((i) => i.status === 'failed').length;
          if (uploadedCount > 0 || failedCount > 0) {
            onBatchComplete?.(uploadedCount, failedCount);
          }
        }
        // Kick off next
        processNext();
      }
    })();

    // Kick off another slot if concurrency allows
    if (activeRef.current < CONCURRENCY) processNext();
  }, [jobId, updateItem, onBatchComplete]);

  // ── Enqueue files ──────────────────────────────────────────────────────────

  const enqueueFiles = useCallback((files: File[]) => {
    const newItems: PendingPhoto[] = files.map((file) => {
      const isPreviewable = canPreview(file);
      const localPreviewUrl = isPreviewable ? URL.createObjectURL(file) : null;
      return {
        clientId: nextClientId(),
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        localPreviewUrl,
        status: 'pending' as UploadStatus,
        progress: 0,
        serverPhotoId: null,
        error: null,
        _file: file,
      };
    });

    setQueue((prev) => [...prev, ...newItems]);

    // Kick off processing after state update
    setTimeout(() => processNext(), 0);
  }, [processNext]);

  // ── Retry a failed item ────────────────────────────────────────────────────

  const retryItem = useCallback((clientId: string) => {
    setQueue((prev) => prev.map((item) =>
      item.clientId === clientId && item.status === 'failed'
        ? { ...item, status: 'pending', progress: 0, error: null }
        : item
    ));
    setTimeout(() => processNext(), 0);
  }, [processNext]);

  // ── Clear uploaded items ───────────────────────────────────────────────────

  const clearUploaded = useCallback(() => {
    setQueue((prev) => {
      prev.filter((i) => i.status === 'uploaded' && i.localPreviewUrl)
        .forEach((i) => URL.revokeObjectURL(i.localPreviewUrl!));
      return prev.filter((i) => i.status !== 'uploaded');
    });
  }, []);

  const clearAll = useCallback(() => {
    setQueue((prev) => {
      prev.filter((i) => i.localPreviewUrl).forEach((i) => URL.revokeObjectURL(i.localPreviewUrl!));
      return [];
    });
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────

  const isUploading = queue.some((i) => i.status === 'uploading' || i.status === 'preparing');
  const uploadedCount = queue.filter((i) => i.status === 'uploaded').length;
  const failedCount   = queue.filter((i) => i.status === 'failed').length;
  const pendingCount  = queue.filter((i) => i.status === 'pending' || i.status === 'preparing' || i.status === 'uploading').length;
  const totalCount    = queue.length;

  return {
    queue,
    isUploading,
    uploadedCount,
    failedCount,
    pendingCount,
    totalCount,
    enqueueFiles,
    retryItem,
    removeItem,
    clearUploaded,
    clearAll,
  };
}
