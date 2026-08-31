/**
 * GET /api/me/2fa/setup — RETIRED (410 Gone)
 *
 * This endpoint was part of the custom TOTP implementation.
 * TOTP enrolment is now handled by the official BetterAuth twoFactor plugin:
 *   POST /api/auth/two-factor/enable  → returns { totpURI, backupCodes }
 *   POST /api/auth/two-factor/verify-totp → verifies and activates
 *
 * Kept registered to avoid 404 for any in-flight requests during deployment.
 */
import type { Request, Response } from 'express';

export default function handler(_req: Request, res: Response) {
  return res.status(410).json({
    error: 'This endpoint has been retired. Use POST /api/auth/two-factor/enable instead.',
    code: 'ENDPOINT_RETIRED',
  });
}
