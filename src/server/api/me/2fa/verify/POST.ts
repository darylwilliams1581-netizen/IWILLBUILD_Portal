/**
 * POST /api/me/2fa/verify — RETIRED (410 Gone)
 *
 * This endpoint was part of the custom TOTP challenge flow.
 * TOTP verification during sign-in is now handled by the official plugin:
 *   POST /api/auth/two-factor/verify-totp
 *
 * The legacy in-session re-confirmation mode (used by some internal flows)
 * can also use the official endpoint.
 *
 * SMS verification remains at POST /api/me/2fa/sms/verify (unchanged).
 */
import type { Request, Response } from 'express';

export default function handler(_req: Request, res: Response) {
  return res.status(410).json({
    error: 'This endpoint has been retired. Use POST /api/auth/two-factor/verify-totp instead.',
    code: 'ENDPOINT_RETIRED',
  });
}
