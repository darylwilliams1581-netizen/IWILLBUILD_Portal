/**
 * DELETE /api/secure-share/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * Revoke a share link (authenticated, company-scoped).
 * Sets revoked = 1 — does not delete the record (audit trail preserved).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { resolveEffectiveCompany } from '../../../lib/dazza-context.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { companyId } = await resolveEffectiveCompany(req, session.user.id);
    if (!companyId) return res.status(400).json({ error: 'No company' });

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    // Verify ownership before revoking
    const [rows] = await db.execute(sql`
      SELECT id FROM secure_share_links
      WHERE id = ${id} AND company_id = ${companyId}
      LIMIT 1
    `) as unknown as [Array<{ id: number }>, unknown];

    if (!rows?.[0]) return res.status(404).json({ error: 'Link not found' });

    await db.execute(sql`
      UPDATE secure_share_links
      SET revoked = 1, updated_at = NOW()
      WHERE id = ${id} AND company_id = ${companyId}
    `);

    // Log the revocation event
    await db.execute(sql`
      INSERT INTO secure_share_events
        (share_link_id, company_id, event_type, ip_address, user_agent, created_at)
      VALUES
        (${id}, ${companyId}, 'revoked',
         ${req.ip ?? null}, ${(req.headers['user-agent'] ?? '').slice(0, 500)}, NOW())
    `);

    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/secure-share/:id error:', e);
    return res.status(500).json({ error: 'Failed to revoke link' });
  }
}
