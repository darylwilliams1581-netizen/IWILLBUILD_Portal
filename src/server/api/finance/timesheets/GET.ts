/**
 * GET /api/finance/timesheets
 * List timesheets for the company.
 * Admins see all; staff see only their own.
 *
 * Query params:
 *   status      — all | draft | submitted | approved | rejected
 *   weekEnding  — YYYY-MM-DD
 *   search      — employee name, job number/name
 *   cursor      — last seen id (pagination)
 *   limit       — page size (max 100, default 25)
 */
import type { Request, Response } from 'express';
import { resolvePOProfile } from '@/server/lib/po-auth.js';
import { listTimesheets } from '@/server/lib/timesheet-service.js';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;

  const q = req.query as Record<string, string | undefined>;

  try {
    const result = await listTimesheets({
      companyId: profile.companyId,
      profileId: profile.id,
      isAdmin: profile.isAdmin,
      status: q.status ?? 'all',
      weekEnding: q.weekEnding,
      search: q.search?.trim() || undefined,
      cursor: q.cursor ? parseInt(q.cursor, 10) : undefined,
      limit: q.limit ? parseInt(q.limit, 10) : 25,
    });

    return res.json(result);
  } catch (err) {
    console.error('[GET /api/finance/timesheets]', err);
    return res.status(500).json({ error: 'Failed to load timesheets' });
  }
}
