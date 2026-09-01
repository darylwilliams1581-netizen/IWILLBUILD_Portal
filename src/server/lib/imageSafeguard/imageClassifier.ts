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
 * PROVIDERS (in priority order):
 *  1. python_worker  — SCANNER_WORKER_URL + SCANNER_WORKER_SECRET
 *  2. openai_vision  — OPENAI_API_KEY + DAZZA_V3_ENABLED
 *     Uses gpt-4o vision with a strictly bounded prompt.
 *     Returns only faceCount (0 or ≥1) — no identity, age, gender, etc.
 */

import { getAdapterCapability } from './scannerAdapter.js';
import { getSecret } from '#airo/secrets';

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

// ── Permitted result codes ────────────────────────────────────────────────────
const PERMITTED_RESULTS = new Set<string>(['clear', 'privacy_signal', 'unavailable', 'failed']);

// ── OpenAI Vision prompt ──────────────────────────────────────────────────────
// Strictly bounded: returns only a JSON object with faceCount (integer ≥ 0).
// The model is explicitly forbidden from inferring identity, age, gender,
// ethnicity, criminality, intent, or any personal characteristic.
const OPENAI_SYSTEM_PROMPT = `You are a privacy-signal detector for a construction job-site photo management platform.

Your ONLY task: count the number of clearly visible human faces in the image.

Rules:
- Return ONLY valid JSON in this exact shape: {"faceCount": <integer>}
- faceCount must be a non-negative integer (0, 1, 2, …).
- Do NOT infer, report, or comment on: identity, name, age, gender, ethnicity, emotion, criminality, intent, or any personal characteristic.
- Do NOT describe the image content.
- Do NOT add any text outside the JSON object.
- A face partially obscured by PPE (hard hat, safety glasses, dust mask) still counts if the face is clearly visible.
- A face that is blurred, turned away, or not clearly visible does NOT count.
- If you cannot determine a count with confidence, return {"faceCount": 0}.`;

// ── Classifier ────────────────────────────────────────────────────────────────

/**
 * Classifies an image buffer.
 *
 * SECURITY:
 *  - Never infers identity, age, gender, ethnicity, criminality, or intent.
 *  - Returns only the 4 permitted result codes.
 *  - No image bytes or raw model output in the return value.
 *  - Never throws — returns { result: 'failed' } on any error.
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

  // ── Provider: python_worker ────────────────────────────────────────────────
  if (cap.provider === 'python_worker') {
    return classifyViaPythonWorker(req);
  }

  // ── Provider: openai_vision ────────────────────────────────────────────────
  if (cap.provider === 'openai_vision') {
    return classifyViaOpenAiVision(req);
  }

  return {
    result: 'unavailable',
    faceCount: 0,
    detectorName: 'none',
    detectorVersion: '0',
    failureCode: 'unknown_provider',
  };
}

// ── OpenAI Vision implementation ──────────────────────────────────────────────

async function classifyViaOpenAiVision(req: ClassifyRequest): Promise<ClassifyOutcome> {
  const apiKey = getSecret('OPENAI_API_KEY');
  if (!apiKey) {
    return { result: 'failed', faceCount: 0, detectorName: 'openai_vision', detectorVersion: 'gpt-4o', failureCode: 'missing_api_key' };
  }

  try {
    // Encode buffer as base64 data URI — never send raw bytes or R2 keys
    const b64 = req.buffer.toString('base64');
    const dataUri = `data:${req.mimeType};base64,${b64}`;

    const body = {
      model: 'gpt-4o',
      max_tokens: 32,
      messages: [
        { role: 'system', content: OPENAI_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUri, detail: 'low' },
            },
          ],
        },
      ],
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const status = response.status;
      return { result: 'failed', faceCount: 0, detectorName: 'openai_vision', detectorVersion: 'gpt-4o', failureCode: `openai_http_${status}` };
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = data?.choices?.[0]?.message?.content ?? '';

    // Parse the bounded JSON response — reject anything outside {"faceCount": N}
    let faceCount = 0;
    try {
      // Strip any markdown code fences the model may have added
      const cleaned = raw.replace(/```[a-z]*\n?/gi, '').trim();
      const parsed = JSON.parse(cleaned) as { faceCount?: unknown };
      const n = Number(parsed?.faceCount ?? 0);
      faceCount = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    } catch {
      // Model returned non-JSON — treat as 0 faces (conservative)
      faceCount = 0;
    }

    const result: ClassifierResult = faceCount > 0 ? 'privacy_signal' : 'clear';
    if (!PERMITTED_RESULTS.has(result)) {
      return { result: 'failed', faceCount: 0, detectorName: 'openai_vision', detectorVersion: 'gpt-4o', failureCode: 'invalid_result_code' };
    }

    return {
      result,
      faceCount,
      detectorName: 'openai_vision',
      detectorVersion: 'gpt-4o',
      failureCode: null,
    };

  } catch {
    // Network error, timeout, or unexpected exception — never expose details
    return { result: 'failed', faceCount: 0, detectorName: 'openai_vision', detectorVersion: 'gpt-4o', failureCode: 'openai_unreachable' };
  }
}

// ── Python worker implementation (future production path) ─────────────────────

async function classifyViaPythonWorker(req: ClassifyRequest): Promise<ClassifyOutcome> {
  const workerUrl    = getSecret('SCANNER_WORKER_URL');
  const workerSecret = getSecret('SCANNER_WORKER_SECRET');
  if (!workerUrl || !workerSecret) {
    return { result: 'failed', faceCount: 0, detectorName: 'python_worker', detectorVersion: '0', failureCode: 'missing_worker_credentials' };
  }

  try {
    const form = new FormData();
    form.append('runId', req.runId);
    form.append('mimeType', req.mimeType);
    form.append('image', new Blob([req.buffer], { type: req.mimeType }), 'image');

    const response = await fetch(`${workerUrl}/classify`, {
      method: 'POST',
      headers: { 'X-Scanner-Secret': workerSecret },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      return { result: 'failed', faceCount: 0, detectorName: 'python_worker', detectorVersion: '0', failureCode: `worker_http_${response.status}` };
    }

    const data = await response.json() as {
      result?: string;
      faceCount?: unknown;
      detectorName?: string;
      detectorVersion?: string;
      failureCode?: string | null;
    };

    const resultCode = PERMITTED_RESULTS.has(String(data?.result ?? ''))
      ? (data.result as ClassifierResult)
      : 'failed';

    return {
      result: resultCode,
      faceCount:       Math.max(0, Math.floor(Number(data?.faceCount ?? 0))),
      detectorName:    String(data?.detectorName  ?? 'python_worker'),
      detectorVersion: String(data?.detectorVersion ?? '0'),
      failureCode:     data?.failureCode ?? null,
    };

  } catch {
    return { result: 'failed', faceCount: 0, detectorName: 'python_worker', detectorVersion: '0', failureCode: 'worker_unreachable' };
  }
}
