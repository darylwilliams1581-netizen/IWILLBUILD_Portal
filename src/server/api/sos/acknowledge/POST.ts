import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

interface AuthUser {
  id: string;
  companyId?: number;
}

export default async function handler(req: Request, res: Response) {
  try {
    const user = (req as Request & { user?: AuthUser }).user;
    if (!user?.id || !user?.companyId) {
      return res.status(401).json({ error: 'Unauthorised' });
    }

    const { alertId } = req.body as { alertId: number };
    if (!alertId) return res.status(400).json({ error: 'alertId required' });

    await db.execute(sql`
      UPDATE job_sos_alerts
      SET status = 'acknowledged',
          acknowledged_by = ${user.id},
          acknowledged_at = NOW()
      WHERE id = ${alertId}
        AND company_id = ${user.companyId}
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[sos/acknowledge] error:', err);
    return res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
}
