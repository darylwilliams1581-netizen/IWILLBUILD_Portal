/**
 * POST /api/risk-register/:id/archive
 * Soft-archives a risk register entry. Sets archived_at, archived_by, archive_reason.
 * The record is never deleted — it moves to the archive view only.
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

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const { reason = '' } = req.body as { reason?: string };
    const archivedBy = session.user.name ?? session.user.email ?? session.user.id;

    await db.execute(sql.raw(`
      UPDATE risk_register
      SET archived_at = NOW(),
          archived_by = '${String(archivedBy).replace(/'/g, "''")}',
          archive_reason = ${reason ? `'${String(reason).replace(/'/g, "''")}'` : 'NULL'},
          updated_at = NOW()
      WHERE id = ${id} AND company_id = ${profile.companyId} AND archived_at IS NULL
    `));

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/risk-register/:id/archive error:', err);
    res.status(500).json({ error: 'Archive failed' });
  }
}
