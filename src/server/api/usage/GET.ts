/**
 * GET /api/usage
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns real usage counts, plan limits, percentages, and warnings
 * for the authenticated user's company.
 *
 * Auth required. Company-scoped. No cross-company data.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { getPlanLimits, getCompanyPlan, HARD_LIMITS } from '../../lib/plan-limits.js';

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

    const companyId = profile.companyId;
    const plan = await getCompanyPlan(companyId);
    const limits = await getPlanLimits(companyId, plan);

    // ── Gather real counts ────────────────────────────────────────────────────

    const safeCount = async (query: ReturnType<typeof sql>): Promise<number> => {
      try {
        const [rows] = await db.execute(query) as unknown as [Array<{ cnt: number | string }>, unknown];
        return Number(rows?.[0]?.cnt ?? 0);
      } catch {
        return 0;
      }
    };

    const safeSum = async (query: ReturnType<typeof sql>): Promise<number> => {
      try {
        const [rows] = await db.execute(query) as unknown as [Array<{ total: number | string | null }>, unknown];
        return Number(rows?.[0]?.total ?? 0);
      } catch {
        return 0;
      }
    };

    const [
      userCount,
      activeJobCount,
      archivedJobCount,
      totalPhotoCount,
      photoStorageBytes,
      fileCount,
      fileStorageBytes,
      costGuideCount,
      formTemplateCount,
      fleetAssetCount,
      completedFormCount,
    ] = await Promise.all([
      safeCount(sql`SELECT COUNT(*) as cnt FROM profiles WHERE company_id = ${companyId} AND status != 'inactive'`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM jobs WHERE company_id = ${companyId} AND (status NOT IN ('Archived','Closed') OR status IS NULL)`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM jobs WHERE company_id = ${companyId} AND status IN ('Archived','Closed')`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM job_photos WHERE company_id = ${companyId}`),
      safeSum(sql`SELECT SUM(size_bytes) as total FROM job_photos WHERE company_id = ${companyId}`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM company_files WHERE company_id = ${companyId}`),
      safeSum(sql`SELECT SUM(size_bytes) as total FROM company_files WHERE company_id = ${companyId}`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM cost_guide_items WHERE company_id = ${companyId}`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM form_templates WHERE company_id = ${companyId}`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM fleet_assets WHERE company_id = ${companyId} AND (archived = 0 OR archived IS NULL)`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM job_form_submissions WHERE company_id = ${companyId} AND status = 'completed'`),
    ]);

    const totalStorageBytes = photoStorageBytes + fileStorageBytes;

    // ── Build usage object ────────────────────────────────────────────────────

    function pct(used: number, limit: number): number {
      if (limit <= 0) return 0;
      return Math.min(100, Math.round((used / limit) * 100));
    }

    function warn(used: number, limit: number, label: string): string | null {
      const p = pct(used, limit);
      if (p >= 100) return `${label} limit reached (${used}/${limit})`;
      if (p >= 80) return `${label} usage above 80% (${used}/${limit})`;
      return null;
    }

    const usageItems = [
      { key: 'users',          label: 'Users',            used: userCount,          limit: limits.users,          unit: 'users' },
      { key: 'activeJobs',     label: 'Active Jobs',      used: activeJobCount,     limit: limits.activeJobs,     unit: 'jobs' },
      { key: 'totalPhotos',    label: 'Job Photos',       used: totalPhotoCount,    limit: limits.totalPhotos,    unit: 'photos' },
      { key: 'storage',        label: 'File Storage',     used: totalStorageBytes,  limit: limits.storageBytes,   unit: 'bytes' },
      { key: 'costGuideItems', label: 'Cost Guide Items', used: costGuideCount,     limit: limits.costGuideItems, unit: 'items' },
      { key: 'formTemplates',  label: 'Form Templates',   used: formTemplateCount,  limit: limits.formTemplates,  unit: 'templates' },
      { key: 'fleetAssets',    label: 'Fleet Assets',     used: fleetAssetCount,    limit: limits.fleetAssets,    unit: 'assets' },
    ].map(item => ({
      ...item,
      pct: pct(item.used, item.limit),
      warning: item.pct >= 80,
      blocked: item.used >= item.limit,
    }));

    const warnings = usageItems
      .map(i => warn(i.used, i.limit, i.label))
      .filter(Boolean) as string[];

    res.json({
      plan,
      limits,
      hardLimits: HARD_LIMITS,
      usage: {
        users:           userCount,
        activeJobs:      activeJobCount,
        archivedJobs:    archivedJobCount,
        totalPhotos:     totalPhotoCount,
        photoStorageBytes,
        fileCount,
        fileStorageBytes,
        totalStorageBytes,
        costGuideItems:  costGuideCount,
        formTemplates:   formTemplateCount,
        fleetAssets:     fleetAssetCount,
        completedForms:  completedFormCount,
      },
      items: usageItems,
      warnings,
      hasWarnings: warnings.length > 0,
      hasBlocked: usageItems.some(i => i.blocked),
    });
  } catch (error) {
    console.error('GET /api/usage error:', error);
    res.status(500).json({ error: 'Failed to load usage data' });
  }
}
