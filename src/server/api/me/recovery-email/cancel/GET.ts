/**
 * GET /api/me/recovery-email/cancel?token=<hex>
 *
 * Called when the OLD address owner clicks the cancel link in the notification email.
 * Cancels the pending change. Sessions are NOT revoked (no takeover assumed).
 * Redirects to a result page — never exposes the token in the response body.
 */
import type { Request, Response } from 'express';
import { cancelRecoveryEmailChange } from '../../../../lib/recovery-email-service.js';
import { getIp, getUserAgent } from '../../../../lib/activity-log.js';
import { APP_URL } from '../../../../lib/app-url.js';

export default async function handler(req: Request, res: Response) {
  const token = typeof req.query['token'] === 'string' ? req.query['token'] : '';

  if (!token) {
    return res.redirect(`${APP_URL}/settings?recovery_cancel_result=invalid`);
  }

  try {
    const result = await cancelRecoveryEmailChange({
      token,
      ipAddress: getIp(req),
      userAgent: getUserAgent(req) ?? undefined,
    });

    if (!result.ok) {
      const code = result.code.toLowerCase();
      return res.redirect(`${APP_URL}/settings?recovery_cancel_result=${code}`);
    }

    return res.redirect(`${APP_URL}/settings?recovery_cancel_result=cancelled`);
  } catch (err) {
    console.error('[recovery-email/cancel]', err instanceof Error ? err.message : String(err));
    return res.redirect(`${APP_URL}/settings?recovery_cancel_result=error`);
  }
}
