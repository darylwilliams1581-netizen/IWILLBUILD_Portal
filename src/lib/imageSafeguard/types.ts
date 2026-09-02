/**
 * imageSafeguard/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A — Shared type contract for the IWIllBUIlD Image Safeguard Protocol.
 *
 * DESIGN PRINCIPLES:
 *  - Never store raw image bytes, face crops, signed URLs, credentials, or
 *    graphic image descriptions in any record or log.
 *  - All identifiers are opaque (UUIDs or DB row IDs) — never R2 object keys.
 *  - Scanner results are safe to log (metadata only).
 *  - Company and user context always comes from the authenticated session.
 *
 * PROTOCOL STATES:
 *  pending         → record created; assessment not yet complete
 *  clear           → no signals detected; no action required
 *  privacy_signal  → EXIF GPS or other privacy metadata detected
 *  elevated        → classifier flagged content requiring review
 *  blocked         → content must not be shared externally
 *  unavailable     → classifier could not run; technical validation passed
 *  error           → assessment failed; record preserved for retry
 *
 * EXTERNAL SHARING BOUNDARY:
 *  clear           → compact confirmation (one-tap)
 *  privacy_signal  → batch confirmation required
 *  unavailable     → batch confirmation required
 *  elevated        → external sharing blocked; neutral message + support route
 *  blocked         → external sharing blocked; neutral message + support route
 *
 * UPLOAD EXPERIENCE:
 *  No per-upload modal. No checkbox per photo. Uploads proceed normally.
 *  A subtle notice "Images are protected by the IWIllBUIlD Image Safeguard
 *  Protocol." is shown near upload controls, linking to privacy information.
 *  The batch confirmation is shown ONCE when images are emailed, shared,
 *  exported, or added to a public/guest link — not on upload.
 */

// ── Protocol state ────────────────────────────────────────────────────────────

export type SafeguardStatus =
  | 'pending'
  | 'clear'
  | 'privacy_signal'
  | 'elevated'
  | 'blocked'
  | 'unavailable'
  | 'error';

// ── Scanner result ────────────────────────────────────────────────────────────

/**
 * Result from the image safety scanner.
 * Safe to log — contains only metadata, never image content.
 */
export interface SafeguardScanResult {
  /** Protocol status after assessment */
  status: SafeguardStatus;
  /** Human-readable reason code (safe to log) */
  reasonCode: string | null;
  /** Scanner/provider name */
  scannerName: string;
  /** Scanner version string */
  scannerVersion: string;
  /** Whether EXIF GPS/location metadata was detected */
  hasGpsMetadata: boolean;
  /** Whether a person/face signal was detected (false if no detector installed) */
  hasPersonSignal: boolean;
  /** ISO timestamp of the assessment */
  assessedAt: string;
}

// ── Safeguard record ──────────────────────────────────────────────────────────

/**
 * A single Image Safeguard record.
 * Written to image_safeguard_records on every image upload.
 * Never contains raw image bytes, signed URLs, or credentials.
 */
export interface SafeguardRecord {
  /** Opaque record ID (UUID) */
  id: string;
  /** Authenticated company ID */
  companyId: number;
  /** Authenticated user ID */
  userId: string;
  /** Opaque storage reference — NOT the R2 object key or a signed URL */
  storageRef: string;
  /** Surface where the upload occurred */
  surface: string;
  /** Job context (null if not job-scoped) */
  jobId: number | null;
  /** Form submission context (null if not form-scoped) */
  submissionId: number | null;
  /** Current protocol status */
  status: SafeguardStatus;
  /** Scanner result (null until assessment completes) */
  scanResult: SafeguardScanResult | null;
  /** Policy version active at time of upload */
  policyVersion: string;
  /** Review status for elevated/blocked records */
  reviewStatus: 'none' | 'pending_review' | 'reviewed' | 'appealed';
  /** ISO timestamp of record creation */
  createdAt: string;
  /** ISO timestamp of last status update */
  updatedAt: string;
}

// ── External sharing boundary ─────────────────────────────────────────────────

/**
 * Context passed to the external-sharing batch confirmation.
 * Covers email, share links, exports, downloads for external distribution,
 * and public/guest links.
 *
 * One confirmation per outgoing batch — not one per image.
 */
export interface SharingBatchContext {
  /** Opaque safeguard record IDs for the images being shared */
  safeguardRecordIds: string[];
  /** Worst-case status across all records in the batch */
  worstStatus: SafeguardStatus;
  /** Number of images in the batch */
  imageCount: number;
  /** Sharing surface (email | share_link | export | download | public_link) */
  sharingSurface: string;
  /** Recipient email addresses (for email surfaces) */
  recipients?: string[];
  /** Job context */
  jobId?: number | null;
}

/**
 * Result of the external-sharing batch confirmation.
 * allowed: true  — user confirmed; caller should pass imageSafeguardAcknowledged: true
 * allowed: false — user cancelled or images are blocked
 */
export type SharingBatchOutcome =
  | { allowed: true }
  | { allowed: false; reason: 'cancelled' | 'blocked' | 'error' };

// ── Privacy-safe copy interface (future) ──────────────────────────────────────

/**
 * Interface for a future privacy-safe derivative generation feature.
 * NOT implemented in CP12A — defined here for future use.
 *
 * RULES (when implemented):
 *  - Never overwrite the original evidence image.
 *  - Generate a separate derivative with a new storage reference.
 *  - The original is preserved with its safeguard record.
 *  - The derivative has its own safeguard record referencing the original.
 */
export interface PrivacySafeCopyRequest {
  /** Safeguard record ID of the original image */
  originalRecordId: string;
  /** Operations to apply */
  operations: Array<
    | { type: 'blur_faces' }
    | { type: 'blur_plates' }
    | { type: 'strip_exif' }
    | { type: 'blur_region'; x: number; y: number; width: number; height: number }
  >;
}

// ── Support escalation interface (future) ─────────────────────────────────────

/**
 * Interface for a future support escalation procedure.
 * NOT implemented in CP12A — defined here for future use.
 *
 * RULES (when implemented):
 *  - Generate an incident ID (opaque UUID).
 *  - Notify authorised Support with safe metadata only.
 *  - Never include the image, thumbnail, signed URL, or R2 key in notifications.
 *  - Restrict review capability by role and audit every access.
 *  - Do not implement police/regulator reporting automatically.
 */
export interface SafeguardIncidentRecord {
  /** Opaque incident ID — NOT the image, thumbnail, or R2 URL */
  incidentId: string;
  /** Safeguard record that triggered the incident */
  safeguardRecordId: string;
  /** Safe metadata only */
  surface: string;
  status: SafeguardStatus;
  reasonCode: string | null;
  userId: string;
  companyId: number;
  /** Review status */
  reviewStatus: 'pending_review' | 'reviewed' | 'appealed';
  /** ISO timestamp */
  createdAt: string;
}

// ── R2 event architecture (future) ───────────────────────────────────────────

/**
 * Interface for the future R2 event-driven assessment pipeline.
 * NOT implemented in CP12A — no Cloudflare Queues, Workers, or event
 * notifications are created here.
 *
 * FUTURE CONFIGURATION REQUIRED:
 *
 * 1. Cloudflare R2 Event Notification:
 *    - Bucket: [R2_BUCKET value]
 *    - Event type: object-create
 *    - Prefix filter: job-photos/, form-attachments/, incident-attachments/
 *    - Destination: Cloudflare Queue (see below)
 *
 * 2. Cloudflare Queue: iwillbuild-image-safeguard
 *    - Delivery: at-least-once
 *    - Max retries: 3
 *    - Retry delay: 30s, 120s, 600s (exponential)
 *    - Dead-letter queue: iwillbuild-image-safeguard-dlq
 *    - DLQ retention: 7 days
 *    - Message TTL: 24 hours
 *
 * 3. Cloudflare Worker: image-safeguard-consumer
 *    - Trigger: Queue binding on iwillbuild-image-safeguard
 *    - Receives: R2ObjectCreatedEvent (object key, size, etag, timestamp)
 *    - Calls: POST /api/image-safety/assess (internal, platform-owner auth)
 *    - On success: acknowledges message
 *    - On failure: throws (triggers retry); after max retries → DLQ
 *    - NEVER reads image bytes into the Worker — passes object key only
 *    - NEVER exposes R2 credentials to the assessment endpoint
 *
 * 4. Assessment endpoint: POST /api/image-safety/assess (future)
 *    - Platform-owner auth only
 *    - Receives: { safeguardRecordId, objectKey, companyId }
 *    - Runs classifier (when available)
 *    - Updates image_safeguard_records.status
 *    - For elevated/blocked: triggers SafeguardIncidentRecord creation
 *    - Returns: { status, assessedAt }
 *
 * 5. Dead-letter queue handling:
 *    - DLQ messages are reviewed by platform-owner
 *    - Records in DLQ state are marked status='error' after 24h
 *    - Error records are retried manually via POST /api/image-safety/retry
 */
export interface R2ObjectCreatedEvent {
  /** R2 object key — used to look up the safeguard record; never stored in logs */
  objectKey: string;
  /** Object size in bytes */
  sizeBytes: number;
  /** R2 ETag */
  etag: string;
  /** ISO timestamp of object creation */
  createdAt: string;
  /** Bucket name */
  bucket: string;
}

/**
 * Message shape for the Cloudflare Queue.
 * The Worker receives this and calls the assessment endpoint.
 */
export interface SafeguardQueueMessage {
  /** Opaque safeguard record ID — the Worker uses this to call the endpoint */
  safeguardRecordId: string;
  /** R2 object key — passed to the assessment endpoint for classifier access */
  objectKey: string;
  /** Company ID — for scoping and audit */
  companyId: number;
  /** Attempt number (1-based) */
  attempt: number;
  /** ISO timestamp of original enqueue */
  enqueuedAt: string;
}
