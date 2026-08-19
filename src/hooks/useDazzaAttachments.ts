/**
 * useDazzaAttachments
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the pending attachment queue for the Dazza chat composer.
 *
 * Upload flow:
 *   1. User selects files via the paperclip button.
 *   2. Each file is validated client-side (extension, size).
 *   3. Each file is uploaded to POST /api/dazza/attachments/upload.
 *   4. On success: the chip shows the attachment ID + metadata.
 *   5. On send: attachment IDs are included in the chat request body.
 *   6. After a successful send: pending chips are cleared.
 *
 * Removing a chip only detaches it from the pending question.
 * It does NOT delete the stored source.
 *
 * Attachments apply to one question only — cleared after send.
 */

import { useState, useCallback, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AttachmentUploadStatus =
  | 'pending'     // selected, not yet uploaded
  | 'uploading'   // XHR in progress
  | 'encrypted'   // stored server-side (we show "Encrypted" briefly)
  | 'attached'    // ready to send
  | 'failed';     // upload failed

export interface PendingAttachment {
  /** Client-side ID for React key / removal */
  clientId: string;
  /** Safe display filename (from server response or sanitised client-side) */
  filename: string;
  /** File size in bytes */
  byteLength: number;
  /** MIME type */
  mimeType: string;
  /** Upload state */
  status: AttachmentUploadStatus;
  /** Set on success — opaque server-assigned ID */
  attachmentId: string | null;
  /** Set on failure */
  error: string | null;
  /** Upload progress 0–100 */
  progress: number;
}

// ── Accepted types (client-side pre-check — server enforces authoritatively) ──

const ACCEPTED_EXTS = new Set(['txt', 'md', 'json']);
const ACCEPTED_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
]);
const MAX_BYTES_CLIENT = 10 * 1024 * 1024; // 10 MiB
const MAX_ATTACHMENTS = 4;

function getExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function sanitiseFilenameClient(raw: string): string {
  const base = raw.replace(/.*[/\\]/, '');
  return base.replace(/[^a-zA-Z0-9._\- ]/g, '_').slice(0, 200) || 'attachment';
}

let _counter = 0;
function nextClientId(): string {
  return `att_${Date.now()}_${++_counter}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseDazzaAttachmentsOptions {
  conversationId: string | null;
}

export function useDazzaAttachments({ conversationId }: UseDazzaAttachmentsOptions) {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const attachmentsRef = useRef<PendingAttachment[]>([]);
  attachmentsRef.current = attachments;

  const updateItem = useCallback((clientId: string, patch: Partial<PendingAttachment>) => {
    setAttachments(prev => prev.map(a => a.clientId === clientId ? { ...a, ...patch } : a));
  }, []);

  // ── Validate + enqueue files ───────────────────────────────────────────────

  const enqueueFiles = useCallback((files: FileList | File[]) => {
    const fileArr = Array.from(files);
    const current = attachmentsRef.current;
    const available = MAX_ATTACHMENTS - current.filter(a => a.status !== 'failed').length;

    if (available <= 0) return;

    const toAdd = fileArr.slice(0, available);

    for (const file of toAdd) {
      const ext = getExt(file.name);
      const clientId = nextClientId();
      const safeFilename = sanitiseFilenameClient(file.name);

      // Client-side pre-validation (server re-validates authoritatively)
      if (!ACCEPTED_EXTS.has(ext)) {
        setAttachments(prev => [...prev, {
          clientId,
          filename: safeFilename,
          byteLength: file.size,
          mimeType: file.type,
          status: 'failed',
          attachmentId: null,
          error: `"${safeFilename}" is not supported. Accepted: .txt, .md, .json`,
          progress: 0,
        }]);
        continue;
      }

      // MIME fallback rules:
      //   .md  — some browsers report text/plain
      //   .json — some browsers report application/octet-stream or "" (empty)
      //   .txt  — always text/plain
      // Extension is already validated above; MIME is belt-and-suspenders only.
      const mimeOk =
        ACCEPTED_MIMES.has(file.type) ||
        (ext === 'md'   && (file.type === 'text/plain' || file.type === '')) ||
        (ext === 'json' && (file.type === 'application/octet-stream' || file.type === '')) ||
        (ext === 'txt'  && file.type === '');

      if (!mimeOk) {
        setAttachments(prev => [...prev, {
          clientId,
          filename: safeFilename,
          byteLength: file.size,
          mimeType: file.type,
          status: 'failed',
          attachmentId: null,
          error: `"${safeFilename}" has an unexpected type (${file.type || 'unknown'}).`,
          progress: 0,
        }]);
        continue;
      }

      if (file.size > MAX_BYTES_CLIENT) {
        setAttachments(prev => [...prev, {
          clientId,
          filename: safeFilename,
          byteLength: file.size,
          mimeType: file.type,
          status: 'failed',
          attachmentId: null,
          error: `"${safeFilename}" exceeds the 10 MiB limit.`,
          progress: 0,
        }]);
        continue;
      }

      // Add as pending, then upload
      setAttachments(prev => [...prev, {
        clientId,
        filename: safeFilename,
        byteLength: file.size,
        mimeType: file.type,
        status: 'uploading',
        attachmentId: null,
        error: null,
        progress: 0,
      }]);

      // Upload via XHR for progress tracking
      void uploadFile(clientId, file, safeFilename, conversationId, updateItem);
    }
  }, [conversationId, updateItem]);

  // ── Remove a chip (does NOT delete the stored source) ─────────────────────

  const removeAttachment = useCallback((clientId: string) => {
    setAttachments(prev => prev.filter(a => a.clientId !== clientId));
  }, []);

  // ── Clear all pending chips ────────────────────────────────────────────────

  const clearAll = useCallback(() => {
    setAttachments([]);
  }, []);

  // ── Clear successfully attached chips after send ───────────────────────────

  const clearAfterSend = useCallback(() => {
    setAttachments([]);
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────

  const readyIds = attachments
    .filter(a => a.status === 'attached' && a.attachmentId)
    .map(a => a.attachmentId as string);

  const isUploading = attachments.some(a => a.status === 'uploading');
  const hasAttachments = attachments.length > 0;
  const canAddMore = attachments.filter(a => a.status !== 'failed').length < MAX_ATTACHMENTS;

  return {
    attachments,
    readyIds,
    isUploading,
    hasAttachments,
    canAddMore,
    enqueueFiles,
    removeAttachment,
    clearAll,
    clearAfterSend,
  };
}

// ── Upload helper (XHR for progress) ─────────────────────────────────────────

async function uploadFile(
  clientId: string,
  file: File,
  safeFilename: string,
  conversationId: string | null,
  updateItem: (clientId: string, patch: Partial<PendingAttachment>) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const fd = new FormData();
    fd.append('file', file, safeFilename);
    if (conversationId) fd.append('conversationId', conversationId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/dazza/attachments/upload');
    xhr.withCredentials = true;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        updateItem(clientId, { progress: Math.round((e.loaded / e.total) * 90) });
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText) as {
          attachmentId?: string;
          safeFilename?: string;
          error?: string;
          message?: string;
        };

        if (xhr.status >= 200 && xhr.status < 300 && data.attachmentId) {
          // Brief "encrypted" state before showing "attached"
          updateItem(clientId, { status: 'encrypted', progress: 100 });
          setTimeout(() => {
            updateItem(clientId, {
              status: 'attached',
              attachmentId: data.attachmentId!,
              filename: data.safeFilename ?? safeFilename,
              progress: 100,
            });
          }, 600);
        } else {
          const msg = data.message ?? data.error ?? `Upload failed (${xhr.status})`;
          updateItem(clientId, { status: 'failed', error: msg, progress: 0 });
        }
      } catch {
        updateItem(clientId, {
          status: 'failed',
          error: `Upload failed (${xhr.status})`,
          progress: 0,
        });
      }
      resolve();
    });

    xhr.addEventListener('error', () => {
      updateItem(clientId, { status: 'failed', error: 'Network error — please retry.', progress: 0 });
      resolve();
    });

    xhr.addEventListener('abort', () => {
      updateItem(clientId, { status: 'failed', error: 'Upload cancelled.', progress: 0 });
      resolve();
    });

    xhr.send(fd);
  });
}
