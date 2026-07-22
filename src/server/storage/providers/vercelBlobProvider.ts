/**
 * Vercel Blob Storage Provider  (STUB — not yet active)
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO: To activate this provider:
 *   1. npm install @vercel/blob
 *   2. Add BLOB_READ_WRITE_TOKEN to secrets
 *   3. Implement the methods below using the @vercel/blob SDK
 *   4. In storage-service.ts, change `activeProvider` to `vercelBlobProvider`
 *
 * Vercel Blob stores objects at a CDN-backed URL like:
 *   https://<store-id>.public.blob.vercel-storage.com/<pathname>
 *
 * Signed URLs are supported via blob.generateClientTokenFromReadWriteToken()
 * for private blobs, or the URL is public for public blobs.
 *
 * Reference: https://vercel.com/docs/storage/vercel-blob
 */

import type { StorageProvider, SaveFileInput, SaveFileResult, GetFileResult } from './types.js';
import { Readable } from 'node:stream';

export const vercelBlobProvider: StorageProvider = {
  name: 'vercel-blob',
  supportsSignedUrls: true,

  async saveFile(_input: SaveFileInput): Promise<SaveFileResult> {
    // TODO: implement using @vercel/blob
    // Example:
    //   import { put } from '@vercel/blob';
    //   const blob = await put(`${input.bucket}/${storageKey}`, input.buffer, {
    //     access: 'public',
    //     contentType: input.mimeType,
    //   });
    //   return { storageKey: blob.pathname, provider: 'vercel-blob', sizeBytes: input.buffer.length, publicUrl: blob.url };
    throw new Error('[vercelBlobProvider] Not yet implemented. See TODO in vercelBlobProvider.ts');
  },

  async getDownloadStream(_storageKey: string, _bucket: string): Promise<GetFileResult> {
    // TODO: implement using fetch(blobUrl) and converting Response.body to a Node stream
    throw new Error('[vercelBlobProvider] Not yet implemented.');
    return { stream: Readable.from([]), mimeType: '', sizeBytes: 0, originalName: '' };
  },

  async deleteFile(_storageKey: string, _bucket: string): Promise<void> {
    // TODO: import { del } from '@vercel/blob'; await del(blobUrl);
    throw new Error('[vercelBlobProvider] Not yet implemented.');
  },

  async getSignedUrl(_storageKey: string, _bucket: string, _expiresInSeconds?: number): Promise<string> {
    // TODO: return the public blob URL (Vercel Blob public objects don't need signing)
    // For private blobs use generateClientTokenFromReadWriteToken()
    throw new Error('[vercelBlobProvider] Not yet implemented.');
  },
};
