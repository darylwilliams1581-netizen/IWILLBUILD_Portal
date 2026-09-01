/**
 * scannerAdapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B2 — Bounded scanner adapter boundary.
 *
 * RUNTIME DECISION (documented):
 * ─────────────────────────────────────────────────────────────────────────────
 * The production container is Alpine Linux (musl libc) with Python 3.12 present
 * but NO pip and NO site-packages beyond setuptools/packaging.
 *
 * The prototype scanner (review_faces.py) requires:
 *   - opencv-python-headless >= 4.10  (requires glibc — cannot run on Alpine musl)
 *   - pillow >= 10                    (requires pip — not available)
 *   - boto3 >= 1.34                   (requires pip — not available)
 *
 * TO ACTIVATE THE SCANNER IN A FUTURE STAGE:
 *   1. Provision a separate worker/sidecar with:
 *      - Debian/Ubuntu base (glibc)
 *      - Python 3.10+
 *      - pip install opencv-python-headless pillow boto3
 *      - review_faces.py deployed to the worker
 *   2. Expose a private HTTP endpoint (e.g. http://scanner-worker:8080/scan)
 *      authenticated with a shared secret (not the R2 credentials).
 *   3. Set the SCANNER_WORKER_URL and SCANNER_WORKER_SECRET secrets.
 *   4. Update getAdapterCapability() below to return configured:true.
 *   5. Implement executeScan() to call the worker endpoint.
 *
 * SECURITY RULES (enforced here regardless of configuration):
 *  - Scan scope is ALWAYS limited to bucket=iwillbuild-files, prefix=job-photos/
 *  - These values are NEVER accepted from the client.
 *  - No R2 credentials, object keys, signed URLs, or image bytes are returned.
 *  - No shell commands, paths, or scanner arguments are accepted from the client.
 *  - The scanner is never run in the browser or on a user device.
 *  - Temporary files are always cleaned up (enforced in the worker, not here).
 *  - Oversized, malformed, non-raster, and unsupported images are skipped safely
 *    by the worker (enforced via DEFAULT_MAX_BYTES, DEFAULT_MAX_PIXELS, magic-byte
 *    validation, and symlink rejection in review_faces.py).
 */

import { getSecret } from '#airo/secrets';

// ── Enforced scan scope — never accepted from client ─────────────────────────
export const SCAN_BUCKET = 'iwillbuild-files' as const;
export const SCAN_PREFIX = 'job-photos/' as const;

// ── Adapter capability ────────────────────────────────────────────────────────

export interface AdapterCapability {
  configured: boolean;
  provider: string | null;
  /** Human-readable reason when not configured. */
  reason: string | null;
}

/**
 * Returns the current adapter capability.
 *
 * Currently always returns configured:false because the Python worker
 * is not provisioned in this container.
 *
 * A future stage will check SCANNER_WORKER_URL here.
 */
export function getAdapterCapability(): AdapterCapability {
  // Future: check getSecret('SCANNER_WORKER_URL')
  const workerUrl = getSecret('SCANNER_WORKER_URL');
  if (workerUrl) {
    // Worker URL is set — but we still need the secret to authenticate
    const workerSecret = getSecret('SCANNER_WORKER_SECRET');
    if (workerSecret) {
      return {
        configured: true,
        provider: 'python_worker',
        reason: null,
      };
    }
    return {
      configured: false,
      provider: null,
      reason: 'SCANNER_WORKER_SECRET not configured.',
    };
  }

  return {
    configured: false,
    provider: null,
    reason:
      'No scanner worker configured. ' +
      'The Python scanner (opencv-python-headless) requires a separate ' +
      'glibc-based worker container. See scannerAdapter.ts for activation steps.',
  };
}

// ── Scan result types ─────────────────────────────────────────────────────────

export type ImageResult = 'clear' | 'privacy_signal' | 'unavailable' | 'failed';

export interface ImageScanResult {
  /** Internal asset ID — NOT an R2 key or signed URL. */
  assetId: string;
  companyId: number;
  userId: string | null;
  result: ImageResult;
  faceCount: number;
  detectorName: string;
  detectorVersion: string;
  /** Sanitized failure code only — no stack traces or internal paths. */
  failureCode: string | null;
  /**
   * R2 object key — stored server-side ONLY in image_safeguard_finding_keys.
   * NEVER returned in any API response. Used only for the authenticated
   * preview endpoint which streams bytes directly.
   */
  r2Key?: string;
}

export interface ScanRequest {
  runId: string;
  rangeStart: Date;
  rangeEnd: Date;
  // NOTE: scan scope (bucket + prefix) is HARDCODED in executeScan — never accepted from client.
}

export interface ScanOutcome {
  imagesConsidered: number;
  imagesScanned: number;
  imagesSkipped: number;
  imagesWithSignal: number;
  imagesFailed: number;
  detectorName: string;
  detectorVersion: string;
  results: ImageScanResult[];
}

// ── Scan execution ────────────────────────────────────────────────────────────

/**
 * Executes a scan run via the configured worker.
 *
 * SECURITY:
 *  - Scan scope (bucket + prefix) is hardcoded here — never from request.
 *  - No R2 credentials are passed to this function — the worker holds them.
 *  - No image bytes, object keys, or signed URLs are returned.
 *
 * When configured: delegates to r2Scanner.runScan() which calls ListObjectsV2,
 * fetches each image server-side, validates it, and classifies it.
 *
 * When not configured: throws scanner_not_configured immediately.
 */
export async function executeScan(req: ScanRequest): Promise<ScanOutcome> {
  const cap = getAdapterCapability();
  if (!cap.configured) {
    throw Object.assign(new Error('scanner_not_configured'), { code: 'scanner_not_configured' });
  }

  // Delegate to r2Scanner — imported lazily to avoid circular dependency
  // and to keep the adapter boundary clean.
  const { runScan } = await import('./r2Scanner.js');
  return runScan({
    runId:      req.runId,
    rangeStart: req.rangeStart,
    rangeEnd:   req.rangeEnd,
  });
}
