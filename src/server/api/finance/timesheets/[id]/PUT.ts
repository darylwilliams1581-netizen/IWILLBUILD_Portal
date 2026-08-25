/**
 * PUT /api/finance/timesheets/:id
 * Update a timesheet (draft/rejected only) OR transition its status.
 *
 * Body for edit:   { weekEnding?, jobId?, notes?, entries? }
 * Body for status: { status: 'submitted' | 'approved' | 'rejected', rejectionReason? }
 */
import type { Request, Response } from 'express';
import { resolvePOProfile } from '@/server/lib/po-auth.js';
import {
  updateTimesheet,
  transitionTimesheet,
  type TimesheetStatus,
} from '@/server/lib/timesheet-service.js';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const body = req.body as Record<string, unknown>;

  try {
    // Status transition request
    if (body.status !== undefined) {
      const result = await transitionTimesheet({
        id,
        companyId: profile.companyId,
        profileId: profile.id,
        isAdmin: profile.isAdmin,
        newStatus: body.status as TimesheetStatus,
        rejectionReason: body.rejectionReason != null ? String(body.rejectionReason).trim() || null : null,
      });
      if (!result.ok) return res.status(result.error.code).json({ error: result.error.message });
      return res.json({ timesheet: result.data });
    }

    // Field update request
    const result = await updateTimesheet({
      id,
      companyId: profile.companyId,
      profileId: profile.id,
      isAdmin: profile.isAdmin,
      weekEnding: body.weekEnding != null ? String(body.weekEnding).trim() : undefined,
      jobId: body.jobId !== undefined ? (body.jobId != null ? parseInt(String(body.jobId), 10) : null) : undefined,
      notes: body.notes !== undefined ? (body.notes != null ? String(body.notes).trim() || null : null) : undefined,
      entries: Array.isArray(body.entries) ? body.entries : undefined,
    });

    if (!result.ok) return res.status(result.error.code).json({ error: result.error.message });
    return res.json({ timesheet: result.data });
  } catch (err) {
    console.error('[PUT /api/finance/timesheets/:id]', err);
    return res.status(500).json({ error: 'Failed to update timesheet' });
  }
}
