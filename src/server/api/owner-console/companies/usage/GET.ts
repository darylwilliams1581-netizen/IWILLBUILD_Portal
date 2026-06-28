/**
 * GET /api/owner-console/companies/usage
 * Returns per-company usage summary for the platform owner.
 * Owner access required.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getPlanLimits, getPlanLimitsSync } from '../../../../lib/plan-limits.js';

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

    const safeCount = async (q: ReturnType<typeof sql>): Promise<number> => {
      try {
        const [rows] = await db.execute(q) as unknown as [Array<{ cnt: number | string }>, unknown];
        return Number(rows?.[0]?.cnt ?? 0);
      } catch { return 0; }
    };

    const safeSum = async (q: ReturnType<typeof sql>): Promise<number> => {
      try {
        const [rows] = await db.execute(q) as unknown as [Array<{ total: number | string | null }>, unknown];
        return Number(rows?.[0]?.total ?? 0);
      } catch { return 0; }
    };

    const result = await Promise.all(allCompanies.map(async (c) => {
      const plan = c.plan ?? 'trial';
      const limits = await getPlanLimits(c.id, plan);

      const [users, activeJobs, photos, files, fileBytes, fleet, formTemplates, costGuide, lastLogin] = await Promise.all([
        safeCount(sql`SELECT COUNT(*) as cnt FROM profiles WHERE company_id = ${c.id} AND status != 'inactive'`),
        safeCount(sql`SELECT COUNT(*) as cnt FROM jobs WHERE company_id = ${c.id} AND status NOT IN ('Archived','Closed')`),
        safeCount(sql`SELECT COUNT(*) as cnt FROM job_photos WHERE company_id = ${c.id}`),
        safeCount(sql`SELECT COUNT(*) as cnt FROM company_files WHERE company_id = ${c.id}`),
        safeSum(sql`SELECT COALESCE(SUM(size_bytes),0) as total FROM company_files WHERE company_id = ${c.id}`),
        safeCount(sql`SELECT COUNT(*) as cnt FROM fleet_assets WHERE company_id = ${c.id} AND (archived = 0 OR archived IS NULL)`),
        safeCount(sql`SELECT COUNT(*) as cnt FROM form_templates WHERE company_id = ${c.id}`),
        safeCount(sql`SELECT COUNT(*) as cnt FROM cost_guide_items WHERE company_id = ${c.id}`),
        (async () => {
          try {
            const [rows] = await db.execute(
              sql`SELECT MAX(last_login_at) as last_login FROM profiles WHERE company_id = ${c.id}`
            ) as unknown as [Array<{ last_login: string | null }>, unknown];
            return rows?.[0]?.last_login ?? null;
          } catch { return null; }
        })(),
      ]);

      const pct = (used: number, limit: number) => limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

      const usagePcts = {
        users:    pct(users, limits.users),
        jobs:     pct(activeJobs, limits.activeJobs),
        photos:   pct(photos, limits.totalPhotos),
        storage:  pct(fileBytes, limits.storageBytes),
        fleet:    pct(fleet, limits.fleetAssets),
      };

      const hasWarning = Object.values(usagePcts).some(p => p >= 80);
      const hasBlocked = Object.values(usagePcts).some(p => p >= 100);

      return {
        id: c.id,
        name: c.name,
        plan,
        subscriptionStatus: c.subscriptionStatus ?? 'trial',
        users,
        usersLimit: limits.users,
        activeJobs,
        activeJobsLimit: limits.activeJobs,
        photos,
        photosLimit: limits.totalPhotos,
        files,
        fileBytes,
        storageLimitBytes: limits.storageBytes,
        fleet,
        fleetLimit: limits.fleetAssets,
        formTemplates,
        costGuide,
        lastLogin,
        usagePcts,
        hasWarning,
        hasBlocked,
        createdAt: c.createdAt,
      };
    }));

    res.json({ companies: result });
  } catch (error) {
    console.error('GET /api/owner-console/companies/usage error:', error);
    res.status(500).json({ error: 'Failed to fetch company usage' });
  }
}
