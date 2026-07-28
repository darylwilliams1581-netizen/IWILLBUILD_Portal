/**
 * DELETE /api/safety/swms/:id
 * Archives (soft-deletes) a SWMS template by setting status = 'archived'.
 * Hard delete is intentionally avoided — job_swms records may reference it.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';

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

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const [rows] = await db.execute(
      sql`SELECT id FROM swms_templates WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];
    if (!rows?.length) return res.status(404).json({ error: 'Template not found' });

    await db.execute(
      sql`UPDATE swms_templates SET status = 'archived' WHERE id = ${id} AND company_id = ${profile.companyId}`
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('[safety/swms/delete]', e);
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
}
