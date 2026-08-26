/**
 * uploadService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical upload service for all IWILLBUILD media destinations.
 *
 * Responsibilities:
 *  - Authenticated company ownership check
 *  - MIME normalisation (extension → magic-byte → safe default)
 *  - MIME validation (image-only or any allowed type)
 *  - HEIC rejection (callers must convert before calling, or pass allowHeic)
 *  - Storage upload via storage-service
 *  - SHA-256 checksum generation
 *  - media_assets row creation
 *  - media_asset_links row creation
 *  - Compatibility row creation in the destination table (caller-supplied fn)
 *  - Storage rollback on DB failure
 *  - X-Client-Id idempotency (DB-backed, 5-min TTL)
 *  - Returns canonical UploadResult
 *
 * Destination types (media_asset_links.destination_type):
 *   job_photo | job_card_photo | company_file | incident_attachment |
 *   fleet_asset_photo | fleet_inspection_media | form_attachment |
 *   profile_attachment | job_file_receipt | drawing | tender_attachment |
 *   safety_document | safety_poster
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
  saveFile,
  deleteFile,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_MIMES,
} from '../storage/storage-service.js';
import type { ParsedFile } from './file-upload.js';
// ── Types ─────────────────────────────────────────────────────────────────────

export type DestinationType =
  | 'job_photo'
  | 'job_card_photo'
  | 'company_file'
  | 'incident_attachment'
  | 'fleet_asset_photo'
  | 'fleet_inspection_media'
  | 'form_attachment'
  | 'profile_attachment'
  | 'job_file_receipt'
  | 'drawing'
  | 'tender_attachment'
  | 'safety_document'
  | 'safety_poster';

export interface UploadResult {
  mediaAssetId: number;
  linkId: number;
  destinationType: DestinationType;
  destinationId: number | null;
  storageKey: string;
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

export interface UploadOptions {
  /** Parsed file from parseMultipartForm */
  file: ParsedFile;
  /** Authenticated company ID */
  companyId: number;
  /** Authenticated user ID */
  userId: string;
  /** Storage bucket name */
  bucket: string;
  /** Storage key (UUID-based, caller generates) */
  storageKey: string;
  /** Destination type for media_asset_links */
  destinationType: DestinationType;
  /** Destination row ID (null for profile attachments etc.) */
  destinationId: number | null;
  /** Optional field key for form attachments */
  fieldKey?: string;
  /** Optional sort order */
  sortOrder?: number;
  /** Optional label */
  label?: string;
  /** Optional caption */
  caption?: string;
  /** Optional captured_at (ISO string or YYYY-MM-DD HH:MM:SS) */
  capturedAt?: string | null;
  /** X-Client-Id for idempotency (from request header) */
  clientId?: string | null;
  /**
   * Caller-supplied function to insert the compatibility row in the
   * destination table. Called AFTER media_assets + media_asset_links are
   * inserted. If it throws, the whole transaction is rolled back and the
   * storage file is deleted.
   *
   * Returns the destination row ID (used as destinationId in the result).
   */
  insertCompatibilityRow?: (ctx: CompatibilityContext) => Promise<number | null>;
  /** If true, accept image/* only. Default: false (accept all ALLOWED_MIMES) */
  imageOnly?: boolean;
  /** If true, HEIC is accepted (caller handles conversion). Default: false */
  allowHeic?: boolean;
}

export interface CompatibilityContext {
  mediaAssetId: number;
  linkId: number;
  storageKey: string;
  publicUrl: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  companyId: number;
  userId: string;
  label: string | null;
  caption: string | null;
}

// ── MIME normalisation ────────────────────────────────────────────────────────

/**
 * Normalise MIME type in-place on a ParsedFile.
 * Applies extension-based reclassification, magic-byte sniffing, and alias
 * normalisation. Mutates file.mimetype.
 */
export function normaliseMime(file: ParsedFile): void {
  const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
  const noExt = !file.originalname.includes('.') || ext === file.originalname.toLowerCase();

  if (
    file.mimetype === 'application/octet-stream' ||
    file.mimetype === '' ||
    file.mimetype === 'application/unknown' ||
    !file.mimetype
  ) {
    if (ext === 'heic' || ext === 'heif')        file.mimetype = 'image/heic';
    else if (ext === 'jpg' || ext === 'jpeg')    file.mimetype = 'image/jpeg';
    else if (ext === 'png')                      file.mimetype = 'image/png';
    else if (ext === 'webp')                     file.mimetype = 'image/webp';
    else if (ext === 'pdf')                      file.mimetype = 'application/pdf';
    else if (ext === 'doc')                      file.mimetype = 'application/msword';
    else if (ext === 'docx')                     file.mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext === 'xls')                      file.mimetype = 'application/vnd.ms-excel';
    else if (ext === 'xlsx')                     file.mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else if (ext === 'csv')                      file.mimetype = 'text/csv';
    else if (ext === 'txt')                      file.mimetype = 'text/plain';
    else if (ext === 'zip')                      file.mimetype = 'application/zip';
    else if (noExt && file.buffer.length > 3) {
      // Magic-byte sniff for iOS extensionless files
      const sig = file.buffer.slice(0, 12);
      if      (sig[0] === 0xFF && sig[1] === 0xD8)                                                   file.mimetype = 'image/jpeg';
      else if (sig[0] === 0x89 && sig[1] === 0x50)                                                   file.mimetype = 'image/png';
      else if (sig[0] === 0x52 && sig[1] === 0x49)                                                   file.mimetype = 'image/webp';
      else if (sig[0] === 0x25 && sig[1] === 0x50 && sig[2] === 0x44 && sig[3] === 0x46)             file.mimetype = 'application/pdf';
      else                                                                                            file.mimetype = 'image/jpeg'; // safe default for iOS camera
    }
  }

  // Alias normalisation
  if (file.mimetype === 'image/jpg')  file.mimetype = 'image/jpeg';
  if (file.mimetype === 'image/heif') file.mimetype = 'image/heic';
}

// ── Checksum ──────────────────────────────────────────────────────────────────

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

// ── Idempotency (DB-backed) ───────────────────────────────────────────────────

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

async function checkIdempotency(
  clientId: string,
  companyId: number,
): Promise<UploadResult | null> {
  try {
    const result = await db.execute(
      sql`SELECT response FROM media_upload_idempotency
          WHERE client_id = ${clientId}
            AND company_id = ${companyId}
            AND expires_at > NOW()
          LIMIT 1`
    ) as unknown as [Array<{ response: string }>, unknown];
    const row = result[0]?.[0];
    if (row?.response) {
      return JSON.parse(row.response) as UploadResult;
    }
  } catch {
    // Idempotency table may not exist yet during first boot — non-fatal
  }
  return null;
}

async function saveIdempotency(
  clientId: string,
  companyId: number,
  result: UploadResult,
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);
    await db.execute(sql`
      INSERT INTO media_upload_idempotency (client_id, company_id, response, expires_at)
      VALUES (${clientId}, ${companyId}, ${JSON.stringify(result)}, ${expiresAt})
      ON DUPLICATE KEY UPDATE response = VALUES(response), expires_at = VALUES(expires_at)
    `);
  } catch {
    // Non-fatal — idempotency is best-effort
  }
}

// ── File type classifier ──────────────────────────────────────────────────────

export function classifyFileType(mime: string): string {
  if (mime.startsWith('image/'))        return 'image';
  if (mime === 'application/pdf')       return 'pdf';
  if (mime.startsWith('video/'))        return 'video';
  if (mime.startsWith('audio/'))        return 'audio';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') return 'spreadsheet';
  if (mime.includes('word') || mime.includes('document')) return 'document';
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed') return 'archive';
  return 'document';
}

// ── Datetime normalisation ────────────────────────────────────────────────────

/** Convert ISO 8601 or any date string to MySQL DATETIME format */
export function toMysqlDatetime(dt: string | null | undefined): string | null {
  if (!dt) return null;
  // A value already in MySQL DATETIME format is a timezone-free database
  // value. Parsing it as a local Date and serialising to UTC shifts the time
  // (for example by ten hours in Brisbane), so preserve it verbatim.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dt)) return dt;
  try {
    const d = new Date(dt);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().replace('T', ' ').slice(0, 19);
  } catch {
    return null;
  }
}

// ── Core upload function ──────────────────────────────────────────────────────

export async function uploadMedia(opts: UploadOptions): Promise<UploadResult> {
  const {
    file,
    companyId,
    userId,
    bucket,
    storageKey,
    destinationType,
    destinationId,
    fieldKey,
    sortOrder = 0,
    label,
    caption,
    capturedAt,
    clientId,
    insertCompatibilityRow,
    imageOnly = false,
    allowHeic = false,
  } = opts;

  // ── 1. MIME normalisation ─────────────────────────────────────────────────
  normaliseMime(file);

  // ── 2. MIME validation ────────────────────────────────────────────────────
  if (imageOnly) {
    if (!ALLOWED_IMAGE_MIMES[file.mimetype]) {
      throw Object.assign(
        new Error(`"${file.originalname}" is not a supported image type (${file.mimetype}). Supported: JPEG, PNG, WebP, HEIC.`),
        { code: 'invalid_file_type', status: 400 }
      );
    }
    if (!allowHeic && file.mimetype === 'image/heic') {
      throw Object.assign(
        new Error(`"${file.originalname}" is HEIC format. Please convert to JPEG before uploading.`),
        { code: 'heic_not_supported', status: 400 }
      );
    }
  } else {
    const allAllowed = { ...ALLOWED_IMAGE_MIMES, ...ALLOWED_MIMES };
    if (!allAllowed[file.mimetype]) {
      throw Object.assign(
        new Error(`"${file.originalname}" is not a supported file type (${file.mimetype}).`),
        { code: 'invalid_file_type', status: 400 }
      );
    }
  }

  // ── 3. Idempotency check ──────────────────────────────────────────────────
  if (clientId) {
    const cached = await checkIdempotency(clientId, companyId);
    if (cached) {
      console.log(`[uploadService] idempotency hit: clientId=${clientId} companyId=${companyId}`);
      return cached;
    }
  }

  // ── 4. Checksum ───────────────────────────────────────────────────────────
  const checksum = sha256(file.buffer);

  // ── 5. Storage upload ─────────────────────────────────────────────────────
  const saved = await saveFile({
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    bucket,
    storageKey,
  });

  let mediaAssetId = 0;
  let linkId = 0;
  let finalDestinationId = destinationId;

  try {
    // ── 6. Insert media_assets row ──────────────────────────────────────────
    const fileType = classifyFileType(file.mimetype);
    const capturedAtMysql = toMysqlDatetime(capturedAt ?? null);

    const maResult = await db.execute(sql`
      INSERT INTO media_assets
        (company_id, storage_key, storage_provider, original_name, mime_type,
         file_type, size_bytes, checksum, label, caption, captured_at,
         uploaded_by_user_id, status, client_id)
      VALUES
        (${companyId}, ${saved.storageKey}, ${saved.provider ?? 'r2'}, ${file.originalname},
         ${file.mimetype}, ${fileType}, ${saved.sizeBytes}, ${checksum},
         ${label ?? null}, ${caption ?? null}, ${capturedAtMysql},
         ${userId}, 'active', ${clientId ?? null})
    `) as unknown as [{ insertId: number }, unknown];
    mediaAssetId = Number((maResult[0] as { insertId?: number })?.insertId ?? 0);

    if (!mediaAssetId) {
      throw new Error('media_assets INSERT returned no insertId');
    }

    // ── 7. Compatibility row (destination table) ────────────────────────────
    if (insertCompatibilityRow) {
      const ctx: CompatibilityContext = {
        mediaAssetId,
        linkId: 0, // not yet known
        storageKey: saved.storageKey,
        publicUrl: saved.publicUrl,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: saved.sizeBytes,
        companyId,
        userId,
        label: label ?? null,
        caption: caption ?? null,
      };
      const compatId = await insertCompatibilityRow(ctx);
      if (compatId != null) finalDestinationId = compatId;
    }

    // ── 8. Insert media_asset_links row ─────────────────────────────────────
    const malResult = await db.execute(sql`
      INSERT INTO media_asset_links
        (media_asset_id, company_id, destination_type, destination_id, field_key, sort_order)
      VALUES
        (${mediaAssetId}, ${companyId}, ${destinationType}, ${finalDestinationId ?? null},
         ${fieldKey ?? null}, ${sortOrder})
    `) as unknown as [{ insertId: number }, unknown];
    linkId = Number((malResult[0] as { insertId?: number })?.insertId ?? 0);

  } catch (dbErr) {
    // ── Rollback: delete the storage file ──────────────────────────────────
    console.error('[uploadService] DB insert failed — rolling back storage:', dbErr instanceof Error ? dbErr.message : dbErr);
    try {
      await deleteFile(saved.storageKey, bucket);
    } catch (delErr) {
      console.error('[uploadService] storage rollback failed:', delErr instanceof Error ? delErr.message : delErr);
    }
    throw dbErr;
  }

  const uploadResult: UploadResult = {
    mediaAssetId,
    linkId,
    destinationType,
    destinationId: finalDestinationId,
    storageKey: saved.storageKey,
    url: saved.publicUrl,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: saved.sizeBytes,
    checksum,
  };

  // ── 9. Save idempotency record ────────────────────────────────────────────
  if (clientId) {
    await saveIdempotency(clientId, companyId, uploadResult);
  }

  return uploadResult;
}

// ── Batch upload ──────────────────────────────────────────────────────────────

export interface BatchUploadOptions extends Omit<UploadOptions, 'file' | 'storageKey' | 'clientId'> {
  files: ParsedFile[];
  /** Function to generate a storage key for each file */
  makeStorageKey: (file: ParsedFile, index: number) => string;
  /** X-Client-Id from request header (applied to first file only for idempotency) */
  clientId?: string | null;
}

export async function uploadMediaBatch(opts: BatchUploadOptions): Promise<UploadResult[]> {
  const { files, makeStorageKey, clientId, ...rest } = opts;
  const results: UploadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const storageKey = makeStorageKey(file, i);
    // Only apply clientId to the first file to avoid collisions on multi-file uploads
    const fileClientId = i === 0 ? (clientId ?? null) : null;
    const result = await uploadMedia({ ...rest, file, storageKey, clientId: fileClientId });
    results.push(result);
  }

  return results;
}
