/**
 * Local Disk Storage Provider  (ACTIVE)
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores files in /shared-storage/public/assets/<bucket>/ — the same paths
 * that the original upload handlers used.  This provider is a drop-in
 * replacement that preserves 100% of existing behaviour while exposing the
 * standard StorageProvider interface so the rest of the app is provider-agnostic.
 *
 * Public URL pattern:  /airo-assets/uploads/<bucket>/<storageKey>
 *
 * TO SWITCH PROVIDERS: change the export in storage-service.ts — no handler
 * changes required.
 */

import { writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StorageProvider, SaveFileInput, SaveFileResult, GetFileResult } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Root on disk — all buckets live under here */
const STORAGE_ROOT = '/shared-storage/public/assets';

/** URL prefix served by the static asset middleware */
const PUBLIC_URL_PREFIX = '/airo-assets/uploads';

// ── Helpers ───────────────────────────────────────────────────────────────────

function bucketDir(bucket: string): string {
  return join(STORAGE_ROOT, bucket);
}

function publicUrl(bucket: string, storageKey: string): string {
  return `${PUBLIC_URL_PREFIX}/${bucket}/${storageKey}`;
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg':   'jpg',
    'image/png':    'png',
    'image/webp':   'webp',
    'image/gif':    'gif',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/csv':   'csv',
    'text/plain': 'txt',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
  };
  return map[mime] ?? 'bin';
}

// ── Provider implementation ───────────────────────────────────────────────────

export const localProvider: StorageProvider = {
  name: 'local',
  supportsSignedUrls: false,

  async saveFile(input: SaveFileInput): Promise<SaveFileResult> {
    const ext = extFromMime(input.mimeType);
    const storageKey = input.storageKey ?? `${randomUUID()}.${ext}`;
    const dir = bucketDir(input.bucket);

    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, storageKey), input.buffer);

    return {
      storageKey,
      provider: 'local',
      sizeBytes: input.buffer.length,
      publicUrl: publicUrl(input.bucket, storageKey),
    };
  },

  async getDownloadStream(storageKey: string, bucket: string): Promise<GetFileResult> {
    const filePath = join(bucketDir(bucket), storageKey);

    // Verify the file exists before opening a stream
    let sizeBytes = 0;
    try {
      const info = await stat(filePath);
      sizeBytes = info.size;
    } catch {
      throw new Error(`File not found: ${bucket}/${storageKey}`);
    }

    const stream = createReadStream(filePath);

    // Derive MIME from extension (best-effort)
    const ext = storageKey.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv', txt: 'text/plain', zip: 'application/zip',
    };

    return {
      stream,
      mimeType: mimeMap[ext] ?? 'application/octet-stream',
      sizeBytes,
      originalName: storageKey,
    };
  },

  async deleteFile(storageKey: string, bucket: string): Promise<void> {
    try {
      await unlink(join(bucketDir(bucket), storageKey));
    } catch {
      // Already gone — not an error
    }
  },

  async getSignedUrl(storageKey: string, bucket: string): Promise<string> {
    // Local provider has no signing — return the public URL directly
    return publicUrl(bucket, storageKey);
  },
};
