/**
 * imageSafeguardService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A — Background Image Safeguard Protocol service.
 *
 * DESIGN RULES:
 *  - Never interrupt the upload flow. All operations are best-effort.
 *  - Never store raw image bytes, signed URLs, R2 keys, or credentials.
 *  - Company and user context always comes from the authenticated session.
 *  - storage_ref is an opaque internal reference — NOT an R2 object key.
 *  - All failures are logged to stderr only; they never propagate to callers.
 *
 * BACKGROUND BEHAVIOUR:
 *  1. Upload completes through the existing validated production boundary.
 *  2. createPendingSafeguardRecord() is called with safe metadata.
 *  3. The record is written to image_safeguard_records with status='pending'.
 *  4. Assessment is queued for background processing (currently: technical
 *     metadata checks only — no classifier is installed).
 *  5. The uploader is not interrupted at any point.
 *
 * CLASSIFIER STATUS:
 *  No automated image classifier is currently installed. The scanner performs:
 *   - EXIF GPS detection (JPEG only)
 *   - File decodability check (createImageBitmap — client-side only)
 *  Server-side assessment marks records 'unavailable' until a classifier
 *  is configured. This is the correct behaviour — we do not fabricate
 *  'clear' results when the classifier is unavailable.
 *
 * FUTURE ASSESSMENT PIPELINE:
 *  See R2ObjectCreatedEvent / SafeguardQueueMessage in types.ts for the
 *  future Cloudflare Queue → Worker → assessment endpoint architecture.
 *  The runBackgroundAssessment() function below is the assessment entry point
 *  that will be called by the future Worker.
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { SafeguardStatus, SafeguardScanResult } from '../../lib/imageSafeguard/types.js';

// ── Protocol policy version ───────────────────────────────────────────────────
// Bump when the protocol wording or assessment logic changes.
export const SAFEGUARD_POLICY_VERSION = '1.0';

// ── Create pending record ─────────────────────────────────────────────────────

export interface CreateSafeguardRecordOptions {
  /** Authenticated company ID (from session — never from request body) */
  companyId: number;
  /** Authenticated user ID (from session — never from request body) */
  userId: string;
  /**
   * Opaque internal reference for this upload.
   * Use the clientUploadId from the upload flow, or a DB row ID once persisted.
   * NEVER pass an R2 object key or a signed URL.
   */
  storageRef: string;
  /** Surface identifier (job_photo, form_attachment, incident_attachment, etc.) */
  surface: string;
  /** Job context (null if not job-scoped) */
  jobId?: number | null;
  /** Form submission context (null if not form-scoped) */
  submissionId?: number | null;
}

/**
 * Create a pending Image Safeguard record for an uploaded image.
 *
 * Best-effort — never throws. Failures are logged to stderr only.
 * The upload flow must not be interrupted if this fails.
 *
 * Returns the record ID on success, null on failure.
 */
export async function createPendingSafeguardRecord(
  opts: CreateSafeguardRecordOptions,
): Promise<string | null> {
  try {
    const id = randomUUID();
    const now = new Date();

    await db.execute(sql`
      INSERT INTO image_safeguard_records
        (id, company_id, user_id, storage_ref, surface, job_id, submission_id,
         status, scan_result_json, policy_version, review_status, created_at, updated_at)
      VALUES
        (${id}, ${opts.companyId}, ${opts.userId}, ${opts.storageRef},
         ${opts.surface}, ${opts.jobId ?? null}, ${opts.submissionId ?? null},
         'pending', NULL, ${SAFEGUARD_POLICY_VERSION}, 'none', ${now}, ${now})
    `);

    // Queue background assessment (non-blocking)
    void scheduleAssessment(id, opts.companyId).catch((err: unknown) => {
      console.error(
        '[imageSafeguard] scheduleAssessment failed for record', id,
        err instanceof Error ? err.message : err,
      );
    });

    return id;
  } catch (err) {
    console.error(
      '[imageSafeguard] createPendingSafeguardRecord failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ── Background assessment ─────────────────────────────────────────────────────

/**
 * Schedule background assessment for a safeguard record.
 *
 * Currently: runs immediately in-process (no external queue).
 * Future: this will be triggered by the Cloudflare Queue Worker.
 *
 * Never throws — failures are logged and the record is marked 'error'.
 */
async function scheduleAssessment(
  recordId: string,
  companyId: number,
): Promise<void> {
  // In-process assessment — runs after a short delay to avoid blocking the
  // upload response. In production this will be replaced by the Queue Worker.
  await new Promise<void>(resolve => setTimeout(resolve, 100));
  await runBackgroundAssessment(recordId, companyId);
}

/**
 * Run the background assessment for a safeguard record.
 *
 * This is the assessment entry point that will be called by the future
 * Cloudflare Queue Worker (see R2ObjectCreatedEvent in types.ts).
 *
 * Current behaviour (no classifier installed):
 *  - Marks the record 'unavailable' with scanner_name='none'
 *  - Does NOT fabricate 'clear' results
 *  - Technical metadata checks pass (file was already validated by uploadPolicy.ts)
 *
 * Future behaviour (classifier configured):
 *  - Calls the classifier with the R2 object key
 *  - Updates status based on classifier result
 *  - For elevated/blocked: creates a SafeguardIncidentRecord
 *
 * Never throws — failures mark the record 'error'.
 */
export async function runBackgroundAssessment(
  recordId: string,
  companyId: number,
): Promise<void> {
  try {
    // ── No classifier installed ───────────────────────────────────────────────
    // Mark as 'unavailable' — do NOT fabricate 'clear'.
    // Technical validation already passed in uploadPolicy.ts.
    const scanResult: SafeguardScanResult = {
      status: 'unavailable',
      reasonCode: 'no_classifier_configured',
      scannerName: 'none',
      scannerVersion: '0.0.0',
      hasGpsMetadata: false, // unknown without client-side EXIF scan
      hasPersonSignal: false, // no detector installed
      assessedAt: new Date().toISOString(),
    };

    await updateSafeguardRecord(recordId, 'unavailable', scanResult);
  } catch (err) {
    console.error(
      '[imageSafeguard] runBackgroundAssessment failed for record', recordId,
      err instanceof Error ? err.message : err,
    );
    // Mark as error so the record can be retried
    try {
      await updateSafeguardRecord(recordId, 'error', null);
    } catch {
      // Last-resort failure — record stays 'pending'
    }
  }
}

// ── Update record status ──────────────────────────────────────────────────────

/**
 * Update a safeguard record's status and scan result.
 * Called by runBackgroundAssessment() and the future assessment endpoint.
 */
export async function updateSafeguardRecord(
  recordId: string,
  status: SafeguardStatus,
  scanResult: SafeguardScanResult | null,
): Promise<void> {
  const scanResultJson = scanResult ? JSON.stringify(scanResult) : null;
  await db.execute(sql`
    UPDATE image_safeguard_records
    SET status = ${status},
        scan_result_json = ${scanResultJson},
        updated_at = ${new Date()}
    WHERE id = ${recordId}
  `);
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Get the worst-case safeguard status for a set of storage references.
 * Used by the external-sharing boundary to determine the confirmation level.
 *
 * Status priority (worst first): blocked > elevated > privacy_signal >
 *   unavailable > pending > clear > error
 *
 * Returns 'unavailable' if no records are found (safe default).
 */
export async function getWorstSafeguardStatus(
  companyId: number,
  storageRefs: string[],
): Promise<SafeguardStatus> {
  if (storageRefs.length === 0) return 'unavailable';

  try {
    // Build a parameterised IN clause using Drizzle sql template tag.
    // sql.raw() does NOT accept parameters — we must use the template form.
    // Each ref is a separate sql`` fragment joined with commas.
    const refFragments = storageRefs.map(r => sql`${r}`);
    const inClause = sql.join(refFragments, sql`, `);
    const rows = await db.execute(
      sql`SELECT status FROM image_safeguard_records
          WHERE company_id = ${companyId} AND storage_ref IN (${inClause})`,
    );

    const statuses = (rows as unknown as Array<{ status: string }>).map(r => r.status as SafeguardStatus);
    if (statuses.length === 0) return 'unavailable';

    const priority: SafeguardStatus[] = [
      'blocked', 'elevated', 'privacy_signal', 'unavailable', 'pending', 'clear', 'error',
    ];
    for (const p of priority) {
      if (statuses.includes(p)) return p;
    }
    return 'unavailable';
  } catch (err) {
    console.error('[imageSafeguard] getWorstSafeguardStatus failed:', err instanceof Error ? err.message : err);
    return 'unavailable'; // fail closed
  }
}

/**
 * Check whether external sharing is permitted for a set of storage references.
 *
 * Returns:
 *  { allowed: true, worstStatus }   — sharing permitted (may require confirmation)
 *  { allowed: false, worstStatus }  — sharing blocked (elevated or blocked status)
 */
export async function checkExternalSharingPermitted(
  companyId: number,
  storageRefs: string[],
): Promise<{ allowed: boolean; worstStatus: SafeguardStatus }> {
  const worstStatus = await getWorstSafeguardStatus(companyId, storageRefs);
  const blocked = worstStatus === 'blocked' || worstStatus === 'elevated';
  return { allowed: !blocked, worstStatus };
}
