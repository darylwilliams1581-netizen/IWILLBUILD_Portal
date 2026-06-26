import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, user } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const callerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!callerProfile?.companyId) return res.status(403).json({ error: 'No company' });
    if (callerProfile.role !== 'admin' && callerProfile.role !== 'owner') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, email, role = 'operator' } = req.body as {
      name?: string;
      email?: string;
      role?: string;
    };

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const emailLower = email.trim().toLowerCase();

    // Check if user already exists in the system
    const existingUser = await db.query.user.findFirst({
      where: eq(user.email, emailLower),
    });

    if (existingUser) {
      // Check if they already have a profile for this company
      const existingProfile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, existingUser.id),
      });
      if (existingProfile?.companyId === callerProfile.companyId) {
        return res.status(409).json({ error: 'This person is already a team member' });
      }
      // They exist but aren't in this company — update their profile
      if (existingProfile) {
        await db.update(profiles)
          .set({ companyId: callerProfile.companyId, role, status: 'invited' })
          .where(eq(profiles.userId, existingUser.id));
      } else {
        await db.insert(profiles).values({
          userId: existingUser.id,
          companyId: callerProfile.companyId,
          role,
          status: 'invited',
        });
      }
      return res.status(201).json({
        ok: true,
        message: `${name} has been added to your team. They can log in with their existing account.`,
        invited: true,
      });
    }

    // User doesn't exist — create a placeholder user + profile with 'invited' status
    // They'll need to sign up using this email to activate their account
    const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + '!A1';

    let newUserId: string | null = null;
    try {
      const result = await auth.api.signUpEmail({
        body: { name: name.trim(), email: emailLower, password: tempPassword },
      });
      newUserId = result?.user?.id ?? null;
    } catch {
      return res.status(409).json({ error: 'An account with that email may already exist' });
    }

    if (!newUserId) {
      return res.status(500).json({ error: 'Failed to create user account' });
    }

    // Create profile with invited status
    await db.insert(profiles).values({
      userId: newUserId,
      companyId: callerProfile.companyId,
      role,
      status: 'invited',
    });

    res.status(201).json({
      ok: true,
      message: `Invite created for ${name}. They can sign up at /signup using ${emailLower}.`,
      invited: true,
    });
  } catch (error) {
    console.error('POST /api/team/invite error:', error);
    res.status(500).json({ error: 'Failed to send invite' });
  }
}
