import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { formTemplates, profiles } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
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
    if (!profile?.companyId) return res.json({ templates: [] });

    const result = await db
      .select()
      .from(formTemplates)
      .where(eq(formTemplates.companyId, profile.companyId))
      .orderBy(desc(formTemplates.createdAt));

    res.json({ templates: result });
  } catch (error) {
    console.error('GET /api/form-templates error:', error);
    res.status(500).json({ error: 'Failed to fetch form templates' });
  }
}
