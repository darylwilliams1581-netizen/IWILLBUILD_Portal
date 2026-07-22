/**
 * GET /api/dazza/knowledge
 * Returns all knowledge entries for the authenticated user's company.
 * Admin/owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const role = profile.role ?? 'worker';
    const isAdmin = role === 'owner' || role === 'admin' || profile.permAdmin === true;
    if (!isAdmin) return res.status(403).json({ error: 'Admin/owner only' });

    const [rows] = await db.execute(
      sql`SELECT id, title, category, content, source_name, active, created_by, created_at, updated_at
          FROM dazza_knowledge
          WHERE company_id = ${profile.companyId}
          ORDER BY category ASC, title ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ entries: rows ?? [] });
  } catch (e) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
}
