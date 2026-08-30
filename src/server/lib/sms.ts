/**
 * SMS sending via Twilio.
 * Only active when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER
 * are all set. Returns false if SMS is not configured.
 *
 * Secret: TWILIO_PHONE_NUMBER (E.164 format, e.g. +61400000000)
 */
import { getSecret } from '#airo/secrets';

export function isSmsConfigured(): boolean {
  return !!(
    getSecret('TWILIO_ACCOUNT_SID') &&
    getSecret('TWILIO_AUTH_TOKEN') &&
    getSecret('TWILIO_PHONE_NUMBER')
  );
}

/**
 * Send an SMS message via Twilio REST API.
 * Returns true on success, false on failure.
 */
export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!isSmsConfigured()) {
    console.warn('[sms] SMS not configured — skipping send');
    return false;
  }

  const accountSid = getSecret('TWILIO_ACCOUNT_SID')!;
  const authToken  = getSecret('TWILIO_AUTH_TOKEN')!;
  const from       = getSecret('TWILIO_PHONE_NUMBER')!;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: from, Body: body });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const text = await response.text();
      // Extract safe fields only — code and message, never phone/credentials
      let safeCode: number | null = null;
      let safeMessage: string | null = null;
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        safeCode    = typeof parsed.code    === 'number' ? parsed.code    : null;
        safeMessage = typeof parsed.message === 'string' ? parsed.message.slice(0, 200) : null;
      } catch { /* not JSON */ }
      console.error(JSON.stringify({
        event: 'sms.twilio_error',
        httpStatus: response.status,
        twilioCode: safeCode,
        twilioMessage: safeMessage,
        ts: Date.now(),
      }));
      return false;
    }

    // Log message SID on success (safe — not a secret)
    try {
      const body = await response.clone().json() as Record<string, unknown>;
      console.info(JSON.stringify({
        event: 'sms.twilio_success',
        messageSid: body.sid ?? null,
        status: body.status ?? null,
        ts: Date.now(),
      }));
    } catch { /* non-critical */ }

    return true;
  } catch (err) {
    console.error('[sms] Send failed:', err);
    return false;
  }
}
