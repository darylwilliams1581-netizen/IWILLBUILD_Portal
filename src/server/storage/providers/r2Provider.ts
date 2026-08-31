/**
 * Cloudflare R2 Storage Provider
 * ─────────────────────────────────────────────────────────────────────────────
 * R2 is S3-compatible. Uploads use a hand-rolled AWS Signature V4 PUT request
 * (via Node's built-in `crypto`) to avoid the AWS SDK v3 hash-middleware bug
 * that throws "Unable to calculate hash for flowing readable stream" when the
 * SDK is bundled by Vite SSR.  Downloads and signed URLs still use the SDK
 * (GET requests don't trigger the hash middleware).
 *
 * Required environment variables (set via Settings → Secrets):
 *   R2_ACCOUNT_ID          — Cloudflare account ID
 *   R2_ACCESS_KEY_ID       — R2 API token Access Key ID
 *   R2_SECRET_ACCESS_KEY   — R2 API token Secret Access Key
 *   R2_BUCKET              — R2 bucket name (e.g. "iwillbuild-files")
 *   R2_PUBLIC_URL          — Optional: public bucket URL for direct serving
 *
 * Object key pattern:  <bucket>/<storageKey>
 */

import { randomUUID, createHmac, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { StorageProvider, SaveFileInput, SaveFileResult, GetFileResult } from './types.js';
import { getSecret } from '#airo/secrets';
import { loadR2Config, redactStorageUrl } from '../r2Config.js';

// ── AWS SDK lazy imports — ONLY used for GET/DELETE/signed URLs, never for PUT ──
// These are intentionally NOT imported at module scope so Vite SSR does not
// bundle the SDK hash-middleware into the initial chunk.  saveFile() uses the
// hand-rolled SigV4 PUT below and never touches these functions.

async function getS3Lazy() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return import('@aws-sdk/client-s3') as Promise<any>;
}
async function getPresignerLazy() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return import('@aws-sdk/s3-request-presigner') as Promise<any>;
}

// ── Client factory (lazy, singleton — used for GET/DELETE/signed URLs only) ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any | null = null;

async function getClient() {
  if (_client) return _client;

  const cfg = loadR2Config(); // throws with sanitized error if any secret is absent

  const { S3Client } = await getS3Lazy();
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: false, // virtual-hosted style — required by R2
    requestHandler: {
      requestTimeout: 30_000, // 30 s per SDK request
    },
  });

  return _client;
}

function getBucket(): string {
  const cfg = loadR2Config();
  return cfg.physicalBucket;
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

// ── AWS Signature V4 helpers (no SDK — avoids hash-middleware crash) ──────────

function sha256hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function signingKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate    = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion  = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  return kSigning;
}

/**
 * Upload a buffer directly to R2 via a hand-signed AWS Signature V4 PUT.
 * This bypasses the AWS SDK v3 hash middleware entirely.
 */
async function putObjectDirect(opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  r2Bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
  contentDisposition: string;
  metadata: Record<string, string>;
}): Promise<void> {
  const { accountId, accessKeyId, secretAccessKey, r2Bucket, key, body, contentType, contentDisposition, metadata } = opts;

  // R2 requires virtual-hosted style: https://{bucket}.{accountId}.r2.cloudflarestorage.com/{key}
  // Path-style (https://{accountId}.r2.cloudflarestorage.com/{bucket}/{key}) returns NoSuchBucket.
  const host = `${r2Bucket}.${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'; // YYYYMMDDTHHmmssZ
  const dateStamp = amzDate.slice(0, 8); // YYYYMMDD

  const payloadHash = sha256hex(body);

  // Build canonical headers — must be sorted alphabetically by header name
  const metaHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    metaHeaders[`x-amz-meta-${k.toLowerCase()}`] = v;
  }

  const allHeaders: Record<string, string> = {
    'content-disposition': contentDisposition,
    'content-length': String(body.length),
    'content-type': contentType,
    'host': host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...metaHeaders,
  };

  const sortedHeaderNames = Object.keys(allHeaders).sort();
  const canonicalHeaders = sortedHeaderNames.map(h => `${h}:${allHeaders[h]}\n`).join('');
  const signedHeaders = sortedHeaderNames.join(';');

  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const canonicalRequest = [
    'PUT',
    `/${encodedKey}`,
    '', // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256hex(Buffer.from(canonicalRequest)),
  ].join('\n');

  const sigKey = signingKey(secretAccessKey, dateStamp, region, service);
  const signature = hmacSha256(sigKey, stringToSign).toString('hex');

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}/${encodedKey}`;
  const fetchHeaders: Record<string, string> = {
    'Authorization': authHeader,
    'Content-Disposition': contentDisposition,
    'Content-Length': String(body.length),
    'Content-Type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  for (const [k, v] of Object.entries(metaHeaders)) {
    fetchHeaders[k] = v;
  }

  // Log path only — never log the full URL (contains accountId in the host)
  console.log(`[r2Provider] PUT /${encodedKey} size=${body.length} contentType=${contentType}`);

  const response = await fetch(url, {
    method: 'PUT',
    headers: fetchHeaders,
    body,
    // @ts-expect-error — Node 18+ fetch accepts Buffer as body
    duplex: 'half',
    signal: AbortSignal.timeout(60_000), // 60 s upload timeout
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`[r2Provider] PUT failed: ${response.status} ${response.statusText} — ${text}`);
  }
}

// ── Provider implementation ───────────────────────────────────────────────────

export const r2Provider: StorageProvider = {
  name: 'r2',
  supportsSignedUrls: true,

  async saveFile(input: SaveFileInput): Promise<SaveFileResult> {
    const cfg = loadR2Config(); // fails closed if any secret is absent

    const ext        = extFromMime(input.mimeType);
    const storageKey = input.storageKey ?? `${randomUUID()}.${ext}`;
    const key        = objectKey(input.bucket, storageKey);

    // Ensure a true Node.js Buffer regardless of what Jimp / busboy returns
    const body = Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from(input.buffer);

    // Use `attachment` disposition for documents; `inline` only for images
    const isImage = input.mimeType.startsWith('image/');
    const disposition = isImage
      ? `inline; filename="${encodeURIComponent(input.originalName)}"`
      : `attachment; filename="${encodeURIComponent(input.originalName)}"`;

    await putObjectDirect({
      accountId:       cfg.accountId,
      accessKeyId:     cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      r2Bucket:        cfg.physicalBucket,
      key,
      body,
      contentType: input.mimeType,
      contentDisposition: disposition,
      metadata: {
        originalName: input.originalName,
        bucket: input.bucket,
      },
    });

    let publicUrl: string;

    if (cfg.publicUrl) {
      publicUrl = `${cfg.publicUrl}/${key}`;
    } else {
      // Fall back to a signed URL via the SDK (GET — no hash middleware issue)
      const client = await getClient();
      const { GetObjectCommand } = await getS3Lazy();
      const { getSignedUrl: awsGetSignedUrl } = await getPresignerLazy();
      publicUrl = await awsGetSignedUrl(
        client,
        new GetObjectCommand({ Bucket: cfg.physicalBucket, Key: key }),
        { expiresIn: 3600 },
      );
    }

    return {
      storageKey,
      provider: 'r2',
      sizeBytes: body.length,
      publicUrl,
    };
  },

  async getDownloadStream(storageKey: string, bucket: string): Promise<GetFileResult> {
    const client = await getClient();
    const { GetObjectCommand } = await getS3Lazy();
    const r2Bucket = getBucket();
    const key = objectKey(bucket, storageKey);

    const response = await client.send(new GetObjectCommand({
      Bucket: r2Bucket,
      Key: key,
    }));

    if (!response.Body) {
      throw new Error(`[r2Provider] Empty body for key: ${redactStorageUrl(`https://bucket.host/${key}`)}`);
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
      const { DeleteObjectCommand } = await getS3Lazy();
      const r2Bucket = getBucket();
      await client.send(new DeleteObjectCommand({
        Bucket: r2Bucket,
        Key: objectKey(bucket, storageKey),
      }));
    } catch (err: unknown) {
      // Log error category only — never log the key or credentials
      const category = err instanceof Error ? err.constructor.name : 'UnknownError';
      console.warn(`[r2Provider] deleteFile best-effort failed: category=${category}`);
    }
  },

  async getSignedUrl(storageKey: string, bucket: string, expiresInSeconds = 3600): Promise<string> {
    const cfg = loadR2Config();
    if (cfg.publicUrl) return `${cfg.publicUrl}/${objectKey(bucket, storageKey)}`;

    const client = await getClient();
    const { GetObjectCommand } = await getS3Lazy();
    const { getSignedUrl: awsGetSignedUrl } = await getPresignerLazy();
    const key = objectKey(bucket, storageKey);

    return awsGetSignedUrl(
      client,
      new GetObjectCommand({ Bucket: cfg.physicalBucket, Key: key }),
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
    const client = await getClient(); // uses loadR2Config() — fails closed
    const { HeadObjectCommand } = await getS3Lazy();
    const cfg = loadR2Config();

    try {
      await client.send(new HeadObjectCommand({
        Bucket: cfg.physicalBucket,
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
    // Return a sanitized error category — never raw message (may contain credentials)
    const category = err instanceof Error ? err.constructor.name : 'UnknownError';
    const isConfig = err instanceof Error && err.message.includes('r2Config');
    return {
      ok: false,
      error: isConfig ? 'missing_credentials' : `connectivity_error:${category}`,
    };
  }
}
