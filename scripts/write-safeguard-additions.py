#!/usr/bin/env python3
"""Write CP12A7 additions to imageSafeguardService.ts"""
import sys

PART1 = r"""
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
"""

PART2 = r"""
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
"""

PART3 = r"""
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
"""

with open('src/server/lib/imageSafeguardService.ts', 'a') as f:
    f.write(PART1)
    f.write(PART2)
    f.write(PART3)

print('done')
