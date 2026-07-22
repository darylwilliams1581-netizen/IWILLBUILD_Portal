/**
 * GET /api/me/email-status
 * Returns the current user's email verification status.
 */
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { user } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, (Array.isArray(v) ? v[0] : v) as string);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Unauthorised' });
    }

    const [row] = await db
      .select({ emailVerified: user.emailVerified, email: user.email })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    return res.json({
      emailVerified: row?.emailVerified ?? false,
      email: row?.email ?? null,
    });
  } catch (err) {
    console.error('me/email-status.error', err);
    return res.status(500).json({ error: 'Failed to get email status' });
  }
}
