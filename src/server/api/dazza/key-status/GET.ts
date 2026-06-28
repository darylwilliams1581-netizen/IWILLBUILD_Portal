/**
 * GET /api/dazza/key-status
 * Returns whether OPENAI_API_KEY is configured — never exposes the key value.
 * Admin/owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    // Only admins/owners can see key status
    const isAdmin = profile.role === 'owner' || profile.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });

    const key = getSecret('OPENAI_API_KEY');
    const configured = !!(key && key.trim().length > 0);

    // Log missing key server-side (never log the value)
    if (!configured) {
      console.warn('[dazza] OPENAI_API_KEY is not configured. Dazza will answer portal lookups and calculators only.');
    }

    res.json({ configured });
  } catch (error) {
    console.error('GET /api/dazza/key-status error:', error);
    res.status(500).json({ error: 'Failed to check key status' });
  }
}
