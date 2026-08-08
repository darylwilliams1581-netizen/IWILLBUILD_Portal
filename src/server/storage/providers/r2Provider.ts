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

async function getS3() {
  return import('@aws-sdk/client-s3') as Promise<typeof import('@aws-sdk/client-s3')>;
}
async function getPresigner() {
  return import('@aws-sdk/s3-request-presigner') as Promise<typeof import('@aws-sdk/s3-request-presigner')>;
}

// ── Client factory (lazy, singleton — used for GET/DELETE/signed URLs only) ───

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

function getAccountId(): string {
  const id = getSecret('R2_ACCOUNT_ID') || process.env.R2_ACCOUNT_ID;
  if (!id) throw new Error('[r2Provider] R2_ACCOUNT_ID env var is not set.');
  return id;
}

function getAccessKey(): string {
  const k = getSecret('R2_ACCESS_KEY_ID') || process.env.R2_ACCESS_KEY_ID;
  if (!k) throw new Error('[r2Provider] R2_ACCESS_KEY_ID env var is not set.');
  return k;
}

function getSecretKey(): string {
  const k = getSecret('R2_SECRET_ACCESS_KEY') || process.env.R2_SECRET_ACCESS_KEY;
  if (!k) throw new Error('[r2Provider] R2_SECRET_ACCESS_KEY env var is not set.');
  return k;
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

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
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
    'host': `${accountId}.r2.cloudflarestorage.com`,
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

  const url = `${endpoint}/${encodedKey}`;
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

  console.log(`[r2Provider] PUT ${url} size=${body.length} contentType=${contentType}`);

  const response = await fetch(url, {
    method: 'PUT',
    headers: fetchHeaders,
    body,
    // @ts-expect-error — Node 18+ fetch accepts Buffer as body
    duplex: 'half',
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
    const accountId    = getAccountId();
    const accessKeyId  = getAccessKey();
    const secretKey    = getSecretKey();
    const r2Bucket     = getBucket();

    const ext        = extFromMime(input.mimeType);
    const storageKey = input.storageKey ?? `${randomUUID()}.${ext}`;
    const key        = objectKey(input.bucket, storageKey);

    // Ensure a true Node.js Buffer regardless of what Jimp / busboy returns
    const body = Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from(input.buffer);

    await putObjectDirect({
      accountId,
      accessKeyId,
      secretAccessKey: secretKey,
      r2Bucket,
      key,
      body,
      contentType: input.mimeType,
      contentDisposition: `inline; filename="${encodeURIComponent(input.originalName)}"`,
      metadata: {
        originalName: input.originalName,
        bucket: input.bucket,
      },
    });

    const publicBase = (getSecret('R2_PUBLIC_URL') || process.env.R2_PUBLIC_URL)?.replace(/\/$/, '');
    let publicUrl: string;

    if (publicBase) {
      publicUrl = `${publicBase}/${key}`;
    } else {
      // Fall back to a signed URL via the SDK (GET — no hash middleware issue)
      const client = await getClient();
      const { GetObjectCommand } = await getS3();
      const { getSignedUrl: awsGetSignedUrl } = await getPresigner();
      publicUrl = await awsGetSignedUrl(
        client,
        new GetObjectCommand({ Bucket: r2Bucket, Key: key }),
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
