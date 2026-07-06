/**
 * POST /api/asset-manager/inspections/:id/report/share
 * Generate or refresh a share token for a read-only inspection report.
 * Body: { expires_days?: number (default 30), scope?: 'read' }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../../lib/auth-middleware.js';
import { createHash } from 'crypto';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { session, profile } = sp;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const expires_days = parseInt(String(req.body.expires_days ?? 30), 10);
  const scope = (req.body.scope as string) || 'read';

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_inspections WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    // Revoke existing active tokens for this inspection
    await db.execute(sql`UPDATE am_report_shares SET revoked = 1 WHERE inspection_id = ${id} AND revoked = 0`);

    const rawToken = crypto.randomUUID();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + expires_days * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ');

    await db.execute(sql`
      INSERT INTO am_report_shares (inspection_id, company_id, token_hash, scope, expires_at, created_by)
      VALUES (${id}, ${profile.companyId}, ${tokenHash}, ${scope}, ${expiresAt}, ${session.user.id})
    `);

    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id) VALUES ('inspection', ${id}, 'share_created', ${session.user.id})`);

    const shareUrl = `/share/asset-report/${rawToken}`;
    return res.json({ ok: true, token: rawToken, shareUrl, expiresAt });
  } catch (err) {
    console.error('POST inspection share error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
