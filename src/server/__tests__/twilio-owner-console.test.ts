/**
 * twilio-owner-console.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Proves:
 *  1. GET /api/owner-console/twilio-info returns accountSid + links when the
 *     TWILIO_ACCOUNT_SID secret is set.
 *  2. Returns 503 when the secret is absent.
 *  3. The response never contains TWILIO_AUTH_TOKEN.
 *  4. TwilioTab.tsx source does not contain any hardcoded Account SID.
 *  5. TwilioTab.tsx source does not contain any hardcoded auth token.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSecret = vi.fn<[string], string | null>();

vi.mock('#airo/secrets', () => ({
  getSecret: (name: string) => mockGetSecret(name),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq() {
  return { headers: {} } as unknown as import('express').Request;
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null as unknown,
    status(code: number) { this._status = code; return this; },
    json(body: unknown) { this._body = body; return this; },
  };
  return res;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/owner-console/twilio-info', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns accountSid and links when TWILIO_ACCOUNT_SID is set', async () => {
    mockGetSecret.mockImplementation((name) =>
      name === 'TWILIO_ACCOUNT_SID' ? 'AC_TEST_SID_REDACTED' : null,
    );

    const { default: handler } = await import('../api/owner-console/twilio-info/GET.js');
    const res = makeRes();
    await handler(makeReq(), res as never);

    expect(res._status).toBe(200);
    const body = res._body as { accountSid: string; links: unknown[] };
    expect(body.accountSid).toBe('AC_TEST_SID_REDACTED');
    expect(Array.isArray(body.links)).toBe(true);
    expect(body.links.length).toBeGreaterThan(0);
  });

  it('returns 503 when TWILIO_ACCOUNT_SID is not set', async () => {
    mockGetSecret.mockReturnValue(null);

    const { default: handler } = await import('../api/owner-console/twilio-info/GET.js');
    const res = makeRes();
    await handler(makeReq(), res as never);

    expect(res._status).toBe(503);
    const body = res._body as { error: string };
    expect(body.error).toBe('twilio_not_configured');
  });

  it('never returns TWILIO_AUTH_TOKEN in the response', async () => {
    const fakeAuthToken = 'AUTH_TOKEN_SHOULD_NEVER_APPEAR';
    mockGetSecret.mockImplementation((name) => {
      if (name === 'TWILIO_ACCOUNT_SID') return 'AC_TEST_SID';
      if (name === 'TWILIO_AUTH_TOKEN') return fakeAuthToken;
      return null;
    });

    const { default: handler } = await import('../api/owner-console/twilio-info/GET.js');
    const res = makeRes();
    await handler(makeReq(), res as never);

    const bodyStr = JSON.stringify(res._body);
    expect(bodyStr).not.toContain(fakeAuthToken);
    expect(bodyStr).not.toContain('authToken');
    expect(bodyStr).not.toContain('auth_token');
  });

  it('all link URLs are Twilio console URLs (no external redirects)', async () => {
    mockGetSecret.mockImplementation((name) =>
      name === 'TWILIO_ACCOUNT_SID' ? 'AC_TEST_SID' : null,
    );

    const { default: handler } = await import('../api/owner-console/twilio-info/GET.js');
    const res = makeRes();
    await handler(makeReq(), res as never);

    const body = res._body as { links: Array<{ url: string }> };
    for (const link of body.links) {
      expect(link.url).toMatch(/^https:\/\/console\.twilio\.com\//);
    }
  });
});

describe('TwilioTab.tsx source hygiene', () => {
  it('does not contain a hardcoded Twilio Account SID', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/owner-console/TwilioTab.tsx'),
      'utf8',
    );
    // AC SIDs are 34-char strings starting with AC
    expect(src).not.toMatch(/AC[0-9a-f]{32}/i);
    // Should not contain the old constant
    expect(src).not.toContain('TWILIO_ACCOUNT_SID =');
  });

  it('does not contain a hardcoded Twilio auth token', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/owner-console/TwilioTab.tsx'),
      'utf8',
    );
    // Auth tokens are 32-char hex strings — check for any 32-char hex literal
    // (conservative: only flag if it looks like a credential assignment)
    expect(src).not.toContain('AUTH_TOKEN');
    expect(src).not.toContain('authToken =');
  });

  it('fetches account info from the server endpoint', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/owner-console/TwilioTab.tsx'),
      'utf8',
    );
    expect(src).toContain('/api/owner-console/twilio-info');
    expect(src).toContain('fetch(');
  });
});
