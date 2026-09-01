/**
 * iwillbuild-image-safeguard-poc
 * ─────────────────────────────────────────────────────────────────────────────
 * Private Cloudflare Worker — Image Safeguard POC classifier.
 *
 * SECURITY CONTRACT:
 *  - POST only. All other methods → 405.
 *  - Authentication via X-Safeguard-Token header (constant-time compare).
 *  - Content-Type must be image/jpeg, image/png, or image/webp.
 *  - Magic bytes independently verified — Content-Type header not trusted.
 *  - Content-Length enforced before body allocation (10 MB hard limit).
 *  - Structural and dimension/pixel limits enforced before model submission.
 *  - Returns ONLY: clear | privacy_signal | unavailable | failed.
 *  - NEVER infers identity, age, gender, ethnicity, intent, or criminality.
 *  - No image bytes, tokens, or raw model output in any log or response.
 *  - No R2 binding. No storage. No queues. No writes of any kind.
 *
 * BINDINGS:
 *  - AI: Workers AI (inference only)
 *  - SAFEGUARD_TOKEN: Worker secret (set via: wrangler secret put SAFEGUARD_TOKEN)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — enforced before body read
const MAX_PIXELS = 50_000_000;       // 50 MP — enforced before model submission
const MAX_DIMENSION = 16_000;        // 16,000 px per side

// Workers AI model and task
const AI_MODEL = '@cf/moondream/moondream3.1-9B-A2B' as const;
const AI_TASK = 'detect' as const;
const AI_TARGET = 'human face' as const;

// Detector identity reported in every response
const DETECTOR_NAME = 'moondream3.1-9B-A2B';
const DETECTOR_VERSION = '1';

// ── Environment binding types ─────────────────────────────────────────────────

export interface Env {
  AI: Ai;
  SAFEGUARD_TOKEN: string;
}

// ── Response helpers ──────────────────────────────────────────────────────────

type ResultCode = 'clear' | 'privacy_signal' | 'unavailable' | 'failed';

interface ClassifyResponse {
  result: ResultCode;
  approximateFaceCount: number;
  requestId: string;
}

function jsonResponse(
  body: ClassifyResponse | { error: string },
  status: number,
  requestId: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      // Never cache — each request is a unique image
      'Cache-Control': 'no-store',
    },
  });
}

function errorResponse(error: string, status: number, requestId: string): Response {
  // Never include image bytes, tokens, or internal paths in error messages
  return jsonResponse({ error }, status, requestId);
}

// ── Request ID ────────────────────────────────────────────────────────────────

function generateRequestId(): string {
  // Opaque 16-byte hex — no timestamp, no counter, no correlation to image content
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Constant-time token comparison ───────────────────────────────────────────

/**
 * Compares two strings in constant time to prevent timing attacks.
 * Uses the SubtleCrypto HMAC approach: both strings are HMAC'd with a
 * random key and the MACs are compared — this ensures the comparison
 * time is independent of where the strings first differ.
 */
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const keyMaterial = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const [macA, macB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);
  const viewA = new Uint8Array(macA);
  const viewB = new Uint8Array(macB);
  if (viewA.length !== viewB.length) return false;
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0;
}

// ── Magic-byte MIME detection ─────────────────────────────────────────────────

type AllowedMime = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Detects MIME type from the first bytes of the buffer.
 * Returns null for any type that is not JPEG, PNG, or WebP.
 * This is the authoritative type check — the Content-Type header is ignored
 * for type determination.
 */
function detectMimeFromMagic(buf: Uint8Array): AllowedMime | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF????WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Checks that the declared Content-Type header matches the magic-byte
 * detected type. Rejects mismatches (e.g. SVG declared as image/jpeg).
 */
function mimeMatchesMagic(declared: string, detected: AllowedMime): boolean {
  const normalised = declared.split(';')[0].trim().toLowerCase();
  return normalised === detected;
}

// ── Structural validation ─────────────────────────────────────────────────────

interface ValidationResult {
  ok: boolean;
  reason?: string;
  width?: number;
  height?: number;
}

/**
 * Validates image structure and extracts dimensions.
 * Enforces MAX_DIMENSION and MAX_PIXELS before model submission.
 * Does not decode the full image — reads only the header bytes.
 */
function validateStructureAndDimensions(
  buf: Uint8Array,
  mime: AllowedMime,
): ValidationResult {
  const MIN_BYTES = 64;
  if (buf.length < MIN_BYTES) {
    return { ok: false, reason: 'image_too_small' };
  }

  let width = 0;
  let height = 0;

  if (mime === 'image/png') {
    // PNG IHDR: bytes 16–23 are width (4) + height (4), big-endian
    if (buf.length < 24) return { ok: false, reason: 'png_header_truncated' };
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    width = view.getUint32(16, false);
    height = view.getUint32(20, false);
  } else if (mime === 'image/jpeg') {
    // Scan for SOF0/SOF1/SOF2 markers to extract dimensions
    let i = 2;
    let found = false;
    while (i + 3 < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      // SOF markers: C0, C1, C2 (baseline, extended, progressive)
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        if (i + 9 < buf.length) {
          const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
          height = view.getUint16(i + 5, false);
          width = view.getUint16(i + 7, false);
          found = true;
        }
        break;
      }
      // Skip this segment
      if (i + 3 >= buf.length) break;
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const segLen = view.getUint16(i + 2, false);
      if (segLen < 2) break;
      i += 2 + segLen;
    }
    if (!found) {
      // Could not find SOF — treat as structurally invalid
      return { ok: false, reason: 'jpeg_no_sof_marker' };
    }
  } else if (mime === 'image/webp') {
    // WebP: RIFF(4) + size(4) + WEBP(4) + chunk_type(4) = 12 bytes minimum
    if (buf.length < 30) return { ok: false, reason: 'webp_header_truncated' };
    const chunkType = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (chunkType === 'VP8 ') {
      // Lossy: dimensions at bytes 26-29 (14-bit, little-endian, mask 0x3FFF)
      if (buf.length < 30) return { ok: false, reason: 'webp_vp8_truncated' };
      width = (view.getUint16(26, true) & 0x3fff) + 1;
      height = (view.getUint16(28, true) & 0x3fff) + 1;
    } else if (chunkType === 'VP8L') {
      // Lossless: 4 bytes at offset 21, packed
      if (buf.length < 25) return { ok: false, reason: 'webp_vp8l_truncated' };
      const bits = view.getUint32(21, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    } else if (chunkType === 'VP8X') {
      // Extended: canvas width/height at bytes 24-29 (24-bit, little-endian, +1)
      if (buf.length < 30) return { ok: false, reason: 'webp_vp8x_truncated' };
      width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
      height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
    } else {
      return { ok: false, reason: 'webp_unknown_chunk' };
    }
  }

  if (width <= 0 || height <= 0) {
    return { ok: false, reason: 'invalid_dimensions' };
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return { ok: false, reason: 'dimension_exceeds_limit' };
  }
  if (width * height > MAX_PIXELS) {
    return { ok: false, reason: 'pixel_count_exceeds_limit' };
  }

  return { ok: true, width, height };
}

// ── Workers AI inference ──────────────────────────────────────────────────────

interface AiDetectResult {
  detections?: Array<{ label?: string; score?: number }>;
}

/**
 * Runs face detection via Workers AI.
 *
 * SECURITY:
 *  - Only counts detections — never returns bounding boxes, labels, or scores.
 *  - Never infers identity, age, gender, ethnicity, intent, or criminality.
 *  - Raw model output is never logged or returned.
 *  - Returns 'unavailable' on any model error rather than throwing.
 */
async function runInference(
  ai: Ai,
  imageBytes: Uint8Array,
  _mime: AllowedMime,
): Promise<{ result: ResultCode; approximateFaceCount: number }> {
  try {
    // Workers AI object detection — detect human faces only
    const response = await (ai.run as (
      model: string,
      inputs: { image: number[]; task: string; target: string },
    ) => Promise<AiDetectResult>)(AI_MODEL, {
      image: Array.from(imageBytes),
      task: AI_TASK,
      target: AI_TARGET,
    });

    // Count detections — never expose bounding boxes, labels, or scores
    const detections = response?.detections ?? [];
    const faceCount = detections.length;

    // privacy_signal = one or more faces detected
    // clear = no faces detected
    // No other attributes inferred
    const result: ResultCode = faceCount > 0 ? 'privacy_signal' : 'clear';

    return { result, approximateFaceCount: faceCount };
  } catch (_err) {
    // Model unavailable or inference error — never log the error details
    // (could contain image metadata or internal paths)
    return { result: 'unavailable', approximateFaceCount: 0 };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = generateRequestId();

    // ── Method gate ───────────────────────────────────────────────────────────
    if (request.method !== 'POST') {
      return errorResponse('method_not_allowed', 405, requestId);
    }

    // ── Authentication ────────────────────────────────────────────────────────
    // Constant-time comparison prevents timing attacks on the token.
    const providedToken = request.headers.get('X-Safeguard-Token') ?? '';
    const expectedToken = env.SAFEGUARD_TOKEN ?? '';

    if (!expectedToken) {
      // Worker secret not configured — fail closed
      return errorResponse('service_unavailable', 503, requestId);
    }

    const authenticated = await constantTimeEqual(providedToken, expectedToken);
    if (!authenticated) {
      // Never reveal whether the token exists or is close — always 401
      return errorResponse('unauthorized', 401, requestId);
    }

    // ── Content-Length gate (before body allocation) ──────────────────────────
    // Enforced before reading the body to prevent memory exhaustion.
    const contentLengthHeader = request.headers.get('Content-Length');
    if (contentLengthHeader !== null) {
      const declaredLength = parseInt(contentLengthHeader, 10);
      if (isNaN(declaredLength) || declaredLength > MAX_BYTES) {
        return errorResponse('payload_too_large', 413, requestId);
      }
    }

    // ── Content-Type gate ─────────────────────────────────────────────────────
    // We check the declared type here only to reject obviously wrong types early.
    // The magic-byte check below is the authoritative type determination.
    const declaredContentType = request.headers.get('Content-Type') ?? '';
    const allowedDeclaredTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const normalisedDeclared = declaredContentType.split(';')[0].trim().toLowerCase();
    if (!allowedDeclaredTypes.includes(normalisedDeclared)) {
      return errorResponse('unsupported_media_type', 415, requestId);
    }

    // ── Body read ─────────────────────────────────────────────────────────────
    let bodyBytes: Uint8Array;
    try {
      const arrayBuffer = await request.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_BYTES) {
        return errorResponse('payload_too_large', 413, requestId);
      }
      bodyBytes = new Uint8Array(arrayBuffer);
    } catch (_err) {
      return errorResponse('body_read_error', 400, requestId);
    }

    if (bodyBytes.length === 0) {
      return errorResponse('empty_body', 400, requestId);
    }

    // ── Magic-byte type detection ─────────────────────────────────────────────
    // This is the authoritative check — Content-Type header is not trusted.
    const detectedMime = detectMimeFromMagic(bodyBytes);
    if (detectedMime === null) {
      // Rejects SVG, HTML, executables, and any non-JPEG/PNG/WebP content
      return errorResponse('unsupported_or_malformed_image', 415, requestId);
    }

    // ── Mismatch check ────────────────────────────────────────────────────────
    // Reject if declared Content-Type doesn't match magic bytes.
    // Prevents e.g. SVG with Content-Type: image/jpeg.
    if (!mimeMatchesMagic(declaredContentType, detectedMime)) {
      return errorResponse('content_type_mismatch', 415, requestId);
    }

    // ── Structural validation and dimension limits ────────────────────────────
    const validation = validateStructureAndDimensions(bodyBytes, detectedMime);
    if (!validation.ok) {
      return errorResponse('invalid_image_structure', 422, requestId);
    }

    // ── Workers AI inference ──────────────────────────────────────────────────
    const { result, approximateFaceCount } = await runInference(env.AI, bodyBytes, detectedMime);

    // ── Sanitised response ────────────────────────────────────────────────────
    // Never include: image bytes, R2 keys, bounding boxes, labels, scores,
    // raw model output, identity, age, gender, ethnicity, intent, criminality.
    const responseBody: ClassifyResponse = {
      result,
      approximateFaceCount,
      requestId,
    };

    return jsonResponse(responseBody, 200, requestId);
  },
} satisfies ExportedHandler<Env>;
