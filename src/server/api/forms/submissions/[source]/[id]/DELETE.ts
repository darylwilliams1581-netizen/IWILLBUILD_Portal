/**
 * DELETE /api/forms/submissions/:source/:id
 *
 * Permanently deletes an archived form submission.
 *
 * Rules:
 *   - Restricted to role 'admin' or 'owner' (company-level).
 *   - Submission MUST be archived first — cannot delete directly from active/completed.
 *   - Cannot delete a submission that has a legal_hold.
 *   - Tenant-isolated: company_id must match.
 *   - Permanently removes the row and any associated stored file paths recorded
 *     in answers_json (storage keys prefixed with 'r2:' or '/shared-storage/').
 *   - Does NOT affect the source form_template or any other submission.
 *   - Records an audit event (without retaining the deleted submission's content).
 *
 * Returns: { ok: true }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import { getSecret } from '#airo/secrets';
import { promises as fs } from 'node:fs';

const VALID_SOURCES = new Set(['internal', 'public']);

function tableFor(source: string) {
  return source === 'internal' ? 'job_form_submissions' : 'form_public_submissions';
}

/** Extract file paths/keys from answers_json that point to stored files. */
function extractStoredFiles(answersJson: string | null): string[] {
  if (!answersJson) return [];
  try {
    const answers = JSON.parse(answersJson) as Record<string, unknown>;
    const paths: string[] = [];
    function walk(val: unknown) {
      if (typeof val === 'string') {
        // Shared-storage paths
        if (val.startsWith('/shared-storage/') || val.startsWith('/airo-assets/uploads/')) {
          paths.push(val);
        }
      } else if (Array.isArray(val)) {
        val.forEach(walk);
      } else if (val && typeof val === 'object') {
        Object.values(val).forEach(walk);
      }
    }
    walk(answers);
    return paths;
  } catch {
    return [];
  }
}

/** Best-effort delete of a stored file. Never throws. */
async function tryDeleteFile(filePath: string): Promise<void> {
  try {
    // Map /airo-assets/uploads/... → /shared-storage/public/assets/uploads/...
    const resolved = filePath.startsWith('/airo-assets/uploads/')
      ? filePath.replace('/airo-assets/uploads/', '/shared-storage/public/assets/uploads/')
      : filePath;
    // Only delete files within shared-storage (never arbitrary paths)
    if (!resolved.startsWith('/shared-storage/')) return;
    await fs.unlink(resolved);
  } catch { /* file may not exist — non-fatal */ }
}

export default async function handler(req: Request, res: Response) {
  const result = await getSessionAndProfile(req, res);
  if (!result) return;
  const { session, profile } = result;

  // Admin, owner (company role), or platform owner (by email)
  const platformOwnerEmail = getSecret('PLATFORM_OWNER_EMAIL') ?? '';
  const isPlatformOwner = !!platformOwnerEmail && session.user.email === platformOwnerEmail;
  if (profile.role !== 'admin' && profile.role !== 'owner' && !isPlatformOwner) {
    return res.status(403).json({ error: 'Only admins and owners can permanently delete submissions.' });
  }

  const { source, id: idParam } = req.params;
  if (!VALID_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source. Must be internal or public.' });

  const id = parseInt(idParam, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const deletedBy = session.user.name ?? session.user.email ?? session.user.id;
  const table = tableFor(source);
  const safe = (s: string) => s.replace(/'/g, "''");

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT id, company_id, archived_at, legal_hold, answers_json FROM \`${table}\` WHERE id = ${id} LIMIT 1`
    )) as unknown as [Array<{ id: number; company_id: number; archived_at: string | null; legal_hold: number | null; answers_json: string | null }>, unknown];

    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'Submission not found' });
    if (row.company_id !== profile.companyId) return res.status(403).json({ error: 'Access denied' });
    if (!row.archived_at) {
      return res.status(409).json({
        error: 'Submission must be archived before it can be permanently deleted. Archive it first.',
      });
    }
    if (row.legal_hold) {
      return res.status(409).json({
        error: 'This submission has a legal hold and cannot be permanently deleted until the hold is lifted.',
      });
    }

    // Collect file paths before deletion
    const filePaths = extractStoredFiles(row.answers_json);

    // Audit BEFORE deletion (so we have the id)
    try {
      await db.execute(sql.raw(`
        INSERT INTO submission_audit_log
          (company_id, submission_source, submission_id, action, actor_user_id, actor_name, note)
        VALUES
          (${profile.companyId}, '${source}', ${id}, 'permanently_deleted',
           '${safe(session.user.id)}', '${safe(deletedBy)}', NULL)
      `));
    } catch { /* audit table may not exist yet — non-fatal */ }

    // Delete the row
    await db.execute(sql.raw(
      `DELETE FROM \`${table}\` WHERE id = ${id} AND company_id = ${profile.companyId}`
    ));

    // Best-effort cleanup of stored files (non-blocking)
    void Promise.all(filePaths.map(tryDeleteFile));

    res.json({ ok: true });
  } catch (err) {
    console.error(`DELETE /api/forms/submissions/${source}/${id} error:`, err);
    res.status(500).json({ error: 'Delete failed' });
  }
}
