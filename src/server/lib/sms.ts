/**
 * SMS sending via Twilio.
 * Only active when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER
 * are all set. Returns false if SMS is not configured.
 *
 * Env var: TWILIO_PHONE_NUMBER (E.164 format, e.g. +61400000000)
 */

export function isSmsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
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

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_PHONE_NUMBER!;

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
      console.error('[sms] Twilio error:', response.status, text);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[sms] Send failed:', err);
    return false;
  }
}
