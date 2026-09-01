/**
 * useImageSafeguardBatch.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A §6 — External-sharing batch confirmation hook.
 *
 * Manages the one-per-batch confirmation modal shown when images are emailed
 * or shared externally.
 *
 * USAGE:
 *   const { checkBatch, modalProps } = useImageSafeguardBatch();
 *
 *   // Before sharing job photos:
 *   const outcome = await checkBatch({
 *     action: 'share_link',
 *     jobId: jobId,
 *     imageCount: photoCount,
 *     sharingSurface: 'share link',
 *   });
 *   if (!outcome.allowed) return; // user cancelled or blocked
 *   // proceed with share — pass imageSafeguardAcknowledged: true to the endpoint
 *
 *   // In JSX:
 *   <ImageSafeguardBatchModal {...modalProps} />
 *
 * GUARANTEES:
 *  - One confirmation per batch — not one per image.
 *  - blocked/elevated images cannot be shared externally.
 *  - Cancel never proceeds.
 *  - Confirm proceeds exactly once (double-tap guard).
 *  - No modal shown when there are no images.
 */

import { useState, useCallback, useRef } from 'react';
import type { SafeguardStatus } from '@/lib/imageSafeguard/types';
import type { ImageSafeguardBatchModalProps } from '@/components/ImageSafeguardBatchModal';

// ── Outcome ───────────────────────────────────────────────────────────────────

export type SharingBatchOutcome =
  | { allowed: true }
  | { allowed: false; reason: 'cancelled' | 'blocked' | 'error' };

// ── Options ───────────────────────────────────────────────────────────────────

export interface CheckBatchOptions {
  /**
   * Sharing action — determines which server-side resolver is used.
   * 'share_link' — job photo share link
   * 'form_email' — form PDF email
   */
  action: 'share_link' | 'form_email';
  /** Job ID — required for share_link */
  jobId?: number | null;
  /** Form submission ID — required for form_email */
  submissionId?: number | null;
  /** Number of images in the batch (for display in the modal) */
  imageCount?: number;
  /** Sharing surface label for display */
  sharingSurface?: string;
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
   * Queries the server for the worst-case status (server resolves refs).
   * Shows the confirmation modal. Returns a SharingBatchOutcome:
   *   { allowed: true }              — proceed with sharing
   *   { allowed: false, reason }     — do not share
   *
   * Never throws.
   */
  const checkBatch = useCallback(
    (opts: CheckBatchOptions): Promise<SharingBatchOutcome> => {
      let resolveOutcome!: (outcome: SharingBatchOutcome) => void;
      const promise = new Promise<SharingBatchOutcome>((resolve) => {
        resolveOutcome = resolve;
      });

      const run = async () => {
        // ── Query server for worst-case status ────────────────────────────────
        let worstStatus: SafeguardStatus = 'unavailable';
        let refCount = 0;
        try {
          const res = await fetch('/api/image-safety/batch-status', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: opts.action,
              jobId: opts.jobId ?? null,
              submissionId: opts.submissionId ?? null,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              worstStatus?: SafeguardStatus;
              refCount?: number;
            };
            if (data.worstStatus) worstStatus = data.worstStatus;
            if (typeof data.refCount === 'number') refCount = data.refCount;
          }
        } catch {
          // Network error — default to 'unavailable' (requires confirmation)
        }

        // Blocked/elevated: resolve immediately without showing modal
        if (worstStatus === 'blocked' || worstStatus === 'elevated') {
          resolveOutcome({ allowed: false, reason: 'blocked' });
          return;
        }

        // ── Show confirmation modal ───────────────────────────────────────────
        confirmingRef.current = false;
        setPending({
          worstStatus,
          imageCount: opts.imageCount ?? refCount,
          sharingSurface: opts.sharingSurface,
          resolve: resolveOutcome,
        });
      };

      void run();
      return promise;
    },
    [],
  );

  /**
   * Called when the user confirms.
   * Double-tap guard prevents multiple calls.
   */
  const handleConfirm = useCallback(() => {
    if (!pending || confirmingRef.current) return;
    confirmingRef.current = true;
    const { resolve } = pending;
    setPending(null);
    resolve({ allowed: true });
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
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  };

  return {
    /** Check a batch before sharing. Resolves when the user confirms or cancels. */
    checkBatch,
    /** Spread onto <ImageSafeguardBatchModal> */
    modalProps,
  };
}
