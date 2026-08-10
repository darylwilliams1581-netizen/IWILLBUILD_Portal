/**
 * POST /api/diag/run-recovery
 * TEMPORARY — no-auth recovery of job_card_photos rows with expired signed URLs.
 * Extracts R2 object key from the stored URL, verifies the object exists,
 * updates file_path to the permanent storageKey.
 * Does NOT delete any rows.
 * Remove before publishing.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSignedUrl } from '../../../storage/storage-service.js';

const BUCKET = 'job-card-photos';

function extractKeyFromSignedUrl(url: string, bucket: string): string | null {
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/^\//, '');
    if (path.startsWith(bucket + '/')) path = path.slice(bucket.length + 1);
    return path || null;
  } catch {
    return null;
  }
}

export default async function handler(_req: Request, res: Response) {
  const [allRows] = await db.execute(
    sql`SELECT id, job_card_id, file_path, file_name FROM job_card_photos WHERE file_path LIKE 'http%' ORDER BY id ASC`
  ) as unknown as [Array<{ id: number; job_card_id: number; file_path: string; file_name: string }>, unknown];

  const total = allRows?.length ?? 0;
  const results: Array<{
    id: number;
    status: 'recovered_via_media_assets' | 'recovered_via_key_extraction' | 'failed';
    oldFilePath: string;
    newStorageKey?: string;
    error?: string;
  }> = [];

  for (const row of (allRows ?? [])) {
    const fp = row.file_path;
    const extractedKey = extractKeyFromSignedUrl(fp, BUCKET);

    if (!extractedKey) {
      results.push({ id: row.id, status: 'failed', oldFilePath: fp, error: 'Could not extract key from URL' });
      continue;
    }

    // Check media_assets for a matching storage_key
    const [maRows] = await db.execute(
      sql`SELECT id, storage_key FROM media_assets WHERE storage_key = ${extractedKey} LIMIT 1`
    ) as unknown as [Array<{ id: number; storage_key: string }>, unknown];

    const matchedKey = maRows?.[0]?.storage_key ?? extractedKey;

    // Verify the R2 object is accessible
    try {
      await getSignedUrl(matchedKey, BUCKET, 60);
    } catch (verifyErr) {
      results.push({
        id: row.id, status: 'failed', oldFilePath: fp, newStorageKey: matchedKey,
        error: `R2 object not accessible: ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`,
      });
      continue;
    }

    // Update file_path to permanent storageKey
    try {
      await db.execute(sql`UPDATE job_card_photos SET file_path = ${matchedKey} WHERE id = ${row.id}`);
      results.push({
        id: row.id,
        status: maRows?.[0] ? 'recovered_via_media_assets' : 'recovered_via_key_extraction',
        oldFilePath: fp,
        newStorageKey: matchedKey,
      });
    } catch (updateErr) {
      results.push({
        id: row.id, status: 'failed', oldFilePath: fp, newStorageKey: matchedKey,
        error: `DB update failed: ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
      });
    }
  }

  const recovered = results.filter(r => r.status !== 'failed').length;
  const failed = results.filter(r => r.status === 'failed').length;

  return res.json({
    ok: true,
    summary: { totalExpiredRows: total, recovered, failed },
    details: results,
  });
}
