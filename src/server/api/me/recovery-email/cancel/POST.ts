/**
 * POST /api/me/recovery-email/cancel
 *
 * EXECUTION STEP — performs the cancellation.
 *
 * Body: { token: string }
 *
 * Called by the confirmation page after the user explicitly clicks
 * "Yes, cancel this change". Cancels the pending recovery-email change.
 * Sessions are NOT revoked (no account takeover assumed — just a dispute).
 *
 * This is a POST so it cannot be triggered by link prefetch, email scanners,
 * or CSRF (the token in the body is the CSRF equivalent here).
 */
import type { Request, Response } from 'express';
import { cancelRecoveryEmailChange } from '../../../../lib/recovery-email-service.js';
import { getIp, getUserAgent } from '../../../../lib/activity-log.js';

export default async function handler(req: Request, res: Response) {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';

  if (!token || token.length < 64) {
    return res.status(400).json({ error: 'Invalid or missing token.' });
  }

  try {
    const result = await cancelRecoveryEmailChange({
      token,
      ipAddress: getIp(req),
      userAgent: getUserAgent(req) ?? undefined,
    });

    if (!result.ok) {
      // Return generic messages — don't distinguish NOT_FOUND from ALREADY_USED
      // to prevent oracle attacks
      if (result.code === 'EXPIRED') {
        return res.status(410).json({ error: 'This cancellation link has expired.' });
      }
      return res.status(410).json({ error: 'This link is no longer valid.' });
    }

    return res.json({ ok: true, message: 'Recovery email change cancelled.' });
  } catch (err) {
    console.error('[recovery-email/cancel POST]', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'Failed to cancel recovery email change.' });
  }
}
