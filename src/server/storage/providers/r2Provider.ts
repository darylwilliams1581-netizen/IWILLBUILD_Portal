/**
 * Cloudflare R2 Storage Provider
 * ─────────────────────────────────────────────────────────────────────────────
 * R2 is S3-compatible, so this uses the AWS SDK v3 with a custom endpoint.
 *
 * Required environment variables (set via Settings → Secrets):
 *   R2_ACCOUNT_ID          — Cloudflare account ID
 *   R2_ACCESS_KEY_ID       — R2 API token Access Key ID
 *   R2_SECRET_ACCESS_KEY   — R2 API token Secret Access Key
 *   R2_BUCKET              — R2 bucket name (e.g. "iwillbuild-files")
 *   R2_PUBLIC_URL          — Optional: public bucket URL for direct serving
 *                            (e.g. https://files.iwillbuild.com)
 *                            If omitted, signed URLs are used for all downloads.
 *
 * Object key pattern:  <bucket>/<storageKey>
 *   e.g.  job-photos/a1b2c3d4-uuid.jpg
 *
 * Signed URL expiry:   1 hour by default (configurable per-call)
 *
 * R2 docs: https://developers.cloudflare.com/r2/api/s3/
 */

// AWS SDK loaded lazily — keeps it out of the SSR bundle (avoids OOM on build).
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { StorageProvider, SaveFileInput, SaveFileResult, GetFileResult } from './types.js';
import { getSecret } from '#airo/secrets';

async function getS3() {
  return import('@aws-sdk/client-s3') as Promise<typeof import('@aws-sdk/client-s3')>;
}
async function getPresigner() {
  return import('@aws-sdk/s3-request-presigner') as Promise<typeof import('@aws-sdk/s3-request-presigner')>;
}

// ── Client factory (lazy, singleton per process) ──────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any | null = null;

async function getClient() {
  if (_client) return _client;

  const accountId = getSecret('R2_ACCOUNT_ID') || process.env.R2_ACCOUNT_ID;
  const accessKeyId = getSecret('R2_ACCESS_KEY_ID') || process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = getSecret('R2_SECRET_ACCESS_KEY') || process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      '[r2Provider] Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in Secrets.'
    );
  }

  const { S3Client } = await getS3();
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return _client;
}

function getBucket(): string {
  const bucket = getSecret('R2_BUCKET') || process.env.R2_BUCKET;
  if (!bucket) throw new Error('[r2Provider] R2_BUCKET env var is not set.');
  return bucket;
}

/** Object key stored in the DB — includes the logical bucket as a prefix */
function objectKey(bucket: string, storageKey: string): string {
  return `${bucket}/${storageKey}`;
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/gif': 'gif', 'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/csv': 'csv', 'text/plain': 'txt',
    'application/zip': 'zip', 'application/x-zip-compressed': 'zip',
  };
  return map[mime] ?? 'bin';
}

// ── Provider implementation ───────────────────────────────────────────────────

export const r2Provider: StorageProvider = {
  name: 'r2',
  supportsSignedUrls: true,

  async saveFile(input: SaveFileInput): Promise<SaveFileResult> {
    const client = await getClient();
    const { PutObjectCommand, GetObjectCommand } = await getS3();
    const { getSignedUrl: awsGetSignedUrl } = await getPresigner();
    const r2Bucket = getBucket();
    const ext = extFromMime(input.mimeType);
    const storageKey = input.storageKey ?? `${randomUUID()}.${ext}`;
    const key = objectKey(input.bucket, storageKey);

    // AWS SDK v3 in a Vite SSR bundle can misidentify a Buffer as a stream
    // ("Unable to calculate hash for flowing readable stream") because the
    // bundled Buffer class reference differs from the runtime one.
    // Copying bytes into a plain Uint8Array (not a Buffer subclass) forces
    // the SDK's hash middleware to treat it as an in-memory blob, not a stream.
    const rawBytes = input.buffer;
    const bodyBytes = new Uint8Array(
      rawBytes.buffer,
      rawBytes.byteOffset,
      rawBytes.byteLength,
    );

    console.log(`[r2Provider] saveFile key=${key} size=${rawBytes.byteLength} bodyType=${bodyBytes.constructor.name}`);

    await client.send(new PutObjectCommand({
      Bucket: r2Bucket,
      Key: key,
      Body: bodyBytes,
      ContentType: input.mimeType,
      ContentLength: rawBytes.byteLength,
      ContentDisposition: `inline; filename="${encodeURIComponent(input.originalName)}"`,
      Metadata: {
        originalName: input.originalName,
        bucket: input.bucket,
      },
    }));

    const publicBase = (getSecret('R2_PUBLIC_URL') || process.env.R2_PUBLIC_URL)?.replace(/\/$/, '');
    const publicUrl = publicBase
      ? `${publicBase}/${key}`
      : await awsGetSignedUrl(client, new GetObjectCommand({ Bucket: r2Bucket, Key: key }), { expiresIn: 3600 });

    return {
      storageKey,
      provider: 'r2',
      sizeBytes: input.buffer.length,
      publicUrl,
    };
  },

  async getDownloadStream(storageKey: string, bucket: string): Promise<GetFileResult> {
    const client = await getClient();
    const { GetObjectCommand } = await getS3();
    const r2Bucket = getBucket();
    const key = objectKey(bucket, storageKey);

    const response = await client.send(new GetObjectCommand({
      Bucket: r2Bucket,
      Key: key,
    }));

    if (!response.Body) {
      throw new Error(`[r2Provider] Empty body for key: ${key}`);
    }

    const stream = response.Body as unknown as Readable;

    return {
      stream,
      mimeType: response.ContentType ?? 'application/octet-stream',
      sizeBytes: response.ContentLength ?? 0,
      originalName: response.Metadata?.originalName ?? storageKey,
    };
  },

  async deleteFile(storageKey: string, bucket: string): Promise<void> {
    try {
      const client = await getClient();
      const { DeleteObjectCommand } = await getS3();
      const r2Bucket = getBucket();
      await client.send(new DeleteObjectCommand({
        Bucket: r2Bucket,
        Key: objectKey(bucket, storageKey),
      }));
    } catch {
      // Best-effort — already gone is fine
    }
  },

  async getSignedUrl(storageKey: string, bucket: string, expiresInSeconds = 3600): Promise<string> {
    const client = await getClient();
    const { GetObjectCommand } = await getS3();
    const { getSignedUrl: awsGetSignedUrl } = await getPresigner();
    const r2Bucket = getBucket();
    const key = objectKey(bucket, storageKey);

    const publicBase = (getSecret('R2_PUBLIC_URL') || process.env.R2_PUBLIC_URL)?.replace(/\/$/, '');
    if (publicBase) return `${publicBase}/${key}`;

    return awsGetSignedUrl(
      client,
      new GetObjectCommand({ Bucket: r2Bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  },
};

// ── Health check (used by the config API) ─────────────────────────────────────

/**
 * Verify R2 credentials and bucket access by doing a HeadObject on a
 * sentinel key.  Returns { ok: true } or { ok: false, error: string }.
 */
export async function testR2Connection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await getClient();
    const { HeadObjectCommand } = await getS3();
    const r2Bucket = getBucket();

    try {
      await client.send(new HeadObjectCommand({
        Bucket: r2Bucket,
        Key: '__iwillbuild_connection_test__',
      }));
    } catch (err: unknown) {
      const code = (err as { name?: string; $metadata?: { httpStatusCode?: number } })?.name;
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (code === 'NotFound' || code === 'NoSuchKey' || status === 404) {
        return { ok: true };
      }
      throw err;
    }

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
