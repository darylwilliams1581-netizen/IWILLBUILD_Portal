import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';

/**
 * GET /api/config/maps-key
 * Returns the Google Maps API key for client-side use.
 * Requires an authenticated session — never exposed to unauthenticated callers.
 */
export default async function handler(req: Request, res: Response) {
  // @ts-expect-error session is attached by better-auth middleware
  const session = req.session as { userId?: string } | undefined;
  if (!session?.userId) {
    res.status(401).json({ error: 'Unauthorised' });
    return;
  }

  const key = getSecret('VITE_GOOGLE_MAPS_API_KEY') ?? '';
  if (!key) {
    res.status(404).json({ error: 'Maps API key not configured' });
    return;
  }

  // Short cache — key rarely changes, but don't cache forever
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.json({ key });
}
