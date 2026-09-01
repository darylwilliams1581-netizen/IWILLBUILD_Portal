/**
 * useImageSafeguardBatch.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A §6 — External-sharing batch confirmation hook.
 *
 * Manages the one-per-batch confirmation modal shown when images are emailed,
 * shared, exported, downloaded for external distribution, or added to a
 * public/guest link.
 *
 * USAGE:
 *   const { checkBatch, modalProps } = useImageSafeguardBatch();
 *
 *   // Before sending an email with images:
 *   const outcome = await checkBatch({
 *     storageRefs: photos.map(p => `job_photo:${p.id}`),
 *     imageCount: photos.length,
 *     sharingSurface: 'email',
 *     jobId: jobId,
 *   });
 *   if (!outcome.allowed) return; // user cancelled or blocked
 *   // proceed with send
 *
 *   // In JSX:
 *   <ImageSafeguardBatchModal {...modalProps} />
 *
 * GUARANTEES:
 *  - One confirmation per batch — not one per image.
 *  - elevated/blocked images cannot be shared externally.
 *  - Cancel never proceeds.
 *  - Confirm proceeds exactly once (double-tap guard).
 *  - Company/user context comes from the server (not the client).
 */

import { useState, useCallback, useRef } from 'react';
import type { SafeguardStatus, SharingBatchOutcome } from '@/lib/imageSafeguard/types';
import type { ImageSafeguardBatchModalProps } from '@/components/ImageSafeguardBatchModal';

// ── Options ───────────────────────────────────────────────────────────────────

export interface CheckBatchOptions {
  /**
   * Opaque storage references for the images being shared.
   * Format: `{surface}:{id}` — e.g. `job_photo:42`, `form_attachment:99`
   * NEVER pass R2 object keys or signed URLs.
   */
  storageRefs: string[];
  /** Number of images in the batch */
  imageCount: number;
  /** Sharing surface label for display */
  sharingSurface?: string;
  /** Job context */
  jobId?: number | null;
}

// ── Internal state ────────────────────────────────────────────────────────────

interface PendingBatch {
  worstStatus: SafeguardStatus;
  imageCount: number;
  sharingSurface?: string;
  resolve: (outcome: SharingBatchOutcome) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useImageSafeguardBatch() {
  const [pending, setPending] = useState<PendingBatch | null>(null);
  const confirmingRef = useRef(false);

  /**
   * Check whether a batch of images can be shared externally.
   *
   * Queries the server for the worst-case safeguard status across the batch,
   * then shows the appropriate confirmation modal.
   *
   * Returns a SharingBatchOutcome:
   *   { allowed: true, confirmationToken }  — proceed with sharing
   *   { allowed: false, reason }            — do not share
   *
   * Never throws.
   */
  const checkBatch = useCallback(
    (opts: CheckBatchOptions): Promise<SharingBatchOutcome> => {
      return new Promise<SharingBatchOutcome>(async (resolve) => {
        // ── 1. Query server for worst-case status ─────────────────────────────
        let worstStatus: SafeguardStatus = 'unavailable';
        try {
          const res = await fetch('/api/image-safety/batch-status', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storageRefs: opts.storageRefs,
              jobId: opts.jobId ?? null,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { worstStatus?: SafeguardStatus };
            if (data.worstStatus) worstStatus = data.worstStatus;
          }
        } catch {
          // Network error — default to 'unavailable' (requires confirmation)
        }

        // ── 2. Show confirmation modal ────────────────────────────────────────
        confirmingRef.current = false;
        setPending({
          worstStatus,
          imageCount: opts.imageCount,
          sharingSurface: opts.sharingSurface,
          resolve,
        });
      });
    },
    [],
  );

  /**
   * Called when the user confirms ("Send securely").
   */
  const handleConfirm = useCallback(async () => {
    if (!pending || confirmingRef.current) return;
    confirmingRef.current = true;

    const { worstStatus, resolve } = pending;
    setPending(null);

    // Record the batch confirmation on the server
    try {
      const res = await fetch('/api/image-safety/batch-confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worstStatus,
          confirmedAt: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { confirmationToken?: string };
        resolve({ allowed: true, confirmationToken: data.confirmationToken ?? '' });
        return;
      }
    } catch {
      // Network error — fail closed
    }

    resolve({ allowed: false, reason: 'error' });
  }, [pending]);

  /**
   * Called when the user cancels.
   */
  const handleCancel = useCallback(() => {
    if (!pending) return;
    const { resolve } = pending;
    setPending(null);
    confirmingRef.current = false;
    resolve({ allowed: false, reason: 'cancelled' });
  }, [pending]);

  // ── Modal props ───────────────────────────────────────────────────────────

  const modalProps: ImageSafeguardBatchModalProps = {
    open: pending !== null,
    worstStatus: pending?.worstStatus ?? 'unavailable',
    imageCount: pending?.imageCount ?? 0,
    sharingSurface: pending?.sharingSurface,
    onConfirm: () => { void handleConfirm(); },
    onCancel: handleCancel,
  };

  return {
    /** Check a batch before sharing. Resolves when the user confirms or cancels. */
    checkBatch,
    /** Spread onto <ImageSafeguardBatchModal> */
    modalProps,
  };
}
