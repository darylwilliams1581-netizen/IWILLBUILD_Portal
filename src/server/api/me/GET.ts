import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles, companies } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

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

    let company = null;
    if (profile?.companyId) {
      company = await db.query.companies.findFirst({
        where: eq(companies.id, profile.companyId),
      });
    }

    res.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      profile: profile ?? null,
      company: company ?? null,
    });
  } catch (error) {
    console.error('GET /api/me error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}
