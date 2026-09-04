/**
 * POST /api/me/2fa/disable — RETIRED (410 Gone)
 *
 * This endpoint was part of the custom TOTP implementation.
 * Disabling 2FA is now handled by the official BetterAuth twoFactor plugin:
 *   POST /api/auth/two-factor/disable
 */
import type { Request, Response } from 'express';

export default function handler(_req: Request, res: Response) {
  return res.status(410).json({
    error: 'This endpoint has been retired. Use POST /api/auth/two-factor/disable instead.',
    code: 'ENDPOINT_RETIRED',
  });
}
