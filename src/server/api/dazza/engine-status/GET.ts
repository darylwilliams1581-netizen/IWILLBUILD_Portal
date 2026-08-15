/**
 * GET /api/dazza/engine-status
 * Platform-owner only.
 * Returns which Dazza engine is currently active plus safe diagnostics.
 * Never exposes the raw secret value, derived characters, or trimmed forms.
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../lib/platform-owner-guard.js';
import { isDazzaV3Enabled } from '../../../lib/dazza-v3-brain.js';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response) {
  const ownerInfo = await getPlatformOwnerInfo(req);
  if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
  if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'forbidden' });

  const v3 = isDazzaV3Enabled();

  // Safe diagnostics — presence and length only, never the value or any derivative
  const raw     = getSecret('DAZZA_V3_ENABLED') ?? '';
  const present = raw.length > 0;

  return res.json({
    engine:    v3 ? 'v3' : 'v2-rollback',
    v3Enabled: v3,
    _diag: {
      secretPresent:   present,
      resolvedEnabled: v3,
    },
  });
}
