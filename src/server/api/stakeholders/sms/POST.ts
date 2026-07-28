import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response) {
  const { to, message } = req.body as { to?: string; message?: string };

  if (!to || !message?.trim()) {
    return res.status(400).json({ error: 'to and message are required' });
  }

  const accountSid = getSecret('TWILIO_ACCOUNT_SID');
  const authToken  = getSecret('TWILIO_AUTH_TOKEN');
  const from       = getSecret('TWILIO_PHONE_NUMBER');

  if (!accountSid || !authToken || !from) {
    return res.status(500).json({ error: 'Twilio not configured' });
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({ To: to, From: from, Body: message.trim() });

    const twilioRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const data = await twilioRes.json() as { sid?: string; error_message?: string };

    if (!twilioRes.ok) {
      return res.status(502).json({ error: data.error_message ?? 'Twilio error' });
    }

    return res.json({ ok: true, sid: data.sid });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
