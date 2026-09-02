/**
 * POST /api/developer/email-settings/test
 * Platform developer only — sends a test email to the contact_notification_email
 * address currently saved in platform_email_settings.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../../lib/platform-owner-guard.js';
import { sendEmail } from '../../../../email.js';

async function getDevSession(req: Request) {
  const auth = getAuth();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
  }
  return auth.api.getSession({ headers });
}

async function isPlatformDev(userId: string, email: string): Promise<boolean> {
  if (PLATFORM_OWNER_EMAILS.has(email.toLowerCase())) return true;
  try {
    const [rows] = await db.execute(
      sql`SELECT platform_role FROM profiles WHERE user_id = ${userId} LIMIT 1`
    ) as unknown as [Array<{ platform_role: string | null }>, unknown];
    return rows?.[0]?.platform_role === 'developer';
  } catch { return false; }
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getDevSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!(await isPlatformDev(session.user.id, session.user.email))) {
      return res.status(403).json({ error: 'Developer access required' });
    }

    // Load current settings
    const [rows] = await db.execute(
      sql`SELECT setting_key, setting_value FROM platform_email_settings`
    ) as unknown as [Array<{ setting_key: string; setting_value: string | null }>, unknown];

    const settings: Record<string, string> = {};
    for (const row of rows ?? []) settings[row.setting_key] = row.setting_value ?? '';

    const notifyEmail  = settings['contact_notification_email'] || session.user.email;
    const replyTo      = settings['support_reply_to']           || 'support@iwillbuild.com';
    const fromName     = settings['from_name']                  || 'IWIllBUIlD';
    const now          = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' });

    await sendEmail({
      to: notifyEmail,
      replyTo,
      fromName,
      subject: `[TEST] IWIllBUIlD Email Settings — ${now}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px;">
          <div style="background:#0f172a;padding:20px 24px;border-radius:6px 6px 0 0;">
            <span style="color:#7c3aed;font-size:20px;font-weight:700;letter-spacing:-0.5px;">IWIllBUIlD</span>
            <span style="color:#64748b;font-size:13px;margin-left:12px;">Developer Console — Email Test</span>
          </div>
          <div style="background:#ffffff;padding:28px 24px;border-radius:0 0 6px 6px;border:1px solid #e2e8f0;border-top:none;">
            <p style="color:#0f172a;font-size:16px;font-weight:600;margin:0 0 16px;">✅ Email delivery is working</p>
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
              This test was triggered from the Developer Console by <strong>${session.user.email}</strong> at ${now} (AEST).
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr style="background:#f8fafc;">
                <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;color:#374151;width:40%;">Setting</td>
                <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#374151;">Value</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#6b7280;">contact_notification_email</td>
                <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#0f172a;">${notifyEmail}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#6b7280;">support_reply_to</td>
                <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#0f172a;">${replyTo}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#6b7280;">from_name</td>
                <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#0f172a;">${fromName}</td>
              </tr>
            </table>
            <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0 16px;" />
            <p style="color:#94a3b8;font-size:12px;margin:0;">
              IWIllBUIlD Developer Console &nbsp;·&nbsp; support@iwillbuild.com
            </p>
          </div>
        </div>
      `,
      text: `IWIllBUIlD Email Test\n\nDelivery is working.\n\nTriggered by: ${session.user.email}\nTime: ${now}\n\nSettings:\n  contact_notification_email: ${notifyEmail}\n  support_reply_to: ${replyTo}\n  from_name: ${fromName}`,
    });

    console.log(`[email-settings] Test email sent to ${notifyEmail} by ${session.user.email}`);
    return res.json({ ok: true, sentTo: notifyEmail });
  } catch (err) {
    console.error('POST /api/developer/email-settings/test error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Send failed' });
  }
}
