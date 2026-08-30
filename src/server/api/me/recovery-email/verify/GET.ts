/**
 * GET /api/me/recovery-email/verify?token=<hex>
 *
 * Called when the new address owner clicks the verification link.
 * Marks the proposed address as verified; actual activation waits for hold expiry.
 * Redirects to a result page — never exposes the token in the response body.
 */
import type { Request, Response } from 'express';
import { verifyRecoveryEmailToken } from '../../../../lib/recovery-email-service.js';
import { getIp, getUserAgent } from '../../../../lib/activity-log.js';
import { APP_URL } from '../../../../lib/app-url.js';

export default async function handler(req: Request, res: Response) {
  const token = typeof req.query['token'] === 'string' ? req.query['token'] : '';

  if (!token) {
    return res.redirect(`${APP_URL}/settings?recovery_email_result=invalid`);
  }

  try {
    const result = await verifyRecoveryEmailToken({
      token,
      ipAddress: getIp(req),
      userAgent: getUserAgent(req) ?? undefined,
    });

    if (!result.ok) {
      const code = result.code.toLowerCase();
      return res.redirect(`${APP_URL}/settings?recovery_email_result=${code}`);
    }

    if (result.alreadyActive) {
      return res.redirect(`${APP_URL}/settings?recovery_email_result=activated`);
    }

    // Hold still in progress — tell the user when it expires
    const holdIso = result.holdExpiresAt.toISOString();
    return res.redirect(`${APP_URL}/settings?recovery_email_result=verified&hold_until=${encodeURIComponent(holdIso)}`);
  } catch (err) {
    console.error('[recovery-email/verify]', err instanceof Error ? err.message : String(err));
    return res.redirect(`${APP_URL}/settings?recovery_email_result=error`);
  }
}
