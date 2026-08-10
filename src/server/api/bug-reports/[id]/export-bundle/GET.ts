/**
 * GET /api/bug-reports/:id/export-bundle
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner only.
 * Generates a ZIP support bundle on-the-fly and streams it to the client.
 *
 * Bundle contents:
 *   BUG-{ref}-support-bundle.zip
 *   ├── summary.md
 *   ├── report.json
 *   ├── timeline.jsonl
 *   └── screenshot.{ext}   (only when the report has an attachment)
 *
 * Security:
 *   - Platform-owner permission required (403 otherwise).
 *   - Screenshot fetched server-side via authorised storage call — no signed URL exposed.
 *   - No secrets, tokens, passwords, coordinates, or request bodies in the bundle.
 *   - Export event recorded in bug_reports (exported_at, exported_by).
 *   - ZIP size hard-capped at 50 MB.
 *   - No temporary files written to disk — ZIP assembled in memory and streamed.
 */
import type { Request, Response } from 'express';
import JSZip from 'jszip';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { getDownloadBuffer } from '../../../../storage/storage-service.js';
import {
  buildReference,
  parseDiagEvents,
  buildSummaryMd,
  buildReportJson,
  buildTimelineJsonl,
  screenshotFilename,
  type BugReportRow,
} from '../../support-bundle-generator.js';

const MAX_BUNDLE_BYTES = 50 * 1024 * 1024; // 50 MB hard cap

export default async function handler(req: Request, res: Response) {
  try {
    // ── 1. Auth — platform-owner only ────────────────────────────────────────
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Platform-owner access required.' });

    // ── 2. Load report ────────────────────────────────────────────────────────
    const { id } = req.params;
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (!safeId) return res.status(400).json({ error: 'Invalid report ID.' });

    const rows = await db.execute(sql.raw(`
      SELECT br.id, br.submitted_by_user_id, br.submitted_by_name, br.submitted_by_email,
             br.company_id, br.category, br.description, br.page_url, br.user_agent,
             br.screenshot_path, br.screenshot_bucket, br.status, br.resolution_note,
             br.resolved_by_name, br.resolved_at,
             br.platform, br.app_version, br.current_route, br.diagnostic_events,
             br.created_at, br.updated_at,
             c.name AS company_name
      FROM bug_reports br
      LEFT JOIN companies c ON c.id = br.company_id
      WHERE br.id = '${safeId}'
      LIMIT 1
    `)) as unknown as BugReportRow[];

    if (!rows.length) return res.status(404).json({ error: 'Report not found.' });
    const report = rows[0];

    // ── 3. Parse diagnostic events ────────────────────────────────────────────
    const diagEvents = parseDiagEvents(report.diagnostic_events);

    // ── 4. Fetch screenshot (server-side, no public URL) ──────────────────────
    let screenshotBuffer: Buffer | null = null;
    let screenshotMime: string | null = null;
    let screenshotFname: string | null = null;

    if (report.screenshot_path && report.screenshot_bucket) {
      try {
        const { buffer, mimeType } = await getDownloadBuffer(
          report.screenshot_path,
          report.screenshot_bucket,
        );
        screenshotBuffer = buffer;
        screenshotMime = mimeType;
        screenshotFname = screenshotFilename(mimeType);
      } catch (err) {
        // Non-fatal — bundle is still useful without the screenshot
        console.warn('[export-bundle] screenshot fetch failed:', err);
      }
    }

    // ── 5. Build bundle files ─────────────────────────────────────────────────
    const summaryMd     = buildSummaryMd(report, diagEvents);
    const reportJson    = buildReportJson(report, diagEvents, !!screenshotBuffer, screenshotMime);
    const timelineJsonl = buildTimelineJsonl(diagEvents, report.created_at);

    // ── 6. Assemble ZIP in memory ─────────────────────────────────────────────
    const zip = new JSZip();
    zip.file('summary.md',      summaryMd,     { date: new Date(report.created_at) });
    zip.file('report.json',     reportJson,    { date: new Date(report.created_at) });
    zip.file('timeline.jsonl',  timelineJsonl, { date: new Date(report.created_at) });
    if (screenshotBuffer && screenshotFname) {
      zip.file(screenshotFname, screenshotBuffer, { binary: true, date: new Date(report.created_at) });
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // ── 7. Size guard ─────────────────────────────────────────────────────────
    if (zipBuffer.length > MAX_BUNDLE_BYTES) {
      return res.status(413).json({ error: 'Bundle exceeds 50 MB size limit.' });
    }

    // ── 8. Audit log — record export (non-fatal if it fails) ─────────────────
    try {
      // Store the authenticated user's ID, not their email
      const exporterId = ownerInfo.userId.replace(/'/g, "''");
      await db.execute(sql.raw(`
        UPDATE bug_reports
        SET exported_at = NOW(),
            exported_by = '${exporterId}',
            updated_at  = NOW()
        WHERE id = '${safeId}'
      `));
    } catch (auditErr) {
      console.warn('[export-bundle] audit log update failed:', auditErr);
    }

    // ── 9. Stream ZIP to client ───────────────────────────────────────────────
    const ref = buildReference(report);
    const filename = `${ref}-support-bundle.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end(zipBuffer);

  } catch (err) {
    console.error('[export-bundle/GET]', err);
    return res.status(500).json({ error: 'Failed to generate support bundle.' });
  }
}
