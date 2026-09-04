/**
 * GET /api/features
 *
 * Returns a set of safe boolean feature flags for the client.
 * No authentication required — flags are non-sensitive capability signals only.
 *
 * SMS_2FA_COMPLIANCE_READY:
 *   Set this secret to "true" once the Twilio account has an approved Primary
 *   Customer Profile and can send to arbitrary (unverified) numbers.
 *   Until then, SMS 2FA enrolment is hidden from the Settings UI so general
 *   users don't attempt to set it up and hit Twilio error 21608.
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';

export default function handler(_req: Request, res: Response) {
  const sms2faReady = getSecret('SMS_2FA_COMPLIANCE_READY') === 'true';

  res.json({
    sms2faEnrolmentEnabled: sms2faReady,
  });
}
