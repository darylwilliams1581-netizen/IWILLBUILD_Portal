/**
 * imageSafety/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared type contract for the CP12A image-safety gate.
 *
 * DESIGN RULES:
 *  - Never include raw image bytes, extracted faces, or sensitive image
 *    descriptions in any of these types.
 *  - Scan results are safe to log (they contain only metadata).
 *  - Attestation tokens are opaque UUIDs — they reference an audit row, not
 *    the image itself.
 *
 * GRADUATED BEHAVIOUR (CP12A rev 2):
 *  clear           → silent pass-through, no modal
 *  privacy_warning → soft one-tap modal (GPS detected)
 *  blocked         → hard block, no override
 *  unavailable     → soft one-tap modal once per batch; inherited within batch
 *
 * BATCH SCOPING:
 *  A batch is the set of photos captured/uploaded in a single authenticated
 *  session for a specific (jobId, surface) pair. Confirmation is requested
 *  once per batch; subsequent files in the same batch inherit the token.
 *  Batch state is in-memory only and expires on component unmount or job change.
 */

// ── Scan result ───────────────────────────────────────────────────────────────

/**
 * Outcome of the client-side image safety scan.
 *
 *  clear           — no signals detected; upload proceeds silently
 *  privacy_warning — EXIF GPS or other privacy signal detected; soft one-tap
 *                    confirmation required
 *  blocked         — file failed hard validation (wrong type, corrupt, etc.);
 *                    upload must not proceed, no override
 *  unavailable     — scanner could not run; soft one-tap confirmation shown
 *                    once per batch, then inherited
 */
export type ScanStatus = 'clear' | 'privacy_warning' | 'blocked' | 'unavailable';

export interface ImageScanResult {
  /** Outcome of the scan */
  status: ScanStatus;
  /** Human-readable reason code (safe to log) */
  reasonCode: string | null;
  /** Scanner version string — bumped when policy wording or logic changes */
  scannerVersion: string;
  /** Whether a GPS/location EXIF tag was detected */
  hasGpsMetadata: boolean;
  /** Whether a person/face signal was detected (always false — no detector installed) */
  hasPersonSignal: boolean;
  /**
   * Whether user confirmation is required for THIS specific file.
   * false for 'clear' results and for batch-inherited confirmations.
   */
  confirmationRequired: boolean;
  /** ISO timestamp of the scan */
  scannedAt: string;
}

// ── Attestation ───────────────────────────────────────────────────────────────

/**
 * Context passed to the attestation endpoint.
 * Never includes raw image bytes, signed URLs, or credential information.
 */
export interface AttestationContext {
  /** Opaque client-generated ID for this pending upload */
  clientUploadId: string;
  /** Scan result metadata */
  scanResult: ImageScanResult;
  /** Job/form context where applicable */
  jobId?: number | null;
  /** Form submission context where applicable */
  submissionId?: number | null;
  /** Surface identifier (e.g. 'job_photo', 'company_logo', 'form_attachment') */
  surface: string;
  /** Policy wording version — must match POLICY_VERSION in the modal */
  policyVersion: string;
  /** ISO timestamp of the user's confirmation */
  confirmedAt: string;
  /** Whether this attestation was inherited from a batch (no new modal shown) */
  batchInherited?: boolean;
}

/**
 * Response from POST /api/image-safety/attest.
 * The token is an opaque reference to the audit row — it is NOT a signed URL
 * and does NOT contain the image or any credential.
 */
export interface AttestationResponse {
  /** Opaque attestation token (UUID) — pass as X-Safety-Attestation header */
  token: string;
  /** ISO timestamp of the audit record */
  recordedAt: string;
}

// ── Gate result ───────────────────────────────────────────────────────────────

/**
 * Result of a batch safeguard gate decision.
 * Used by useImageSafeguardBatch to communicate whether external sharing
 * is permitted, cancelled, or blocked.
 */
export type GateOutcome =
  | { allowed: true;  token: string }
  | { allowed: false; reason: 'cancelled' | 'blocked' | 'scan_error' };

// ── Batch state ───────────────────────────────────────────────────────────────

/**
 * In-memory batch confirmation record.
 * Keyed by batchKey = `${jobId ?? 'none'}|${surface}`.
 * Expires on component unmount — never persisted to localStorage or DB.
 */
export interface BatchConfirmation {
  /** The attestation token from the first confirmation in this batch */
  token: string;
  /** ISO timestamp of the original confirmation */
  confirmedAt: string;
  /** The jobId this batch is scoped to (null for non-job surfaces) */
  jobId: number | null;
  /** The surface this batch is scoped to */
  surface: string;
}
