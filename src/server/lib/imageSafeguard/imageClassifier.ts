/**
 * imageClassifier.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B3 — Image classifier boundary for the Image Safeguard scanner.
 *
 * DESIGN RULES (enforced unconditionally):
 *  - Returns ONLY: clear | privacy_signal | unavailable | failed.
 *  - NEVER infers or reports: identity, age, gender, ethnicity, criminality,
 *    intent, or any personal characteristic.
 *  - privacy_signal means "human review recommended" ONLY — not a legal
 *    conclusion, not proof of inappropriate content.
 *  - No image bytes, R2 keys, or signed URLs are returned.
 *  - No raw model output is stored or returned.
 *  - The classifier never runs in the browser or on a user device.
 *
 * CURRENT STATE:
 *  - The Python worker (opencv-python-headless) is not provisioned.
 *  - All calls return { result: 'unavailable', reason: 'scanner_not_configured' }.
 *  - This is intentional — production scanning is disabled until the
 *    synthetic-image POC passes.
 *
 * ACTIVATION:
 *  - Set SCANNER_WORKER_URL and SCANNER_WORKER_SECRET secrets.
 *  - The adapter will return configured:true.
 *  - Replace the stub body below with a call to the worker HTTP endpoint.
 *  - The worker receives only: runId, a temporary local file path (worker-managed),
 *    and the validated MIME type. It returns only the result code + faceCount.
 *  - The worker NEVER receives R2 credentials, object keys, or signed URLs.
 */

import { getAdapterCapability } from './scannerAdapter.js';

// ── Result types ──────────────────────────────────────────────────────────────

export type ClassifierResult = 'clear' | 'privacy_signal' | 'unavailable' | 'failed';

export interface ClassifyRequest {
  /** Validated image buffer — JPEG, PNG, or WebP only. */
  buffer: Buffer;
  /** Validated MIME type from magic bytes. */
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Run ID for correlation — NOT returned in response. */
  runId: string;
}

export interface ClassifyOutcome {
  result: ClassifierResult;
  /**
   * Number of faces detected (0 when result is clear or unavailable).
   * This is a count only — no identity, age, gender, or other attributes.
   */
  faceCount: number;
  detectorName: string;
  detectorVersion: string;
  /** Sanitized failure code — only set when result is 'failed'. */
  failureCode: string | null;
}

// ── Classifier ────────────────────────────────────────────────────────────────

/**
 * Classifies an image buffer.
 *
 * SECURITY:
 *  - Never infers identity, age, gender, ethnicity, criminality, or intent.
 *  - Returns only the 4 permitted result codes.
 *  - No image bytes or raw model output in the return value.
 *  - Never throws — returns { result: 'failed' } on any error.
 *
 * Currently returns 'unavailable' because the Python worker is not provisioned.
 */
export async function classifyImage(req: ClassifyRequest): Promise<ClassifyOutcome> {
  const cap = getAdapterCapability();

  if (!cap.configured) {
    return {
      result: 'unavailable',
      faceCount: 0,
      detectorName: 'none',
      detectorVersion: '0',
      failureCode: 'scanner_not_configured',
    };
  }

  // ── Future implementation ──────────────────────────────────────────────────
  // When the Python worker is provisioned:
  //
  // 1. Write buffer to a temporary file (worker-managed, not here).
  // 2. POST to SCANNER_WORKER_URL/classify with:
  //    - runId (for correlation)
  //    - mimeType (validated)
  //    - The buffer as multipart/form-data (worker receives bytes, not R2 key)
  //    - X-Scanner-Secret header
  // 3. Worker returns: { result, faceCount, detectorName, detectorVersion }
  //    - result is one of: clear | privacy_signal | unavailable | failed
  //    - faceCount is a non-negative integer
  //    - NO identity, age, gender, ethnicity, or other attributes
  // 4. Map worker response to ClassifyOutcome.
  // 5. Worker cleans up its own temp files.
  //
  // Example (not yet active):
  // const workerUrl = getSecret('SCANNER_WORKER_URL')!;
  // const workerSecret = getSecret('SCANNER_WORKER_SECRET')!;
  // const form = new FormData();
  // form.append('runId', req.runId);
  // form.append('mimeType', req.mimeType);
  // form.append('image', new Blob([req.buffer], { type: req.mimeType }), 'image');
  // const response = await fetch(`${workerUrl}/classify`, {
  //   method: 'POST',
  //   headers: { 'X-Scanner-Secret': workerSecret },
  //   body: form,
  //   signal: AbortSignal.timeout(60_000),
  // });
  // const data = await response.json();
  // return {
  //   result: data.result,
  //   faceCount: Number(data.faceCount ?? 0),
  //   detectorName: String(data.detectorName ?? 'unknown'),
  //   detectorVersion: String(data.detectorVersion ?? '0'),
  //   failureCode: null,
  // };

  // This path is unreachable until a worker is configured.
  return {
    result: 'unavailable',
    faceCount: 0,
    detectorName: 'none',
    detectorVersion: '0',
    failureCode: 'scanner_not_configured',
  };
}
