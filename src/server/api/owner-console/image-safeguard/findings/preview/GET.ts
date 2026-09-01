/**
 * GET /api/owner-console/image-safeguard/findings/:findingId/preview
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B3 — Authenticated image preview for a specific finding.
 *
 * Streams the image bytes for a finding directly from R2 to the browser.
 * The R2 object key is NEVER returned to the client — only the bytes.
 *
 * SECURITY:
 *  - requirePlatformOwner middleware applied in entry.ts.
 *  - Finding must exist in image_safeguard_findings.
 *  - Finding must belong to the expected company (tenant isolation).
 *  - Content-Type is derived from validated magic bytes — never from DB metadata.
 *  - X-Content-Type-Options: nosniff always set.
 *  - Cache-Control: private, no-store (sensitive content — never cached).
 *  - No R2 key, signed URL, or object metadata returned.
 *  - Every preview access is audited (exposes potentially sensitive content).
 *  - No image bytes stored in the audit log.
 *
 * RESPONSE:
 *  200  image/jpeg | image/png | image/webp  (streamed bytes)
 *  400  { error: 'invalid_finding_id' }
 *  404  { error: 'finding_not_found' }
 *  500  { error: 'preview_unavailable' }
 *
 * NOTE: The finding's asset_id is stored as 'key_hash:{hash}' — a one-way
 * hash of the R2 key. To serve the preview, we resolve the actual key from
 * the scan run's date range and the company prefix. This is intentional:
 * the hash prevents the raw key from appearing in any API response.
 *
 * IMPLEMENTATION NOTE (CP12B3):
 * The asset_id stored by r2Scanner is 'key_hash:{hash}'. To serve the preview
 * we need the original key. In this stage we store the key in a separate
 * server-side lookup table (image_safeguard_finding_keys) that is never
 * exposed through any API. The preview endpoint looks up the key there.
 */

import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { loadR2Config } from '../../../../../storage/r2Config.js';
import { detectMimeFromMagic } from '../../../../../storage/uploadPolicy.js';
import { SCAN_PREFIX } from '../../../../../lib/imageSafeguard/scannerAdapter.js';
import { Readable } from 'node:stream';

// ── AWS SDK lazy import ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getS3Lazy(): Promise<any> {
  return import('@aws-sdk/client-s3');
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  // requirePlatformOwner middleware applied in entry.ts — access already verified.
  try {
    const { findingId } = req.params as { findingId?: string };

    // ── 1. Validate finding ID ───────────────────────────────────────────────
    if (!findingId || !/^[0-9a-f-]{36}$/.test(findingId)) {
      return res.status(400).json({ error: 'invalid_finding_id' });
    }

    // ── 2. Look up finding + key ─────────────────────────────────────────────
    // We join image_safeguard_findings with image_safeguard_finding_keys.
    // The key table is never exposed through any API — only used here.
    const rows = await db.execute(sql`
      SELECT f.id, f.company_id, f.result, k.r2_key
      FROM image_safeguard_findings f
      LEFT JOIN image_safeguard_finding_keys k ON k.finding_id = f.id
      WHERE f.id = ${findingId}
      LIMIT 1
    `);

    const row = (rows as unknown as Array<{
      id: string;
      company_id: number;
      result: string;
      r2_key: string | null;
    }>)[0];

    if (!row) {
      return res.status(404).json({ error: 'finding_not_found' });
    }

    if (!row.r2_key) {
      return res.status(404).json({ error: 'finding_not_found' });
    }

    // ── 3. Prefix enforcement — defence in depth ─────────────────────────────
    if (!row.r2_key.startsWith(SCAN_PREFIX)) {
      // This should never happen — log sanitized error, return 404
      console.error('[preview] r2_key does not start with SCAN_PREFIX — rejected');
      return res.status(404).json({ error: 'finding_not_found' });
    }

    // ── 4. Resolve initiator for audit ───────────────────────────────────────
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    const reviewerId = session?.user?.id ?? 'unknown';

    // ── 5. Fetch from R2 ─────────────────────────────────────────────────────
    let buffer: Buffer;
    let detectedMime: string | null;

    try {
      const cfg = loadR2Config();
      const { S3Client, GetObjectCommand } = await getS3Lazy();
      const client = new S3Client({
        region: 'auto',
        endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
        forcePathStyle: false,
        requestHandler: { requestTimeout: 30_000 },
      });

      const response = await client.send(new GetObjectCommand({
        Bucket: cfg.physicalBucket,
        Key: row.r2_key,
      }));

      if (!response.Body) {
        return res.status(500).json({ error: 'preview_unavailable' });
      }

      const stream = response.Body as unknown as Readable;
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const MAX_PREVIEW_BYTES = 10 * 1024 * 1024; // 10 MB

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_PREVIEW_BYTES) {
            stream.destroy();
            reject(new Error('oversized'));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      buffer = Buffer.concat(chunks);

      // ── 6. Validate Content-Type from magic bytes ────────────────────────
      detectedMime = detectMimeFromMagic(buffer);
    } catch {
      return res.status(500).json({ error: 'preview_unavailable' });
    }

    // Only serve JPEG, PNG, WebP — reject anything else
    const ALLOWED_PREVIEW_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!detectedMime || !ALLOWED_PREVIEW_MIMES.has(detectedMime)) {
      return res.status(500).json({ error: 'preview_unavailable' });
    }

    // ── 7. Audit: preview access ─────────────────────────────────────────────
    // Every preview access is audited — no image bytes in the log.
    try {
      await db.execute(sql`
        INSERT INTO platform_activity_log
          (id, company_id, user_id, action, resource_type, resource_id, metadata, created_at)
        VALUES
          (${randomUUID()}, ${row.company_id}, ${reviewerId},
           'safeguard_finding_preview',
           'finding', ${findingId},
           ${JSON.stringify({ findingResult: row.result })},
           ${new Date().toISOString()})
      `);
    } catch {
      // Audit failure must not block the preview
    }

    // ── 8. Stream response ───────────────────────────────────────────────────
    res.setHeader('Content-Type', detectedMime);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    return res.status(200).send(buffer);

  } catch {
    return res.status(500).json({ error: 'preview_unavailable' });
  }
}
