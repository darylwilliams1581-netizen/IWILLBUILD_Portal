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
 */

// ── Scan result ───────────────────────────────────────────────────────────────

/**
 * Outcome of the client-side image safety scan.
 *
 *  clear        — no signals detected; confirmation still shown for images
 *                 (policy requirement: all image uploads require attestation)
 *  privacy_warning — EXIF GPS or other privacy signal detected; confirmation
 *                 required with explicit warning
 *  blocked      — file failed hard validation (wrong type, corrupt, etc.);
 *                 upload must not proceed
 *  unavailable  — scanner could not run (no person detector installed);
 *                 show general confirmation, never silently bypass
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
  /** Whether the user must confirm before upload proceeds */
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
 * Result returned by useImageSafetyGate after the user interacts with the modal.
 */
export type GateOutcome =
  | { allowed: true;  token: string }
  | { allowed: false; reason: 'cancelled' | 'blocked' | 'scan_error' };
