/**
 * PUT /api/emergency-alerts/:id
 * Update the status of an emergency alert.
 *
 * Body: { action: 'acknowledge' | 'resolve' }
 *
 * - acknowledge: sets acknowledged_by, acknowledged_at; status stays 'active'
 * - resolve: sets resolved_by, resolved_at; status → 'resolved'
 *
 * Access: any authenticated user in the same company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const companyId = auth.profile.companyId;
  const userId    = auth.session.user.id;
  const userName  = auth.session.user.name ?? auth.session.user.email ?? 'Unknown';
  const alertId   = parseInt(req.params.id, 10);

  if (isNaN(alertId)) return res.status(400).json({ error: 'Invalid alert id' });

  const { action } = req.body as { action?: string };
  if (action !== 'acknowledge' && action !== 'resolve') {
    return res.status(400).json({ error: 'action must be acknowledge or resolve' });
  }

  // Verify alert belongs to this company
  const [rows] = await db.execute(
    sql`SELECT id, status FROM emergency_alerts
        WHERE id = ${alertId} AND company_id = ${companyId} LIMIT 1`
  ) as unknown as [Array<{ id: number; status: string }>, unknown];

  if (!rows.length) return res.status(404).json({ error: 'Alert not found' });
  const alert = rows[0];

  if (alert.status === 'resolved') {
    return res.status(400).json({ error: 'Alert is already resolved' });
  }

  try {
    if (action === 'acknowledge') {
      await db.execute(sql`
        UPDATE emergency_alerts
        SET acknowledged_by = ${userId},
            acknowledged_by_name = ${userName},
            acknowledged_at = NOW(),
            updated_at = NOW()
        WHERE id = ${alertId} AND company_id = ${companyId}
      `);
    } else {
      await db.execute(sql`
        UPDATE emergency_alerts
        SET status = 'resolved',
            resolved_by = ${userId},
            resolved_by_name = ${userName},
            resolved_at = NOW(),
            updated_at = NOW()
        WHERE id = ${alertId} AND company_id = ${companyId}
      `);
    }

    const [updated] = await db.execute(
      sql`SELECT * FROM emergency_alerts WHERE id = ${alertId} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ ok: true, alert: updated[0] ?? null });
  } catch (err) {
    console.error('PUT /api/emergency-alerts/:id error:', err);
    return res.status(500).json({ error: 'Failed to update alert' });
  }
}
