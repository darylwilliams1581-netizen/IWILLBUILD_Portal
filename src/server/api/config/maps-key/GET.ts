import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { getAuth } from '../../../../lib/auth/auth.js';

/**
 * GET /api/config/maps-key
 *
 * Returns the Google Maps JavaScript API key for client-side use.
 * Requires an authenticated session — never exposed to unauthenticated callers.
 *
 * Secret lookup order (first non-empty value wins):
 *   1. GOOGLE_MAPS_API_KEY   — preferred canonical name
 *   2. VITE_GOOGLE_MAPS_API_KEY — legacy name (kept for backwards compatibility)
 *
 * The key value is NEVER logged — only its presence/absence is logged.
 *
 * Response:    { key: string }
 *
 * Error responses (all JSON):
 *   401  { error: 'Unauthorised' }
 *   404  { error: 'Maps API key not configured', detail: string }
 *   500  { error: 'Internal server error' }
 *
 * Mobile / Capacitor note:
 *   The Capacitor WebView sends the session cookie on same-origin requests to
 *   https://iwillbuild.com. If this returns 401 on mobile, the session cookie
 *   is not being sent — check that credentials: 'include' is set on the fetch
 *   and that the cookie domain matches the production URL.
 *
 * Google Cloud requirements for the key:
 *   - Maps JavaScript API must be enabled
 *   - Billing must be enabled on the project
 *   - HTTP referrer restrictions must include:
 *       https://iwillbuild.com/*
 *       https://www.iwillbuild.com/*
 *   (capacitor://localhost is NOT needed — FleetLiveMap only runs in the
 *    desktop browser, not in the Capacitor WebView)
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

    // Try canonical name first, then legacy VITE_ name
    const key = (getSecret('GOOGLE_MAPS_API_KEY') ?? '') || (getSecret('VITE_GOOGLE_MAPS_API_KEY') ?? '');

    if (!key) {
      console.error(
        '[maps-key] Neither GOOGLE_MAPS_API_KEY nor VITE_GOOGLE_MAPS_API_KEY is set. ' +
        'Add GOOGLE_MAPS_API_KEY in Settings → Secrets. The Fleet Live Map will not load until this is configured.'
      );
      res.status(404).json({
        error: 'Maps API key not configured',
        detail:
          'Neither GOOGLE_MAPS_API_KEY nor VITE_GOOGLE_MAPS_API_KEY is set. ' +
          'Add GOOGLE_MAPS_API_KEY in Settings → Secrets.',
      });
      return;
    }

    console.info('[maps-key] Maps API key found and returned (key value not logged).');

    // Cache for 5 minutes — key doesn't change at runtime
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json({ key });
  } catch (err) {
    console.error('[maps-key] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
