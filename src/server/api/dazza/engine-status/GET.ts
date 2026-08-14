/**
 * GET /api/dazza/engine-status
 * Platform-owner only.
 * Returns which Dazza engine is currently active.
 * Never exposes the raw flag value — only the resolved engine name.
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../lib/platform-owner-guard.js';
import { isDazzaV3Enabled } from '../../../lib/dazza-v3-brain.js';

export default async function handler(req: Request, res: Response) {
  const ownerInfo = await getPlatformOwnerInfo(req);
  if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
  if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'forbidden' });

  const v3 = isDazzaV3Enabled();
  return res.json({
    engine: v3 ? 'v3' : 'v2-rollback',
    v3Enabled: v3,
  });
}
