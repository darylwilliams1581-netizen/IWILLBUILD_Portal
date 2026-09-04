/**
 * GET /api/settings/storage-provider/debug
 * Reports presence (true/false) for R2 secrets — no values, no partial values.
 * Owner-only.
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';

function isPresent(name: string): boolean {
  const v = getSecret(name);
  if (v !== null && v !== undefined && String(v).trim() !== '') return true;
  const e = process.env[name];
  return !!(e && e.trim() !== '');
}

export default async function handler(req: Request, res: Response) {
  try {
    const profile = (req as unknown as { userProfile?: { role?: string } }).userProfile;
    if (!profile) return res.status(401).json({ error: 'Unauthorized' });
    if (profile.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    const vars = [
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
      'R2_PUBLIC_URL',
      'STORAGE_PROVIDER',
    ];

    const result: Record<string, boolean> = {};
    for (const v of vars) {
      result[v] = isPresent(v);
    }

    res.json(result);
  } catch (err) {
    console.error('[settings/storage-provider/debug] Unhandled error:', err instanceof Error ? err.constructor.name : 'UnknownError');
    res.status(500).json({ error: 'Failed to fetch storage debug info' });
  }
}
