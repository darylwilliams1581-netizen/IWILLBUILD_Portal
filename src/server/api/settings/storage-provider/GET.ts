/**
 * GET /api/settings/storage-provider
 * Returns the current storage provider status.
 * Owner-only. Never returns credential values.
 */
import type { Request, Response } from 'express';
import { getStorageStatus } from '../../../storage/r2Config.js';

export default async function handler(req: Request, res: Response) {
  try {
    const profile = (req as unknown as { userProfile?: { role?: string } }).userProfile;
    if (!profile) return res.status(401).json({ error: 'Unauthorized' });
    if (profile.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    // getStorageStatus() reads via getSecret() — never returns credential values
    const status = getStorageStatus();

    res.json({
      activeProvider:  status.provider,
      configured:      status.configured,
      physicalBucket:  status.physicalBucket,  // physical R2 bucket name (non-sensitive)
      publicMode:      status.publicMode,
      error:           status.error ?? null,
    });
  } catch (err) {
    console.error('[settings/storage-provider] Unhandled error:', err instanceof Error ? err.constructor.name : 'UnknownError');
    res.status(500).json({ error: 'Failed to fetch storage provider info' });
  }
}
