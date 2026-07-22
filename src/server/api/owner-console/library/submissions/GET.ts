/**
 * GET /api/owner-console/library/submissions
 *
 * DEPRECATED — the pending-review submission queue no longer exists.
 * Only the platform owner can publish to the Global Library (directly via
 * POST /api/owner-console/library/items or the publish-to-library endpoints).
 * Regular company users cannot submit items for review.
 *
 * This endpoint is kept registered to avoid 404s from any cached UI code,
 * but always returns an empty list.
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Forbidden' });

  // No pending submissions exist — owner publishes directly
  return res.json({ submissions: [] });
}
