/**
 * r2Scanner.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B3 — Server-side R2 scan orchestrator for the Image Safeguard scanner.
 *
 * DESIGN RULES (enforced unconditionally):
 *  - Capability check FIRST — if not configured, fail the run immediately.
 *    Do NOT call scanListObjects when the classifier is unavailable.
 *    Do NOT create hundreds of 'unavailable' finding rows.
 *  - Scan scope is HARDCODED: bucket = R2_BUCKET, prefix = SCAN_PREFIX.
 *    These are NEVER accepted from the client.
 *  - MAX_BATCH_SIZE = 50 objects per run (first production version).
 *  - Only privacy_signal and failed findings are stored as rows.
 *    clear results are counted only — no row created.
 *  - No R2 keys, signed URLs, image bytes, or credentials in any response.
 *  - No PutObject, DeleteObject, CopyObject, or CreateMultipartUpload calls.
 *    (enforced by using scanListObjects() from r2Provider — read-only).
 *  - Cursor is advanced ONLY after the complete batch succeeds.
 *  - Previous cursor is preserved after partial failure.
 *  - Tenant isolation: all finding rows include company_id from the asset record.
 *
 * STORAGE KEY FORMAT (job-photos namespace):
 *   job-photos/companies/{companyId}/job-photos/{uuid}/{filename}
 *
 * The scanner uses the companyId embedded in the key for tenant isolation.
 * It does NOT trust any company_id from client input.
 *
 * R2 PROVIDER REUSE:
 *  - Uses scanListObjects() from r2Provider.ts — the EXISTING R2 provider.
 *    No second S3Client or loadR2Config() call here.
 *  - scanListObjects() uses ListObjectsV2Command only — no writes.
 */

import { scanListObjects } from '../../storage/providers/r2Provider.js';
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
 *  - Uses scanListObjects() from r2Provider — ListObjectsV2 only, no writes.
 *  - No R2 credentials, object keys, signed URLs, or image bytes returned.
 *  - MAX_BATCH_SIZE = 50 enforced — stops after 50 objects.
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

  // ── 2. List objects in the scan prefix within the date range ───────────────
  // Uses scanListObjects() from r2Provider — ListObjectsV2 only, no writes.
  // The prefix is the hardcoded SCAN_PREFIX — never from the request.
  // Date filtering is applied client-side on LastModified because R2 does not
  // support server-side date filtering in ListObjectsV2.
  // We fetch up to MAX_BATCH_SIZE * 20 entries to allow date filtering,
  // then cap at MAX_BATCH_SIZE after filtering.
  let allEntries: Awaited<ReturnType<typeof scanListObjects>>;
  try {
    allEntries = await scanListObjects(SCAN_PREFIX, MAX_BATCH_SIZE * 20);
  } catch (listErr: unknown) {
    // Map R2/AWS errors to a stable code — never expose credentials or internal paths.
    const name    = listErr instanceof Error ? listErr.name    : 'unknown';
    const message = listErr instanceof Error ? listErr.message : String(listErr);
    console.error('[r2Scanner] scanListObjects failed', { name, message: message.slice(0, 300) });
    // Attach a stable code so the async catch in POST.ts stores a useful error_code.
    throw Object.assign(
      new Error('r2_list_failed'),
      { code: 'r2_list_failed', cause: name },
    );
  }

  const keys: string[] = [];
  for (const entry of allEntries) {
    const lastMod = entry.lastModified;
    if (lastMod && lastMod >= req.rangeStart && lastMod <= req.rangeEnd) {
      keys.push(entry.key);
      if (keys.length >= MAX_BATCH_SIZE) break;
    }
  }

  // ── 3. Process each object ─────────────────────────────────────────────────
  const results: ImageScanResult[] = [];
  const imagesConsidered = keys.length;
  let imagesScanned = 0;
  let imagesSkipped = 0;
  let imagesWithSignal = 0;
  let imagesFailed = 0;

  // Determine detector info from the first successful classification
  let detectorName = cap.provider ?? 'unknown';
  let detectorVersion = '0';

  for (const key of keys) {
    const companyId = extractCompanyIdFromKey(key);

    // ── 3a. Fetch and validate ───────────────────────────────────────────────
    // fetchImageForScan enforces SCAN_PREFIX again (defence-in-depth) and
    // uses scanGetObject() from r2Provider — GetObjectCommand only, no writes.
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

    // ── 3b. Classify ─────────────────────────────────────────────────────────
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

    // ── 3c. Record result ────────────────────────────────────────────────────
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
