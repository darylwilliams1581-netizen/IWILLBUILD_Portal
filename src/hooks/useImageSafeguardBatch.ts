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
   * CP12A7: Sharing action — determines which server-side resolver is used.
   * 'share_link' — resolves job_photo refs for the job
   * 'form_email' — resolves company_file refs for the form submission
   */
  action: 'share_link' | 'form_email';
  /** Job ID — required for share_link */
  jobId?: number | null;
  /** Form submission ID — required for form_email */
  submissionId?: number | null;
  /**
   * Recipients — required for form_email.
   * Must be the final resolved list (to + cc + bcc) at the moment of Send.
   * The token is bound to this exact list.
   */
  recipients?: string[];
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
  opts: CheckBatchOptions;
  resolve: (outcome: SharingBatchOutcome) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useImageSafeguardBatch() {
  const [pending, setPending] = useState<PendingBatch | null>(null);
  const confirmingRef = useRef(false);

  /**
   * Check whether a batch of images can be shared externally.
   *
   * CP12A7: Calls batch-status with action + context (not client-supplied refs).
   * The server resolves the exact image refs and returns the worst status.
   * On confirmation, calls batch-confirm which issues a bound token.
   *
   * Returns a SharingBatchOutcome:
   *   { allowed: true, confirmationToken }  — proceed with sharing
   *   { allowed: false, reason }            — do not share
   *
   * Never throws.
   */
  const checkBatch = useCallback(
    (opts: CheckBatchOptions): Promise<SharingBatchOutcome> => {
      // Wrap the async work in a non-async Promise executor to satisfy the
      // no-async-promise-executor lint rule.
      let resolveOutcome!: (outcome: SharingBatchOutcome) => void;
      const promise = new Promise<SharingBatchOutcome>((resolve) => {
        resolveOutcome = resolve;
      });

      const run = async () => {
        // ── 1. Query server for worst-case status (server resolves refs) ──────
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

        // ── 2. Show confirmation modal ────────────────────────────────────────
        confirmingRef.current = false;
        setPending({
          worstStatus,
          imageCount: opts.imageCount ?? refCount,
          sharingSurface: opts.sharingSurface,
          opts,
          resolve: resolveOutcome,
        });
      };

      void run();
      return promise;
    },
    [],
  );

  /**
   * Called when the user confirms ("Send securely").
   * CP12A7: Calls batch-confirm with action + context only (spec §6).
   * resolvedRefs are NOT sent — the server re-resolves them independently.
   */
  const handleConfirm = useCallback(async () => {
    if (!pending || confirmingRef.current) return;
    confirmingRef.current = true;

    const { opts, resolve } = pending;
    setPending(null);

    // Call batch-confirm — server resolves refs independently (spec §6)
    try {
      const res = await fetch('/api/image-safety/batch-confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: opts.action,
          jobId: opts.jobId ?? null,
          submissionId: opts.submissionId ?? null,
          recipients: opts.recipients ?? [],
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
