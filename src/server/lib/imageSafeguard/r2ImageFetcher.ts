/**
 * r2ImageFetcher.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B3 — Server-side R2 image fetcher for the Image Safeguard scanner.
 *
 * SECURITY RULES (enforced unconditionally):
 *  - All R2 operations are server-side only. No credentials, keys, or signed
 *    URLs are ever returned to the caller or to the browser.
 *  - Object keys are NEVER accepted from client input. The caller supplies
 *    only a key that was obtained from ListObjectsV2 server-side.
 *  - The key is validated against the hardcoded SCAN_PREFIX before any fetch.
 *  - No PutObject, DeleteObject, CopyObject, or CreateMultipartUpload calls.
 *  - Size is checked against MAX_BYTES before allocating a buffer.
 *  - Magic bytes are validated (JPEG/PNG/WebP only — no GIF, HEIC, or other).
 *  - Structural validation is applied after magic-byte check.
 *  - Pixel/dimension limits are enforced to prevent decompression bombs.
 *  - No image bytes, R2 keys, or signed URLs are returned in error responses.
 *
 * REUSE:
 *  - Uses the existing loadR2Config() from r2Config.ts (single config path).
 *  - Uses detectMimeFromMagic() from uploadPolicy.ts (shared validation).
 *  - Uses the existing AWS SDK lazy-import pattern from r2Provider.ts.
 *
 * SUPPORTED FORMATS (scan only):
 *  - JPEG (image/jpeg)
 *  - PNG  (image/png)
 *  - WebP (image/webp)
 *
 * GIF and HEIC are NOT scanned — they are skipped with reason 'unsupported_format'.
 */

import { Readable } from 'node:stream';
import { loadR2Config } from '../../storage/r2Config.js';
import { detectMimeFromMagic } from '../../storage/uploadPolicy.js';
import { SCAN_PREFIX } from './scannerAdapter.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum image size accepted for scanning. Matches IMAGE_POLICY.maxBytes. */
export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Maximum pixel count (width × height) to prevent decompression bombs.
 * 50 MP is generous for job-site photos; typical phone photos are 8–12 MP.
 */
export const MAX_PIXELS = 50_000_000;

/**
 * Maximum dimension (width or height) in pixels.
 * Prevents absurdly tall/wide images that could cause OOM in the classifier.
 */
export const MAX_DIMENSION = 16_000;

/** Minimum buffer size to be a valid image (smallest valid JPEG is ~107 bytes). */
const MIN_BYTES = 64;

/** Supported scan MIME types — GIF and HEIC are excluded from scanning. */
export const SCAN_SUPPORTED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// ── Result types ──────────────────────────────────────────────────────────────

export type FetchSkipReason =
  | 'oversized'
  | 'undersized'
  | 'unsupported_format'
  | 'magic_mismatch'
  | 'structural_invalid'
  | 'dimension_exceeded'
  | 'fetch_error'
  | 'prefix_violation';

export interface FetchSuccess {
  ok: true;
  buffer: Buffer;
  /** Validated MIME type from magic bytes — never from R2 metadata alone. */
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
}

export interface FetchSkipped {
  ok: false;
  reason: FetchSkipReason;
  /** Sanitized detail — no R2 keys, credentials, or internal paths. */
  detail: string;
}

export type FetchResult = FetchSuccess | FetchSkipped;

// ── AWS SDK lazy import (matches r2Provider.ts pattern) ───────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getS3Lazy(): Promise<any> {
  return import('@aws-sdk/client-s3');
}

// ── Key prefix enforcement ────────────────────────────────────────────────────

/**
 * Validates that an object key starts with the hardcoded scan prefix.
 * Rejects any key that could escape the job-photos namespace.
 *
 * The key is obtained from ListObjectsV2 server-side — this is a defence-in-depth
 * check to ensure no code path can accidentally fetch outside the scan scope.
 */
export function assertScanPrefix(key: string): void {
  const prefix = `${SCAN_PREFIX}`;
  if (!key.startsWith(prefix)) {
    throw Object.assign(
      new Error(`[r2ImageFetcher] Key does not start with scan prefix. Rejected.`),
      { code: 'prefix_violation' },
    );
  }
  // Reject path traversal sequences
  if (key.includes('..') || key.includes('//') || key.includes('\\')) {
    throw Object.assign(
      new Error(`[r2ImageFetcher] Key contains path traversal sequence. Rejected.`),
      { code: 'prefix_violation' },
    );
  }
}

// ── Structural validation ─────────────────────────────────────────────────────

/**
 * Validates basic structural integrity of an image buffer.
 *
 * JPEG: checks SOI (FF D8) and EOI (FF D9) markers.
 * PNG:  checks 8-byte signature and IHDR chunk presence.
 * WebP: checks RIFF header, WEBP marker, and minimum chunk structure.
 *
 * Does NOT decode the full image — that is the classifier's job.
 * Does NOT allocate sizes declared by untrusted content (no width/height from headers).
 *
 * Returns { ok: true } or { ok: false, reason: string }.
 */
export function validateImageStructure(
  buffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
): { ok: true } | { ok: false; reason: string } {
  if (buffer.length < MIN_BYTES) {
    return { ok: false, reason: 'buffer_too_small' };
  }

  switch (mimeType) {
    case 'image/jpeg': {
      // SOI marker: FF D8
      if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
        return { ok: false, reason: 'jpeg_missing_soi' };
      }
      // EOI marker: FF D9 — must appear somewhere in the last 2 bytes
      // (some encoders pad after EOI, so we check the last 16 bytes)
      const tail = buffer.slice(Math.max(0, buffer.length - 16));
      let hasEoi = false;
      for (let i = 0; i < tail.length - 1; i++) {
        if (tail[i] === 0xFF && tail[i + 1] === 0xD9) { hasEoi = true; break; }
      }
      if (!hasEoi) return { ok: false, reason: 'jpeg_missing_eoi' };
      // Minimum JPEG segment: SOI + at least one marker segment
      if (buffer.length < 10) return { ok: false, reason: 'jpeg_too_short' };
      return { ok: true };
    }

    case 'image/png': {
      // PNG signature: 89 50 4E 47 0D 0A 1A 0A
      const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
      if (buffer.length < 8) return { ok: false, reason: 'png_too_short' };
      for (let i = 0; i < 8; i++) {
        if (buffer[i] !== PNG_SIG[i]) return { ok: false, reason: 'png_bad_signature' };
      }
      // IHDR chunk must follow immediately: 4-byte length + 'IHDR'
      if (buffer.length < 24) return { ok: false, reason: 'png_missing_ihdr' };
      const ihdrTag = buffer.slice(12, 16).toString('ascii');
      if (ihdrTag !== 'IHDR') return { ok: false, reason: 'png_missing_ihdr' };
      // IHDR length must be exactly 13
      const ihdrLen = buffer.readUInt32BE(8);
      if (ihdrLen !== 13) return { ok: false, reason: 'png_bad_ihdr_length' };
      return { ok: true };
    }

    case 'image/webp': {
      // RIFF header: 52 49 46 46
      if (buffer.length < 12) return { ok: false, reason: 'webp_too_short' };
      if (buffer[0] !== 0x52 || buffer[1] !== 0x49 || buffer[2] !== 0x46 || buffer[3] !== 0x46) {
        return { ok: false, reason: 'webp_bad_riff' };
      }
      // WEBP marker at bytes 8-11: 57 45 42 50
      if (buffer[8] !== 0x57 || buffer[9] !== 0x45 || buffer[10] !== 0x42 || buffer[11] !== 0x50) {
        return { ok: false, reason: 'webp_bad_marker' };
      }
      // RIFF file size (bytes 4-7) must not exceed buffer length
      // NOTE: we read this as a sanity check only — we do NOT allocate based on it.
      const riffSize = buffer.readUInt32LE(4);
      if (riffSize + 8 > buffer.length + 1024) {
        // Allow 1 KB tolerance for trailing data
        return { ok: false, reason: 'webp_size_mismatch' };
      }
      return { ok: true };
    }
  }
}

/**
 * Extracts image dimensions from a buffer WITHOUT decoding the full image.
 * Returns null if dimensions cannot be determined safely.
 *
 * SECURITY: reads only fixed-offset header fields — never allocates based on
 * declared dimensions. Caller enforces MAX_PIXELS and MAX_DIMENSION limits.
 */
export function extractDimensions(
  buffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
): { width: number; height: number } | null {
  try {
    switch (mimeType) {
      case 'image/png': {
        // IHDR: width at bytes 16-19, height at bytes 20-23 (big-endian)
        if (buffer.length < 24) return null;
        const width  = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }

      case 'image/jpeg': {
        // Scan for SOF markers (FF C0, FF C1, FF C2) to find width/height
        // SOF0/SOF1/SOF2: marker(2) + length(2) + precision(1) + height(2) + width(2)
        let i = 2; // skip SOI
        while (i < buffer.length - 8) {
          if (buffer[i] !== 0xFF) break;
          const marker = buffer[i + 1];
          if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
            // SOF marker found
            const height = buffer.readUInt16BE(i + 5);
            const width  = buffer.readUInt16BE(i + 7);
            return { width, height };
          }
          // Skip to next marker
          if (i + 3 >= buffer.length) break;
          const segLen = buffer.readUInt16BE(i + 2);
          if (segLen < 2) break;
          i += 2 + segLen;
        }
        return null;
      }

      case 'image/webp': {
        // VP8 (lossy): chunk type at 12-15, dimensions at 26-29
        // VP8L (lossless): chunk type at 12-15, dimensions encoded differently
        // VP8X (extended): chunk type at 12-15, canvas width/height at 24-29
        if (buffer.length < 30) return null;
        const chunkType = buffer.slice(12, 16).toString('ascii');
        if (chunkType === 'VP8 ' && buffer.length >= 30) {
          // VP8 bitstream: skip 3 bytes frame tag, then width/height
          const w = (buffer.readUInt16LE(26) & 0x3FFF);
          const h = (buffer.readUInt16LE(28) & 0x3FFF);
          return { width: w, height: h };
        }
        if (chunkType === 'VP8X' && buffer.length >= 30) {
          // VP8X: canvas width-1 (24-bit LE) at offset 24, height-1 at offset 27
          const w = (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1;
          const h = (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1;
          return { width: w, height: h };
        }
        return null;
      }
    }
  } catch {
    return null;
  }
}

// ── Core fetch function ───────────────────────────────────────────────────────

/**
 * Fetches a single image from R2 and validates it for scanner submission.
 *
 * SECURITY:
 *  - key must start with SCAN_PREFIX_NAMESPACE — enforced by assertScanPrefix().
 *  - Uses GetObjectCommand only — no writes.
 *  - Returns buffer + validated MIME only — no R2 key, no signed URL.
 *  - Size checked against MAX_BYTES before buffer allocation.
 *  - Magic bytes validated (JPEG/PNG/WebP only).
 *  - Structural integrity validated.
 *  - Pixel dimensions validated against MAX_PIXELS and MAX_DIMENSION.
 *
 * @param key  Full R2 object key — must start with SCAN_PREFIX_NAMESPACE.
 *             Obtained from ListObjectsV2 server-side, never from client.
 */
export async function fetchImageForScan(key: string): Promise<FetchResult> {
  // ── 1. Prefix enforcement ──────────────────────────────────────────────────
  try {
    assertScanPrefix(key);
  } catch {
    return { ok: false, reason: 'prefix_violation', detail: 'Key rejected by prefix guard.' };
  }

  // ── 2. Load R2 config (reuses existing loadR2Config — single config path) ──
  let cfg: ReturnType<typeof loadR2Config>;
  try {
    cfg = loadR2Config();
  } catch {
    return { ok: false, reason: 'fetch_error', detail: 'R2 configuration unavailable.' };
  }

  // ── 3. Fetch from R2 using GetObjectCommand ────────────────────────────────
  let buffer: Buffer;
  try {
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
      Key: key,
    }));

    // ── 3a. Size check from Content-Length before streaming ──────────────────
    const contentLength = response.ContentLength ?? 0;
    if (contentLength > MAX_BYTES) {
      return {
        ok: false,
        reason: 'oversized',
        detail: `Object exceeds MAX_BYTES (${MAX_BYTES}).`,
      };
    }

    // ── 3b. Stream to buffer ─────────────────────────────────────────────────
    if (!response.Body) {
      return { ok: false, reason: 'fetch_error', detail: 'Empty response body.' };
    }

    const stream = response.Body as unknown as Readable;
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BYTES) {
          stream.destroy();
          reject(Object.assign(new Error('oversized'), { code: 'oversized' }));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    buffer = Buffer.concat(chunks);
  } catch (err: unknown) {
    const code = err instanceof Error && 'code' in err ? String((err as { code: string }).code) : '';
    if (code === 'oversized') {
      return { ok: false, reason: 'oversized', detail: `Object exceeds MAX_BYTES (${MAX_BYTES}).` };
    }
    // Sanitized error — no key, no credentials
    return { ok: false, reason: 'fetch_error', detail: 'R2 fetch failed.' };
  }

  // ── 4. Minimum size check ──────────────────────────────────────────────────
  if (buffer.length < MIN_BYTES) {
    return { ok: false, reason: 'undersized', detail: 'Buffer too small to be a valid image.' };
  }

  // ── 5. Magic-byte detection (reuses detectMimeFromMagic from uploadPolicy) ─
  const detectedMime = detectMimeFromMagic(buffer);
  if (!detectedMime || !SCAN_SUPPORTED_MIMES.has(detectedMime)) {
    return {
      ok: false,
      reason: 'unsupported_format',
      detail: `Detected MIME not supported for scanning.`,
    };
  }

  const validatedMime = detectedMime as 'image/jpeg' | 'image/png' | 'image/webp';

  // ── 6. Structural validation ───────────────────────────────────────────────
  const structural = validateImageStructure(buffer, validatedMime);
  if (!structural.ok) {
    return {
      ok: false,
      reason: 'structural_invalid',
      detail: `Structural validation failed: ${structural.reason}.`,
    };
  }

  // ── 7. Dimension validation ────────────────────────────────────────────────
  // We extract dimensions from header fields only — never allocate based on them.
  const dims = extractDimensions(buffer, validatedMime);
  if (dims !== null) {
    if (dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
      return {
        ok: false,
        reason: 'dimension_exceeded',
        detail: `Image dimension exceeds MAX_DIMENSION (${MAX_DIMENSION}px).`,
      };
    }
    if (dims.width * dims.height > MAX_PIXELS) {
      return {
        ok: false,
        reason: 'dimension_exceeded',
        detail: `Image pixel count exceeds MAX_PIXELS (${MAX_PIXELS}).`,
      };
    }
  }
  // If dimensions cannot be extracted, we proceed — the classifier enforces its own limits.

  return {
    ok: true,
    buffer,
    mimeType: validatedMime,
    sizeBytes: buffer.length,
  };
}
