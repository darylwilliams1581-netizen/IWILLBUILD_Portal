/**
 * GET /api/dazza/engine-status
 * Platform-owner only.
 * Returns which Dazza engine is currently active plus safe diagnostics.
 * Never exposes the raw secret value — only length, first char, and resolved boolean.
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

  // Safe diagnostics — never expose the raw value
  const raw     = getSecret('DAZZA_V3_ENABLED') ?? '';
  const rawLen  = raw.length;
  const rawFirst = rawLen > 0 ? raw[0] : '';
  const trimmed  = raw.trim().toLowerCase();

  return res.json({
    engine:       v3 ? 'v3' : 'v2-rollback',
    v3Enabled:    v3,
    // Safe diagnostics for Daryl to confirm the secret value shape
    _diag: {
      secretPresent: rawLen > 0,
      secretLength:  rawLen,
      secretFirstChar: rawFirst,   // e.g. 't' for 'true', '1' for '1'
      secretTrimmedLower: trimmed, // e.g. 'true', 'false', '1', ''
      resolvedEnabled: v3,
    },
  });
}
