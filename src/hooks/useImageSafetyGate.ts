/**
 * useImageSafetyGate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A — Orchestrates the image safety scan → modal → attestation flow.
 *
 * USAGE:
 *   const { checkFile, modalProps, pendingFile } = useImageSafetyGate({ surface: 'job_photo' });
 *
 *   // In your file-selection handler:
 *   const outcome = await checkFile(file, { jobId });
 *   if (!outcome.allowed) return; // user cancelled or file blocked
 *   // outcome.token is the attestation token — pass as X-Safety-Attestation header
 *   await uploadFile(file, { headers: { 'X-Safety-Attestation': outcome.token } });
 *
 *   // In your JSX:
 *   <ImageSafetyConfirmModal {...modalProps} />
 *
 * GUARANTEES:
 *  - The modal is shown BEFORE any upload, DB reference, or signed URL is created.
 *  - 'blocked' files cannot be overridden.
 *  - 'unavailable' scanner shows the general confirmation (never silent bypass).
 *  - Duplicate clicks cannot create duplicate attestation records (deduped by
 *    clientUploadId which is generated once per checkFile call).
 *  - The pending file is preserved while the modal is open.
 *  - Closing/back = cancel.
 */

import { useState, useCallback, useRef } from 'react';
import { scanImage } from '@/lib/imageSafety/scanner';
import { POLICY_VERSION } from '@/components/ImageSafetyConfirmModal';
import type { ImageScanResult, GateOutcome, AttestationContext } from '@/lib/imageSafety/types';
import type { ImageSafetyConfirmModalProps } from '@/components/ImageSafetyConfirmModal';

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

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useImageSafetyGate({ surface }: UseImageSafetyGateOptions) {
  const [pending, setPending] = useState<PendingGate | null>(null);
  // Guard against duplicate confirm clicks
  const confirmingRef = useRef(false);

  /**
   * Run the safety gate for a single file.
   *
   * Returns a GateOutcome:
   *   { allowed: true, token }   — user confirmed; token is the attestation UUID
   *   { allowed: false, reason } — user cancelled, file blocked, or scan error
   *
   * Never throws — errors are returned as { allowed: false, reason: 'scan_error' }.
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

        // ── 3. Show confirmation modal ───────────────────────────────────────
        // All image uploads require confirmation (policy requirement).
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
    [],
  );

  /**
   * Called when the user clicks "Confirm and upload".
   * Posts the attestation record to the server, then resolves the gate promise.
   */
  const handleConfirm = useCallback(async () => {
    if (!pending || confirmingRef.current) return;
    confirmingRef.current = true;

    const { file, scanResult, clientUploadId, jobId, submissionId, resolve } = pending;

    // Close modal immediately — the upload will proceed
    setPending(null);

    // ── Post attestation ─────────────────────────────────────────────────────
    const ctx: AttestationContext = {
      clientUploadId,
      scanResult,
      jobId: jobId ?? null,
      submissionId: submissionId ?? null,
      surface,
      policyVersion: POLICY_VERSION,
      confirmedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch('/api/image-safety/attest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ctx),
      });

      if (!res.ok) {
        // Attestation endpoint failed — treat as scan_error (safe: don't upload)
        console.error('[imageSafetyGate] attestation failed:', res.status);
        resolve({ allowed: false, reason: 'scan_error' });
        return;
      }

      const data = (await res.json()) as { token?: string; recordedAt?: string };
      if (!data.token) {
        resolve({ allowed: false, reason: 'scan_error' });
        return;
      }

      resolve({ allowed: true, token: data.token });
    } catch (err) {
      console.error('[imageSafetyGate] attestation network error:', err instanceof Error ? err.message : err);
      resolve({ allowed: false, reason: 'scan_error' });
    }

    // Suppress unused variable warning — file is preserved for the caller
    void file;
  }, [pending, surface]);

  /**
   * Called when the user cancels or closes the modal.
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
      scannerVersion: '1.0.0',
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
  };
}
