/**
 * POST /api/diag/recover-old-photos
 * TEMPORARY — recovers job_card_photos rows where file_path is an expired signed URL.
 *
 * Strategy per row:
 *  1. Skip rows where file_path does NOT start with "http" (already a storageKey — healthy).
 *  2. Extract the R2 object key from the signed URL path component.
 *  3. Look up media_assets.storage_key for a match.
 *  4. If found: update file_path → storageKey (permanent fix).
 *  5. If not found: attempt to generate a signed URL from the extracted key directly.
 *     Update file_path → extracted key so future GETs can regenerate it.
 *  6. Report recovered / failed counts. Does NOT delete any rows.
 *
 * Remove before publishing.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getSignedUrl } from '../../../storage/storage-service.js';

const BUCKET = 'job-card-photos';

/**
 * Extract the R2 object key from a signed URL.
 * R2 signed URLs look like:
 *   https://<account>.r2.cloudflarestorage.com/<bucket>/<key>?X-Amz-...
 * or with a public base:
 *   https://<custom-domain>/<key>?...
 * We take the last path segment(s) after stripping the bucket prefix.
 */
function extractKeyFromSignedUrl(url: string, bucket: string): string | null {
  try {
    const u = new URL(url);
    // pathname looks like /<bucket>/<key> or just /<key>
    let path = u.pathname.replace(/^\//, ''); // strip leading slash
    // If path starts with the bucket name, strip it
    if (path.startsWith(bucket + '/')) {
      path = path.slice(bucket.length + 1);
    }
    return path || null;
  } catch {
    return null;
  }
}

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
  }
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

  const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
  if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

  // Fetch all job_card_photos for this company
  const [allRows] = await db.execute(
    sql`SELECT id, job_card_id, file_path, file_name FROM job_card_photos WHERE company_id = ${profile.companyId} ORDER BY id ASC`
  ) as unknown as [Array<{ id: number; job_card_id: number; file_path: string; file_name: string }>, unknown];

  const total = allRows?.length ?? 0;
  const results: Array<{
    id: number;
    job_card_id: number;
    status: 'healthy' | 'recovered_via_media_assets' | 'recovered_via_key_extraction' | 'failed';
    oldFilePath?: string;
    newStorageKey?: string;
    error?: string;
  }> = [];

  for (const row of (allRows ?? [])) {
    const fp = row.file_path ?? '';

    // Already a storageKey (not a URL) — healthy, skip
    if (!fp.startsWith('http')) {
      results.push({ id: row.id, job_card_id: row.job_card_id, status: 'healthy' });
      continue;
    }

    const extractedKey = extractKeyFromSignedUrl(fp, BUCKET);

    if (!extractedKey) {
      results.push({ id: row.id, job_card_id: row.job_card_id, status: 'failed', oldFilePath: fp, error: 'Could not extract key from URL' });
      continue;
    }

    // Try to find matching media_assets row
    const [maRows] = await db.execute(
      sql`SELECT id, storage_key FROM media_assets WHERE storage_key = ${extractedKey} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; storage_key: string }>, unknown];

    const matchedKey = maRows?.[0]?.storage_key ?? extractedKey;

    // Verify the object exists by attempting a signed URL
    try {
      await getSignedUrl(matchedKey, BUCKET, 60); // 60s just for verification
    } catch (verifyErr) {
      results.push({
        id: row.id, job_card_id: row.job_card_id, status: 'failed',
        oldFilePath: fp, newStorageKey: matchedKey,
        error: `Object not accessible: ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`,
      });
      continue;
    }

    // Update file_path to the permanent storageKey
    try {
      await db.execute(
        sql`UPDATE job_card_photos SET file_path = ${matchedKey} WHERE id = ${row.id}`
      );
      results.push({
        id: row.id, job_card_id: row.job_card_id,
        status: maRows?.[0] ? 'recovered_via_media_assets' : 'recovered_via_key_extraction',
        oldFilePath: fp,
        newStorageKey: matchedKey,
      });
    } catch (updateErr) {
      results.push({
        id: row.id, job_card_id: row.job_card_id, status: 'failed',
        oldFilePath: fp, newStorageKey: matchedKey,
        error: `DB update failed: ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
      });
    }
  }

  const healthy = results.filter(r => r.status === 'healthy').length;
  const recoveredViaMA = results.filter(r => r.status === 'recovered_via_media_assets').length;
  const recoveredViaKey = results.filter(r => r.status === 'recovered_via_key_extraction').length;
  const failed = results.filter(r => r.status === 'failed').length;

  return res.json({
    ok: true,
    summary: { total, healthy, recoveredViaMediaAssets: recoveredViaMA, recoveredViaKeyExtraction: recoveredViaKey, failed },
    details: results,
  });
}
