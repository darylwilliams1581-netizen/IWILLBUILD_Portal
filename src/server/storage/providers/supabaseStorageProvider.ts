/**
 * Supabase Storage Provider  (STUB — not yet active)
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO: To activate this provider:
 *   1. npm install @supabase/supabase-js
 *   2. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to secrets
 *   3. Create a Supabase Storage bucket named 'iwillbuild-files' (or per bucket)
 *   4. Implement the methods below using the Supabase Storage SDK
 *   5. In storage-service.ts, change `activeProvider` to `supabaseStorageProvider`
 *
 * Supabase Storage object path pattern:  <bucket>/<storageKey>
 * Public URL:  <SUPABASE_URL>/storage/v1/object/public/<bucket>/<storageKey>
 * Signed URL:  <SUPABASE_URL>/storage/v1/object/sign/<bucket>/<storageKey>?token=...
 *
 * Reference: https://supabase.com/docs/guides/storage
 */

import type { StorageProvider, SaveFileInput, SaveFileResult, GetFileResult } from './types.js';
import { Readable } from 'node:stream';

export const supabaseStorageProvider: StorageProvider = {
  name: 'supabase-storage',
  supportsSignedUrls: true,

  async saveFile(_input: SaveFileInput): Promise<SaveFileResult> {
    // TODO: implement using @supabase/supabase-js
    // Example:
    //   import { createClient } from '@supabase/supabase-js';
    //   const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    //   const { error } = await supabase.storage.from(input.bucket).upload(storageKey, input.buffer, { contentType: input.mimeType, upsert: false });
    //   const { data } = supabase.storage.from(input.bucket).getPublicUrl(storageKey);
    //   return { storageKey, provider: 'supabase-storage', sizeBytes: input.buffer.length, publicUrl: data.publicUrl };
    throw new Error('[supabaseStorageProvider] Not yet implemented. See TODO in supabaseStorageProvider.ts');
  },

  async getDownloadStream(_storageKey: string, _bucket: string): Promise<GetFileResult> {
    // TODO: supabase.storage.from(bucket).download(storageKey) → ArrayBuffer → Buffer → Readable
    throw new Error('[supabaseStorageProvider] Not yet implemented.');
    return { stream: Readable.from([]), mimeType: '', sizeBytes: 0, originalName: '' };
  },

  async deleteFile(_storageKey: string, _bucket: string): Promise<void> {
    // TODO: supabase.storage.from(bucket).remove([storageKey])
    throw new Error('[supabaseStorageProvider] Not yet implemented.');
  },

  async getSignedUrl(_storageKey: string, _bucket: string, expiresInSeconds = 3600): Promise<string> {
    // TODO: const { data } = await supabase.storage.from(bucket).createSignedUrl(storageKey, expiresInSeconds);
    //       return data!.signedUrl;
    void expiresInSeconds;
    throw new Error('[supabaseStorageProvider] Not yet implemented.');
  },
};
