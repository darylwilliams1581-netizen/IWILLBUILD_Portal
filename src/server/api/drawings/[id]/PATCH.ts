/**
 * PATCH /api/drawings/:id
 * Update drawing register metadata (title, revision, discipline, status, drawingNumber).
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

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const { drawingNumber, title, revision, discipline, status } = req.body as {
      drawingNumber?: string;
      title?: string;
      revision?: string;
      discipline?: string;
      status?: string;
    };

    await db.execute(sql`
      UPDATE drawing_records
      SET
        drawing_number = COALESCE(${drawingNumber?.trim() || null}, drawing_number),
        title          = COALESCE(${title?.trim() || null}, title),
        revision       = COALESCE(${revision?.trim() || null}, revision),
        discipline     = COALESCE(${discipline?.trim() || null}, discipline),
        status         = COALESCE(${status?.trim() || null}, status),
        updated_at     = NOW()
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/drawings/:id error:', err);
    res.status(500).json({ error: 'Failed to update drawing' });
  }
}
