/**
 * useUploadQueue
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic cross-platform upload queue for any endpoint.
 *
 * Design goals:
 *   - Works identically on iOS Safari, iOS TestFlight (WKWebView), desktop
 *     Safari, Chrome, Android browser, and Android WebView.
 *   - Never calls FileReader, createImageBitmap, or File.path — all unsafe on
 *     iOS WKWebView for large files.
 *   - Uploads via XHR so progress events work (fetch has no upload progress).
 *   - Stable X-Client-Id per file so the server can deduplicate retried
 *     requests (iOS Safari sometimes fires the input onChange twice).
 *   - Concurrency-controlled: max 2 simultaneous uploads.
 *   - Retry without re-selecting the file — the File object is kept in state.
 *   - Clears only after confirmed server success.
 *   - Does NOT use IndexedDB — this queue is in-memory only. For offline-first
 *     photo queues that survive app close, use usePhotoUploadQueue instead.
 *
 * Usage:
 *   const q = useUploadQueue({
 *     endpoint: `/api/jobs/${jobId}/photos`,
 *     fieldName: 'photos',           // FormData field name (default: 'file')
 *     accept: 'image/*',             // for the hidden input
 *     multiple: true,
 *     onSuccess: (items) => reload(),
 *   });
 *
 *   // Render the hidden input:
 *   <input ref={q.inputRef} type="file" accept={q.accept} multiple={q.multiple}
 *          className="hidden" onChange={q.handleInputChange} />
 *
 *   // Trigger it:
 *   <button onClick={() => q.inputRef.current?.click()}>Upload</button>
 *
 *   // Show queue:
 *   {q.queue.map(item => <QueueItem key={item.clientId} item={item} onRetry={q.retry} onRemove={q.remove} />)}
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UploadItemStatus = 'pending' | 'uploading' | 'done' | 'failed';

export interface UploadQueueItem {
  /** Stable ID — sent as X-Client-Id header for server-side deduplication */
  clientId: string;
  fileName: string;
  mimeType: string;
  /** 0–100 */
  progress: number;
  status: UploadItemStatus;
  /** Set on failure */
  error: string | null;
  /** The File object — kept for retry */
  _file: File;
  /** Extra FormData fields to append alongside the file */
  _extra?: Record<string, string>;
}

export interface UseUploadQueueOptions {
  /** API endpoint to POST to, e.g. /api/jobs/5/photos */
  endpoint: string;
  /** FormData field name for the file (default: 'file') */
  fieldName?: string;
  /** accept attribute for the hidden input (default: 'image/*') */
  accept?: string;
  /** Allow multiple files (default: false) */
  multiple?: boolean;
  /** Max concurrent uploads (default: 2) */
  concurrency?: number;
  /** Called after each successful upload with the server response body */
  onSuccess?: (results: Array<{ clientId: string; response: unknown }>) => void;
  /** Called after each failed upload */
  onError?: (clientId: string, error: string) => void;
  /**
   * Validate a file before queuing. Return an error string to reject it,
   * or null/undefined to accept.
   */
  validate?: (file: File) => string | null | undefined;
  /**
   * Extra FormData fields to append alongside every file.
   * Can also be set per-file via enqueue().
   */
  extraFields?: Record<string, string>;
}

// ── Counter for stable client IDs ─────────────────────────────────────────────

let _counter = 0;
function nextClientId(): string {
  return `uq_${Date.now()}_${++_counter}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useUploadQueue(options: UseUploadQueueOptions) {
  const {
    endpoint,
    fieldName = 'file',
    accept = 'image/*',
    multiple = false,
    concurrency = 2,
    onSuccess,
    onError,
    validate,
    extraFields,
  } = options;

  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const activeRef  = useRef(0);
  const queueRef   = useRef<UploadQueueItem[]>([]);
  queueRef.current = queue;

  // Stable refs so processNext closure doesn't go stale
  const endpointRef    = useRef(endpoint);
  const fieldNameRef   = useRef(fieldName);
  const onSuccessRef   = useRef(onSuccess);
  const onErrorRef     = useRef(onError);
  endpointRef.current  = endpoint;
  fieldNameRef.current = fieldName;
  onSuccessRef.current = onSuccess;
  onErrorRef.current   = onError;

  // ── Mutators ───────────────────────────────────────────────────────────────

  const updateItem = useCallback((clientId: string, patch: Partial<UploadQueueItem>) => {
    setQueue(prev => prev.map(i => i.clientId === clientId ? { ...i, ...patch } : i));
  }, []);

  // ── XHR upload ────────────────────────────────────────────────────────────

  function uploadXhr(
    item: UploadQueueItem,
    onProgress: (pct: number) => void,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append(fieldNameRef.current, item._file, item.fileName);
      // Append extra fields
      if (item._extra) {
        for (const [k, v] of Object.entries(item._extra)) fd.append(k, v);
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpointRef.current);
      xhr.withCredentials = true;
      xhr.setRequestHeader('X-Client-Id', item.clientId);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });

      xhr.addEventListener('load', () => {
        let body: unknown;
        try { body = JSON.parse(xhr.responseText); } catch { body = xhr.responseText; }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body);
        } else {
          const msg = (body as { error?: string })?.error ?? `Upload failed (${xhr.status})`;
          reject(new Error(msg));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error — check your connection')));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

      xhr.send(fd);
    });
  }

  // ── Process queue ─────────────────────────────────────────────────────────

  const processNext = useCallback(() => {
    const current = queueRef.current;
    if (activeRef.current >= concurrency) return;

    const next = current.find(i => i.status === 'pending');
    if (!next) return;

    activeRef.current += 1;
    const { clientId } = next;

    updateItem(clientId, { status: 'uploading', progress: 0 });

    void (async () => {
      try {
        const response = await uploadXhr(
          next,
          (pct) => updateItem(clientId, { progress: pct }),
        );

        updateItem(clientId, { status: 'done', progress: 100, error: null });
        onSuccessRef.current?.([{ clientId, response }]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upload failed';
        updateItem(clientId, { status: 'failed', error: msg });
        onErrorRef.current?.(clientId, msg);
      } finally {
        activeRef.current -= 1;
        processNext();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concurrency, updateItem]);

  // ── Enqueue files ─────────────────────────────────────────────────────────

  const enqueue = useCallback((
    files: File[],
    extra?: Record<string, string>,
  ): { accepted: UploadQueueItem[]; rejected: Array<{ file: File; reason: string }> } => {
    const accepted: UploadQueueItem[] = [];
    const rejected: Array<{ file: File; reason: string }> = [];

    for (const file of files) {
      const reason = validate?.(file);
      if (reason) { rejected.push({ file, reason }); continue; }

      accepted.push({
        clientId:  nextClientId(),
        fileName:  file.name || `upload_${Date.now()}`,
        mimeType:  file.type || 'application/octet-stream',
        progress:  0,
        status:    'pending',
        error:     null,
        _file:     file,
        _extra:    { ...(extraFields ?? {}), ...(extra ?? {}) },
      });
    }

    if (accepted.length > 0) {
      setQueue(prev => [...prev, ...accepted]);
      // Kick off up to `concurrency` slots
      for (let i = 0; i < Math.min(accepted.length, concurrency); i++) {
        setTimeout(() => processNext(), i * 30);
      }
    }

    return { accepted, rejected };
  }, [validate, extraFields, concurrency, processNext]);

  // ── Input change handler ───────────────────────────────────────────────────
  // Guards against iOS Safari firing onChange twice for the same selection.

  const lastInputFilesRef = useRef<string>('');

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    // Dedup: build a fingerprint from name+size+lastModified
    const fingerprint = files.map(f => `${f.name}:${f.size}:${f.lastModified}`).join('|');
    if (fingerprint === lastInputFilesRef.current) return;
    lastInputFilesRef.current = fingerprint;

    enqueue(files);

    // Reset so the same file can be re-selected after a failure
    e.target.value = '';

    // Clear fingerprint after a short delay so a genuine re-select works
    setTimeout(() => { lastInputFilesRef.current = ''; }, 2000);
  }, [enqueue]);

  // ── Retry ─────────────────────────────────────────────────────────────────

  const retry = useCallback((clientId: string) => {
    setQueue(prev => prev.map(i =>
      i.clientId === clientId && i.status === 'failed'
        ? { ...i, status: 'pending', progress: 0, error: null }
        : i
    ));
    setTimeout(() => processNext(), 0);
  }, [processNext]);

  // ── Remove ────────────────────────────────────────────────────────────────

  const remove = useCallback((clientId: string) => {
    setQueue(prev => prev.filter(i => i.clientId !== clientId));
  }, []);

  // ── Clear done items ──────────────────────────────────────────────────────

  const clearDone = useCallback(() => {
    setQueue(prev => prev.filter(i => i.status !== 'done'));
  }, []);

  const clearAll = useCallback(() => {
    setQueue([]);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────

  const isUploading  = queue.some(i => i.status === 'uploading');
  const pendingCount = queue.filter(i => i.status === 'pending' || i.status === 'uploading').length;
  const doneCount    = queue.filter(i => i.status === 'done').length;
  const failedCount  = queue.filter(i => i.status === 'failed').length;

  // Ref for the hidden input
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-clear done items after 3 s so the queue doesn't pile up
  useEffect(() => {
    if (doneCount === 0) return;
    const t = setTimeout(() => clearDone(), 3000);
    return () => clearTimeout(t);
  }, [doneCount, clearDone]);

  return {
    queue,
    isUploading,
    pendingCount,
    doneCount,
    failedCount,
    enqueue,
    retry,
    remove,
    clearDone,
    clearAll,
    // Input helpers
    inputRef,
    accept,
    multiple,
    handleInputChange,
  };
}
