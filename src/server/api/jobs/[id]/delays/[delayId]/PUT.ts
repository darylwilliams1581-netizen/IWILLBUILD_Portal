/**
 * PUT /api/jobs/:id/delays/:delayId
 * Updates a delay / condition record entry. Requires writable subscription.
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
    if (!existing?.length) return res.status(404).json({ error: 'Record not found' });

    const {
      category,
      impact_summary,
      days,
      delayDate,
      notes,
      rainfall_mm,
      ground_condition,
      work_condition,
      reason, // legacy compat
    } = req.body as {
      category?: string;
      impact_summary?: string;
      days?: string | number;
      delayDate?: string;
      notes?: string;
      rainfall_mm?: string | number;
      ground_condition?: string;
      work_condition?: string;
      reason?: string;
    };

    const resolvedSummary = (impact_summary?.trim() || reason?.trim() || '').trim();
    if (!resolvedSummary) return res.status(400).json({ error: 'Impact summary is required' });

    const daysNum = parseFloat(String(days ?? 0));
    if (isNaN(daysNum) || daysNum < 0) return res.status(400).json({ error: 'Days must be a non-negative number' });

    const entryType = daysNum > 0 ? 'delay' : 'condition';
    const today = new Date().toISOString().slice(0, 10);
    const effectiveDate = delayDate?.trim() || today;

    const resolvedCategory = category?.trim() || null;
    const resolvedRainfallMm = rainfall_mm !== undefined && rainfall_mm !== '' ? parseFloat(String(rainfall_mm)) : null;
    const resolvedGroundCondition = ground_condition?.trim() || null;
    const resolvedWorkCondition = work_condition?.trim() || null;

    await db.execute(sql`
      UPDATE job_delays
      SET reason           = ${resolvedSummary},
          impact_summary   = ${resolvedSummary},
          category         = ${resolvedCategory},
          entry_type       = ${entryType},
          days             = ${daysNum},
          delay_date       = ${effectiveDate},
          notes            = ${notes?.trim() || null},
          rainfall_mm      = ${resolvedRainfallMm},
          ground_condition = ${resolvedGroundCondition},
          work_condition   = ${resolvedWorkCondition},
          updated_at       = NOW()
      WHERE id = ${delayId} AND company_id = ${profile.companyId}
    `);

    const [rows] = await db.execute(
      sql`SELECT * FROM job_delays WHERE id = ${delayId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ delay: rows?.[0] ?? null });
  } catch (err) {
    console.error('PUT /api/jobs/:id/delays/:delayId error:', err);
    return res.status(500).json({ error: 'Failed to update record' });
  }
}
