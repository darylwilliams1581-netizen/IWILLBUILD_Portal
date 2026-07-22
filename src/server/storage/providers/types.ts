/**
 * Storage Provider Interface
 * ─────────────────────────────────────────────────────────────────────────────
 * Every storage backend (local disk, Vercel Blob, Supabase Storage, S3/R2,
 * SharePoint) must implement this interface.  The active provider is selected
 * in storage-service.ts — swap it there without touching any upload handler.
 *
 * DESIGN NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 * • storageKey  — opaque string owned by the provider (e.g. a UUID filename,
 *                 a Blob URL, an S3 object key).  Stored in the DB so the
 *                 service can later retrieve / delete the object.
 * • bucket      — optional logical bucket / folder hint.  Providers that don't
 *                 support buckets may ignore it.
 * • signedUrl   — only meaningful for cloud providers; local provider returns
 *                 the public-path URL instead.
 */

import type { Readable } from 'node:stream';

// ── Input / output shapes ─────────────────────────────────────────────────────

export interface SaveFileInput {
  /** Raw file bytes */
  buffer: Buffer;
  /** Original filename from the client (used for extension / display) */
  originalName: string;
  /** MIME type as reported by multer / validated server-side */
  mimeType: string;
  /** Logical bucket / sub-folder (e.g. 'job-photos', 'company-files', 'receipts') */
  bucket: string;
  /** Optional: pre-generated key.  If omitted the provider generates one. */
  storageKey?: string;
}

export interface SaveFileResult {
  /** Opaque key to store in the DB (used for retrieval / deletion) */
  storageKey: string;
  /** Provider identifier — stored in DB so future reads use the right provider */
  provider: string;
  /** Byte length of what was actually written (may differ from input after compression) */
  sizeBytes: number;
  /** Public URL for serving the file (may be a signed URL for cloud providers) */
  publicUrl: string;
}

export interface GetFileResult {
  /** Readable stream of the file bytes */
  stream: Readable;
  /** MIME type */
  mimeType: string;
  /** Byte length (0 if unknown) */
  sizeBytes: number;
  /** Original filename hint */
  originalName: string;
}

export interface StorageUsageResult {
  /** Total bytes used by this company across all buckets */
  totalBytes: number;
  /** Total number of stored objects */
  totalFiles: number;
  /** Breakdown by bucket */
  byBucket: Record<string, { bytes: number; files: number }>;
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface StorageProvider {
  /** Unique identifier stored in the DB (e.g. 'local', 'vercel-blob', 's3') */
  readonly name: string;

  /**
   * Write a file to the backing store.
   * Returns the storage key and public URL.
   */
  saveFile(input: SaveFileInput): Promise<SaveFileResult>;

  /**
   * Open a readable stream for the given storage key.
   * Throws if the file does not exist.
   */
  getDownloadStream(storageKey: string, bucket: string): Promise<GetFileResult>;

  /**
   * Permanently delete a file from the backing store.
   * Should NOT throw if the file is already gone (best-effort).
   */
  deleteFile(storageKey: string, bucket: string): Promise<void>;

  /**
   * Return a short-lived signed URL for direct client download.
   * Local provider returns the same public URL (no expiry).
   */
  getSignedUrl(storageKey: string, bucket: string, expiresInSeconds?: number): Promise<string>;

  /**
   * Whether this provider supports signed URLs with real expiry.
   * Used by the service layer to decide whether to proxy or redirect.
   */
  supportsSignedUrls: boolean;
}
