/**
 * POST /api/jobs/:id/generate-qr
 *
 * Generates a signed short-lived QR token for a job sign-in or sign-out action.
 * Returns the token and the full URL to embed in a QR code.
 *
 * Body: { action: 'signin' | 'signout'; actorType?: string }
 * Returns: { ok, token, url, expiresAt }
 *
 * Access: owner, admin, site_manager roles.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';
import { signQrToken } from '../../../../lib/qr-token.js';
import type { ResultSetHeader } from 'mysql2';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'site_manager', 'estimator']);
const VALID_ACTOR_TYPES = new Set([
  'employee', 'contractor', 'consultant', 'delivery_driver', 'guest',
]);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  if (!ALLOWED_ROLES.has(auth.profile.role)) {
    return res.status(403).json({ error: 'Only owners, admins, and site managers can generate QR codes.' });
  }

  const jobId = parseInt(req.params.id);
  if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

  const { action, actorType = 'guest' } = req.body as {
    action?: string;
    actorType?: string;
  };

  if (action !== 'signin' && action !== 'signout') {
    return res.status(400).json({ error: 'action must be "signin" or "signout"' });
  }

  const safeActorType = VALID_ACTOR_TYPES.has(actorType) ? actorType : 'guest';
  const companyId = auth.profile.companyId;
  const userId    = auth.session.user.id;

  try {
    // ── Verify job belongs to company ─────────────────────────────────────
    const [jobRows] = await db.execute(
      sql.raw(`SELECT id, name FROM jobs WHERE id = ${jobId} AND company_id = ${companyId} LIMIT 1`)
    ) as unknown as [Array<{ id: number; name: string }>, unknown];
    if (!jobRows?.[0]) return res.status(404).json({ error: 'Job not found' });

    // ── Sign token ────────────────────────────────────────────────────────
    const { token, payload } = signQrToken(jobId, action, safeActorType);
    const expiresAt = new Date(payload.exp * 1000).toISOString();

    // ── Persist token for audit (optional — non-fatal if table missing) ───
    try {
      await db.execute(
        sql.raw(`
          INSERT INTO qr_tokens (id, company_id, job_id, action, actor_type, issued_by, expires_at)
          VALUES ('${payload.jti}', ${companyId}, ${jobId}, '${action}', '${safeActorType}', '${userId.replace(/'/g, '')}', '${expiresAt.replace('T', ' ').replace('Z', '')}')
        `)
      ) as unknown as [ResultSetHeader, unknown];
    } catch {
      // qr_tokens table may not exist yet — non-fatal
    }

    // ── Build URL ─────────────────────────────────────────────────────────
    const baseUrl = req.headers.origin ?? `https://${req.headers.host ?? 'iwillbuild.com'}`;
    const url = `${baseUrl}/jobs/${jobId}/signin?mode=${action}&token=${encodeURIComponent(token)}`;

    return res.json({
      ok: true,
      token,
      url,
      expiresAt,
      jobId,
      action,
      actorType: safeActorType,
    });
  } catch (err) {
    console.error('POST /api/jobs/:id/generate-qr error:', err);
    return res.status(500).json({ error: 'Failed to generate QR token' });
  }
}
