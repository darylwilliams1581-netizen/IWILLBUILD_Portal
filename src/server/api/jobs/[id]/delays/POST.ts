/**
 * POST /api/jobs/:id/delays
 * Creates a new delay / condition record entry. Requires writable subscription.
 *
 * Accepts the hybrid form payload:
 *   category        — Weather | Material | Site access | Client / instruction |
 *                     Labour / subcontractor | Plant / equipment | Other
 *   entry_type      — 'delay' (days > 0) | 'condition' (days = 0 with impacts)
 *   impact_summary  — short purposeful description (replaces old "reason")
 *   days            — 0 for condition-only records
 *   delay_date
 *   notes           — optional supporting context
 *   rainfall_mm     — weather: rainfall total
 *   ground_condition— weather: ground state
 *   work_condition  — weather: impact to works
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import type { ResultSetHeader } from 'mysql2';

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
      return res.status(403).json({ error: 'Your subscription is view-only. Upgrade to add records.' });
    }

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    // Verify job belongs to this company
    const [jobRows] = await db.execute(
      sql`SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });

    const {
      category,
      impact_summary,
      days,
      delayDate,
      notes,
      rainfall_mm,
      ground_condition,
      work_condition,
      // legacy field — kept for backward compat; mapped to impact_summary if present
      reason,
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

    // Resolve impact summary — new field wins, fall back to legacy reason
    const resolvedSummary = (impact_summary?.trim() || reason?.trim() || '').trim();
    if (!resolvedSummary) return res.status(400).json({ error: 'Impact summary is required' });

    const daysNum = parseFloat(String(days ?? 0));
    if (isNaN(daysNum) || daysNum < 0) return res.status(400).json({ error: 'Days must be a non-negative number' });

    // Determine entry type
    const entryType = daysNum > 0 ? 'delay' : 'condition';

    const today = new Date().toISOString().slice(0, 10);
    const effectiveDate = delayDate?.trim() || today;

    const resolvedCategory = category?.trim() || null;
    const resolvedRainfallMm = rainfall_mm !== undefined && rainfall_mm !== '' ? parseFloat(String(rainfall_mm)) : null;
    const resolvedGroundCondition = ground_condition?.trim() || null;
    const resolvedWorkCondition = work_condition?.trim() || null;

    // Get creator name
    const [userRows] = await db.execute(
      sql`SELECT name FROM user WHERE id = ${session.user.id} LIMIT 1`
    ) as unknown as [Array<{ name: string }>, unknown];
    const creatorName = userRows?.[0]?.name ?? session.user.email ?? 'Unknown';

    const [result] = await db.execute(sql`
      INSERT INTO job_delays
        (company_id, job_id, reason, impact_summary, category, entry_type,
         days, delay_date, notes,
         rainfall_mm, ground_condition, work_condition,
         created_by_user_id, created_by_name)
      VALUES
        (${profile.companyId}, ${jobId},
         ${resolvedSummary}, ${resolvedSummary}, ${resolvedCategory}, ${entryType},
         ${daysNum}, ${effectiveDate}, ${notes?.trim() || null},
         ${resolvedRainfallMm}, ${resolvedGroundCondition}, ${resolvedWorkCondition},
         ${session.user.id}, ${creatorName})
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT * FROM job_delays WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.status(201).json({ delay: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/jobs/:id/delays error:', err);
    return res.status(500).json({ error: 'Failed to create record' });
  }
}
