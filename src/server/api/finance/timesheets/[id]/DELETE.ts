/**
 * DELETE /api/finance/timesheets/:id
 * Delete a timesheet. Only draft timesheets can be deleted.
 * Staff can only delete their own; admins can delete any draft.
 */
import type { Request, Response } from 'express';
import { resolvePOProfile } from '@/server/lib/po-auth.js';
import { deleteTimesheet } from '@/server/lib/timesheet-service.js';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const result = await deleteTimesheet({
      id,
      companyId: profile.companyId,
      profileId: profile.id,
      isAdmin: profile.isAdmin,
    });

    if (!result.ok) return res.status(result.error.code).json({ error: result.error.message });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/finance/timesheets/:id]', err);
    return res.status(500).json({ error: 'Failed to delete timesheet' });
  }
}
