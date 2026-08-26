/**
 * POST /api/finance/timesheets
 * Create a new timesheet (always starts as draft).
 *
 * SECURITY: employeeProfileId is ALWAYS derived from the authenticated session.
 * Workers cannot supply or override their own employee identity.
 * Admins may supply an explicit employeeProfileId to create on behalf of another
 * employee within the same company.
 *
 * Body: { weekEnding, jobId?, notes?, entries: [...] }
 */
import type { Request, Response } from 'express';
import { resolvePOProfile } from '@/server/lib/po-auth.js';
import { createTimesheet } from '@/server/lib/timesheet-service.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;

  const body = req.body as Record<string, unknown>;

  try {
    // Determine employee: workers always use their own profile.
    // Admins may specify a different employee within the same company.
    let employeeProfileId: number = profile.id;

    if (profile.isAdmin && body.employeeProfileId != null) {
      const requestedId = parseInt(String(body.employeeProfileId), 10);
      if (!isNaN(requestedId) && requestedId !== profile.id) {
        // Verify the requested employee belongs to the same company
        const [empRows] = await db.execute(sql`
          SELECT id FROM profiles
          WHERE id = ${requestedId} AND company_id = ${profile.companyId} AND status = 'active'
          LIMIT 1
        `);
        if ((empRows as unknown[]).length === 0) {
          return res.status(400).json({ error: 'Employee not found in your company' });
        }
        employeeProfileId = requestedId;
      }
    }

    const result = await createTimesheet({
      companyId: profile.companyId,
      profileId: profile.id,
      employeeProfileId,
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
