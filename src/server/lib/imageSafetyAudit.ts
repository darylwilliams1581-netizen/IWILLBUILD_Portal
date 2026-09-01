/**
 * imageSafetyAudit.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A — Server-side audit record writer for image upload attestations.
 *
 * WHAT IS RECORDED (per CP12A §6):
 *   - authenticated user ID
 *   - company ID
 *   - job/form context where applicable
 *   - resulting storage reference (clientUploadId — opaque, not a URL)
 *   - scan status and reason code
 *   - scanner version
 *   - policy/wording version
 *   - confirmation timestamp
 *   - app/platform context (surface)
 *
 * WHAT IS NEVER RECORDED:
 *   - raw image bytes
 *   - facial crops or extracted face data
 *   - signed URLs or credential information
 *   - sensitive image descriptions
 *
 * FUTURE HIGH-RISK ESCALATION (CP12A §7):
 *   The IncidentRecord interface is defined here for future use.
 *   No external reporting or human viewing is implemented in CP12A.
 *   A future notification must contain only an incident ID and safe metadata —
 *   not the image, thumbnail, or direct R2 URL.
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import type { AttestationContext } from '../../lib/imageSafety/types.js';

// ── Audit event ───────────────────────────────────────────────────────────────

export interface ImageSafetyAuditEvent {
  /** Opaque attestation token (UUID) — primary key of this record */
  token: string;
  /** Authenticated user ID */
  userId: string;
  /** Company ID */
  companyId: number;
  /** Attestation context from the client */
  context: AttestationContext;
}

/**
 * Write an image safety attestation audit record.
 * Best-effort — never throws; failures are logged to stderr only.
 *
 * Returns the token on success, null on failure.
 */
export async function recordImageSafetyAttestation(
  event: ImageSafetyAuditEvent,
): Promise<string | null> {
  try {
    const { token, userId, companyId, context } = event;

    // Safe metadata only — no image bytes, no signed URLs
    const metadata = JSON.stringify({
      clientUploadId:   context.clientUploadId,
      surface:          context.surface,
      scanStatus:       context.scanResult.status,
      reasonCode:       context.scanResult.reasonCode,
      scannerVersion:   context.scanResult.scannerVersion,
      hasGpsMetadata:   context.scanResult.hasGpsMetadata,
      hasPersonSignal:  context.scanResult.hasPersonSignal,
      policyVersion:    context.policyVersion,
      confirmedAt:      context.confirmedAt,
      jobId:            context.jobId ?? null,
      submissionId:     context.submissionId ?? null,
    });

    await db.execute(sql`
      INSERT INTO platform_activity_log
        (event_type, success, user_id, company_id, metadata_json)
      VALUES
        ('image_safety.attestation', 1, ${userId}, ${companyId}, ${metadata})
    `);

    return token;
  } catch (err) {
    // Audit failure must never break the upload flow
    console.error(
      '[imageSafetyAudit] Failed to record attestation:',
      err instanceof Error ? err.constructor.name : 'UnknownError',
    );
    return null;
  }
}

// ── Future high-risk incident interface (CP12A §7) ────────────────────────────
// Not implemented in CP12A — defined here for future use.
// A notification must contain only an incident ID and safe metadata.

export interface HighRiskIncidentRecord {
  /** Opaque incident ID — NOT the image, thumbnail, or R2 URL */
  incidentId: string;
  /** Attestation token that triggered the incident */
  attestationToken: string;
  /** Safe metadata only */
  surface: string;
  scanStatus: string;
  reasonCode: string | null;
  userId: string;
  companyId: number;
  createdAt: string;
}
