import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, user } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
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
    if (callerProfile?.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' });
    }

    const allCompanies = await db.query.companies.findMany();

    const result = await Promise.all(
      allCompanies.map(async (c) => {
        // Count users
        const [totalRow] = await db.execute(
          sql`SELECT COUNT(*) as cnt FROM profiles WHERE company_id = ${c.id}`
        );
        const [activeRow] = await db.execute(
          sql`SELECT COUNT(*) as cnt FROM profiles WHERE company_id = ${c.id} AND status = 'active'`
        );
        // Find owner
        const ownerProfile = await db.query.profiles.findFirst({
          where: (p, { and, eq }) => and(eq(p.companyId, c.id), eq(p.role, 'owner')),
        });
        let ownerName = '—';
        if (ownerProfile) {
          const ownerUser = await db.query.user.findFirst({
            where: eq(user.id, ownerProfile.userId),
          });
          ownerName = ownerUser?.name ?? ownerUser?.email ?? '—';
        }

        const get = (r: unknown) => Number((r as Array<{ cnt: number }>)[0]?.cnt ?? 0);

        return {
          id: c.id,
          name: c.name,
          owner: ownerName,
          totalUsers: get(totalRow),
          activeUsers: get(activeRow),
          createdAt: c.createdAt,
          status: 'active',
        };
      })
    );

    res.json({ companies: result });
  } catch (error) {
    console.error('GET /api/owner-console/companies error:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
}
