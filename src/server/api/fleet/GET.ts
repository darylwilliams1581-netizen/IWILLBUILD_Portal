import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { fleetAssets, profiles } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
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
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const showArchived = req.query.archived === 'true';

    // Fetch assets via Drizzle (schema columns)
    const rows = await db
      .select()
      .from(fleetAssets)
      .where(
        showArchived
          ? eq(fleetAssets.companyId, profile.companyId)
          : and(eq(fleetAssets.companyId, profile.companyId), eq(fleetAssets.archived, false)),
      )
      .orderBy(fleetAssets.name);

    // Attempt to enrich with vin column (self-healing — column may not exist yet)
    let vinMap: Record<number, string | null> = {};
    try {
      const [vinRows] = await db.execute(
        sql`SELECT id, vin FROM fleet_assets WHERE company_id = ${profile.companyId}`
      ) as unknown as [Array<{ id: number; vin: string | null }>, unknown];
      for (const r of vinRows) {
        vinMap[r.id] = r.vin ?? null;
      }
    } catch {
      // vin column doesn't exist yet — safe to ignore, will be created on first POST
    }

    const assets = rows.map((a) => ({ ...a, vin: vinMap[a.id] ?? null }));

    res.json({ assets });
  } catch (error) {
    console.error('GET /api/fleet error:', error);
    res.status(500).json({ error: 'Failed to fetch fleet' });
  }
}
