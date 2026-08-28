/**
 * source-document-storage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage helpers for Phase 2 "Word Source Document" workflow.
 *
 * Storage key format:
 *   {companyId}/{templateId}/rev{revision}/{nanoid}.{ext}
 *
 * Uses the existing storage-service (R2 when STORAGE_PROVIDER=r2, local disk
 * otherwise). Bucket name: 'source-documents'.
 */

import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { saveFile, getDownloadBuffer, deleteFile } from '../storage/storage-service.js';

export const BUCKET_SOURCE_DOCS = 'source-documents';

export interface SourceUploadResult {
  /** Storage key — store in document_templates.source_file_key */
  storageKey: string;
  /** SHA-256 hex digest of the uploaded bytes */
  sha256: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Public URL */
  publicUrl: string;
}

/**
 * Upload a source document buffer to storage.
 */
export async function uploadSourceDocument(
  buffer: Buffer,
  options: {
    companyId: number;
    templateId: number;
    revision: number;
    originalName: string;
    mimeType: string;
  },
): Promise<SourceUploadResult> {
  const { companyId, templateId, revision, originalName, mimeType } = options;

  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const ext = originalName.split('.').pop()?.toLowerCase() ?? 'bin';
  const slug = nanoid(12);
  const storageKey = `${companyId}/${templateId}/rev${revision}/${slug}.${ext}`;

  const result = await saveFile({
    bucket: BUCKET_SOURCE_DOCS,
    storageKey,
    buffer,
    mimeType,
    originalName,
  });

  return {
    storageKey: result.storageKey,
    sha256,
    sizeBytes: buffer.length,
    publicUrl: result.publicUrl,
  };
}

/**
 * Download a source document buffer from storage.
 */
export async function downloadSourceDocument(storageKey: string): Promise<Buffer | null> {
  try {
    const { buffer } = await getDownloadBuffer(storageKey, BUCKET_SOURCE_DOCS);
    return buffer;
  } catch {
    return null;
  }
}

/**
 * Delete a source document from storage (best-effort).
 */
export async function deleteSourceDocument(storageKey: string): Promise<void> {
  try {
    await deleteFile(storageKey, BUCKET_SOURCE_DOCS);
  } catch {
    // Ignore — file may already be gone
  }
}

/**
 * Compute SHA-256 of a buffer without uploading.
 */
export function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
