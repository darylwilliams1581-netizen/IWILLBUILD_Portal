/**
 * POST /api/team/invites/accept
 * Accept an email invitation. New workers choose their own password here;
 * existing account holders must sign in first and then accept the same link.
 */
import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { profiles, user } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';

function headersFrom(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
  }
  return headers;
}

function passwordError(value: string): string | null {
  if (value.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(value)) return 'Password must include a letter.';
  if (!/[0-9]/.test(value)) return 'Password must include a number.';
  if (!/[^a-zA-Z0-9]/.test(value)) return 'Password must include a symbol.';
  return null;
}

export default async function handler(req: Request, res: Response) {
  try {
    const { token, password, name } = req.body as { token?: string; password?: string; name?: string };
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      return res.status(400).json({ error: 'This invitation link is invalid.' });
    }

    type InviteRow = { id: number; company_id: number; email: string; name: string | null; role: string; status: string; expires_at: Date | string };
    const [rows] = await db.execute(sql`
      SELECT id, company_id, email, name, role, status, expires_at
      FROM company_invites WHERE token = ${token} LIMIT 1
    `) as unknown as [InviteRow[], unknown];
    const invite = rows?.[0];
    if (!invite) return res.status(404).json({ error: 'This invitation link is invalid.' });
    if (invite.status !== 'pending') return res.status(410).json({ error: 'This invitation is no longer active.' });
    if (new Date(invite.expires_at).getTime() <= Date.now()) return res.status(410).json({ error: 'This invitation has expired. Ask the company owner to resend it.' });

    const role = ['admin', 'manager', 'supervisor', 'worker', 'readonly'].includes(invite.role) ? invite.role : 'worker';
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: headersFrom(req) });
    const existingUser = await db.query.user.findFirst({ where: eq(user.email, invite.email) });
    let userId = existingUser?.id ?? '';

    if (session?.user) {
      if (session.user.id !== userId) return res.status(403).json({ error: 'Sign in to the account that received this invitation.' });
    } else {
      if (existingUser) return res.status(401).json({ code: 'sign_in_required', error: 'This email already has an IWILLBUILD account. Sign in to that account, reopen the invite link, and accept it.' });
      if (!password) return res.status(400).json({ error: 'Choose a password to create your login.' });
      const validationError = passwordError(password);
      if (validationError) return res.status(400).json({ error: validationError });
      try {
        const created = await auth.api.signUpEmail({
          body: {
            name: (name?.trim() || invite.name?.trim() || invite.email.split('@')[0]).slice(0, 255),
            email: invite.email,
            password,
          },
        });
        userId = created?.user?.id ?? '';
      } catch {
        return res.status(409).json({ code: 'account_exists', error: 'An account now exists for this email. Sign in to that account and reopen the invite link.' });
      }
      if (!userId) return res.status(500).json({ error: 'Could not create the invited account.' });
      // The single-use invitation token was sent to this email address and serves
      // as the email verification step for the new worker account.
      await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
    }

    const existingProfile = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
    if (existingProfile?.companyId && existingProfile.companyId !== invite.company_id) {
      return res.status(409).json({ error: 'This account is already linked to another company.' });
    }
    if (existingProfile) {
      await db.update(profiles).set({ companyId: invite.company_id, role, status: 'active' }).where(eq(profiles.userId, userId));
    } else {
      await db.insert(profiles).values({ userId, companyId: invite.company_id, role, status: 'active' });
    }

    await db.execute(sql`
      UPDATE company_invites SET status = 'accepted', accepted_at = NOW()
      WHERE id = ${invite.id} AND token = ${token} AND status = 'pending'
    `);
    return res.json({ ok: true, message: 'Invitation accepted. Sign in to open your company account.' });
  } catch (error) {
    console.error('[team/invites/accept]', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Could not accept this invitation.' });
  }
}
