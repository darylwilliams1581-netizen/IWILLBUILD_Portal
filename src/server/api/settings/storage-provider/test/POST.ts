/**
 * POST /api/settings/storage-provider/test
 * Tests connectivity to the configured storage provider.
 * Owner-only.
 */
import type { Request, Response } from 'express';
import { testR2Connection } from '../../../../storage/providers/r2Provider.js';

export default async function handler(req: Request, res: Response) {
  const profile = (req as unknown as { userProfile?: { role?: string } }).userProfile;
  if (!profile) return res.status(401).json({ error: 'Unauthorized' });
  if (profile.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

  const { provider } = req.body as { provider?: string };

  if (provider === 'r2') {
    const result = await testR2Connection();
    return res.json(result);
  }

  if (provider === 'local' || !provider) {
    // Local is always reachable
    return res.json({ ok: true });
  }

  res.status(400).json({ ok: false, error: `Unknown provider: ${provider}` });
}
