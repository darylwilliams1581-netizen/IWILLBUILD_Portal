/**
 * POST /api/team/invites/:id/resend
 * Company owner/admin — resend an invite email and reset expiry.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles, companies } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { logEmail } from '../../../../../lib/email-log.js';
import { logActivity } from '../../../../../lib/activity-log.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company.' });
    if (profile.role !== 'owner' && profile.role !== 'admin' && !profile.permAdmin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const inviteId = Number(req.params.id);
    type InviteRow = { id: number; email: string; name: string | null; role: string; status: string; token: string };
    const [inviteRows] = await db.execute(
      sql`SELECT id, email, name, role, status, token FROM company_invites WHERE id = ${inviteId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [InviteRow[], unknown];

    const invite = inviteRows?.[0];
    if (!invite) return res.status(404).json({ error: 'Invite not found.' });
    if (invite.status === 'accepted') return res.status(400).json({ error: 'This invite has already been accepted.' });
    if (invite.status === 'cancelled') return res.status(400).json({ error: 'This invite was cancelled. Create a new invite instead.' });

    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.execute(sql`
      UPDATE company_invites SET status = 'pending', expires_at = ${newExpiry} WHERE id = ${inviteId}
    `);

    const company = await db.query.companies.findFirst({ where: eq(companies.id, profile.companyId) });
    const inviteUrl = `${process.env.APP_URL ?? 'https://iwillbuild.com'}/accept-invite?token=${invite.token}`;

    let emailSent = false;
    let emailError: string | null = null;
    try {
      const { sendEmail } = await import('../../../../../email.js');
      await sendEmail({
        to: invite.email,
        subject: `Reminder: You've been invited to join ${company?.name ?? 'IWIllBUILD'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
            <div style="background: #7C3AED; padding: 16px 24px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 20px;">IWIllBUILD Portal</h1>
            </div>
            <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
              <h2 style="color: #111; margin-top: 0;">Invitation reminder</h2>
              <p style="color: #444;">This is a reminder that you've been invited to join <strong>${company?.name}</strong> on IWIllBUILD Portal.</p>
              <p style="margin: 24px 0;">
                <a href="${inviteUrl}" style="background: #7C3AED; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                  Accept Invitation
                </a>
              </p>
              <p style="color: #888; font-size: 13px;">This invite expires in 7 days.</p>
            </div>
          </div>
        `,
      });
      emailSent = true;
    } catch (e) {
      emailError = (e as Error)?.message?.slice(0, 200) ?? 'Unknown';
    }

    await logEmail({
      emailType: 'invite_resend',
      recipientEmail: invite.email,
      subject: `Reminder: Invitation to ${company?.name}`,
      status: emailSent ? 'sent' : 'failed',
      errorMessage: emailError,
      companyId: profile.companyId,
    });

    void logActivity({
      eventType: 'invite_resent',
      success: true,
      email: invite.email,
      companyId: profile.companyId,
      performedByUserId: session.user.id,
    });

    return res.json({ ok: true, emailSent });
  } catch (err) {
    console.error('POST /api/team/invites/:id/resend error:', err);
    return res.status(500).json({ error: 'Failed to resend invite.' });
  }
}
