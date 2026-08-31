/**
 * POST /api/forms/submissions/:source/:id/restore
 *
 * Restores an archived form submission to its previous status.
 * Clears archived_at, archived_by, archive_reason.
 *
 * Rules:
 *   - Any authenticated member of the company may restore.
 *   - Can only restore a submission that is currently archived.
 *   - source must be 'internal' or 'public'.
 *   - Tenant-isolated: company_id must match.
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

  const restoredBy = session.user.name ?? session.user.email ?? session.user.id;
  const table = tableFor(source);
  const safe = (s: string) => s.replace(/'/g, "''");

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT id, company_id, archived_at FROM \`${table}\` WHERE id = ${id} LIMIT 1`
    )) as unknown as [Array<{ id: number; company_id: number; archived_at: string | null }>, unknown];

    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'Submission not found' });
    if (row.company_id !== profile.companyId) return res.status(403).json({ error: 'Access denied' });
    if (!row.archived_at) return res.status(409).json({ error: 'Submission is not archived' });

    await db.execute(sql.raw(`
      UPDATE \`${table}\`
      SET archived_at    = NULL,
          archived_by    = NULL,
          archive_reason = NULL,
          updated_at     = NOW()
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `));

    // Audit event — non-blocking
    try {
      await db.execute(sql.raw(`
        INSERT INTO submission_audit_log
          (company_id, submission_source, submission_id, action, actor_user_id, actor_name, note)
        VALUES
          (${profile.companyId}, '${source}', ${id}, 'restored',
           '${safe(session.user.id)}', '${safe(restoredBy)}', NULL)
      `));
    } catch { /* audit table may not exist yet — non-fatal */ }

    res.json({ ok: true });
  } catch (err) {
    console.error(`POST /api/forms/submissions/${source}/${id}/restore error:`, err);
    res.status(500).json({ error: 'Restore failed' });
  }
}
