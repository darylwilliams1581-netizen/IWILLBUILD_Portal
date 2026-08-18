/**
 * POST /api/lens/photos/export-zip
 * ─────────────────────────────────────────────────────────────────────────────
 * Export an arbitrary selection of Lens photos as a single ZIP archive.
 *
 * Body: { photoIds: number[] }
 *
 * Security:
 *   - Authentication required (session cookie)
 *   - Company ID resolved from session only — never from the request body
 *   - Every photo ID is verified to belong to the authenticated company
 *   - Unauthorised / missing IDs are silently excluded (not leaked)
 *   - Parameterised queries throughout
 *
 * ZIP structure:
 *   - Single job:  flat list of filenames (no sub-folder)
 *   - Multi-job:   per-job sub-folders  JOB-001 Kitchen/photo.jpg
 *                                        No Job/photo.jpg
 *
 * Filename deduplication: _2, _3, … suffix before extension.
 *
 * Streaming: buffers the full ZIP in memory (same as existing endpoint).
 * No permanent ZIP is written to R2 or local storage.
 */

import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import {
  buildPhotoZip,
  lensSelectionZipFilename,
  wholeJobZipFilename,
  todayDateString,
  type PhotoRow,
  type JobMeta,
} from '../../../../lib/zip-photo-export.js';

export default async function handler(req: Request, res: Response) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
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

    // ── Validate body ───────────────────────────────────────────────────────
    const body = req.body as { photoIds?: unknown };
    if (!Array.isArray(body.photoIds) || body.photoIds.length === 0) {
      return res.status(400).json({ error: 'photoIds must be a non-empty array' });
    }

    // Deduplicate and sanitise IDs — reject non-integers silently
    const rawIds = body.photoIds as unknown[];
    const uniqueIds = [
      ...new Set(
        rawIds
          .map(id => (typeof id === 'number' ? Math.floor(id) : parseInt(String(id), 10)))
          .filter(id => Number.isFinite(id) && id > 0)
      ),
    ];

    if (uniqueIds.length === 0) {
      return res.status(400).json({ error: 'No valid photo IDs provided' });
    }

    // ── Fetch photos — company-scoped only ──────────────────────────────────
    // The inArray + companyId constraint means any ID from another company
    // simply returns no row and is silently excluded.
    const rows = await db.select().from(jobPhotos).where(
      and(
        eq(jobPhotos.companyId, profile.companyId),
        inArray(jobPhotos.id, uniqueIds),
      )
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No authorised photos found for the given IDs' });
    }

    // ── Fetch job metadata for folder naming ────────────────────────────────
    const jobIds = [...new Set(rows.map(r => r.jobId))];
    const jobRows = await db.select().from(jobs).where(
      and(
        eq(jobs.companyId, profile.companyId),
        inArray(jobs.id, jobIds),
      )
    );

    const jobMap = new Map<number, JobMeta>(
      jobRows.map(j => [j.id, { id: j.id, name: j.name ?? null, jobNumber: j.jobNumber ?? null }])
    );

    // ── Build ZIP ───────────────────────────────────────────────────────────
    const photoRowsTyped: PhotoRow[] = rows.map(r => ({
      id:           r.id,
      jobId:        r.jobId,
      filename:     r.filename,
      originalName: r.originalName ?? null,
      mimeType:     r.mimeType ?? null,
    }));

    const multiJob   = jobIds.length > 1;
    const zipBuffer  = await buildPhotoZip(photoRowsTyped, jobMap, multiJob);

    // ── ZIP filename ────────────────────────────────────────────────────────
    const date = todayDateString();
    let zipFilename: string;
    if (!multiJob && jobIds.length === 1) {
      const singleJob = jobMap.get(jobIds[0]);
      zipFilename = singleJob
        ? wholeJobZipFilename(singleJob, date)
        : lensSelectionZipFilename(date);
    } else {
      zipFilename = lensSelectionZipFilename(date);
    }

    // ── Stream response ─────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.end(zipBuffer);
  } catch (error) {
    console.error('POST /api/lens/photos/export-zip error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  }
}
