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
 *  - Finding must have a corresponding key in image_safeguard_finding_keys.
 *  - The key is scoped through finding_id — no client-supplied key accepted.
 *  - Prefix guard (SCAN_PREFIX) applied before any R2 fetch (defence-in-depth).
 *  - Content-Type is derived from validated magic bytes — never from DB metadata.
 *  - X-Content-Type-Options: nosniff always set.
 *  - Cache-Control: private, no-store (sensitive content — never cached).
 *  - No R2 key, signed URL, or object metadata returned.
 *  - Every preview access is audited (exposes potentially sensitive content).
 *  - No image bytes stored in the audit log.
 *  - Uses scanGetObject() from r2Provider — GetObjectCommand only, no writes.
 *
 * TENANT ISOLATION:
 *  - The platform owner can view findings from any company.
 *  - Cross-company access is intentional (platform owner reviews all findings).
 *  - Unknown finding IDs return 404 (no information leakage about existence).
 *  - Missing key records return 404 (finding exists but preview unavailable).
 *
 * RESPONSE:
 *  200  image/jpeg | image/png | image/webp  (streamed bytes)
 *  400  { error: 'invalid_finding_id' }
 *  404  { error: 'finding_not_found' }
 *  500  { error: 'preview_unavailable' }
 *
 * IMPLEMENTATION NOTE (CP12B3):
 * The asset_id stored by r2Scanner is 'key_hash:{hash}'. To serve the preview
 * we need the original key. We store the key in a separate server-side lookup
 * table (image_safeguard_finding_keys) that is never exposed through any API.
 * The preview endpoint looks up the key there, scoped by finding_id only
 * (the platform owner has access to all findings by design).
 *
 * WHY A SEPARATE TABLE (not a column on image_safeguard_findings)?
 *  - image_safeguard_findings is returned by the runs/findings list APIs.
 *    Adding r2_key there would risk accidental exposure in a future SELECT *.
 *  - A separate table with no API route makes the isolation explicit and
 *    auditable — the only code that reads it is this preview endpoint.
 *  - ON DELETE CASCADE ensures no orphaned key records when a finding is deleted.
 */

import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { detectMimeFromMagic } from '../../../../../storage/uploadPolicy.js';
import { scanGetObject } from '../../../../../storage/providers/r2Provider.js';
import { SCAN_PREFIX } from '../../../../../lib/imageSafeguard/scannerAdapter.js';
import { MAX_BYTES } from '../../../../../lib/imageSafeguard/r2ImageFetcher.js';

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  // requirePlatformOwner middleware applied in entry.ts — access already verified.
  try {
    const { findingId } = req.params as { findingId?: string };

    // ── 1. Validate finding ID format ────────────────────────────────────────
    if (!findingId || !/^[0-9a-f-]{36}$/.test(findingId)) {
      return res.status(400).json({ error: 'invalid_finding_id' });
    }

    // ── 2. Look up finding + key ─────────────────────────────────────────────
    // Join image_safeguard_findings with image_safeguard_finding_keys.
    // The key table is never exposed through any API — only used here.
    // Scoped by finding_id (platform owner has access to all findings by design).
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

    // Unknown finding ID → 404 (no information leakage)
    if (!row) {
      return res.status(404).json({ error: 'finding_not_found' });
    }

    // Finding exists but no key record → 404 (preview unavailable)
    if (!row.r2_key) {
      return res.status(404).json({ error: 'finding_not_found' });
    }

    // ── 3. Prefix enforcement — defence in depth ─────────────────────────────
    // The key was stored by the scanner which already enforces SCAN_PREFIX,
    // but we re-check here to ensure no code path can serve outside the scan scope.
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

    // ── 5. Fetch from R2 using scanGetObject (reuses existing r2Provider) ────
    // scanGetObject uses GetObjectCommand only — no writes.
    // MAX_BYTES enforced to prevent buffer exhaustion.
    let buffer: Buffer;
    let detectedMime: string | null;

    try {
      const result = await scanGetObject(row.r2_key, MAX_BYTES);
      buffer = result.buffer;

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
