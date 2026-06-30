/**
 * GET /api/job-forms/:id/share
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the active share link status for a form submission.
 * Does NOT return the raw token (it is shown only once at creation).
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

    // Get active links
    const [rows] = await db.execute(
      sql`SELECT id, target_type, expires_at, max_views, view_count, revoked_at, created_at
          FROM shared_links
          WHERE company_id = ${profile.companyId}
            AND target_id = ${String(id)}
          ORDER BY created_at DESC
          LIMIT 10`
    ) as unknown as [Array<{
      id: number;
      target_type: string;
      expires_at: string;
      max_views: number | null;
      view_count: number;
      revoked_at: string | null;
      created_at: string;
    }>, unknown];

    const links = (rows ?? []).map((r) => ({
      id: r.id,
      targetType: r.target_type,
      expiresAt: r.expires_at,
      maxViews: r.max_views,
      viewCount: r.view_count,
      revokedAt: r.revoked_at,
      createdAt: r.created_at,
      isActive: !r.revoked_at && new Date(r.expires_at) > new Date(),
    }));

    return res.json({ links });

  } catch (err) {
    console.error('GET /api/job-forms/:id/share error:', err);
    res.status(500).json({ error: 'Failed to load share status' });
  }
}
