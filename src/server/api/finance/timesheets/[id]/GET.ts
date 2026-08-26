/**
 * GET /api/finance/timesheets/:id
 * Get a single timesheet with all entries.
 * Admins can see any; staff can only see their own.
 */
import type { Request, Response } from 'express';
import { resolvePOProfile } from '@/server/lib/po-auth.js';
import { getTimesheet } from '@/server/lib/timesheet-service.js';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const ts = await getTimesheet(id, profile.companyId, profile.id, profile.isAdmin);
    if (!ts) return res.status(404).json({ error: 'Timesheet not found' });
    return res.json({ timesheet: ts });
  } catch (err) {
    console.error('[GET /api/finance/timesheets/:id]', err);
    return res.status(500).json({ error: 'Failed to load timesheet' });
  }
}
