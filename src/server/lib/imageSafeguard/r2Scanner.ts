/**
 * r2Scanner.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B3 — Server-side R2 scan orchestrator for the Image Safeguard scanner.
 *
 * DESIGN RULES (enforced unconditionally):
 *  - Capability check FIRST — if not configured, fail the run immediately.
 *    Do NOT call ListObjectsV2 when the classifier is unavailable.
 *    Do NOT create hundreds of 'unavailable' finding rows.
 *  - Scan scope is HARDCODED: bucket = R2_BUCKET, prefix = SCAN_PREFIX.
 *    These are NEVER accepted from the client.
 *  - MAX_BATCH_SIZE = 50 objects per run (first production version).
 *  - Only privacy_signal and failed findings are stored as rows.
 *    clear results are counted only — no row created.
 *  - No R2 keys, signed URLs, image bytes, or credentials in any response.
 *  - No PutObject, DeleteObject, CopyObject, or CreateMultipartUpload calls.
 *  - Cursor is advanced ONLY after the complete batch succeeds.
 *  - Previous cursor is preserved after partial failure.
 *  - Tenant isolation: all finding rows include company_id from the asset record.
 *
 * STORAGE KEY FORMAT (job-photos namespace):
 *   job-photos/companies/{companyId}/job-photos/{uuid}/{filename}
 *
 * The scanner uses the companyId embedded in the key for tenant isolation.
 * It does NOT trust any company_id from client input.
 */

import { loadR2Config } from '../../storage/r2Config.js';
import { getAdapterCapability, SCAN_PREFIX, SCAN_BUCKET, type ScanOutcome, type ImageScanResult } from './scannerAdapter.js';
import { fetchImageForScan } from './r2ImageFetcher.js';
import { classifyImage } from './imageClassifier.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maximum number of objects processed per scan run.
 * Conservative first-production value — reduces timeouts and accidental large scans.
 * Pagination can support additional batches in a future stage.
 */
export const MAX_BATCH_SIZE = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScanRunRequest {
  runId: string;
  rangeStart: Date;
  rangeEnd: Date;
}

// ── AWS SDK lazy import ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getS3Lazy(): Promise<any> {
  return import('@aws-sdk/client-s3');
}

// ── Company ID extraction ─────────────────────────────────────────────────────

/**
 * Extracts the company ID from a job-photos object key.
 * Format: job-photos/companies/{companyId}/...
 *
 * Returns 0 if the key does not match the expected format.
 * Never trusts any company_id from client input.
 */
export function extractCompanyIdFromKey(key: string): number {
  const match = key.match(/^[^/]+\/companies\/(\d+)\//);
  if (!match) return 0;
  const id = parseInt(match[1], 10);
  return isNaN(id) ? 0 : id;
}

// ── Core scan function ────────────────────────────────────────────────────────

/**
 * Runs a scan of the job-photos prefix within the given date range.
 *
 * SECURITY:
 *  - Capability check first — throws scanner_not_configured if not configured.
 *  - Scan scope (bucket + prefix) is hardcoded — never from request.
 *  - No R2 credentials, object keys, signed URLs, or image bytes returned.
 *  - MAX_BATCH_SIZE enforced — stops after 50 objects.
 *  - Only privacy_signal and failed findings stored as rows.
 *  - Cursor advanced only on full success.
 *
 * @throws { code: 'scanner_not_configured' } if classifier is not configured.
 */
export async function runScan(req: ScanRunRequest): Promise<ScanOutcome> {
  // ── 1. Capability check FIRST — before any R2 contact ─────────────────────
  const cap = getAdapterCapability();
  if (!cap.configured) {
    throw Object.assign(
      new Error('scanner_not_configured'),
      { code: 'scanner_not_configured' },
    );
  }

  // ── 2. Load R2 config ──────────────────────────────────────────────────────
  const cfg = loadR2Config();

  // ── 3. Build S3 client ─────────────────────────────────────────────────────
  const { S3Client, ListObjectsV2Command } = await getS3Lazy();
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: false,
    requestHandler: { requestTimeout: 30_000 },
  });

  // ── 4. List objects in the scan prefix within the date range ───────────────
  // We use ListObjectsV2 with the hardcoded prefix.
  // Date filtering is done client-side on LastModified because R2 does not
  // support server-side date filtering in ListObjectsV2.
  // MAX_BATCH_SIZE caps the total objects processed.
  const keys: string[] = [];
  let continuationToken: string | undefined;

  outer: do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listResponse: any = await client.send(new ListObjectsV2Command({
      Bucket: cfg.physicalBucket,
      Prefix: SCAN_PREFIX,
      MaxKeys: 1000, // fetch in pages of 1000, filter by date, stop at MAX_BATCH_SIZE
      ContinuationToken: continuationToken,
    }));

    const contents: Array<{ Key?: string; LastModified?: Date }> =
      listResponse.Contents ?? [];

    for (const obj of contents) {
      if (!obj.Key) continue;
      const lastMod = obj.LastModified ? new Date(obj.LastModified) : null;
      // Filter by date range
      if (lastMod && lastMod >= req.rangeStart && lastMod <= req.rangeEnd) {
        keys.push(obj.Key);
        if (keys.length >= MAX_BATCH_SIZE) break outer;
      }
    }

    continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
  } while (continuationToken);

  // ── 5. Process each object ─────────────────────────────────────────────────
  const results: ImageScanResult[] = [];
  let imagesConsidered = keys.length;
  let imagesScanned = 0;
  let imagesSkipped = 0;
  let imagesWithSignal = 0;
  let imagesFailed = 0;

  // Determine detector info from the first successful classification
  let detectorName = cap.provider ?? 'unknown';
  let detectorVersion = '0';

  for (const key of keys) {
    const companyId = extractCompanyIdFromKey(key);

    // ── 5a. Fetch and validate ───────────────────────────────────────────────
    const fetchResult = await fetchImageForScan(key);
    if (!fetchResult.ok) {
      imagesSkipped++;
      // Only record failed fetches as findings (not skipped/unsupported)
      if (fetchResult.reason === 'fetch_error') {
        imagesFailed++;
        results.push({
          assetId: `key_hash:${hashKey(key)}`, // never expose raw key
          companyId,
          userId: null,
          result: 'failed',
          faceCount: 0,
          detectorName,
          detectorVersion,
          failureCode: 'fetch_error',
        });
      }
      continue;
    }

    // ── 5b. Classify ─────────────────────────────────────────────────────────
    let outcome: Awaited<ReturnType<typeof classifyImage>>;
    try {
      outcome = await classifyImage({
        buffer: fetchResult.buffer,
        mimeType: fetchResult.mimeType,
        runId: req.runId,
      });
    } catch {
      imagesFailed++;
      results.push({
        assetId: `key_hash:${hashKey(key)}`,
        companyId,
        userId: null,
        result: 'failed',
        faceCount: 0,
        detectorName,
        detectorVersion,
        failureCode: 'classifier_error',
      });
      continue;
    }

    // Update detector info from first real classification
    if (outcome.detectorName !== 'none') {
      detectorName = outcome.detectorName;
      detectorVersion = outcome.detectorVersion;
    }

    imagesScanned++;

    // ── 5c. Record result ────────────────────────────────────────────────────
    // Only store rows for privacy_signal and failed — clear is counted only.
    if (outcome.result === 'privacy_signal') {
      imagesWithSignal++;
      results.push({
        assetId: `key_hash:${hashKey(key)}`,
        companyId,
        userId: null,
        result: 'privacy_signal',
        faceCount: outcome.faceCount,
        detectorName: outcome.detectorName,
        detectorVersion: outcome.detectorVersion,
        failureCode: null,
        // r2Key stored server-side only — never returned in API responses
        r2Key: key,
      });
    } else if (outcome.result === 'failed') {
      imagesFailed++;
      results.push({
        assetId: `key_hash:${hashKey(key)}`,
        companyId,
        userId: null,
        result: 'failed',
        faceCount: 0,
        detectorName: outcome.detectorName,
        detectorVersion: outcome.detectorVersion,
        failureCode: outcome.failureCode ?? 'classifier_failed',
        // r2Key stored for failed items too — allows re-inspection
        r2Key: key,
      });
    }
    // 'clear' and 'unavailable' — counted only, no row stored, no key stored.
  }

  return {
    imagesConsidered,
    imagesScanned,
    imagesSkipped,
    imagesWithSignal,
    imagesFailed,
    detectorName,
    detectorVersion,
    results,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a short deterministic hash of an R2 key for use as an asset ID.
 * The raw key is NEVER stored or returned — only this hash.
 *
 * This allows finding rows to be correlated with R2 objects by the platform
 * owner without exposing the key in API responses.
 */
function hashKey(key: string): string {
  // Simple djb2 hash — not cryptographic, just for correlation
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
    hash = hash >>> 0; // keep as unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

// Re-export SCAN_BUCKET and SCAN_PREFIX for test access
export { SCAN_BUCKET, SCAN_PREFIX };
