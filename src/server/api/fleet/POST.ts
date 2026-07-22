import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { fleetAssets, profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { getPlanLimits, getCompanyPlan, checkLimit } from '../../lib/plan-limits.js';

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

    // ── Plan limit check: fleet assets ────────────────────────────────────────
    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);

    const [countRow] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM fleet_assets WHERE company_id = ${profile.companyId} AND (archived = 0 OR archived IS NULL)`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    const currentCount = Number(countRow?.[0]?.cnt ?? 0);

    const limitCheck = checkLimit(currentCount, limits.fleetAssets, 'Fleet Assets');
    if (!limitCheck.allowed) {
      return res.status(403).json({ code: limitCheck.code, error: limitCheck.message });
    }

    const {
      name, assetNumber, type, makeModel, vin, rego, regoNotApplicable,
      serviceDate, regoExpiry, status, notes,
    } = req.body as Record<string, string | boolean | undefined>;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Asset name is required' });
    }

    // Ensure vin column exists (self-healing migration runs at startup via entry.ts)

    const [inserted] = await db.insert(fleetAssets).values({
      companyId: profile.companyId,
      name: String(name).trim(),
      assetNumber: assetNumber ? String(assetNumber).trim() : null,
      type: type ? String(type).trim() : 'Vehicle',
      makeModel: makeModel ? String(makeModel).trim() : null,
      rego: rego ? String(rego).trim() : null,
      regoNotApplicable: Boolean(regoNotApplicable),
      serviceDate: serviceDate ? new Date(String(serviceDate)) : null,
      regoExpiry: regoExpiry ? new Date(String(regoExpiry)) : null,
      status: status ? String(status).trim() : 'Active',
      notes: notes ? String(notes).trim() : null,
    }).$returningId();

    // Patch VIN separately via raw SQL (column added via self-healing migration, not in Drizzle schema)
    if (vin && String(vin).trim()) {
      await db.execute(sql`UPDATE fleet_assets SET vin = ${String(vin).trim()} WHERE id = ${inserted.id}`);
    }

    const asset = await db.query.fleetAssets.findFirst({
      where: eq(fleetAssets.id, inserted.id),
    });

    res.status(201).json({ asset });
  } catch (error) {
    console.error('POST /api/fleet error:', error);
    res.status(500).json({ error: 'Failed to create asset' });
  }
}
