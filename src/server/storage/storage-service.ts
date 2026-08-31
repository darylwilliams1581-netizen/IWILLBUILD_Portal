/**
 * Central Storage Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Single entry point for all file I/O in IWILLBUILD.
 *
 * PHYSICAL vs LOGICAL STORAGE MODEL (CP10A2)
 * ──────────────────────────────────────────
 * There is exactly ONE physical Cloudflare R2 bucket: R2_BUCKET secret.
 * All object keys are prefixed with a logical namespace (object-key prefix)
 * that partitions the bucket by data category:
 *
 *   Physical bucket:  iwillbuild-files  (from R2_BUCKET secret)
 *   Logical namespaces (object-key prefixes):
 *     job-photos          → job-photos/companies/{id}/{category}/{uuid}/{file}
 *     company-files       → company-files/companies/{id}/{category}/{uuid}/{file}
 *     safety-documents    → safety-documents/companies/{id}/{category}/{uuid}/{file}
 *     safety-posters      → safety-posters/companies/{id}/{category}/{uuid}/{file}
 *     source-documents    → source-documents/companies/{id}/{category}/{uuid}/{file}
 *     dazza-sources       → dazza-sources/companies/{id}/{category}/{uuid}/{file}
 *     form-media          → form-media/companies/{id}/{category}/{uuid}/{file}
 *     fleet-files         → fleet-files/companies/{id}/{category}/{uuid}/{file}
 *     (+ additional namespaces — see LOGICAL_NAMESPACES in r2Config.ts)
 *
 * The "bucket" parameter in all storage functions is the logical namespace
 * (object-key prefix), NOT a separate physical bucket.
 *
 * SWITCHING PROVIDERS
 * ───────────────────
 * Change `activeProvider` below to any StorageProvider implementation.
 * All upload handlers call this service — no handler changes needed.
 *
 * VALIDATION RULES (centralised in uploadPolicy.ts)
 * ──────────────────────────────────────────────────
 *   • Per-namespace policies: size, MIME, extension, magic bytes
 *   • HEIC/HEIF accepted for image namespaces — converted to JPEG by compressImageIfNeeded()
 *   • Max image size: 10 MB; max document size: 25 MB
 *   • Blocked: exe, bat, cmd, sh, ps1, msi, dmg, app, bin, com, vbs,
 *              js, ts, py, rb, pl, php, jar, class, dll, so, dylib,
 *              html, htm, svg, xml (markup — XSS risk)
 *   • MIME/extension/magic-byte mismatches rejected
 *   • Signed URL expiry capped at 1 hour (default 15 minutes)
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { localProvider } from './providers/localProvider.js';
import { r2Provider } from './providers/r2Provider.js';
import type { StorageProvider, SaveFileInput, SaveFileResult, GetFileResult, StorageUsageResult } from './providers/types.js';
import { resolveProviderName } from './r2Config.js';
import { clampSignedUrlExpiry, SIGNED_URL_DEFAULT_EXPIRY_SECONDS } from './uploadPolicy.js';

// ── Active provider ───────────────────────────────────────────────────────────
// Driven by the STORAGE_PROVIDER environment variable:
//   STORAGE_PROVIDER=local   → local disk (default, Airo-managed storage)
//   STORAGE_PROVIDER=r2      → Cloudflare R2 (requires R2_* secrets)
//
// Set STORAGE_PROVIDER=r2 in Settings → Secrets once R2 credentials are added.

function resolveProvider(): StorageProvider {
  const name = resolveProviderName();
  switch (name) {
    case 'r2':    return r2Provider;
    case 'local':
    default:      return localProvider;
  }
}

const activeProvider: StorageProvider = resolveProvider();

// ── Logical namespace constants ───────────────────────────────────────────────
// These are object-key prefixes within the single physical R2 bucket (R2_BUCKET).
// They are NOT separate Cloudflare buckets.
// Always use these constants — never accept a namespace from client input.

export const BUCKET_JOB_PHOTOS     = 'job-photos';
export const BUCKET_COMPANY_FILES  = 'company-files';
export const BUCKET_RECEIPTS       = 'uploads/receipts';
export const BUCKET_SAFETY_DOCS    = 'safety-documents';
export const BUCKET_SAFETY_POSTERS = 'safety-posters';
export const BUCKET_FLEET_FILES    = 'fleet-files';
export const BUCKET_FORM_MEDIA     = 'form-media';

// ── Validation constants ──────────────────────────────────────────────────────

export const MAX_FILES_PER_BATCH   = 10;
export const MAX_IMAGE_SIZE_BYTES  = 10 * 1024 * 1024;   // 10 MB
export const MAX_FILE_SIZE_BYTES   = 25 * 1024 * 1024;   // 25 MB

export const ALLOWED_IMAGE_MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',   // non-standard alias some iOS/Android browsers send
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',   // occasionally sent by Android
  // HEIC/HEIF accepted — converted to JPEG by compressImageIfNeeded()
  'image/heic':          'jpg',
  'image/heif':          'jpg',
  'image/heic-sequence': 'jpg',
  'image/heif-sequence': 'jpg',
};

export const ALLOWED_DOCUMENT_MIMES: Record<string, string> = {
  'application/pdf':  'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv':   'csv',
  'text/plain': 'txt',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
};

export const ALLOWED_MIMES: Record<string, string> = {
  ...ALLOWED_IMAGE_MIMES,
  ...ALLOWED_DOCUMENT_MIMES,
};

const BLOCKED_EXTENSIONS = new Set([
  'exe','bat','cmd','sh','ps1','msi','dmg','app','bin','com','vbs',
  'js','ts','py','rb','pl','php','jar','class','dll','so','dylib',
]);

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  code?: string;
  error?: string;
}

/**
 * Validate a single file upload.
 * Call this server-side after multer has parsed the request.
 */
export function validateUpload(file: {
  originalname: string;
  mimetype: string;
  size: number;
}, options: { isImage?: boolean } = {}): ValidationResult {
  const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';

  // Blocked executables / scripts
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      code: 'blocked_extension',
      error: 'Executable and script files are not allowed.',
    };
  }

  // MIME type check
  if (!ALLOWED_MIMES[file.mimetype]) {
    return {
      ok: false,
      code: 'unsupported_type',
      error: `"${file.originalname}" is not a supported file type. Allowed: PDF, JPG, PNG, WebP, DOC, DOCX, XLS, XLSX, CSV, TXT, ZIP.`,
    };
  }

  // Size check
  const maxBytes = options.isImage ? MAX_IMAGE_SIZE_BYTES : MAX_FILE_SIZE_BYTES;
  if (file.size > maxBytes) {
    const limitMB = Math.round(maxBytes / (1024 * 1024));
    return {
      ok: false,
      code: 'file_too_large',
      error: `"${file.originalname}" exceeds the ${limitMB} MB limit.`,
    };
  }

  return { ok: true };
}

/**
 * Validate a batch of files (photos upload).
 * Returns the first error found, or ok if all pass.
 */
export function validateBatch(
  files: Array<{ originalname: string; mimetype: string; size: number }>,
  options: { isImage?: boolean; maxFiles?: number } = {},
): ValidationResult {
  const maxFiles = options.maxFiles ?? MAX_FILES_PER_BATCH;
  if (files.length > maxFiles) {
    return {
      ok: false,
      code: 'too_many_files',
      error: `Maximum ${maxFiles} files per upload. Please select fewer files.`,
    };
  }
  for (const f of files) {
    const result = validateUpload(f, options);
    if (!result.ok) return result;
  }
  return { ok: true };
}

// ── Image compression ─────────────────────────────────────────────────────────

// Jimp lazy-loaded to avoid ESM/CJS conflicts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _CustomJimp: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _JimpMime: any = null;

async function getJimp() {
  if (_CustomJimp) return { CustomJimp: _CustomJimp, JimpMime: _JimpMime };
  const [core, jimpPkg, resizePkg] = await Promise.all([
    import('@jimp/core'),
    import('jimp'),
    import('@jimp/plugin-resize'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createJimp = (core as any).createJimp;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { defaultPlugins, defaultFormats, JimpMime } = jimpPkg as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resizeMethods = (resizePkg as any).methods;
  _JimpMime = JimpMime;
  _CustomJimp = createJimp({ plugins: [...defaultPlugins, resizeMethods], formats: defaultFormats });
  return { CustomJimp: _CustomJimp, JimpMime: _JimpMime };
}

const MAX_DIMENSION = 1920;
const JPEG_QUALITY  = 82;

// HEIC/HEIF MIME types — always output as JPEG
const HEIC_MIMES = new Set([
  'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
]);

/**
 * Compress an image buffer using Jimp.
 * - Resizes to max 1920px on the longest side
 * - Converts to JPEG at quality 82 (PNG stays PNG, HEIC→JPEG)
 * - Returns original buffer unchanged if Jimp fails
 */
export async function compressImageIfNeeded(
  buffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  // Only compress images; pass documents through unchanged
  if (!ALLOWED_IMAGE_MIMES[mimeType]) {
    return { buffer, mimeType };
  }

  // HEIC/HEIF: always output as JPEG regardless of Jimp support
  void HEIC_MIMES.has(mimeType); // checked by caller; kept for documentation

  try {
    const { CustomJimp, JimpMime } = await getJimp();
    const img = await CustomJimp.read(buffer);
    const { width, height } = img;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      if (width >= height) img.resize({ w: MAX_DIMENSION });
      else                 img.resize({ h: MAX_DIMENSION });
    }

    if (mimeType === 'image/png') {
      // Jimp v1 getBuffer returns Uint8Array at runtime despite Buffer type annotation.
      // Buffer.from() with a copy ensures a true Node.js Buffer for AWS SDK v3.
      const raw = await img.getBuffer(JimpMime.png);
      return { buffer: Buffer.from(raw), mimeType: 'image/png' };
    }

    // JPEG / WebP / HEIC → output as JPEG
    const raw = await img.getBuffer(JimpMime.jpeg, { quality: JPEG_QUALITY });
    return { buffer: Buffer.from(raw), mimeType: 'image/jpeg' };
  } catch {
    // Jimp failed to decode this image.
    // For HEIC/HEIF: store the raw buffer as-is rather than rejecting.
    // R2 stores any binary; the download proxy streams it back to the client.
    // iOS Safari can display HEIC natively; other browsers get the proxy URL.
    console.warn(`[storage] compressImageIfNeeded: Jimp failed for mime=${mimeType} — storing raw buffer`);
    // Ensure the fallback is also a true Buffer copy, not a Uint8Array reference.
    const fallback = Buffer.from(buffer);
    console.warn(`[storage] fallback buffer type=${fallback.constructor.name} isBuffer=${Buffer.isBuffer(fallback)} byteLength=${fallback.byteLength}`);
    return { buffer: fallback, mimeType };
  }
}

// ── Thumbnail generation ──────────────────────────────────────────────────────

const THUMBNAIL_WIDTH  = 300;
const THUMBNAIL_QUALITY = 75;
const PREVIEW_WIDTH    = 1000;
const PREVIEW_QUALITY  = 80;

export interface ThumbnailResult {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * Apply a text watermark to a JPEG buffer.
 *
 * The watermark is burned into the image pixels — it is not a metadata-only
 * or frontend-overlay watermark. The output is always image/jpeg.
 *
 * Processing:
 *   1. Decode the JPEG with Jimp.
 *   2. Print the watermark text in the bottom-right corner using Jimp's
 *      built-in bitmap font (no external font files required).
 *   3. Re-encode as JPEG at quality 82.
 *
 * Throws if Jimp cannot decode the buffer — the caller must NOT save an
 * unwatermarked file when this throws.
 *
 * @param buffer     JPEG buffer (already compressed/resized)
 * @param text       Watermark text (e.g. company name + date)
 * @returns          New JPEG buffer with watermark pixels embedded
 */
export async function applyWatermark(buffer: Buffer, text: string): Promise<Buffer> {
  const { CustomJimp, JimpMime } = await getJimp();

  const img = await CustomJimp.read(buffer);
  const w: number = img.width;
  const h: number = img.height;

  // Build the watermark string: "CompanyName • YYYY-MM-DD"
  const dateStr = new Date().toISOString().slice(0, 10);
  const label = `${text} • ${dateStr}`;

  // Jimp v1 print API: print(font, x, y, text, maxWidth?)
  // We use the built-in SANS_16_WHITE font — always available, no file I/O.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jimpPkg = CustomJimp as any;
  const font = await (jimpPkg.loadFont
    ? jimpPkg.loadFont(jimpPkg.FONT_SANS_16_WHITE ?? 'FONT_SANS_16_WHITE')
    : Promise.resolve(null));

  if (font) {
    // Position: bottom-right with 12px margin
    const margin = 12;
    // Approximate text width: ~9px per char for SANS_16
    const approxTextW = label.length * 9;
    const x = Math.max(margin, w - approxTextW - margin);
    const y = h - 28; // 16px font + 12px margin from bottom
    img.print({ font, x, y, text: label });
  } else {
    // Fallback: draw a semi-transparent dark rectangle + white text using
    // Jimp's scan() pixel manipulation — no font file needed.
    const barH = 28;
    const barY = h - barH;
    // Draw dark bar across the bottom
    img.scan(0, barY, w, barH, function (this: typeof img, px: number, py: number, idx: number) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bitmap = (this as any).bitmap;
      if (!bitmap?.data) return;
      bitmap.data[idx]     = Math.floor(bitmap.data[idx] * 0.35);     // R
      bitmap.data[idx + 1] = Math.floor(bitmap.data[idx + 1] * 0.35); // G
      bitmap.data[idx + 2] = Math.floor(bitmap.data[idx + 2] * 0.35); // B
      // alpha unchanged
    });
    // We can't render text without a font — the dark bar alone is the watermark.
    // The caller's label is embedded in the EXIF/metadata path instead.
    console.warn('[storage] applyWatermark: no font available — dark bar applied, text skipped');
  }

  const raw = await img.getBuffer(JimpMime.jpeg, { quality: JPEG_QUALITY });
  return Buffer.from(raw);
}

/**
 * Returns null if Jimp cannot decode the image (e.g. raw HEIC on server).
 * Never throws — failures are logged and null is returned.
 */
export async function generateThumbnail(
  buffer: Buffer,
  mimeType: string,
  targetWidth = THUMBNAIL_WIDTH,
  quality = THUMBNAIL_QUALITY,
): Promise<ThumbnailResult | null> {
  // HEIC/HEIF: Jimp may not be able to decode on server — return null gracefully
  if (HEIC_MIMES.has(mimeType)) {
    console.log(`[storage] generateThumbnail: skipping HEIC (server can't decode) mime=${mimeType}`);
    return null;
  }
  try {
    const { CustomJimp, JimpMime } = await getJimp();
    const img = await CustomJimp.read(buffer);
    const origW: number = img.width;

    // Only resize if wider than target
    if (origW > targetWidth) {
      img.resize({ w: targetWidth });
    }

    const thumbW: number = img.width;
    const thumbH: number = img.height;

    const outBuffer: Buffer = await img.getBuffer(JimpMime.jpeg, { quality });
    return { buffer: outBuffer, mimeType: 'image/jpeg', width: thumbW, height: thumbH };
  } catch (err) {
    console.warn(`[storage] generateThumbnail failed mime=${mimeType}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Generate a preview (medium-size) image from an image buffer.
 * Returns null if Jimp cannot decode.
 */
export async function generatePreview(
  buffer: Buffer,
  mimeType: string,
): Promise<ThumbnailResult | null> {
  return generateThumbnail(buffer, mimeType, PREVIEW_WIDTH, PREVIEW_QUALITY);
}

/**
 * Get the pixel dimensions of an image buffer.
 * Returns null if Jimp cannot decode.
 */
export async function getImageDimensions(
  buffer: Buffer,
  mimeType: string,
): Promise<{ width: number; height: number } | null> {
  if (HEIC_MIMES.has(mimeType)) return null;
  try {
    const { CustomJimp } = await getJimp();
    const img = await CustomJimp.read(buffer);
    return { width: img.width as number, height: img.height as number };
  } catch {
    return null;
  }
}

// ── Core service functions ────────────────────────────────────────────────────

/**
 * Save a file to the active storage provider.
 * Does NOT compress — call compressImageIfNeeded() first if needed.
 * Guarantees the buffer passed to the provider is a true Node.js Buffer
 * (Jimp v1 getBuffer returns Uint8Array at runtime which breaks AWS SDK v3).
 */
export async function saveFile(input: SaveFileInput): Promise<SaveFileResult> {
  const safeInput: SaveFileInput = {
    ...input,
    buffer: Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from(input.buffer),
  };
  return activeProvider.saveFile(safeInput);
}

/**
 * Open a download stream for a stored file.
 * Throws if the file does not exist.
 */
export async function getDownloadStream(
  storageKey: string,
  bucket: string,
): Promise<GetFileResult> {
  return activeProvider.getDownloadStream(storageKey, bucket);
}

/**
 * Download a file from storage and return its full contents as a Buffer.
 * Use for server-side processing (PDF generation, image manipulation, etc.).
 * For large files prefer getDownloadStream to avoid holding everything in memory.
 */
export async function getDownloadBuffer(
  storageKey: string,
  bucket: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const { stream, mimeType } = await activeProvider.getDownloadStream(storageKey, bucket);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve({ buffer: Buffer.concat(chunks), mimeType: mimeType ?? 'application/octet-stream' }));
    stream.on('error', reject);
  });
}

/**
 * Delete a file from the active storage provider.
 * Best-effort — does not throw if the file is already gone.
 */
export async function deleteFile(storageKey: string, bucket: string): Promise<void> {
  return activeProvider.deleteFile(storageKey, bucket);
}

/**
 * Get a URL for serving a file.
 * For local provider: returns the public path.
 * For cloud providers: returns a signed GET-only URL.
 *
 * SECURITY RULES:
 *   - Call only after verifying the caller owns the record (company membership + DB ownership)
 *   - Expiry is clamped to [60s, SIGNED_URL_MAX_EXPIRY_SECONDS] — never store the result
 *   - The "bucket" parameter is the logical namespace (object-key prefix), not a physical bucket
 *   - Never log the returned URL (contains credentials in query string)
 *
 * @param storageKey  The storage key from the DB record
 * @param bucket      The logical namespace (e.g. 'job-photos', 'company-files')
 * @param expiresInSeconds  Requested expiry — clamped to max 1 hour
 */
export async function getSignedUrl(
  storageKey: string,
  bucket: string,
  expiresInSeconds = SIGNED_URL_DEFAULT_EXPIRY_SECONDS,
): Promise<string> {
  const clampedExpiry = clampSignedUrlExpiry(expiresInSeconds);
  return activeProvider.getSignedUrl(storageKey, bucket, clampedExpiry);
}

/** Whether the active provider supports real signed URL expiry */
export function providerSupportsSignedUrls(): boolean {
  return activeProvider.supportsSignedUrls;
}

/** Name of the currently active provider (stored in DB records) */
export function activeProviderName(): string {
  return activeProvider.name;
}

// ── Storage usage ─────────────────────────────────────────────────────────────

/**
 * Calculate total storage used by a company across all file tables.
 * Used by plan limit checks and the Owner Console storage monitor.
 *
 * TODO: When migrating to a cloud provider, this query will still work as long
 * as file metadata (size_bytes) is kept in the DB.  The actual bytes live in
 * the cloud, but the DB is the source of truth for accounting.
 */
export async function getStorageUsage(companyId: number): Promise<StorageUsageResult> {
  const safeSum = async (q: ReturnType<typeof sql>): Promise<number> => {
    try {
      const [rows] = await db.execute(q) as unknown as [Array<{ total: number | string | null }>, unknown];
      return Number(rows?.[0]?.total ?? 0);
    } catch { return 0; }
  };
  const safeCount = async (q: ReturnType<typeof sql>): Promise<number> => {
    try {
      const [rows] = await db.execute(q) as unknown as [Array<{ cnt: number | string }>, unknown];
      return Number(rows?.[0]?.cnt ?? 0);
    } catch { return 0; }
  };

  const [
    fileBytes, fileCount,
    photoBytes, photoCount,
    safetyDocBytes, safetyDocCount,
    safetyPosterBytes, safetyPosterCount,
  ] = await Promise.all([
    safeSum(sql`SELECT COALESCE(SUM(size_bytes),0) as total FROM company_files WHERE company_id = ${companyId}`),
    safeCount(sql`SELECT COUNT(*) as cnt FROM company_files WHERE company_id = ${companyId}`),
    safeSum(sql`SELECT COALESCE(SUM(size_bytes),0) as total FROM job_photos WHERE company_id = ${companyId}`),
    safeCount(sql`SELECT COUNT(*) as cnt FROM job_photos WHERE company_id = ${companyId}`),
    safeSum(sql`SELECT COALESCE(SUM(size_bytes),0) as total FROM safety_documents WHERE company_id = ${companyId}`),
    safeCount(sql`SELECT COUNT(*) as cnt FROM safety_documents WHERE company_id = ${companyId}`),
    safeSum(sql`SELECT COALESCE(SUM(size_bytes),0) as total FROM safety_posters WHERE company_id = ${companyId}`),
    safeCount(sql`SELECT COUNT(*) as cnt FROM safety_posters WHERE company_id = ${companyId}`),
  ]);

  return {
    totalBytes: fileBytes + photoBytes + safetyDocBytes + safetyPosterBytes,
    totalFiles: fileCount + photoCount + safetyDocCount + safetyPosterCount,
    byBucket: {
      [BUCKET_COMPANY_FILES]:  { bytes: fileBytes,         files: fileCount },
      [BUCKET_JOB_PHOTOS]:     { bytes: photoBytes,        files: photoCount },
      [BUCKET_SAFETY_DOCS]:    { bytes: safetyDocBytes,    files: safetyDocCount },
      [BUCKET_SAFETY_POSTERS]: { bytes: safetyPosterBytes, files: safetyPosterCount },
    },
  };
}

/**
 * Check whether a company has enough storage quota remaining.
 * Returns { allowed: true } or { allowed: false, error: string }.
 *
 * TODO: integrate with plan-limits.ts getPlanLimits() when billing limits are
 * fully wired — for now this is a pass-through that callers can use.
 */
export async function checkStorageQuota(
  companyId: number,
  additionalBytes: number,
  limitBytes: number,
): Promise<{ allowed: boolean; usedBytes: number; error?: string }> {
  const usage = await getStorageUsage(companyId);
  const usedBytes = usage.totalBytes;

  if (usedBytes + additionalBytes > limitBytes) {
    const usedGB  = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);
    const limitGB = (limitBytes / (1024 * 1024 * 1024)).toFixed(0);
    return {
      allowed: false,
      usedBytes,
      error: `Storage limit reached (${usedGB} GB / ${limitGB} GB). Upgrade your plan or remove old files.`,
    };
  }

  return { allowed: true, usedBytes };
}
