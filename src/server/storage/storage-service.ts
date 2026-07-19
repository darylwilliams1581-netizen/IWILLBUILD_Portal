/**
 * Central Storage Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Single entry point for all file I/O in IWILLBUILD.
 *
 * SWITCHING PROVIDERS
 * ───────────────────
 * Change `activeProvider` below to any StorageProvider implementation.
 * All upload handlers call this service — no handler changes needed.
 *
 *   import { vercelBlobProvider } from './providers/vercelBlobProvider.js';
 *   const activeProvider: StorageProvider = vercelBlobProvider;
 *
 * BUCKETS
 * ───────
 * Logical bucket names map to sub-folders on local disk and to prefixes /
 * actual buckets on cloud providers:
 *
 *   BUCKET_JOB_PHOTOS   = 'job-photos'
 *   BUCKET_COMPANY_FILES = 'company-files'
 *   BUCKET_RECEIPTS     = 'uploads/receipts'
 *   BUCKET_SAFETY_DOCS  = 'safety-documents'
 *   BUCKET_SAFETY_POSTERS = 'safety-posters'
 *   BUCKET_FLEET_FILES  = 'fleet-files'
 *   BUCKET_FORM_MEDIA   = 'form-media'
 *
 * VALIDATION RULES (centralised here)
 * ────────────────────────────────────
 *   • HEIC/HEIF rejected
 *   • Max 10 files per batch upload
 *   • Max image size before compression: 10 MB
 *   • Max general file size: 25 MB
 *   • Allowed image types: jpg, jpeg, png, webp
 *   • Allowed document types: pdf, doc, docx, xls, xlsx, csv, txt, zip
 *   • Blocked: exe, bat, cmd, sh, ps1, msi, dmg, app, bin, com, vbs,
 *              js, ts, py, rb, pl, php, jar, class, dll, so, dylib
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { localProvider } from './providers/localProvider.js';
import { r2Provider } from './providers/r2Provider.js';
import type { StorageProvider, SaveFileInput, SaveFileResult, GetFileResult, StorageUsageResult } from './providers/types.js';
import { getSecret } from '#airo/secrets';

// ── Active provider ───────────────────────────────────────────────────────────
// Driven by the STORAGE_PROVIDER environment variable:
//   STORAGE_PROVIDER=local   → local disk (default, Airo-managed storage)
//   STORAGE_PROVIDER=r2      → Cloudflare R2 (requires R2_* secrets)
//
// Set STORAGE_PROVIDER=r2 in Settings → Secrets once R2 credentials are added.

function resolveProvider(): StorageProvider {
  const name = (getSecret('STORAGE_PROVIDER') || process.env.STORAGE_PROVIDER || 'local').toLowerCase().trim();
  switch (name) {
    case 'r2':    return r2Provider;
    case 'local':
    default:      return localProvider;
  }
}

const activeProvider: StorageProvider = resolveProvider();

// ── Bucket constants ──────────────────────────────────────────────────────────

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
  const isHeic = HEIC_MIMES.has(mimeType);

  try {
    const { CustomJimp, JimpMime } = await getJimp();
    const img = await CustomJimp.read(buffer);
    const { width, height } = img;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      if (width >= height) img.resize({ w: MAX_DIMENSION });
      else                 img.resize({ h: MAX_DIMENSION });
    }

    if (mimeType === 'image/png') {
      const out: Buffer = await img.getBuffer(JimpMime.png);
      return { buffer: out, mimeType: 'image/png' };
    }

    // JPEG / WebP / HEIC → output as JPEG
    const out: Buffer = await img.getBuffer(JimpMime.jpeg, { quality: JPEG_QUALITY });
    return { buffer: out, mimeType: 'image/jpeg' };
  } catch {
    // Jimp failed — if HEIC, we can't serve it as-is; reject it
    if (isHeic) {
      throw new Error('HEIC/HEIF image could not be converted. Please shoot in JPEG mode (Camera Settings → Formats → Most Compatible) or convert the file before uploading.');
    }
    // For other formats, return original unchanged
    return { buffer, mimeType };
  }
}

// ── Core service functions ────────────────────────────────────────────────────

/**
 * Save a file to the active storage provider.
 * Does NOT compress — call compressImageIfNeeded() first if needed.
 */
export async function saveFile(input: SaveFileInput): Promise<SaveFileResult> {
  return activeProvider.saveFile(input);
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
 * Delete a file from the active storage provider.
 * Best-effort — does not throw if the file is already gone.
 */
export async function deleteFile(storageKey: string, bucket: string): Promise<void> {
  return activeProvider.deleteFile(storageKey, bucket);
}

/**
 * Get a URL for serving a file.
 * For local provider: returns the public path.
 * For cloud providers: returns a signed URL with the given expiry.
 */
export async function getSignedUrl(
  storageKey: string,
  bucket: string,
  expiresInSeconds = 3600,
): Promise<string> {
  return activeProvider.getSignedUrl(storageKey, bucket, expiresInSeconds);
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
