import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { getAuth } from '../../../../lib/auth/auth.js';

/**
 * GET /api/config/maps-key
 *
 * Returns the Google Maps API key for client-side use.
 * Requires an authenticated session — never exposed to unauthenticated callers.
 *
 * Secret name: VITE_GOOGLE_MAPS_API_KEY
 * Response:    { key: string }
 *
 * Error responses (all JSON):
 *   401  { error: 'Unauthorised' }           — no valid session
 *   404  { error: 'Maps API key not configured', detail: string }
 *   500  { error: 'Internal server error' }
 *
 * Mobile / Capacitor note:
 *   The Capacitor WebView sends the session cookie on same-origin requests to
 *   https://iwillbuild.com. If this returns 401 on mobile, the session cookie
 *   is not being sent — check that credentials: 'include' is set on the fetch
 *   and that the cookie domain matches the production URL.
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
      console.warn('[maps-key] Unauthenticated request — no valid session found.');
      res.status(401).json({ error: 'Unauthorised' });
      return;
    }

    const key = getSecret('VITE_GOOGLE_MAPS_API_KEY') ?? '';
    if (!key) {
      console.error(
        '[maps-key] VITE_GOOGLE_MAPS_API_KEY is not set or is empty. ' +
        'Add it in Settings → Secrets. The Fleet Live Map will not load until this is configured.'
      );
      res.status(404).json({
        error: 'Maps API key not configured',
        detail: 'VITE_GOOGLE_MAPS_API_KEY secret is missing or empty. Configure it in Settings → Secrets.',
      });
      return;
    }

    // Cache for 5 minutes — key doesn't change at runtime
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json({ key });
  } catch (err) {
    console.error('[maps-key] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
