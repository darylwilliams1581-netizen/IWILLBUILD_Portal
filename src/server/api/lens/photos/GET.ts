/**
 * GET /api/lens/photos
 *
 * Company-wide photo gallery for Lens Phase 1.
 *
 * - Authentication required; company_id resolved from session — never from request.
 * - Queries job_photos LEFT JOIN jobs LEFT JOIN media_assets.
 * - LEFT JOINs ensure older photos without media_asset_id still appear.
 * - Returns only photos belonging to the authenticated company.
 * - Supports page/limit pagination and jobId / search / dateFrom / dateTo filters.
 * - Thumbnail/preview URLs are served through the existing authenticated proxy
 *   endpoint (/api/jobs/:jobId/photos/:photoId/download) — no signed URLs
 *   exposed directly, no R2 credentials in the response.
 *
 * Response shape:
 *   { photos: LensPhoto[], page: number, limit: number, total: number, hasMore: boolean }
 */

import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const DEFAULT_LIMIT = 48;
const MAX_LIMIT     = 200;

export default async function handler(req: Request, res: Response) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
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

    // ── Query params ─────────────────────────────────────────────────────────
    const pageParam  = parseInt(String(req.query.page  ?? '1'), 10);
    const limitParam = parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10);
    const page  = isNaN(pageParam)  || pageParam  < 1 ? 1 : pageParam;
    const limit = isNaN(limitParam) || limitParam < 1 ? DEFAULT_LIMIT : Math.min(limitParam, MAX_LIMIT);
    const offset = (page - 1) * limit;

    const jobIdParam = req.query.jobId ? parseInt(String(req.query.jobId), 10) : null;
    const jobId      = jobIdParam && !isNaN(jobIdParam) ? jobIdParam : null;
    const search     = req.query.search     ? String(req.query.search).trim()     : null;
    const uploadedBy = req.query.uploadedBy ? String(req.query.uploadedBy).trim() : null;
    const dateFrom   = req.query.dateFrom   ? String(req.query.dateFrom).trim()   : null;
    const dateTo     = req.query.dateTo     ? String(req.query.dateTo).trim()     : null;

    // ── Build WHERE fragments ─────────────────────────────────────────────────
    // All conditions are parameterised via sql template literals — no string
    // interpolation of user-supplied values.
    const conditions: ReturnType<typeof sql>[] = [
      sql`jp.company_id = ${companyId}`,
    ];

    if (jobId !== null) {
      conditions.push(sql`jp.job_id = ${jobId}`);
    }

    if (search) {
      const like = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
      conditions.push(sql`(
        jp.original_name LIKE ${like}
        OR jp.label       LIKE ${like}
        OR jp.caption     LIKE ${like}
        OR j.name         LIKE ${like}
        OR j.job_number   LIKE ${like}
      )`);
    }

    if (uploadedBy) {
      const like = `%${uploadedBy.replace(/[%_\\]/g, '\\$&')}%`;
      conditions.push(sql`jp.uploaded_by_name LIKE ${like}`);
    }

    if (dateFrom) {
      conditions.push(sql`jp.created_at >= ${dateFrom}`);
    }
    if (dateTo) {
      // Include the full dateTo day
      conditions.push(sql`jp.created_at < DATE_ADD(${dateTo}, INTERVAL 1 DAY)`);
    }

    const whereClause = conditions.reduce(
      (acc, cond) => sql`${acc} AND ${cond}`,
    );

    // ── Total count ───────────────────────────────────────────────────────────
    const [countRows] = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM   job_photos jp
      LEFT JOIN jobs j ON j.id = jp.job_id
      WHERE  ${whereClause}
    `) as unknown as [Array<{ total: number | string }>];
    const total = Number(countRows?.[0]?.total ?? 0);

    // ── Photo rows ────────────────────────────────────────────────────────────
    // LEFT JOIN media_assets so older photos without media_asset_id still appear.
    // Thumbnail URL: use the authenticated proxy endpoint — no signed URL exposed.
    // The proxy serves thumbnail_key → preview_key → filename in that priority order.
    const [rows] = await db.execute(sql`
      SELECT
        jp.id,
        jp.job_id                                                AS jobId,
        j.job_number                                             AS jobNumber,
        j.name                                                   AS jobName,
        j.address                                                AS jobAddress,
        jp.label,
        jp.caption,
        jp.original_name                                         AS originalName,
        jp.mime_type                                             AS mimeType,
        jp.image_width                                           AS imageWidth,
        jp.image_height                                          AS imageHeight,
        jp.uploaded_by_name                                      AS uploadedByName,
        jp.created_at                                            AS createdAt,
        jp.status,
        jp.locked_at                                             AS lockedAt,
        jp.locked_by_name                                        AS lockedByName,
        jp.media_asset_id                                        AS mediaAssetId,
        -- thumbnail_key present → use report-image proxy (serves thumbnail/preview)
        -- otherwise fall back to the download proxy
        CASE
          WHEN jp.thumbnail_key IS NOT NULL OR jp.preview_key IS NOT NULL
            THEN CONCAT('/api/jobs/', jp.job_id, '/photos/', jp.id, '/report-image')
          ELSE
            CONCAT('/api/jobs/', jp.job_id, '/photos/', jp.id, '/download')
        END                                                      AS thumbnailUrl,
        -- Full-size download always via the authenticated proxy
        CONCAT('/api/jobs/', jp.job_id, '/photos/', jp.id, '/download') AS downloadUrl,
        -- Dimensions from job_photos directly (media_assets does not carry image dimensions)
        jp.image_width                                           AS width,
        jp.image_height                                          AS height
      FROM   job_photos jp
      LEFT JOIN jobs         j  ON j.id  = jp.job_id
      LEFT JOIN media_assets ma ON ma.id = jp.media_asset_id
      WHERE  ${whereClause}
      ORDER BY jp.created_at DESC
      LIMIT  ${limit}
      OFFSET ${offset}
    `) as unknown as [Array<Record<string, unknown>>];

    const photos = (rows ?? []).map((r) => ({
      id:            Number(r.id),
      jobId:         Number(r.jobId),
      jobNumber:     r.jobNumber as string | null,
      jobName:       r.jobName   as string | null,
      label:         r.label     as string | null,
      caption:       r.caption   as string | null,
      originalName:  r.originalName as string | null,
      mimeType:      r.mimeType  as string | null,
      imageWidth:    r.width  != null ? Number(r.width)  : null,
      imageHeight:   r.height != null ? Number(r.height) : null,
      uploadedByName: r.uploadedByName as string | null,
      createdAt:     r.createdAt,
      status:        (r.status as string) ?? 'draft',
      lockedAt:      r.lockedAt ?? null,
      lockedByName:  r.lockedByName as string | null,
      mediaAssetId:  r.mediaAssetId != null ? Number(r.mediaAssetId) : null,
      thumbnailUrl:  r.thumbnailUrl as string,
      downloadUrl:   r.downloadUrl  as string,
    }));

    return res.json({
      photos,
      page,
      limit,
      total,
      hasMore: offset + photos.length < total,
    });
  } catch (error) {
    console.error('GET /api/lens/photos error:', error);
    return res.status(500).json({ error: 'Failed to fetch photos' });
  }
}
