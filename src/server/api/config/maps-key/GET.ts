import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { getAuth } from '../../../../lib/auth/auth.js';

/**
 * GET /api/config/maps-key
 * Returns the Google Maps API key for client-side use.
 * Requires an authenticated session — never exposed to unauthenticated callers.
 */
export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) {
      res.status(401).json({ error: 'Unauthorised' });
      return;
    }

    const key = getSecret('VITE_GOOGLE_MAPS_API_KEY') ?? '';
    if (!key) {
      res.status(404).json({ error: 'Maps API key not configured' });
      return;
    }

    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json({ key });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
