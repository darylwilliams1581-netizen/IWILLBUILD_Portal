/**
 * POST /api/owner-console/image-safeguard/scan
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B2 — Initiates an Image Safeguard scan run.
 *
 * REQUEST BODY (all optional):
 *   since:      ISO-8601 string | null  — scan start (default: cursor or 7 days)
 *   until:      ISO-8601 string | null  — scan end (default: server now)
 *   useCursor:  boolean                 — use last successful scan as `since`
 *
 * SECURITY:
 *  - Platform-owner access only (requirePlatformOwner middleware in entry.ts).
 *  - Scan scope (bucket + prefix) is HARDCODED server-side — never from client.
 *  - No R2 credentials, object keys, signed URLs, or image bytes in responses.
 *  - No shell commands, paths, or scanner arguments accepted from client.
 *  - Date range is validated server-side before any provider call.
 *  - Only one active scan at a time (overlapping runs rejected).
 *  - Sanitized errors only — no internal paths, stack traces, or DB details.
 *
 * RESPONSE (success — scanner configured):
 *   201 { runId, rangeStart, rangeEnd, usedCursor, runStatus }
 *
 * RESPONSE (scanner not configured):
 *   503 { error: 'scanner_not_configured', message: '...' }
 *
 * RESPONSE (overlapping run):
 *   409 { error: 'scan_already_running', message: '...' }
 *
 * RESPONSE (invalid date range):
 *   400 { error: '<code>', message: '...' }
 */

import type { Request, Response } from 'express';
import { getAdapterCapability } from '../../../../lib/imageSafeguard/scannerAdapter.js';
import {
  resolveDateRange,
  isDateRangeError,
  hasActiveRun,
  createScanRun,
  markRunStarted,
  markRunCompleted,
  markRunFailed,
  advanceCursor,
} from '../../../../lib/imageSafeguard/scanRunService.js';
import { executeScan } from '../../../../lib/imageSafeguard/scannerAdapter.js';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  // requirePlatformOwner middleware applied in entry.ts — access already verified.
  try {
    // ── 1. Check scanner capability ──────────────────────────────────────────
    const cap = getAdapterCapability();
    if (!cap.configured) {
      return res.status(503).json({
        error: 'scanner_not_configured',
        message: 'Image scanning is not configured. See server logs for activation steps.',
      });
    }

    // ── 2. Resolve initiator identity ────────────────────────────────────────
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    const initiatedBy = session?.user?.id ?? 'unknown';

    // ── 3. Validate date range ───────────────────────────────────────────────
    const body = req.body as { since?: string; until?: string; useCursor?: boolean } | undefined;
    const rangeReq = {
      since: body?.since ?? null,
      until: body?.until ?? null,
      useCursor: Boolean(body?.useCursor),
    };

    const rangeResult = await resolveDateRange(rangeReq);
    if (isDateRangeError(rangeResult)) {
      return res.status(400).json({
        error: rangeResult.code,
        message: rangeResult.message,
      });
    }

    // ── 4. Check for overlapping run ─────────────────────────────────────────
    const active = await hasActiveRun();
    if (active) {
      return res.status(409).json({
        error: 'scan_already_running',
        message: 'A scan is already in progress. Wait for it to complete before starting another.',
      });
    }

    // ── 5. Create run record ─────────────────────────────────────────────────
    const runId = await createScanRun(initiatedBy, rangeResult);

    // ── 6. Audit: scan initiated ─────────────────────────────────────────────
    try {
      await db.execute(sql`
        INSERT INTO platform_activity_log
          (id, company_id, user_id, action, resource_type, resource_id, metadata, created_at)
        VALUES
          (${randomUUID()}, 0, ${initiatedBy}, 'safeguard_scan_initiated',
           'scan_run', ${runId},
           ${JSON.stringify({
             rangeStart: rangeResult.rangeStart.toISOString(),
             rangeEnd:   rangeResult.rangeEnd.toISOString(),
             usedCursor: rangeResult.usedCursor,
           })},
           ${new Date().toISOString()})
      `);
    } catch {
      // Audit failure must not block the scan
    }

    // ── 7. Execute scan asynchronously ───────────────────────────────────────
    // Fire-and-forget: the run record tracks progress.
    // The client polls GET /status or GET /runs for updates.
    void (async () => {
      try {
        await markRunStarted(runId);
        const outcome = await executeScan({
          runId,
          rangeStart: rangeResult.rangeStart,
          rangeEnd:   rangeResult.rangeEnd,
        });

        // Persist findings — only privacy_signal and failed (clear is counted only)
        for (const finding of outcome.results) {
          if (finding.result !== 'privacy_signal' && finding.result !== 'failed') continue;
          try {
            const findingId = randomUUID();
            await db.execute(sql`
              INSERT INTO image_safeguard_findings
                (id, scan_run_id, asset_id, company_id, user_id, result,
                 face_count, detector_name, detector_version, failure_code, scanned_at)
              VALUES
                (${findingId}, ${runId}, ${finding.assetId}, ${finding.companyId},
                 ${finding.userId ?? null}, ${finding.result}, ${finding.faceCount},
                 ${finding.detectorName}, ${finding.detectorVersion},
                 ${finding.failureCode ?? null}, ${new Date().toISOString()})
            `);
            // Store the R2 key in the server-side lookup table (never exposed via API)
            if (finding.r2Key) {
              await db.execute(sql`
                INSERT INTO image_safeguard_finding_keys (finding_id, r2_key, created_at)
                VALUES (${findingId}, ${finding.r2Key}, ${new Date().toISOString()})
              `).catch(() => undefined); // non-fatal — preview will return 404 if missing
            }
          } catch {
            // Individual finding insert failure — continue
          }
        }

        await markRunCompleted(
          runId,
          {
            imagesConsidered: outcome.imagesConsidered,
            imagesScanned:    outcome.imagesScanned,
            imagesSkipped:    outcome.imagesSkipped,
            imagesWithSignal: outcome.imagesWithSignal,
            imagesFailed:     outcome.imagesFailed,
          },
          outcome.detectorName,
          outcome.detectorVersion,
        );

        // Advance cursor ONLY on successful completion
        await advanceCursor(runId, new Date());

        // Audit: scan completed
        try {
          await db.execute(sql`
            INSERT INTO platform_activity_log
              (id, company_id, user_id, action, resource_type, resource_id, metadata, created_at)
            VALUES
              (${randomUUID()}, 0, ${initiatedBy}, 'safeguard_scan_completed',
               'scan_run', ${runId},
               ${JSON.stringify({
                 imagesConsidered: outcome.imagesConsidered,
                 imagesScanned:    outcome.imagesScanned,
                 imagesWithSignal: outcome.imagesWithSignal,
                 detectorName:     outcome.detectorName,
               })},
               ${new Date().toISOString()})
          `);
        } catch {
          // Audit failure must not affect run status
        }
      } catch (err: unknown) {
        const code =
          err instanceof Error && 'code' in err
            ? String((err as { code: string }).code)
            : 'scan_error';
        await markRunFailed(runId, code).catch(() => undefined);

        // Audit: scan failed (sanitized code only)
        try {
          await db.execute(sql`
            INSERT INTO platform_activity_log
              (id, company_id, user_id, action, resource_type, resource_id, metadata, created_at)
            VALUES
              (${randomUUID()}, 0, ${initiatedBy}, 'safeguard_scan_failed',
               'scan_run', ${runId},
               ${JSON.stringify({ errorCode: code })},
               ${new Date().toISOString()})
          `);
        } catch {
          // Audit failure must not propagate
        }
      }
    })();

    // ── 8. Return immediately with run ID ────────────────────────────────────
    return res.status(201).json({
      runId,
      rangeStart:  rangeResult.rangeStart.toISOString(),
      rangeEnd:    rangeResult.rangeEnd.toISOString(),
      usedCursor:  rangeResult.usedCursor,
      runStatus:   'pending',
    });
  } catch (outerErr: unknown) {
    // Distinguish a missing schema (table not yet created) from other failures.
    // Never put SQL text, stack traces, R2 keys, or secret names in the body.
    const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
    const isSchemaError =
      /table.*doesn'?t exist/i.test(msg) ||
      /no such table/i.test(msg) ||
      /relation.*does not exist/i.test(msg) ||
      /ER_NO_SUCH_TABLE/i.test(msg);
    // NOTE: do NOT add table-name substring patterns here.
    // Matching on a table name would misclassify lock timeouts, FK violations,
    // and connection errors that mention the table as schema_not_ready when
    // the tables actually exist.

    if (isSchemaError) {
      return res.status(503).json({
        error: 'schema_not_ready',
        message: 'Image Safeguard storage is not ready.',
      });
    }
    return res.status(500).json({
      error: 'scan_initiate_failed',
      message: 'Scan could not be started.',
    });
  }
}
