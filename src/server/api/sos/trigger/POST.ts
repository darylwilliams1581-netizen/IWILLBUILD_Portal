import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { sendPushToCompany } from '../../../lib/push-notifications.js';

interface AuthUser {
  id: string;
  name?: string;
  email?: string;
  companyId?: number;
}

export default async function handler(req: Request, res: Response) {
  try {
    const user = (req as Request & { user?: AuthUser }).user;
    if (!user?.id || !user?.companyId) {
      return res.status(401).json({ error: 'Unauthorised' });
    }

    const { jobId, lat, lng } = req.body as {
      jobId?: number;
      lat?: number;
      lng?: number;
    };

    const triggeredByName = user.name ?? user.email ?? 'Unknown user';

    // 1. Save alert to DB
    const result = await db.execute(sql`
      INSERT INTO job_sos_alerts
        (company_id, triggered_by, triggered_by_name, job_id, lat, lng, status)
      VALUES
        (${user.companyId}, ${user.id}, ${triggeredByName}, ${jobId ?? null}, ${lat ?? null}, ${lng ?? null}, 'active')
    `) as unknown as { insertId?: number };

    const alertId = result?.insertId ?? 0;

    // 2. Fan-out push notification to ALL company users
    await sendPushToCompany(user.companyId, {
      title: '🚨 SOS EMERGENCY ALERT',
      body: `${triggeredByName} has activated an emergency beacon. Tap to respond.`,
      url: jobId ? `/jobs/${jobId}` : '/dashboard',
      tag: `sos-${alertId}`,
    });

    // 3. Also push to developer/owner (company_id = 1 is the platform owner)
    // This is a best-effort secondary push — won't fail the request if it errors
    try {
      if (user.companyId !== 1) {
        await sendPushToCompany(1, {
          title: `🚨 SOS — ${triggeredByName}`,
          body: `Emergency beacon triggered on company ${user.companyId}`,
          url: '/owner-console',
          tag: `sos-dev-${alertId}`,
        });
      }
    } catch {
      // non-critical
    }

    return res.status(201).json({
      ok: true,
      alertId,
      message: `Emergency alert sent to all team members`,
    });
  } catch (err) {
    console.error('[sos/trigger] error:', err);
    return res.status(500).json({ error: 'Failed to trigger SOS alert' });
  }
}
