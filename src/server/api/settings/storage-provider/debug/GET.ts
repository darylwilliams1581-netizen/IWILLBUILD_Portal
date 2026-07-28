/**
 * GET /api/settings/storage-provider/debug
 * Temporary: shows which R2 env vars are present (no values exposed).
 * Owner-only. Remove after confirming secrets are injected.
 */
import type { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  const profile = (req as unknown as { userProfile?: { role?: string } }).userProfile;
  if (!profile) return res.status(401).json({ error: 'Unauthorized' });
  if (profile.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

  const vars = ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','R2_PUBLIC_URL','STORAGE_PROVIDER'];
  const result: Record<string, string> = {};
  for (const v of vars) {
    const val = process.env[v];
    if (!val) { result[v] = '(not set)'; continue; }
    if (v.includes('SECRET') || v.includes('KEY')) result[v] = val.slice(0, 6) + '…';
    else result[v] = val;
  }
  res.json(result);
}
