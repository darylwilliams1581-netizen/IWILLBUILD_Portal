/**
 * source-document-storage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage helpers for Phase 2 "Word Source Document" workflow.
 *
 * Storage key format (CP10A5 — migrated to buildObjectKey):
 *   source-documents/companies/{companyId}/source-docs/{uuid}/{filename}
 *
 * Uses the existing storage-service (R2 when STORAGE_PROVIDER=r2, local disk
 * otherwise). Bucket name: 'source-documents'.
 */

import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { saveFile, getDownloadBuffer, deleteFile } from '../storage/storage-service.js';
import { buildObjectKey } from '../storage/r2Config.js';

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
 * The buffer is user-supplied (DOCX from multipart upload) and passes through
 * the full validateUploadPolicy gate in saveFile().
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

  // Use buildObjectKey so the key starts with 'source-documents/' and the
  // namespace is correctly inferred by saveFile()'s validation gate.
  const storageKey = buildObjectKey({
    logicalNamespace: 'source-documents',
    companyId,
    category: `rev${revision}-t${templateId}`,
    uuid: randomUUID(),
    originalName,
  });

  const result = await saveFile({
    bucket: BUCKET_SOURCE_DOCS,
    storageKey,
    buffer,
    mimeType,
    originalName,
    // skipValidation intentionally omitted — user-supplied DOCX must be validated
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
