/**
 * POST /api/job-forms/:id/share
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a new external share link for a form submission.
 * Returns the raw token (shown once — not stored).
 *
 * Body: { type: 'external_form' | 'form_submission', expiryDays?: number, maxViews?: number }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobFormSubmissions, profiles } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { generateShareToken, hashToken, expiresAt } from '../../../../lib/share-tokens.js';

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

    const {
      type = 'external_form',
      expiryDays = 30,
      maxViews = null,
    } = req.body as { type?: string; expiryDays?: number; maxViews?: number | null };

    if (!['external_form', 'form_submission'].includes(type)) {
      return res.status(400).json({ error: 'Invalid share type' });
    }

    // Verify submission belongs to this company
    const submission = await db.query.jobFormSubmissions.findFirst({
      where: and(
        eq(jobFormSubmissions.id, id),
        eq(jobFormSubmissions.companyId, profile.companyId),
      ),
    });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    // Revoke any existing active links of the same type for this submission
    await db.execute(
      sql`UPDATE shared_links
          SET revoked_at = NOW(), updated_at = NOW()
          WHERE company_id = ${profile.companyId}
            AND target_type = ${type}
            AND target_id = ${String(id)}
            AND revoked_at IS NULL`
    );

    // Generate new token
    const rawToken = generateShareToken();
    const tokenHash = hashToken(rawToken);
    const exp = expiresAt(expiryDays);

    await db.execute(
      sql`INSERT INTO shared_links
            (company_id, created_by_user_id, target_type, target_id,
             token_hash, expires_at, max_views, view_count, created_at, updated_at)
          VALUES
            (${profile.companyId}, ${session.user.id}, ${type}, ${String(id)},
             ${tokenHash}, ${exp.toISOString().slice(0, 19).replace('T', ' ')},
             ${maxViews}, 0, NOW(), NOW())`
    );

    // Audit log
    await db.execute(
      sql`INSERT INTO share_audit_log (shared_link_id, company_id, event_type, ip_address, user_agent, created_at)
          SELECT id, ${profile.companyId}, 'link_created', ${req.ip ?? null},
                 ${(req.headers['user-agent'] ?? '').slice(0, 500)}, NOW()
          FROM shared_links WHERE token_hash = ${tokenHash} LIMIT 1`
    );

    // Update form status to 'sent' if it was draft
    if (type === 'external_form' && submission.status === 'draft') {
      await db.execute(
        sql`UPDATE job_form_submissions SET status = 'sent', updated_at = NOW()
            WHERE id = ${id} AND company_id = ${profile.companyId}`
      );
    }

    return res.status(201).json({
      token: rawToken,
      expiresAt: exp.toISOString(),
      type,
    });

  } catch (err) {
    console.error('POST /api/job-forms/:id/share error:', err);
    res.status(500).json({ error: 'Failed to create share link' });
  }
}
