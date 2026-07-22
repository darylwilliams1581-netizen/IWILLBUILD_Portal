/**
 * DELETE /api/jobs/:id/ledger/:entryId
 * Delete a ledger entry (only pending entries can be deleted by non-owners).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

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

    const entryId = parseInt(String(req.params.entryId), 10);
    if (isNaN(entryId)) return res.status(400).json({ error: 'Invalid entry ID' });

    const [existing] = await db.execute(sql`
      SELECT id, status, locked FROM job_cost_ledger WHERE id = ${entryId} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ id: number; status: string; locked: number }>, unknown];
    if (!existing?.length) return res.status(404).json({ error: 'Entry not found' });

    // Immutability guard — approved or locked entries cannot be deleted
    if (existing[0].locked || existing[0].status === 'approved') {
      return res.status(423).json({
        error: 'Posted costs cannot be deleted. To correct an error, use the "Correct Entry" function to post an adjustment (negative amount). This maintains a full audit trail.',
        locked: true,
      });
    }

    await db.execute(sql`DELETE FROM job_cost_ledger WHERE id = ${entryId} AND company_id = ${profile.companyId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/jobs/:id/ledger/:entryId error:', err);
    res.status(500).json({ error: 'Failed to delete ledger entry' });
  }
}
