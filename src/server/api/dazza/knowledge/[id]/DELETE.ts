/**
 * DELETE /api/dazza/knowledge/:id
 * Deletes a knowledge entry. Admin/owner only. Company-scoped.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const id = parseInt(req.params.id ?? '0', 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const [existing] = await db.execute(
      sql`SELECT id FROM dazza_knowledge WHERE id = ${id} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!existing?.length) return res.status(404).json({ error: 'Not found' });

    await db.execute(
      sql`DELETE FROM dazza_knowledge WHERE id = ${id} AND company_id = ${profile.companyId}`
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
}
