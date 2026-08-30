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
      // Mask any phone numbers in the error body before logging (E.164 pattern)
      const masked = text.replace(/\+\d{7,15}/g, (m) => m.slice(0, 4) + '****' + m.slice(-2));
      console.error('[sms] Twilio error:', response.status, masked);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[sms] Send failed:', err);
    return false;
  }
}
