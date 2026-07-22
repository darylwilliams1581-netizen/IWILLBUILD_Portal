import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

interface AuthUser {
  id: string;
  companyId?: number;
}

interface SosAlertRow {
  id: number;
  triggered_by: string;
  triggered_by_name: string;
  job_id: number | null;
  lat: number | null;
  lng: number | null;
  status: string;
  created_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

export default async function handler(req: Request, res: Response) {
  try {
    const user = (req as Request & { user?: AuthUser }).user;
    if (!user?.id || !user?.companyId) {
      return res.status(401).json({ error: 'Unauthorised' });
    }

    // Return last 20 alerts for this company, newest first
    const rows = await db.execute(sql`
      SELECT id, triggered_by, triggered_by_name, job_id, lat, lng,
             status, created_at, acknowledged_by, acknowledged_at
      FROM job_sos_alerts
      WHERE company_id = ${user.companyId}
      ORDER BY created_at DESC
      LIMIT 20
    `) as unknown as SosAlertRow[];

    return res.json({ alerts: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    console.error('[sos/list] error:', err);
    return res.status(500).json({ error: 'Failed to load SOS alerts' });
  }
}
