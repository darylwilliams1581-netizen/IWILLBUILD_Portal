/**
 * GET /api/owner-console/storage
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-wide storage aggregation for the platform owner.
 * Access enforced by requirePlatformOwner middleware in entry.ts.
 * Never exposes file contents — metadata only.
 *
 * Returns:
 *   platform   — totals across all companies
 *   companies  — per-company breakdown with status (ok / warning / over)
 *   topByStorage   — top 10 companies by bytes used
 *   topFiles       — top 10 largest individual files
 *   topJobsByStorage — top 10 jobs by combined file+photo storage
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getPlanLimits } from '../../../lib/plan-limits.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function safeCount(q: ReturnType<typeof sql>): Promise<number> {
  try {
    const [rows] = await db.execute(q) as unknown as [Array<{ cnt: number | string }>, unknown];
    return Number(rows?.[0]?.cnt ?? 0);
  } catch { return 0; }
}

async function safeSum(q: ReturnType<typeof sql>): Promise<number> {
  try {
    const [rows] = await db.execute(q) as unknown as [Array<{ total: number | string | null }>, unknown];
    return Number(rows?.[0]?.total ?? 0);
  } catch { return 0; }
}

async function safeRows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  try {
    const [rows] = await db.execute(q) as unknown as [T[], unknown];
    return rows ?? [];
  } catch { return []; }
}

function storageStatus(pct: number): 'ok' | 'warning' | 'over' | 'blocked' {
  if (pct >= 100) return 'blocked';
  if (pct >= 90)  return 'over';
  if (pct >= 70)  return 'warning';
  return 'ok';
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    // Platform owner check handled by requirePlatformOwner middleware in entry.ts

    // ── Platform-wide totals ──────────────────────────────────────────────────

    const [
      totalFileBytes,
      totalFileCount,
      totalPhotoBytes,
      totalPhotoCount,
      totalSafetyDocBytes,
      totalSafetyDocCount,
      totalSafePosterBytes,
      totalSafePosterCount,
      totalCompanies,
    ] = await Promise.all([
      safeSum(sql`SELECT COALESCE(SUM(size_bytes), 0) as total FROM company_files`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM company_files`),
      safeSum(sql`SELECT COALESCE(SUM(size_bytes), 0) as total FROM job_photos`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM job_photos`),
      safeSum(sql`SELECT COALESCE(SUM(size_bytes), 0) as total FROM safety_documents`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM safety_documents`),
      safeSum(sql`SELECT COALESCE(SUM(size_bytes), 0) as total FROM safety_posters`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM safety_posters`),
      safeCount(sql`SELECT COUNT(*) as cnt FROM companies`),
    ]);

    const totalBytes = totalFileBytes + totalPhotoBytes + totalSafetyDocBytes + totalSafePosterBytes;
    const totalFiles = totalFileCount + totalPhotoCount + totalSafetyDocCount + totalSafePosterCount;

    // ── Per-company breakdown ─────────────────────────────────────────────────

    interface CompanyRow { id: number; name: string; plan: string | null; }
    const allCompanies = await safeRows<CompanyRow>(
      sql`SELECT id, name, plan FROM companies ORDER BY name`
    );

    const companyData = await Promise.all(allCompanies.map(async (c) => {
      const plan = c.plan ?? 'trial';
      const limits = await getPlanLimits(c.id, plan);

      const [fileBytes, fileCount, photoBytes, photoCount, safetyDocBytes, safetyPosterBytes, lastUpload] = await Promise.all([
        safeSum(sql`SELECT COALESCE(SUM(size_bytes), 0) as total FROM company_files WHERE company_id = ${c.id}`),
        safeCount(sql`SELECT COUNT(*) as cnt FROM company_files WHERE company_id = ${c.id}`),
        safeSum(sql`SELECT COALESCE(SUM(size_bytes), 0) as total FROM job_photos WHERE company_id = ${c.id}`),
        safeCount(sql`SELECT COUNT(*) as cnt FROM job_photos WHERE company_id = ${c.id}`),
        safeSum(sql`SELECT COALESCE(SUM(size_bytes), 0) as total FROM safety_documents WHERE company_id = ${c.id}`),
        safeSum(sql`SELECT COALESCE(SUM(size_bytes), 0) as total FROM safety_posters WHERE company_id = ${c.id}`),
        (async () => {
          try {
            // Most recent upload across all file tables
            const [rows] = await db.execute(sql`
              SELECT MAX(ts) as last_upload FROM (
                SELECT MAX(created_at) as ts FROM company_files WHERE company_id = ${c.id}
                UNION ALL
                SELECT MAX(created_at) as ts FROM job_photos WHERE company_id = ${c.id}
                UNION ALL
                SELECT MAX(created_at) as ts FROM safety_documents WHERE company_id = ${c.id}
                UNION ALL
                SELECT MAX(created_at) as ts FROM safety_posters WHERE company_id = ${c.id}
              ) t
            `) as unknown as [Array<{ last_upload: string | null }>, unknown];
            return rows?.[0]?.last_upload ?? null;
          } catch { return null; }
        })(),
      ]);

      const totalCompanyBytes = fileBytes + photoBytes + safetyDocBytes + safetyPosterBytes;
      const totalCompanyFiles = fileCount + photoCount;
      const pct = limits.storageBytes > 0
        ? Math.min(100, Math.round((totalCompanyBytes / limits.storageBytes) * 100))
        : 0;

      return {
        id: c.id,
        name: c.name,
        plan,
        fileBytes,
        fileCount,
        photoBytes,
        photoCount,
        safetyBytes: safetyDocBytes + safetyPosterBytes,
        totalBytes: totalCompanyBytes,
        totalFiles: totalCompanyFiles,
        storageLimitBytes: limits.storageBytes,
        pct,
        status: storageStatus(pct),
        lastUpload,
      };
    }));

    // ── Top 10 companies by storage ───────────────────────────────────────────

    const topByStorage = [...companyData]
      .sort((a, b) => b.totalBytes - a.totalBytes)
      .slice(0, 10);

    // ── Top 10 largest individual files ──────────────────────────────────────

    interface FileRow {
      id: number;
      company_id: number;
      company_name: string;
      original_name: string;
      size_bytes: number;
      mime_type: string;
      file_category: string | null;
      created_at: string;
      source: string;
    }

    const topFilesRaw = await safeRows<FileRow>(sql`
      SELECT
        f.id, f.company_id, c.name as company_name,
        f.original_name, f.size_bytes, f.mime_type,
        f.file_category, f.created_at,
        'file' as source
      FROM company_files f
      JOIN companies c ON c.id = f.company_id
      ORDER BY f.size_bytes DESC
      LIMIT 10
    `);

    const topPhotoRaw = await safeRows<{
      id: number; company_id: number; company_name: string;
      original_name: string; size_bytes: number; mime_type: string;
      created_at: string;
    }>(sql`
      SELECT
        p.id, p.company_id, c.name as company_name,
        COALESCE(p.original_name, p.filename) as original_name,
        p.size_bytes, p.mime_type, p.created_at
      FROM job_photos p
      JOIN companies c ON c.id = p.company_id
      ORDER BY p.size_bytes DESC
      LIMIT 10
    `);

    // Merge and take top 10 overall
    const allTopFiles = [
      ...topFilesRaw.map(f => ({ ...f, source: 'file' as const })),
      ...topPhotoRaw.map(p => ({ ...p, file_category: null, source: 'photo' as const })),
    ].sort((a, b) => b.size_bytes - a.size_bytes).slice(0, 10);

    // ── Top 10 jobs by storage ────────────────────────────────────────────────

    interface JobStorageRow {
      job_id: number;
      job_name: string;
      job_number: string | null;
      company_id: number;
      company_name: string;
      photo_bytes: number;
      file_bytes: number;
      photo_count: number;
      file_count: number;
    }

    const topJobsRaw = await safeRows<JobStorageRow>(sql`
      SELECT
        j.id as job_id,
        j.name as job_name,
        j.job_number,
        j.company_id,
        c.name as company_name,
        COALESCE(ph.photo_bytes, 0) as photo_bytes,
        COALESCE(fi.file_bytes, 0) as file_bytes,
        COALESCE(ph.photo_count, 0) as photo_count,
        COALESCE(fi.file_count, 0) as file_count
      FROM jobs j
      JOIN companies c ON c.id = j.company_id
      LEFT JOIN (
        SELECT job_id, SUM(size_bytes) as photo_bytes, COUNT(*) as photo_count
        FROM job_photos GROUP BY job_id
      ) ph ON ph.job_id = j.id
      LEFT JOIN (
        SELECT job_id, SUM(size_bytes) as file_bytes, COUNT(*) as file_count
        FROM company_files WHERE job_id IS NOT NULL GROUP BY job_id
      ) fi ON fi.job_id = j.id
      HAVING (photo_bytes + file_bytes) > 0
      ORDER BY (photo_bytes + file_bytes) DESC
      LIMIT 10
    `);

    const topJobsByStorage = topJobsRaw.map(j => ({
      ...j,
      totalBytes: j.photo_bytes + j.file_bytes,
      totalFiles: j.photo_count + j.file_count,
    }));

    // ── Warning counts ────────────────────────────────────────────────────────

    const warningCount = companyData.filter(c => c.status === 'warning').length;
    const overCount    = companyData.filter(c => c.status === 'over').length;
    const blockedCount = companyData.filter(c => c.status === 'blocked').length;
    const companiesWithStorage = companyData.filter(c => c.totalBytes > 0).length;

    res.json({
      platform: {
        totalBytes,
        totalFiles,
        totalFileCount,
        totalPhotoCount,
        totalSafetyDocCount,
        totalSafePosterCount,
        totalCompanies,
        companiesWithStorage,
        warningCount,
        overCount,
        blockedCount,
        breakdown: {
          fileBytes:        totalFileBytes,
          photoBytes:       totalPhotoBytes,
          safetyDocBytes:   totalSafetyDocBytes,
          safetyPosterBytes: totalSafePosterBytes,
        },
      },
      companies: companyData,
      topByStorage,
      topFiles: allTopFiles,
      topJobsByStorage,
    });

  } catch (error) {
    console.error('GET /api/owner-console/storage error:', error);
    res.status(500).json({ error: 'Failed to load storage data' });
  }
}
