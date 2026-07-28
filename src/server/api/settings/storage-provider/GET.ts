/**
 * GET /api/settings/storage-provider
 * Returns the current storage provider name and whether R2 credentials are set.
 * Owner-only.
 */
import type { Request, Response } from 'express';
import { activeProviderName } from '../../../storage/storage-service.js';

export default async function handler(req: Request, res: Response) {
  const profile = (req as unknown as { userProfile?: { role?: string } }).userProfile;
  if (!profile) return res.status(401).json({ error: 'Unauthorized' });
  if (profile.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

  const r2Configured = !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );

  res.json({
    activeProvider: activeProviderName(),
    envProvider: (process.env.STORAGE_PROVIDER ?? 'local').toLowerCase(),
    r2Configured,
    r2PublicUrl: process.env.R2_PUBLIC_URL ?? null,
    r2Bucket: process.env.R2_BUCKET ?? null,
  });
}
