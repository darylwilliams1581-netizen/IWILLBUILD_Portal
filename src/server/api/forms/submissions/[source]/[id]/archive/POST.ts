/**
 * POST /api/forms/submissions/:source/:id/archive
 *
 * Soft-archives a form submission. Sets archived_at, archived_by, archive_reason.
 * The record is never deleted — it moves to the Archived view only.
 *
 * Rules:
 *   - Any authenticated member of the company may archive.
 *   - Cannot archive a submission that is already archived.
 *   - Cannot archive a submission that has a legal_hold.
 *   - source must be 'internal' (job_form_submissions) or 'public' (form_public_submissions).
 *   - Tenant-isolated: company_id must match.
 *
 * Body (JSON, all optional):
 *   reason  — free-text reason for archiving
 *
 * Returns: { ok: true }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../../lib/auth-middleware.js';

const VALID_SOURCES = new Set(['internal', 'public']);

function tableFor(source: string) {
  return source === 'internal' ? 'job_form_submissions' : 'form_public_submissions';
}

export default async function handler(req: Request, res: Response) {
  const result = await getSessionAndProfile(req, res);
  if (!result) return;
  const { session, profile } = result;

  const { source, id: idParam } = req.params;
  if (!VALID_SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source. Must be internal or public.' });

  const id = parseInt(idParam, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const { reason = '' } = (req.body ?? {}) as { reason?: string };
  const archivedBy = session.user.name ?? session.user.email ?? session.user.id;
  const table = tableFor(source);
  const safe = (s: string) => s.replace(/'/g, "''");

  try {
    // Fetch the row — verify ownership and current state
    const [rows] = await db.execute(sql.raw(
      `SELECT id, company_id, archived_at, legal_hold FROM \`${table}\` WHERE id = ${id} LIMIT 1`
    )) as unknown as [Array<{ id: number; company_id: number; archived_at: string | null; legal_hold: number | null }>, unknown];

    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'Submission not found' });
    if (row.company_id !== profile.companyId) return res.status(403).json({ error: 'Access denied' });
    if (row.archived_at) return res.status(409).json({ error: 'Submission is already archived' });
    if (row.legal_hold) return res.status(409).json({ error: 'This submission has a legal hold and cannot be archived until the hold is lifted.' });

    const reasonSql = reason.trim()
      ? `'${safe(reason.trim())}'`
      : 'NULL';

    await db.execute(sql.raw(`
      UPDATE \`${table}\`
      SET archived_at     = NOW(),
          archived_by     = '${safe(archivedBy)}',
          archive_reason  = ${reasonSql},
          updated_at      = NOW()
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `));

    // Audit event — non-blocking
    try {
      await db.execute(sql.raw(`
        INSERT INTO submission_audit_log
          (company_id, submission_source, submission_id, action, actor_user_id, actor_name, note)
        VALUES
          (${profile.companyId}, '${source}', ${id}, 'archived',
           '${safe(session.user.id)}', '${safe(archivedBy)}',
           ${reasonSql})
      `));
    } catch { /* audit table may not exist yet — non-fatal */ }

    res.json({ ok: true });
  } catch (err) {
    console.error(`POST /api/forms/submissions/${source}/${id}/archive error:`, err);
    res.status(500).json({ error: 'Archive failed' });
  }
}
