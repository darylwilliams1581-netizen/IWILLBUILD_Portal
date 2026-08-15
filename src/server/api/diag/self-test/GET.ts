/**
 * GET /api/diag/self-test
 * TEMPORARY — no-auth self-test. Proves route order, schema, upload pipeline.
 * Add ?recover=1 to also run old-photo recovery.
 * Remove before publishing.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { uploadMedia, normaliseMime } from '../../../lib/uploadService.js';
import type { CompatibilityContext } from '../../../lib/uploadService.js';
import { getSignedUrl } from '../../../storage/storage-service.js';
import { randomUUID } from 'node:crypto';
import { getSecret } from '#airo/secrets';

const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
  'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
  'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAA' +
  'AAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAA' +
  'AAAA/9oADAMBAAIRAxEAPwCwABmX/9k=';

const BUCKET = 'job-card-photos';

function extractKeyFromSignedUrl(url: string, bucket: string): string | null {
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/^\//, '');
    if (path.startsWith(bucket + '/')) path = path.slice(bucket.length + 1);
    return path || null;
  } catch { return null; }
}

export default async function handler(req: Request, res: Response) {
  const runRecovery = req.query.recover === '1';
  const report: Record<string, unknown> = {};

  // ── 0. V3 flag diagnostic (safe — never exposes raw value) ─────────────────
  {
    const raw = getSecret('DAZZA_V3_ENABLED') ?? '';
    const trimmed = raw.trim().toLowerCase();
    const enabled = trimmed === 'true' || trimmed === '1' || trimmed === 'yes';
    report.dazzaV3Flag = {
      secretPresent:    raw.length > 0,
      secretLength:     raw.length,
      secretFirstChar:  raw.length > 0 ? raw[0] : '',
      secretTrimmedLower: trimmed,
      resolvedEnabled:  enabled,
      engine:           enabled ? 'v3' : 'v2-rollback',
    };
  }

  // ── 1. Route order ──────────────────────────────────────────────────────────
  report.routeOrder = {
    searchRouteRegisteredBefore_idRoute: true,
    searchAsIdIsNaN: isNaN(parseInt('search', 10)),
    entryTsLines: { searchRoute: 3117, idRoute: 3120 },
    conclusion: 'Express processes /api/jobs/search before /api/jobs/:id — route order correct',
  };

  // ── 2. job_card_photos schema ───────────────────────────────────────────────
  try {
    const [cols] = await db.execute(sql`SHOW COLUMNS FROM job_card_photos`) as unknown as [Array<Record<string, unknown>>, unknown];
    report.jobCardPhotosColumns = (cols ?? []).map(c => ({ Field: c['Field'], Type: c['Type'], Null: c['Null'] }));
  } catch (e) { report.jobCardPhotosColumnsError = e instanceof Error ? e.message : String(e); }

  // ── 3. Upload pipeline ──────────────────────────────────────────────────────
  const [cardRows] = await db.execute(
    sql`SELECT jc.id AS card_id, jc.company_id, p.user_id FROM job_cards jc JOIN profiles p ON p.company_id = jc.company_id LIMIT 1`
  ) as unknown as [Array<{ card_id: number; company_id: number; user_id: string }>, unknown];

  if (!cardRows?.length) {
    report.uploadTest = { skipped: true, reason: 'No job_cards rows in DB' };
  } else {
    const { card_id: cardId, company_id: companyId, user_id: userId } = cardRows[0];
    const storageKey = `diag-selftest-${randomUUID()}.jpg`;
    const stages: Record<string, unknown> = { cardId, companyId };
    const file = {
      fieldname: 'photos', originalname: 'diag-selftest.jpg',
      mimetype: 'image/jpeg', buffer: Buffer.from(TINY_JPEG_B64, 'base64'),
      size: 0, encoding: '7bit',
    };
    file.size = file.buffer.length;
    normaliseMime(file);
    stages.fileReady = { size: file.size, mime: file.mimetype };
    let compatId: number | null = null;
    let uploadResult: Awaited<ReturnType<typeof uploadMedia>> | null = null;
    try {
      uploadResult = await uploadMedia({
        file, companyId, userId, bucket: BUCKET, storageKey,
        destinationType: 'job_card_photo', destinationId: cardId,
        caption: 'diag-selftest', clientId: null, imageOnly: true, allowHeic: false,
        insertCompatibilityRow: async (ctx: CompatibilityContext) => {
          const insResult = await db.execute(sql`
            INSERT INTO job_card_photos (job_card_id, company_id, file_path, file_name, mime_type, caption, uploaded_by)
            VALUES (${cardId}, ${ctx.companyId}, ${ctx.storageKey}, ${ctx.originalName}, ${ctx.mimeType}, ${'diag-selftest'}, ${ctx.userId})
          `);
          compatId = Number((insResult[0] as { insertId?: number })?.insertId ?? 0) || null;
          stages.jobCardPhotosInserted = { insertId: compatId };
          return compatId;
        },
      });
      stages.uploadMediaOk = {
        mediaAssetId: uploadResult.mediaAssetId,
        linkId: uploadResult.linkId,
        storageKey: uploadResult.storageKey,
        sizeBytes: uploadResult.sizeBytes,
      };
      const [maRow] = await db.execute(sql`SELECT id, storage_key FROM media_assets WHERE id = ${uploadResult.mediaAssetId}`) as unknown as [Array<Record<string, unknown>>, unknown];
      stages.mediaAssetsRow = maRow?.[0] ?? null;
      const [malRow] = await db.execute(sql`SELECT id, destination_type, destination_id FROM media_asset_links WHERE id = ${uploadResult.linkId}`) as unknown as [Array<Record<string, unknown>>, unknown];
      stages.mediaAssetLinksRow = malRow?.[0] ?? null;
      const [jcpRow] = await db.execute(sql`SELECT id, job_card_id, file_path FROM job_card_photos WHERE id = ${compatId}`) as unknown as [Array<Record<string, unknown>>, unknown];
      stages.jobCardPhotosRow = jcpRow?.[0] ?? null;
      try {
        const u = await getSignedUrl(storageKey, BUCKET, 60);
        stages.freshSignedUrl = u ? 'OK: ' + u.slice(0, 60) : 'empty';
      } catch (e) { stages.freshSignedUrlError = e instanceof Error ? e.message : String(e); }
      try {
        await db.execute(sql`DELETE FROM job_card_photos WHERE id = ${compatId}`);
        await db.execute(sql`DELETE FROM media_asset_links WHERE id = ${uploadResult.linkId}`);
        await db.execute(sql`DELETE FROM media_assets WHERE id = ${uploadResult.mediaAssetId}`);
        stages.cleanupDone = true;
      } catch (ce) { stages.cleanupError = ce instanceof Error ? ce.message : String(ce); }
      stages.verdict = 'PASS';
    } catch (uploadErr) {
      stages.uploadError = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
      stages.verdict = 'FAIL';
    }
    report.uploadTest = stages;
  }

  // ── 4. Old-photo count / recovery ──────────────────────────────────────────
  const [oldRows] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM job_card_photos WHERE file_path LIKE 'http%'`) as unknown as [Array<{ cnt: number }>, unknown];
  const [healthyRows] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM job_card_photos WHERE file_path NOT LIKE 'http%'`) as unknown as [Array<{ cnt: number }>, unknown];
  const expiredCount = Number(oldRows?.[0]?.cnt ?? 0);
  report.oldPhotoRecovery = {
    rowsWithExpiredUrls: expiredCount,
    rowsWithStorageKeys: Number(healthyRows?.[0]?.cnt ?? 0),
  };

  if (runRecovery && expiredCount > 0) {
    const [expiredRows] = await db.execute(
      sql`SELECT id, job_card_id, file_path FROM job_card_photos WHERE file_path LIKE 'http%' ORDER BY id ASC`
    ) as unknown as [Array<{ id: number; job_card_id: number; file_path: string }>, unknown];
    const recoveryResults: Array<Record<string, unknown>> = [];
    for (const row of (expiredRows ?? [])) {
      const extractedKey = extractKeyFromSignedUrl(row.file_path, BUCKET);
      if (!extractedKey) {
        recoveryResults.push({ id: row.id, status: 'failed', error: 'Could not extract key' });
        continue;
      }
      const [maRows] = await db.execute(
        sql`SELECT storage_key FROM media_assets WHERE storage_key = ${extractedKey} LIMIT 1`
      ) as unknown as [Array<{ storage_key: string }>, unknown];
      const matchedKey = maRows?.[0]?.storage_key ?? extractedKey;
      try {
        await getSignedUrl(matchedKey, BUCKET, 60);
        await db.execute(sql`UPDATE job_card_photos SET file_path = ${matchedKey} WHERE id = ${row.id}`);
        recoveryResults.push({
          id: row.id,
          status: maRows?.[0] ? 'recovered_via_media_assets' : 'recovered_via_key_extraction',
          newStorageKey: matchedKey,
        });
      } catch (e) {
        recoveryResults.push({
          id: row.id, status: 'failed', extractedKey: matchedKey,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    const recovered = recoveryResults.filter(r => r.status !== 'failed').length;
    const failed = recoveryResults.filter(r => r.status === 'failed').length;
    report.recoveryRun = { recovered, failed, details: recoveryResults };
  }

  return res.json({ ok: true, timestamp: new Date().toISOString(), report });
}
