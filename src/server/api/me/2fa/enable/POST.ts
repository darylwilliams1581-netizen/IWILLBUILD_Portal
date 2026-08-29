/**
 * POST /api/me/2fa/enable — RETIRED (410 Gone)
 *
 * This endpoint was part of the custom TOTP implementation.
 * TOTP verification during enrolment is now handled by the official plugin:
 *   POST /api/auth/two-factor/verify-totp
 */
import type { Request, Response } from 'express';

export default function handler(_req: Request, res: Response) {
  return res.status(410).json({
    error: 'This endpoint has been retired. Use POST /api/auth/two-factor/verify-totp instead.',
    code: 'ENDPOINT_RETIRED',
  });
}
