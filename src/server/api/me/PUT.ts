import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { user, profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, (Array.isArray(v) ? v[0] : v) as string);
    }

    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { name, email } = req.body as { name?: string; email?: string };

    // ── Validation ────────────────────────────────────────────────────────────
    const trimmedName  = (name  ?? '').trim();
    const trimmedEmail = (email ?? '').trim().toLowerCase();

    if (!trimmedName)  return res.status(400).json({ error: 'Display name is required.' });
    if (!trimmedEmail) return res.status(400).json({ error: 'Email is required.' });

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // If email is changing, ensure it isn't already taken by another user
    if (trimmedEmail !== session.user.email.toLowerCase()) {
      const existing = await db.query.user.findFirst({
        where: eq(user.email, trimmedEmail),
      });
      if (existing && existing.id !== session.user.id) {
        return res.status(409).json({ error: 'That email address is already in use.' });
      }
    }

    // ── Update the BetterAuth user table ──────────────────────────────────────
    // Only touches name + email — password hash, role, permissions are untouched.
    await db
      .update(user)
      .set({ name: trimmedName, email: trimmedEmail })
      .where(eq(user.id, session.user.id));

    // ── Return the refreshed profile so the client can update its cache ───────
    const updatedProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });

    res.json({
      ok: true,
      user: {
        id: session.user.id,
        name: trimmedName,
        email: trimmedEmail,
      },
      profile: updatedProfile ?? null,
    });
  } catch (error) {
    console.error('PUT /api/me error:', error);
    res.status(500).json({ error: 'Failed to update profile. Please try again.' });
  }
}
