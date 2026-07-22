/**
 * POST /api/auth/check-signup-status
 * Public — checks whether an email has an auth account and, if so, whether
 * signup was completed (profile + company exist).
 *
 * Returns:
 *   { status: 'available' }                  — email not taken, can sign up
 *   { status: 'complete' }                   — full account exists, sign in instead
 *   { status: 'incomplete', userId: string } — auth user exists but no profile/company
 *
 * Never reveals password hashes or tokens.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, user } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const { email } = req.body as { email?: string };
    if (!email?.trim()) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const normalised = email.trim().toLowerCase();

    // Look up auth user
    const [authUser] = await db
      .select({ id: user.id, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.email, normalised))
      .limit(1);

    if (!authUser) {
      return res.json({ status: 'available' });
    }

    // Auth user exists — check for profile
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, authUser.id),
    });

    if (!profile) {
      // Orphaned: auth user with no profile
      return res.json({
        status: 'incomplete',
        userId: authUser.id,
        emailVerified: authUser.emailVerified ?? false,
      });
    }

    // Full account exists
    return res.json({ status: 'complete' });
  } catch (err) {
    console.error('POST /api/auth/check-signup-status error:', err);
    return res.status(500).json({ error: 'Failed to check signup status.' });
  }
}
