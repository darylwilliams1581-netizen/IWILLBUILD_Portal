/**
 * AWS S3 / Cloudflare R2 Storage Provider  (STUB — not yet active)
 * ─────────────────────────────────────────────────────────────────────────────
 * Works for both AWS S3 and Cloudflare R2 (R2 is S3-compatible).
 *
 * TODO: To activate this provider:
 *   1. npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 *   2. Add secrets:
 *        S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 *        (For R2: S3_ENDPOINT = https://<account-id>.r2.cloudflarestorage.com)
 *   3. Implement the methods below using the AWS SDK v3
 *   4. In storage-service.ts, change `activeProvider` to `s3Provider`
 *
 * S3 object key pattern:  <bucket>/<storageKey>
 * Signed URL expiry:      configurable (default 1 hour)
 *
 * Reference:
 *   https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/
 *   https://developers.cloudflare.com/r2/api/s3/
 */

import type { StorageProvider, SaveFileInput, SaveFileResult, GetFileResult } from './types.js';
import { Readable } from 'node:stream';

export const s3Provider: StorageProvider = {
  name: 's3',
  supportsSignedUrls: true,

  async saveFile(_input: SaveFileInput): Promise<SaveFileResult> {
    // TODO: implement using @aws-sdk/client-s3
    // Example:
    //   import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
    //   const client = new S3Client({ region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT });
    //   await client.send(new PutObjectCommand({
    //     Bucket: process.env.S3_BUCKET,
    //     Key: `${input.bucket}/${storageKey}`,
    //     Body: input.buffer,
    //     ContentType: input.mimeType,
    //   }));
    //   return { storageKey, provider: 's3', sizeBytes: input.buffer.length, publicUrl: `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${input.bucket}/${storageKey}` };
    throw new Error('[s3Provider] Not yet implemented. See TODO in s3Provider.ts');
  },

  async getDownloadStream(_storageKey: string, _bucket: string): Promise<GetFileResult> {
    // TODO:
    //   import { GetObjectCommand } from '@aws-sdk/client-s3';
    //   const response = await client.send(new GetObjectCommand({ Bucket, Key: `${bucket}/${storageKey}` }));
    //   const stream = response.Body as Readable;
    //   return { stream, mimeType: response.ContentType ?? 'application/octet-stream', sizeBytes: response.ContentLength ?? 0, originalName: storageKey };
    throw new Error('[s3Provider] Not yet implemented.');
    return { stream: Readable.from([]), mimeType: '', sizeBytes: 0, originalName: '' };
  },

  async deleteFile(_storageKey: string, _bucket: string): Promise<void> {
    // TODO:
    //   import { DeleteObjectCommand } from '@aws-sdk/client-s3';
    //   await client.send(new DeleteObjectCommand({ Bucket, Key: `${bucket}/${storageKey}` }));
    throw new Error('[s3Provider] Not yet implemented.');
  },

  async getSignedUrl(_storageKey: string, _bucket: string, expiresInSeconds = 3600): Promise<string> {
    // TODO:
    //   import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
    //   import { GetObjectCommand } from '@aws-sdk/client-s3';
    //   return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: `${bucket}/${storageKey}` }), { expiresIn: expiresInSeconds });
    void expiresInSeconds;
    throw new Error('[s3Provider] Not yet implemented.');
  },
};
