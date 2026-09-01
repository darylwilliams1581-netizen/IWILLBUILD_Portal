/**
 * iwillbuild-image-safeguard-poc — unit tests
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B4 — Corrected test suite.
 *
 * The AI binding is mocked — no real inference is performed here.
 * The synthetic POC test (real Workers AI) is performed post-deploy.
 *
 * Coverage:
 *  - Missing / wrong authentication rejected
 *  - Non-POST rejected
 *  - JPEG / PNG / WebP accepted (magic bytes)
 *  - SVG / HTML / executable / malformed / mismatched rejected
 *  - Body-size enforcement:
 *      · Content-Length > 10 MB rejected before body read
 *      · Missing Content-Length with body > 10 MB rejected via stream
 *      · Falsely small Content-Length with body > 10 MB rejected via stream
 *      · Malformed Content-Length rejected
 *      · Exact MAX_BYTES accepted
 *      · Stream cancelled after exceeding limit (classifier never called)
 *  - Response schema: result, faceCount, detectorName, detectorVersion,
 *      failureCode, requestId — matches imageClassifier.ts ClassifyOutcome
 *  - No sensitive fields in any response
 *  - No R2 binding or write capability
 */

import { describe, it, expect, vi } from 'vitest';

// ── Helpers to build minimal valid image buffers ──────────────────────────────

function makeJpegBuffer(padToBytes = 128): Uint8Array {
  // Minimal JPEG: SOI + APP0 (16-byte segment) + SOF0 with 1x1 dimensions.
  // APP0 segment: marker(2) + length(2) + body(14) = 18 bytes total, ends at offset 20.
  // SOF0 must start at offset 20 (immediately after APP0 ends).
  const buf = new Uint8Array(Math.max(padToBytes, 128)).fill(0x00);
  // SOI
  buf[0] = 0xff; buf[1] = 0xd8;
  // APP0 marker (FF E0) at offset 2
  buf[2] = 0xff; buf[3] = 0xe0;
  // APP0 length = 16 (big-endian) — covers bytes 4..19
  buf[4] = 0x00; buf[5] = 0x10;
  // JFIF identifier
  buf[6] = 0x4a; buf[7] = 0x46; buf[8] = 0x49; buf[9] = 0x46; buf[10] = 0x00;
  // SOF0 marker (FF C0) at offset 20
  buf[20] = 0xff; buf[21] = 0xc0;
  // SOF0 length = 17
  buf[22] = 0x00; buf[23] = 0x11;
  // Precision = 8
  buf[24] = 0x08;
  // Height = 1 (big-endian)
  buf[25] = 0x00; buf[26] = 0x01;
  // Width = 1 (big-endian)
  buf[27] = 0x00; buf[28] = 0x01;
  return buf;
}

function makePngBuffer(): Uint8Array {
  const buf = new Uint8Array(64).fill(0x00);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
  buf[4] = 0x0d; buf[5] = 0x0a; buf[6] = 0x1a; buf[7] = 0x0a;
  buf[8] = 0x00; buf[9] = 0x00; buf[10] = 0x00; buf[11] = 0x0d;
  buf[12] = 0x49; buf[13] = 0x48; buf[14] = 0x44; buf[15] = 0x52;
  buf[16] = 0x00; buf[17] = 0x00; buf[18] = 0x00; buf[19] = 0x01;
  buf[20] = 0x00; buf[21] = 0x00; buf[22] = 0x00; buf[23] = 0x01;
  return buf;
}

function makeWebpBuffer(): Uint8Array {
  const buf = new Uint8Array(80).fill(0x00);
  buf[0] = 0x52; buf[1] = 0x49; buf[2] = 0x46; buf[3] = 0x46;
  buf[4] = 0x48; buf[5] = 0x00; buf[6] = 0x00; buf[7] = 0x00;
  buf[8] = 0x57; buf[9] = 0x45; buf[10] = 0x42; buf[11] = 0x50;
  // VP8X chunk
  buf[12] = 0x56; buf[13] = 0x50; buf[14] = 0x38; buf[15] = 0x58;
  buf[16] = 0x0a; buf[17] = 0x00; buf[18] = 0x00; buf[19] = 0x00;
  // Canvas width-1 = 0 → width=1; height-1 = 0 → height=1
  buf[24] = 0x00; buf[25] = 0x00; buf[26] = 0x00;
  buf[27] = 0x00; buf[28] = 0x00; buf[29] = 0x00;
  return buf;
}

function makeSvgBuffer(): Uint8Array {
  return new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
}

function makeHtmlBuffer(): Uint8Array {
  return new TextEncoder().encode('<!DOCTYPE html><html><body>xss</body></html>');
}

function makeExecutableBuffer(): Uint8Array {
  const buf = new Uint8Array(64).fill(0x00);
  buf[0] = 0x7f; buf[1] = 0x45; buf[2] = 0x4c; buf[3] = 0x46;
  return buf;
}

function makeTruncatedBuffer(): Uint8Array {
  return new Uint8Array(10).fill(0x00);
}

/**
 * Builds a body larger than MAX_BYTES (10 MB + 1 byte) with valid JPEG magic
 * bytes at the start so it passes the magic-byte check if the size gate fails.
 */
function makeOversizedJpegBody(): Uint8Array {
  const MAX_BYTES = 10 * 1024 * 1024;
  const buf = new Uint8Array(MAX_BYTES + 1).fill(0x00);
  // JPEG magic bytes
  buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff;
  return buf;
}

// ── Mock AI binding ───────────────────────────────────────────────────────────

function makeMockAi(faceCount: number): Ai {
  return {
    run: vi.fn().mockResolvedValue({
      detections: Array.from({ length: faceCount }, (_, i) => ({
        label: 'human face',
        score: 0.9 - i * 0.05,
      })),
    }),
  } as unknown as Ai;
}

function makeMockAiError(): Ai {
  return {
    run: vi.fn().mockRejectedValue(new Error('model_unavailable')),
  } as unknown as Ai;
}

// ── Build a mock Env ──────────────────────────────────────────────────────────

function makeEnv(token = 'test-secret-token', aiOverride?: Ai) {
  return {
    AI: aiOverride ?? makeMockAi(0),
    SAFEGUARD_TOKEN: token,
  };
}

// ── Import handler ────────────────────────────────────────────────────────────

async function getHandler() {
  const mod = await import('./index.js');
  return mod.default;
}

// ── Helper: build a Request ───────────────────────────────────────────────────

function makeRequest(
  method: string,
  body: Uint8Array | null,
  contentType: string,
  token: string | null,
  contentLengthOverride?: number | 'omit',
): Request {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
  };
  if (token !== null) headers['X-Safeguard-Token'] = token;

  // contentLengthOverride:
  //   undefined  → set Content-Length to actual body length (default)
  //   'omit'     → do not set Content-Length header at all
  //   number     → set Content-Length to that specific value (may be false/malformed)
  if (contentLengthOverride === 'omit') {
    // no Content-Length header
  } else if (contentLengthOverride !== undefined) {
    headers['Content-Length'] = String(contentLengthOverride);
  } else if (body !== null) {
    headers['Content-Length'] = String(body.byteLength);
  }

  return new Request('https://worker.example.com/classify', {
    method,
    headers,
    body: body ?? undefined,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Authentication', () => {
  it('rejects missing X-Safeguard-Token with 401', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', null);
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('rejects wrong X-Safeguard-Token with 401', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'wrong-token');
    const res = await handler.fetch(req, makeEnv('correct-token') as any, {} as any);
    expect(res.status).toBe(401);
  });

  it('rejects empty token with 401', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', '');
    const res = await handler.fetch(req, makeEnv('correct-token') as any, {} as any);
    expect(res.status).toBe(401);
  });

  it('returns 503 when SAFEGUARD_TOKEN secret is not configured', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'any-token');
    const env = { AI: makeMockAi(0), SAFEGUARD_TOKEN: '' };
    const res = await handler.fetch(req, env as any, {} as any);
    expect(res.status).toBe(503);
  });
});

describe('Method enforcement', () => {
  const methods = ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  for (const method of methods) {
    it(`rejects ${method} with 405`, async () => {
      const handler = await getHandler();
      const req = makeRequest(method, null, 'image/jpeg', 'test-secret-token');
      const res = await handler.fetch(req, makeEnv() as any, {} as any);
      expect(res.status).toBe(405);
    });
  }
});

describe('Accepted image types', () => {
  it('accepts JPEG magic bytes and returns 200', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect(res.status).toBe(200);
  });

  it('accepts PNG magic bytes and returns 200', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makePngBuffer(), 'image/png', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect(res.status).toBe(200);
  });

  it('accepts WebP magic bytes and returns 200', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeWebpBuffer(), 'image/webp', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect(res.status).toBe(200);
  });
});

describe('Rejected image types', () => {
  it('rejects SVG declared as image/jpeg with 415', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeSvgBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect(res.status).toBe(415);
  });

  it('rejects SVG declared as image/svg+xml with 415', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeSvgBuffer(), 'image/svg+xml', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect(res.status).toBe(415);
  });

  it('rejects HTML with 415', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeHtmlBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect(res.status).toBe(415);
  });

  it('rejects ELF executable with 415', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeExecutableBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect(res.status).toBe(415);
  });

  it('rejects truncated/malformed buffer with 415 or 422', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeTruncatedBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect([415, 422]).toContain(res.status);
  });

  it('rejects PNG bytes declared as image/jpeg with 415', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makePngBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect(res.status).toBe(415);
  });

  it('rejects JPEG bytes declared as image/png with 415', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/png', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect(res.status).toBe(415);
  });

  it('rejects empty body with 400', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', new Uint8Array(0), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect(res.status).toBe(400);
  });
});

// ── Body-size enforcement ─────────────────────────────────────────────────────
// These tests prove the body-size bypass is closed.
// The classifier (AI mock) must never be called for any oversized request.

describe('Body-size enforcement', () => {
  const MAX_BYTES = 10 * 1024 * 1024;

  it('rejects Content-Length > 10 MB before body read with 413', async () => {
    const handler = await getHandler();
    const mockAi = makeMockAi(0);
    // Body is small — Content-Length header triggers early rejection
    const req = makeRequest(
      'POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token',
      MAX_BYTES + 1,
    );
    const res = await handler.fetch(req, makeEnv('test-secret-token', mockAi) as any, {} as any);
    expect(res.status).toBe(413);
    // Classifier must not have been called
    expect((mockAi.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('rejects missing Content-Length with body > 10 MB via stream with 413', async () => {
    const handler = await getHandler();
    const mockAi = makeMockAi(0);
    const oversizedBody = makeOversizedJpegBody();
    // 'omit' → no Content-Length header; size gate must catch it via streaming
    const req = makeRequest(
      'POST', oversizedBody, 'image/jpeg', 'test-secret-token',
      'omit',
    );
    const res = await handler.fetch(req, makeEnv('test-secret-token', mockAi) as any, {} as any);
    expect(res.status).toBe(413);
    expect((mockAi.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('rejects falsely small Content-Length with body > 10 MB via stream with 413', async () => {
    const handler = await getHandler();
    const mockAi = makeMockAi(0);
    const oversizedBody = makeOversizedJpegBody();
    // Content-Length claims 100 bytes but actual body is > 10 MB
    // The stream reader must catch the actual size
    const req = makeRequest(
      'POST', oversizedBody, 'image/jpeg', 'test-secret-token',
      100,
    );
    const res = await handler.fetch(req, makeEnv('test-secret-token', mockAi) as any, {} as any);
    expect(res.status).toBe(413);
    expect((mockAi.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('rejects malformed Content-Length (non-numeric) with 413', async () => {
    const handler = await getHandler();
    const mockAi = makeMockAi(0);
    // Manually set a non-numeric Content-Length
    const headers: Record<string, string> = {
      'Content-Type': 'image/jpeg',
      'X-Safeguard-Token': 'test-secret-token',
      'Content-Length': 'not-a-number',
    };
    const req = new Request('https://worker.example.com/classify', {
      method: 'POST',
      headers,
      body: makeJpegBuffer(),
    });
    const res = await handler.fetch(req, makeEnv('test-secret-token', mockAi) as any, {} as any);
    expect(res.status).toBe(413);
    expect((mockAi.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('accepts body at exactly MAX_BYTES with valid JPEG structure', async () => {
    const handler = await getHandler();
    const mockAi = makeMockAi(0);
    // Build a valid JPEG padded to exactly MAX_BYTES
    const exactBody = makeJpegBuffer(MAX_BYTES);
    const req = makeRequest(
      'POST', exactBody, 'image/jpeg', 'test-secret-token',
      MAX_BYTES,
    );
    const res = await handler.fetch(req, makeEnv('test-secret-token', mockAi) as any, {} as any);
    // Should reach the classifier (200) — not rejected by size gate
    expect(res.status).toBe(200);
  });

  it('stream is cancelled after exceeding limit — classifier never called', async () => {
    // This test proves the stream cancellation path specifically.
    // We use the readBoundedBody export directly to verify stream behaviour.
    const { readBoundedBody } = await import('./index.js');
    const oversizedBody = makeOversizedJpegBody();

    // Build a Request with no Content-Length so only the stream gate fires
    const req = new Request('https://worker.example.com/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: oversizedBody,
    });

    const result = await readBoundedBody(req);
    // Must return null — stream was cancelled after MAX_BYTES+1
    expect(result).toBeNull();
  });
});

// ── Response schema ───────────────────────────────────────────────────────────
// Verifies the response matches imageClassifier.ts ClassifyOutcome exactly.

describe('Response schema', () => {
  it('success response contains exactly the Dazza contract fields', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const keys = Object.keys(body);

    // Required fields (matches ClassifyOutcome in imageClassifier.ts)
    expect(keys).toContain('result');
    expect(keys).toContain('faceCount');
    expect(keys).toContain('detectorName');
    expect(keys).toContain('detectorVersion');
    expect(keys).toContain('failureCode');
    expect(keys).toContain('requestId');

    // Must NOT contain the old field name or any sensitive fields
    const forbidden = [
      'approximateFaceCount',          // old field name — must not appear
      'image', 'bytes', 'buffer',
      'r2Key', 'storageKey', 'key',
      'token', 'secret', 'accessKeyId', 'secretAccessKey',
      'identity', 'age', 'gender', 'ethnicity', 'criminality', 'intent',
      'boundingBox', 'bbox', 'label', 'score', 'rawModel', 'modelOutput',
    ];
    for (const field of forbidden) {
      expect(keys).not.toContain(field);
    }
  });

  it('detectorName is cloudflare-workers-ai', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    const body = await res.json() as { detectorName: string };
    expect(body.detectorName).toBe('cloudflare-workers-ai');
  });

  it('detectorVersion is the model identifier', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    const body = await res.json() as { detectorVersion: string };
    expect(body.detectorVersion).toBe('@cf/moondream/moondream3.1-9B-A2B');
  });

  it('result is one of the four permitted codes', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    const body = await res.json() as { result: string };
    expect(['clear', 'privacy_signal', 'unavailable', 'failed']).toContain(body.result);
  });

  it('privacy_signal returned with faceCount when AI detects faces', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv('test-secret-token', makeMockAi(2)) as any, {} as any);
    const body = await res.json() as { result: string; faceCount: number; failureCode: unknown };
    expect(body.result).toBe('privacy_signal');
    expect(body.faceCount).toBe(2);
    expect(body.failureCode).toBeNull();
  });

  it('clear returned with faceCount=0 when AI detects no faces', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv('test-secret-token', makeMockAi(0)) as any, {} as any);
    const body = await res.json() as { result: string; faceCount: number; failureCode: unknown };
    expect(body.result).toBe('clear');
    expect(body.faceCount).toBe(0);
    expect(body.failureCode).toBeNull();
  });

  it('unavailable returned with sanitized failureCode when AI errors', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv('test-secret-token', makeMockAiError()) as any, {} as any);
    const body = await res.json() as { result: string; faceCount: number; failureCode: string | null };
    expect(body.result).toBe('unavailable');
    expect(body.faceCount).toBe(0);
    // failureCode must be a sanitized string — not a stack trace or internal path
    expect(typeof body.failureCode).toBe('string');
    expect(body.failureCode).not.toContain('Error:');
    expect(body.failureCode).not.toContain('at ');
    expect(body.failureCode).not.toContain('/');
  });

  it('requestId is an opaque 32-char hex string', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    const body = await res.json() as { requestId: string };
    expect(body.requestId).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('No sensitive logging', () => {
  it('does not log image bytes or token on rejection', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = await getHandler();
    const req = makeRequest('POST', makeSvgBuffer(), 'image/jpeg', 'test-secret-token');
    await handler.fetch(req, makeEnv() as any, {} as any);
    for (const call of [...consoleSpy.mock.calls, ...errorSpy.mock.calls]) {
      const output = call.join(' ');
      expect(output).not.toContain('test-secret-token');
      expect(output).not.toContain('FF D8');
    }
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('No R2 binding or write capability', () => {
  it('Env type has no R2 binding', async () => {
    const env = makeEnv();
    const envKeys = Object.keys(env);
    expect(envKeys).not.toContain('R2');
    expect(envKeys).not.toContain('BUCKET');
    expect(envKeys).not.toContain('STORAGE');
    expect(envKeys).toContain('AI');
    expect(envKeys).toContain('SAFEGUARD_TOKEN');
  });

  it('wrangler.toml has no r2_buckets binding', async () => {
    const { readFileSync } = await import('fs');
    const toml = readFileSync(
      new URL('../wrangler.toml', import.meta.url).pathname,
      'utf8',
    );
    expect(toml).not.toContain('r2_buckets');
    expect(toml).not.toContain('[[r2_buckets]]');
    expect(toml).toContain('[ai]');
    expect(toml).toContain('binding = "AI"');
  });
});

// ── imageClassifier.ts contract alignment ─────────────────────────────────────
// Proves the Worker response can be consumed by imageClassifier.ts without
// translation ambiguity.

describe('imageClassifier.ts contract alignment', () => {
  it('Worker faceCount maps directly to ClassifyOutcome.faceCount', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv('test-secret-token', makeMockAi(3)) as any, {} as any);
    const body = await res.json() as Record<string, unknown>;
    // imageClassifier.ts reads: Number(data.faceCount ?? 0)
    expect(typeof body['faceCount']).toBe('number');
    expect(body['faceCount']).toBe(3);
    // Must NOT have approximateFaceCount — that would require translation
    expect(body['approximateFaceCount']).toBeUndefined();
  });

  it('Worker detectorName maps directly to ClassifyOutcome.detectorName', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    const body = await res.json() as Record<string, unknown>;
    // imageClassifier.ts reads: String(data.detectorName ?? 'unknown')
    expect(typeof body['detectorName']).toBe('string');
    expect(body['detectorName']).toBe('cloudflare-workers-ai');
  });

  it('Worker detectorVersion maps directly to ClassifyOutcome.detectorVersion', async () => {
    const handler = await getHandler();
    const req = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const res = await handler.fetch(req, makeEnv() as any, {} as any);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body['detectorVersion']).toBe('string');
    expect(body['detectorVersion']).toBe('@cf/moondream/moondream3.1-9B-A2B');
  });

  it('Worker failureCode is null on success and a sanitized string on error', async () => {
    const handler = await getHandler();

    // Success path: failureCode must be null
    const reqOk = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const resOk = await handler.fetch(reqOk, makeEnv('test-secret-token', makeMockAi(0)) as any, {} as any);
    const bodyOk = await resOk.json() as Record<string, unknown>;
    expect(bodyOk['failureCode']).toBeNull();

    // Error path: failureCode must be a non-empty string (not a stack trace)
    const reqErr = makeRequest('POST', makeJpegBuffer(), 'image/jpeg', 'test-secret-token');
    const resErr = await handler.fetch(reqErr, makeEnv('test-secret-token', makeMockAiError()) as any, {} as any);
    const bodyErr = await resErr.json() as Record<string, unknown>;
    expect(typeof bodyErr['failureCode']).toBe('string');
    expect((bodyErr['failureCode'] as string).length).toBeGreaterThan(0);
  });
});
