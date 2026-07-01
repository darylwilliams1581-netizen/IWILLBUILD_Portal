/**
 * GET /api/owner-console/starter-pack?companyId=N
 * Returns starter pack status for a company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
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
    if (profile?.role !== 'owner') return res.status(403).json({ error: 'Owner access required' });

    const companyId = parseInt(req.query.companyId as string);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    // Company status
    const [companyRows] = await db.execute(
      sql`SELECT id, name, starter_pack_loaded, starter_pack_loaded_at FROM companies WHERE id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; name: string; starter_pack_loaded: number; starter_pack_loaded_at: string | null }>, unknown];

    if (!companyRows || companyRows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyRows[0];

    // Run history
    let runs: Array<{ id: number; status: string; notes: string | null; created_at: string }> = [];
    try {
      const [runRows] = await db.execute(
        sql`SELECT id, status, notes, created_at FROM starter_pack_runs WHERE company_id = ${companyId} ORDER BY created_at DESC LIMIT 10`
      ) as unknown as [typeof runs, unknown];
      runs = runRows ?? [];
    } catch {
      // Table may not exist yet
    }

    return res.json({
      ok: true,
      company: {
        id: company.id,
        name: company.name,
        starterPackLoaded: Boolean(company.starter_pack_loaded),
        starterPackLoadedAt: company.starter_pack_loaded_at,
      },
      runs,
    });
  } catch (err) {
    console.error('GET /api/owner-console/starter-pack error:', err);
    return res.status(500).json({ error: 'Failed to fetch starter pack status' });
  }
}
