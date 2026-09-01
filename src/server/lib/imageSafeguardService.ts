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
import { randomUUID, createHash } from 'node:crypto';
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

// ── CP12A7: Server-side image reference resolution ────────────────────────────

/**
 * Resolve the exact storage refs for all photos belonging to a job.
 * Returns job_photo:{id} strings matching the format written on upload.
 * Scoped to companyId. Returns empty array on DB failure (fail-closed).
 */
export async function resolveJobPhotoRefs(
  companyId: number,
  jobId: number,
): Promise<string[]> {
  try {
    const rows = await db.execute(sql`
      SELECT id FROM job_photos
      WHERE job_id = ${jobId} AND company_id = ${companyId}
      ORDER BY id ASC
    `);
    return (rows as unknown as Array<{ id: number }>).map(r => `job_photo:${r.id}`);
  } catch (err) {
    console.error('[imageSafeguard] resolveJobPhotoRefs failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Resolve the exact storage refs for all photos embedded in a form PDF.
 *
 * The form PDF builder resolves photos from company_files rows via
 * /api/files/{id}/dl URLs stored in the submission answers JSON.
 * This function replicates that resolution server-side.
 *
 * Returns company_file:{id} strings.
 * Scoped to companyId. Returns empty array on DB failure (fail-closed).
 */
export async function resolveFormPhotoRefs(
  companyId: number,
  submissionId: number,
): Promise<string[]> {
  try {
    const submissionRows = await db.execute(sql`
      SELECT answers_json FROM job_form_submissions
      WHERE id = ${submissionId} AND company_id = ${companyId}
      LIMIT 1
    `);
    const submissionRow = (submissionRows as unknown as Array<{ answers_json: string | null }>)[0];
    if (!submissionRow) return [];

    let answers: Record<string, unknown> = {};
    try {
      if (submissionRow.answers_json) {
        answers = JSON.parse(submissionRow.answers_json) as Record<string, unknown>;
      }
    } catch {
      return [];
    }

    const templateRows = await db.execute(sql`
      SELECT jft.fields_json
      FROM job_form_submissions jfs
      JOIN job_form_templates jft ON jft.id = jfs.template_id
      WHERE jfs.id = ${submissionId} AND jfs.company_id = ${companyId}
      LIMIT 1
    `);
    const templateRow = (templateRows as unknown as Array<{ fields_json: string | null }>)[0];
    if (!templateRow?.fields_json) return [];

    let fields: Array<{ id: number | string; fieldType?: string }> = [];
    try {
      fields = JSON.parse(templateRow.fields_json) as typeof fields;
    } catch {
      return [];
    }

    const fileIds = new Set<number>();
    for (const field of fields) {
      if (field.fieldType !== 'photo') continue;
      const value = answers[String(field.id)];
      const urls = extractAnswerUrls(value);
      for (const url of urls) {
        const id = extractFileIdFromUrl(url);
        if (id !== null) fileIds.add(id);
      }
    }

    if (fileIds.size === 0) return [];

    const idList = Array.from(fileIds);
    const idFragments = idList.map(id => sql`${id}`);
    const inClause = sql.join(idFragments, sql`, `);
    const fileRows = await db.execute(sql`
      SELECT id FROM company_files
      WHERE company_id = ${companyId} AND id IN (${inClause})
    `);
    const verifiedIds = (fileRows as unknown as Array<{ id: number }>).map(r => r.id);

    return verifiedIds.sort((a, b) => a - b).map(id => `company_file:${id}`);
  } catch (err) {
    console.error('[imageSafeguard] resolveFormPhotoRefs failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

function extractAnswerUrls(value: unknown): string[] {
  if (!value) return [];
  let urls: string[] = [];
  if (Array.isArray(value)) {
    urls = value.filter((item): item is string => typeof item === 'string');
  } else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      urls = Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [value];
    } catch {
      urls = [value];
    }
  }
  return urls.filter(u => Boolean(u) && u.includes('/api/files/'));
}

function extractFileIdFromUrl(value: string): number | null {
  // Matches /api/files/{numeric-id}/download
  const PATTERN = /(?:^|\/)api\/files\/(\d+)\/download(?:\?|$)/i;
  const match = value.match(PATTERN);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ── CP12A7: Bound confirmation token ─────────────────────────────────────────

export type SharingAction = 'share_link' | 'form_email';

export interface IssueConfirmationTokenOptions {
  companyId: number;
  userId: string;
  action: SharingAction;
  storageRefs: string[];
  recipients?: string[];
  worstStatus: SafeguardStatus;
}

export interface ConfirmationTokenRecord {
  tokenId: string;
  expiresAt: string;
  worstStatus: SafeguardStatus;
}

const CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Compute a stable SHA-256 hex digest of a sorted list of strings.
 * Used to bind a confirmation token to the exact set of refs/recipients.
 */
export function computeDigest(items: string[]): string {
  const sorted = [...items].sort();
  return createHash('sha256').update(sorted.join('\n')).digest('hex');
}

/**
 * Issue a server-side bound confirmation token.
 *
 * The token is stored in image_safeguard_confirmations and is:
 *  - Bound to the authenticated company + user
 *  - Bound to the exact sorted storage refs (via SHA-256 digest)
 *  - Bound to the exact sorted recipients (form_email only)
 *  - Single-use (used_at is set atomically on consumption)
 *  - Time-limited (5 minutes)
 *  - Unique nonce (prevents replay within the TTL window)
 *
 * Returns null if the status is blocked/elevated (must not issue token).
 * Returns null on DB failure (fail-closed).
 */
export async function issueConfirmationToken(
  opts: IssueConfirmationTokenOptions,
): Promise<ConfirmationTokenRecord | null> {
  if (opts.worstStatus === 'blocked' || opts.worstStatus === 'elevated') {
    return null;
  }

  const tokenId = randomUUID();
  const nonce = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIRMATION_TTL_MS);
  const refsDigest = computeDigest(opts.storageRefs);
  const recipientsDigest = opts.recipients ? computeDigest(opts.recipients) : null;

  try {
    await db.execute(sql`
      INSERT INTO image_safeguard_confirmations
        (id, company_id, user_id, action, image_refs_digest, recipients_digest,
         worst_status, nonce, expires_at, used_at, created_at)
      VALUES
        (${tokenId}, ${opts.companyId}, ${opts.userId}, ${opts.action},
         ${refsDigest}, ${recipientsDigest},
         ${opts.worstStatus}, ${nonce}, ${expiresAt}, NULL, ${now})
    `);

    return { tokenId, expiresAt: expiresAt.toISOString(), worstStatus: opts.worstStatus };
  } catch (err) {
    console.error('[imageSafeguard] issueConfirmationToken failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export type ConsumeTokenResult =
  | { ok: true; worstStatus: SafeguardStatus }
  | { ok: false; reason: 'missing' | 'expired' | 'used' | 'wrong_company' | 'wrong_user' | 'wrong_refs' | 'wrong_recipients' | 'blocked' | 'db_error' };

/**
 * Consume a bound confirmation token.
 *
 * Validates all binding constraints and marks the token used atomically.
 * Returns { ok: false, reason } for any validation failure.
 * Returns { ok: true, worstStatus } on success.
 *
 * SECURITY INVARIANTS:
 *  - Token must exist and not be expired
 *  - Token must not have been used before (single-use)
 *  - company_id and user_id must match the authenticated session
 *  - image_refs_digest must match the exact refs being shared
 *  - recipients_digest must match the exact recipients (form_email only)
 *  - worst_status must not be blocked or elevated
 *  - The used_at update uses WHERE used_at IS NULL to prevent race conditions
 */
export async function consumeConfirmationToken(opts: {
  tokenId: string;
  companyId: number;
  userId: string;
  action: SharingAction;
  storageRefs: string[];
  recipients?: string[];
}): Promise<ConsumeTokenResult> {
  try {
    const rows = await db.execute(sql`
      SELECT id, company_id, user_id, action, image_refs_digest, recipients_digest,
             worst_status, expires_at, used_at
      FROM image_safeguard_confirmations
      WHERE id = ${opts.tokenId}
      LIMIT 1
    `);
    const row = (rows as unknown as Array<{
      id: string;
      company_id: number;
      user_id: string;
      action: string;
      image_refs_digest: string;
      recipients_digest: string | null;
      worst_status: string;
      expires_at: Date | string;
      used_at: Date | string | null;
    }>)[0];

    if (!row) return { ok: false, reason: 'missing' };

    const expiresAt = new Date(row.expires_at);
    if (expiresAt < new Date()) return { ok: false, reason: 'expired' };

    if (row.used_at !== null) return { ok: false, reason: 'used' };

    if (row.company_id !== opts.companyId) return { ok: false, reason: 'wrong_company' };
    if (row.user_id !== opts.userId) return { ok: false, reason: 'wrong_user' };

    const expectedRefsDigest = computeDigest(opts.storageRefs);
    if (row.image_refs_digest !== expectedRefsDigest) return { ok: false, reason: 'wrong_refs' };

    if (opts.action === 'form_email') {
      const expectedRecipientsDigest = opts.recipients ? computeDigest(opts.recipients) : computeDigest([]);
      const storedRecipientsDigest = row.recipients_digest ?? computeDigest([]);
      if (storedRecipientsDigest !== expectedRecipientsDigest) {
        return { ok: false, reason: 'wrong_recipients' };
      }
    }

    const worstStatus = row.worst_status as SafeguardStatus;
    if (worstStatus === 'blocked' || worstStatus === 'elevated') {
      return { ok: false, reason: 'blocked' };
    }

    const now = new Date();
    const updateResult = await db.execute(sql`
      UPDATE image_safeguard_confirmations
      SET used_at = ${now}
      WHERE id = ${opts.tokenId} AND used_at IS NULL
    `);
    const affectedRows = (updateResult as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;
    if (affectedRows === 0) return { ok: false, reason: 'used' };

    return { ok: true, worstStatus };
  } catch (err) {
    console.error('[imageSafeguard] consumeConfirmationToken failed:', err instanceof Error ? err.message : err);
    return { ok: false, reason: 'db_error' };
  }
}
