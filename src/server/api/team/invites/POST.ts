/**
 * POST /api/team/invites
 * Company owner/admin — invite a new user, creating a tracked invite record and sending email.
 * Body: { email, name?, role? }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, companies, user } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { logActivity } from '../../../lib/activity-log.js';
import { logEmail } from '../../../lib/email-log.js';
import { getPlanLimits, getCompanyPlan, checkLimit } from '../../../lib/plan-limits.js';
import crypto from 'crypto';

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
    if (profile.role !== 'owner' && profile.role !== 'admin' && !profile.permAdmin && !profile.permInviteUsers) {
      return res.status(403).json({ error: 'You do not have permission to invite users.' });
    }

    const { email, name, role = 'member' } = req.body as { email?: string; name?: string; role?: string };
    if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });

    const normalEmail = email.trim().toLowerCase();
    const companyId = profile.companyId;

    // Plan limit check
    const plan = await getCompanyPlan(companyId);
    const limits = await getPlanLimits(companyId, plan);
    const [countRow] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM profiles WHERE company_id = ${companyId} AND status != 'inactive'`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    const limitCheck = checkLimit(Number(countRow?.[0]?.cnt ?? 0), limits.users, 'Users');
    if (!limitCheck.allowed) {
      return res.status(403).json({ code: limitCheck.code, error: limitCheck.message });
    }

    const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });

    // Check if already a member
    const [existingMember] = await db.execute(
      sql`SELECT p.id FROM profiles p INNER JOIN user u ON u.id = p.user_id WHERE u.email = ${normalEmail} AND p.company_id = ${companyId} AND p.status != 'inactive' LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];
    if (existingMember?.length) {
      return res.status(409).json({ error: 'This person is already a member of your company.' });
    }

    // Check for existing pending invite
    const [existingInvite] = await db.execute(
      sql`SELECT id FROM company_invites WHERE email = ${normalEmail} AND company_id = ${companyId} AND status = 'pending' LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];
    if (existingInvite?.length) {
      return res.status(409).json({ error: 'An invite is already pending for this email. Use resend to send again.' });
    }

    // Generate invite token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.execute(sql`
      INSERT INTO company_invites
        (company_id, email, name, role, token, status, invited_by_user_id, invited_by_email, expires_at, created_at)
      VALUES (
        ${companyId}, ${normalEmail}, ${name?.trim() ?? null}, ${role},
        ${token}, 'pending', ${session.user.id}, ${session.user.email ?? ''},
        ${expiresAt}, NOW()
      )
    `);

    // Also create/update the user profile so they appear in the team list
    const existingUser = await db.query.user.findFirst({ where: eq(user.email, normalEmail) });
    if (existingUser) {
      const existingProfile = await db.query.profiles.findFirst({ where: eq(profiles.userId, existingUser.id) });
      if (!existingProfile) {
        await db.insert(profiles).values({ userId: existingUser.id, companyId, role, status: 'invited' });
      } else if (existingProfile.companyId !== companyId) {
        await db.update(profiles).set({ companyId, role, status: 'invited' }).where(eq(profiles.userId, existingUser.id));
      }
    }

    // Send invite email
    const inviteUrl = `${process.env.APP_URL ?? 'https://iwillbuild.com'}/accept-invite?token=${token}`;
    let emailSent = false;
    let emailError: string | null = null;

    try {
      const { sendEmail } = await import('../../../email.js');
      await sendEmail({
        to: normalEmail,
        subject: `You've been invited to join ${company?.name ?? 'IWIIlBUILD'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
            <div style="background: #7C3AED; padding: 16px 24px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 20px;">IWIIlBUILD Portal</h1>
            </div>
            <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
              <h2 style="color: #111; margin-top: 0;">You're invited!</h2>
              <p style="color: #444;">${session.user.name ?? session.user.email} has invited you to join <strong>${company?.name}</strong> on IWIIlBUILD Portal.</p>
              ${name ? `<p style="color: #444;">Hi ${name},</p>` : ''}
              <p style="color: #444;">Your role will be: <strong>${role}</strong></p>
              <p style="margin: 24px 0;">
                <a href="${inviteUrl}" style="background: #7C3AED; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                  Accept Invitation
                </a>
              </p>
              <p style="color: #888; font-size: 13px;">This invite expires in 7 days. If you didn't expect this, you can safely ignore this email.</p>
              <p style="color: #aaa; font-size: 12px; margin-top: 24px;">Or copy this link: ${inviteUrl}</p>
            </div>
          </div>
        `,
      });
      emailSent = true;
    } catch (e) {
      emailError = (e as Error)?.message?.slice(0, 200) ?? 'Unknown error';
      console.warn('[team/invites] email send failed:', emailError);
    }

    await logEmail({
      emailType: 'invite',
      recipientEmail: normalEmail,
      subject: `You've been invited to join ${company?.name ?? 'IWIIlBUILD'}`,
      status: emailSent ? 'sent' : 'failed',
      errorMessage: emailError,
      companyId,
    });

    void logActivity({
      eventType: 'user_invited',
      success: true,
      email: normalEmail,
      companyId,
      performedByUserId: session.user.id,
      metadata: { role, companyName: company?.name, emailSent },
    });

    return res.status(201).json({ ok: true, emailSent, message: emailSent ? `Invite sent to ${normalEmail}` : `Invite created but email failed to send. Check email delivery log.` });
  } catch (err) {
    console.error('POST /api/team/invites error:', err);
    return res.status(500).json({ error: 'Failed to send invite.' });
  }
}
