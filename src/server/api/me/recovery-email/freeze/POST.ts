/**
 * POST /api/me/recovery-email/freeze
 *
 * EXECUTION STEP — performs the account freeze.
 *
 * Body: { token: string }
 *
 * Called by the confirmation page after the user explicitly clicks
 * "Yes, freeze my account". Freezes the account, revokes ALL sessions,
 * and cancels the pending recovery-email change.
 *
 * This is a POST so it cannot be triggered by link prefetch, email scanners,
 * or CSRF (the token in the body is the CSRF equivalent here).
 *
 * This endpoint is PUBLIC (token-authenticated, no session required) because
 * the user's session may already be compromised when they click the freeze link.
 */
import type { Request, Response } from 'express';
import { freezeAccountViaToken } from '../../../../lib/recovery-email-service.js';
import { getIp, getUserAgent } from '../../../../lib/activity-log.js';

export default async function handler(req: Request, res: Response) {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';

  if (!token || token.length < 64) {
    return res.status(400).json({ error: 'Invalid or missing token.' });
  }

  try {
    const result = await freezeAccountViaToken({
      token,
      ipAddress: getIp(req),
      userAgent: getUserAgent(req) ?? undefined,
    });

    if (!result.ok) {
      if (result.code === 'ALREADY_FROZEN') {
        return res.status(409).json({ error: 'This account is already frozen.' });
      }
      if (result.code === 'EXPIRED') {
        return res.status(410).json({ error: 'This freeze link has expired.' });
      }
      // NOT_FOUND and ALREADY_USED both return generic 410 to prevent oracle attacks
      return res.status(410).json({ error: 'This link is no longer valid.' });
    }

    // Account frozen — all sessions revoked
    return res.json({ ok: true, message: 'Account frozen. All sessions have been signed out.' });
  } catch (err) {
    console.error('[recovery-email/freeze POST]', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'Failed to freeze account.' });
  }
}
