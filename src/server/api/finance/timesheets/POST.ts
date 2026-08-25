/**
 * POST /api/finance/timesheets
 * Create a new timesheet (always starts as draft).
 *
 * Body: { weekEnding, jobId?, notes?, entries: [{ work_date, job_id?, description, hours }] }
 */
import type { Request, Response } from 'express';
import { resolvePOProfile } from '@/server/lib/po-auth.js';
import { createTimesheet } from '@/server/lib/timesheet-service.js';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;

  const body = req.body as Record<string, unknown>;

  try {
    const result = await createTimesheet({
      companyId: profile.companyId,
      profileId: profile.id,
      weekEnding: String(body.weekEnding ?? '').trim(),
      jobId: body.jobId != null ? parseInt(String(body.jobId), 10) : null,
      notes: body.notes != null ? String(body.notes).trim() || null : null,
      entries: Array.isArray(body.entries) ? body.entries : [],
    });

    if (!result.ok) {
      return res.status(result.error.code).json({ error: result.error.message });
    }

    return res.status(201).json({ timesheet: result.data });
  } catch (err) {
    console.error('[POST /api/finance/timesheets]', err);
    return res.status(500).json({ error: 'Failed to create timesheet' });
  }
}
