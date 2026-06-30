/**
 * DELETE /api/job-forms/:id/share
 * ─────────────────────────────────────────────────────────────────────────────
 * Revokes all active share links for a form submission.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobFormSubmissions, profiles } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    // Verify ownership
    const submission = await db.query.jobFormSubmissions.findFirst({
      where: and(
        eq(jobFormSubmissions.id, id),
        eq(jobFormSubmissions.companyId, profile.companyId),
      ),
    });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    // Revoke all active links
    await db.execute(
      sql`UPDATE shared_links
          SET revoked_at = NOW(), updated_at = NOW()
          WHERE company_id = ${profile.companyId}
            AND target_id = ${String(id)}
            AND revoked_at IS NULL`
    );

    // Audit log
    await db.execute(
      sql`INSERT INTO share_audit_log (shared_link_id, company_id, event_type, ip_address, user_agent, created_at)
          VALUES (0, ${profile.companyId}, 'link_revoked',
                  ${req.ip ?? null}, ${(req.headers['user-agent'] ?? '').slice(0, 500)}, NOW())`
    );

    return res.json({ ok: true });

  } catch (err) {
    console.error('DELETE /api/job-forms/:id/share error:', err);
    res.status(500).json({ error: 'Failed to revoke share link' });
  }
}
