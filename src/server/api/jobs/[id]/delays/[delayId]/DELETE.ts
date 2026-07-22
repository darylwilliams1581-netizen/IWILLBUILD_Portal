/**
 * DELETE /api/jobs/:id/delays/:delayId
 * Deletes a delay entry. Requires writable subscription.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

const VIEW_ONLY_STATUSES = ['trial_expired', 'past_due', 'cancelled', 'suspended'];

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

    // Writable subscription check
    const [companyRows] = await db.execute(
      sql`SELECT subscription_status FROM companies WHERE id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ subscription_status: string }>, unknown];
    const subStatus = companyRows?.[0]?.subscription_status ?? 'trial_active';
    if (VIEW_ONLY_STATUSES.includes(subStatus)) {
      return res.status(403).json({ error: 'Your subscription is view-only.' });
    }

    const jobId = parseInt(String(req.params.id), 10);
    const delayId = parseInt(String(req.params.delayId), 10);
    if (isNaN(jobId) || isNaN(delayId)) return res.status(400).json({ error: 'Invalid ID' });

    // Verify delay belongs to this company + job
    const [existing] = await db.execute(
      sql`SELECT id FROM job_delays WHERE id = ${delayId} AND job_id = ${jobId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!existing?.length) return res.status(404).json({ error: 'Delay not found' });

    await db.execute(
      sql`DELETE FROM job_delays WHERE id = ${delayId} AND company_id = ${profile.companyId}`
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/jobs/:id/delays/:delayId error:', err);
    return res.status(500).json({ error: 'Failed to delete delay' });
  }
}
