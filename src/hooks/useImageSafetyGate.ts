/**
 * useImageSafetyGate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A rev 2 — Graduated image safety gate with batch confirmation.
 *
 * GRADUATED BEHAVIOUR:
 *
 *  clear           → silent pass-through; no modal, no attestation call
 *  privacy_warning → soft one-tap modal ("People may be visible"); Retake/Use photo
 *  blocked         → hard block; no modal, no override
 *  unavailable     → soft one-tap modal ONCE per batch; subsequent files in the
 *                    same batch inherit the token (no repeated prompt)
 *
 * BATCH SCOPING:
 *  A batch is the set of photos captured/uploaded in a single authenticated
 *  session for a specific (jobId, surface) pair. The batch key is
 *  `${jobId ?? 'none'}|${surface}`. Confirmation is requested once; all
 *  subsequent checkFile calls with the same key inherit the token.
 *
 *  Batch state is in-memory only (module-level Map). It is cleared when:
 *   - clearBatch() is called explicitly (e.g. on job change)
 *   - The component using the hook unmounts (via useEffect cleanup)
 *
 *  Batch state NEVER transfers between users or companies — it is keyed by
 *  jobId+surface and lives only in the current browser session.
 *
 * PROFILE / SELFIE SURFACES:
 *  Surfaces ending in '_selfie' or '_profile' are expected-person contexts.
 *  For these, 'unavailable' results pass through silently (no modal) because
 *  the user is intentionally uploading their own photo.
 *
 * USAGE:
 *   const { checkFile, modalProps, clearBatch } = useImageSafetyGate({
 *     surface: 'job_photo',
 *   });
 *
 *   // In your file-selection handler:
 *   const outcome = await checkFile(file, { jobId });
 *   if (!outcome.allowed) return; // user cancelled or file blocked
 *   // outcome.token is the attestation token (empty string for clear pass-throughs)
 *   await uploadFile(file);
 *
 *   // In your JSX:
 *   <ImageSafetyConfirmModal {...modalProps} />
 *
 *   // On job change / component unmount:
 *   clearBatch();
 *
 * GUARANTEES:
 *  - 'clear' files never trigger a modal.
 *  - 'blocked' files cannot be overridden.
 *  - 'unavailable' shows the modal at most once per batch.
 *  - Duplicate confirm taps cannot create duplicate attestation records.
 *  - Cancel/Retake never proceeds to upload.
 *  - "Use photo" uploads exactly once.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { scanImage } from '@/lib/imageSafety/scanner';
import { POLICY_VERSION } from '@/components/ImageSafetyConfirmModal';
import type {
  ImageScanResult,
  GateOutcome,
  AttestationContext,
  BatchConfirmation,
} from '@/lib/imageSafety/types';
import type { ImageSafetyConfirmModalProps } from '@/components/ImageSafetyConfirmModal';

// ── Module-level batch store ──────────────────────────────────────────────────
// Keyed by batchKey = `${jobId ?? 'none'}|${surface}`.
// Lives for the duration of the browser session; cleared on component unmount.

const batchStore = new Map<string, BatchConfirmation>();

function makeBatchKey(jobId: number | null | undefined, surface: string): string {
  return `${jobId ?? 'none'}|${surface}`;
}

// ── Surfaces that are expected-person contexts ────────────────────────────────
// For these, 'unavailable' results pass through silently.

function isExpectedPersonSurface(surface: string): boolean {
  return surface.endsWith('_selfie') || surface.endsWith('_profile');
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseImageSafetyGateOptions {
  /** Surface identifier recorded in the audit row */
  surface: string;
}

export interface CheckFileOptions {
  jobId?: number | null;
  submissionId?: number | null;
}

// ── Internal state ────────────────────────────────────────────────────────────

interface PendingGate {
  file: File;
  scanResult: ImageScanResult;
  clientUploadId: string;
  jobId?: number | null;
  submissionId?: number | null;
  resolve: (outcome: GateOutcome) => void;
}

// ── Attestation helper ────────────────────────────────────────────────────────

async function postAttestation(
  ctx: AttestationContext,
): Promise<{ token: string } | null> {
  try {
    const res = await fetch('/api/image-safety/attest', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ctx),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    return data.token ? { token: data.token } : null;
  } catch {
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useImageSafetyGate({ surface }: UseImageSafetyGateOptions) {
  const [pending, setPending] = useState<PendingGate | null>(null);
  const confirmingRef = useRef(false);

  // Clear this surface's batch entries on unmount
  useEffect(() => {
    return () => {
      // Remove all batch keys for this surface
      for (const key of batchStore.keys()) {
        if (key.endsWith(`|${surface}`)) {
          batchStore.delete(key);
        }
      }
    };
  }, [surface]);

  /**
   * Explicitly clear the batch for a given jobId + surface.
   * Call this when the user navigates to a new job.
   */
  const clearBatch = useCallback((jobId?: number | null) => {
    batchStore.delete(makeBatchKey(jobId, surface));
  }, [surface]);

  /**
   * Run the safety gate for a single file.
   *
   * Returns a GateOutcome:
   *   { allowed: true, token }   — proceed; token is attestation UUID or '' for clear
   *   { allowed: false, reason } — do not upload
   *
   * Never throws.
   */
  const checkFile = useCallback(
    (file: File, opts: CheckFileOptions = {}): Promise<GateOutcome> => {
      return new Promise<GateOutcome>(async (resolve) => {
        // ── 1. Scan ──────────────────────────────────────────────────────────
        let scanResult: ImageScanResult;
        try {
          scanResult = await scanImage(file);
        } catch {
          resolve({ allowed: false, reason: 'scan_error' });
          return;
        }

        // ── 2. Hard block — no override ──────────────────────────────────────
        if (scanResult.status === 'blocked') {
          resolve({ allowed: false, reason: 'blocked' });
          return;
        }

        // ── 3. Clear — silent pass-through ───────────────────────────────────
        if (scanResult.status === 'clear') {
          resolve({ allowed: true, token: '' });
          return;
        }

        // ── 4. Expected-person surface + unavailable → silent pass-through ───
        if (scanResult.status === 'unavailable' && isExpectedPersonSurface(surface)) {
          resolve({ allowed: true, token: '' });
          return;
        }

        // ── 5. Check batch cache (unavailable only) ──────────────────────────
        // privacy_warning (GPS) always shows the modal — GPS is a concrete signal
        // that warrants explicit per-image acknowledgement.
        if (scanResult.status === 'unavailable') {
          const batchKey = makeBatchKey(opts.jobId, surface);
          const existing = batchStore.get(batchKey);
          if (existing) {
            // Batch already confirmed — inherit token, no modal
            resolve({ allowed: true, token: existing.token });
            return;
          }
        }

        // ── 6. Show soft confirmation modal ──────────────────────────────────
        const clientUploadId = crypto.randomUUID();
        confirmingRef.current = false;

        setPending({
          file,
          scanResult,
          clientUploadId,
          jobId: opts.jobId ?? null,
          submissionId: opts.submissionId ?? null,
          resolve,
        });
      });
    },
    [surface],
  );

  /**
   * Called when the user taps "Use photo".
   * Posts the attestation record, stores batch token, resolves the gate promise.
   */
  const handleConfirm = useCallback(async () => {
    if (!pending || confirmingRef.current) return;
    confirmingRef.current = true;

    const { scanResult, clientUploadId, jobId, submissionId, resolve } = pending;

    // Close modal immediately
    setPending(null);

    const ctx: AttestationContext = {
      clientUploadId,
      scanResult,
      jobId: jobId ?? null,
      submissionId: submissionId ?? null,
      surface,
      policyVersion: POLICY_VERSION,
      confirmedAt: new Date().toISOString(),
      batchInherited: false,
    };

    const result = await postAttestation(ctx);

    if (!result) {
      // Attestation endpoint failed — treat as scan_error (safe: don't upload)
      resolve({ allowed: false, reason: 'scan_error' });
      return;
    }

    // Store batch token for 'unavailable' results so subsequent files inherit it
    if (scanResult.status === 'unavailable') {
      const batchKey = makeBatchKey(jobId, surface);
      batchStore.set(batchKey, {
        token: result.token,
        confirmedAt: ctx.confirmedAt,
        jobId: jobId ?? null,
        surface,
      });
    }

    resolve({ allowed: true, token: result.token });
  }, [pending, surface]);

  /**
   * Called when the user taps "Retake" or closes the modal.
   */
  const handleCancel = useCallback(() => {
    if (!pending) return;
    const { resolve } = pending;
    setPending(null);
    confirmingRef.current = false;
    resolve({ allowed: false, reason: 'cancelled' });
  }, [pending]);

  // ── Modal props (spread directly onto <ImageSafetyConfirmModal>) ──────────

  const modalProps: ImageSafetyConfirmModalProps = {
    open: pending !== null,
    scanResult: pending?.scanResult ?? {
      status: 'unavailable',
      reasonCode: null,
      scannerVersion: '2.0.0',
      hasGpsMetadata: false,
      hasPersonSignal: false,
      confirmationRequired: true,
      scannedAt: new Date().toISOString(),
    },
    fileName: pending?.file.name ?? '',
    onConfirm: () => { void handleConfirm(); },
    onCancel: handleCancel,
  };

  return {
    /** Run the gate for a file. Resolves when the user confirms or cancels. */
    checkFile,
    /** Spread onto <ImageSafetyConfirmModal> */
    modalProps,
    /** The file currently awaiting confirmation (null when modal is closed) */
    pendingFile: pending?.file ?? null,
    /** Clear the batch for a given jobId (call on job change) */
    clearBatch,
  };
}
