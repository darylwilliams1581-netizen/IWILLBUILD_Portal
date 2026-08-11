/**
 * POST /api/owner-console/library/submissions/:id/review
 *
 * DEPRECATED — the pending-review queue no longer exists.
 * The platform owner publishes directly; there is no approval workflow.
 *
 * Returns 410 Gone so any stale UI code gets a clear signal.
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  try {
    const info = await getPlatformOwnerInfo(req);
    if (!info) return res.status(401).json({ error: 'Unauthorised' });
    if (!info.isPlatformOwner) return res.status(403).json({ error: 'Forbidden' });

    return res.status(410).json({
      error: 'The submission review queue has been removed. Publish items directly via the Owner Console.',
    });
  } catch (err) {
    console.error('[owner-console/library/submissions/review] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
