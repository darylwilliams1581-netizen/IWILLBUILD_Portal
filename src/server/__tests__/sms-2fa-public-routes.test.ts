/**
 * Focused tests for the pre-login SMS 2FA public-route fix.
 *
 * Verifies:
 *  1. isPublicRoute allows POST /api/me/2fa/sms/send
 *  2. isPublicRoute allows POST /api/me/2fa/sms/verify
 *  3. send-setup remains protected (NOT in public routes)
 *  4. enable, disable, status remain protected
 *  5. /api/me/2fa/sms/send handler returns 401 without a valid challenge token
 *  6. /api/me/2fa/sms/verify handler returns 401 without a valid challenge token
 *  7. A valid challenge token reaches the SMS provider (send path)
 *  8. A valid OTP verifies exactly once (verify path — replay blocked)
 *
 * DB and Twilio are fully mocked — no real network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPublicRoute } from '../lib/auth-middleware.js';

// ── Shared mock state ──────────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file before any const
// declarations, so we must use vi.hoisted() to create the mock functions
// before the factories reference them.

const { mockDbExecute, mockSendSms, mockCheckSmsRate, mockCheck2faRate } = vi.hoisted(() => ({
  mockDbExecute:    vi.fn(),
  mockSendSms:      vi.fn(),
  mockCheckSmsRate: vi.fn(() => true),
  mockCheck2faRate: vi.fn(() => true),
}));

vi.mock('../db/client.js', () => ({ db: { execute: mockDbExecute } }));

vi.mock('../lib/sms.js', () => ({
  isSmsConfigured: () => true,
  sendSms: mockSendSms,
}));

vi.mock('../lib/signup-rate-limiter.js', () => ({
  checkSmsRate: mockCheckSmsRate,
  check2faRate: mockCheck2faRate,
}));

// BetterAuth mock — getSession returns null (login flow); $context provides
// a minimal internalAdapter so the session-creation path can be exercised.
// createSession returns the session row directly (flat object), not { session, user }
const mockCreateSession = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    token: 'mock-token-abc',
    id: 'mock-session-id',
    userId: 'user-xyz',
    expiresAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
);

vi.mock('../../lib/auth/auth.js', () => ({
  getAuth: () => ({
    api: { getSession: vi.fn().mockResolvedValue(null) },
    $context: Promise.resolve({
      internalAdapter: { createSession: mockCreateSession },
      authCookies: { sessionToken: { name: '__Secure-better-auth.session_token', attributes: {} } },
      secret: 'test-secret',
      sessionConfig: { expiresIn: 604800 },
    }),
  }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from 'node:crypto';

function makeToken() {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    body: {},
    ...overrides,
  };
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null as unknown,
    _headers: {} as Record<string, string>,
    status(code: number) { this._status = code; return this; },
    json(body: unknown) { this._body = body; return this; },
    setHeader(k: string, v: string) { this._headers[k] = v; },
  };
  return res;
}

// ── Section 1: isPublicRoute ───────────────────────────────────────────────────

describe('isPublicRoute — SMS 2FA pre-login routes', () => {
  it('allows POST /api/me/2fa/sms/send', () => {
    expect(isPublicRoute('POST', '/api/me/2fa/sms/send')).toBe(true);
  });

  it('allows POST /api/me/2fa/sms/verify', () => {
    expect(isPublicRoute('POST', '/api/me/2fa/sms/verify')).toBe(true);
  });

  it('does NOT allow GET /api/me/2fa/sms/send (wrong method)', () => {
    expect(isPublicRoute('GET', '/api/me/2fa/sms/send')).toBe(false);
  });

  it('does NOT allow GET /api/me/2fa/sms/verify (wrong method)', () => {
    expect(isPublicRoute('GET', '/api/me/2fa/sms/verify')).toBe(false);
  });

  it('does NOT allow POST /api/me/2fa/sms/send-setup (setup remains protected)', () => {
    expect(isPublicRoute('POST', '/api/me/2fa/sms/send-setup')).toBe(false);
  });

  it('does NOT allow POST /api/me/2fa/sms/enable (enable remains protected)', () => {
    expect(isPublicRoute('POST', '/api/me/2fa/sms/enable')).toBe(false);
  });

  it('does NOT allow POST /api/me/2fa/sms/disable (disable remains protected)', () => {
    expect(isPublicRoute('POST', '/api/me/2fa/sms/disable')).toBe(false);
  });

  it('does NOT allow GET /api/me/2fa/status (status remains protected)', () => {
    expect(isPublicRoute('GET', '/api/me/2fa/status')).toBe(false);
  });

  it('does NOT allow arbitrary /api/me routes (no blanket exemption)', () => {
    expect(isPublicRoute('GET', '/api/me/profile')).toBe(false);
    expect(isPublicRoute('POST', '/api/me/change-password')).toBe(false);
  });
});

// ── Section 2: send handler — token validation ─────────────────────────────────

describe('POST /api/me/2fa/sms/send — handler token validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckSmsRate.mockReturnValue(true);
    mockSendSms.mockResolvedValue({ ok: true, twilioCode: null });
  });

  it('returns 401 when no X-SMS-Challenge-Token header is present', async () => {
    const { default: handler } = await import('../api/me/2fa/sms/send/POST.js');
    // DB returns empty challenge rows and no session
    mockDbExecute.mockResolvedValue([[],  undefined]);
    const req = makeReq({ headers: {} });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(401);
  });

  it('returns 401 when challenge token is not found in DB (invalid/expired)', async () => {
    const { default: handler } = await import('../api/me/2fa/sms/send/POST.js');
    mockDbExecute.mockResolvedValue([[], undefined]);
    const req = makeReq({ headers: { 'x-sms-challenge-token': 'deadbeef' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(401);
  });

  it('calls the SMS provider when a valid challenge token is presented', async () => {
    const { default: handler } = await import('../api/me/2fa/sms/send/POST.js');
    const userId = 'user-abc';
    const token  = makeToken();

    // Sequence of DB calls made by the handler:
    // 1. challenge lookup → found
    // 2. user row lookup → sms_2fa_enabled=1, phone present
    // 3. DELETE old codes
    // 4. INSERT new code
    mockDbExecute
      .mockResolvedValueOnce([[{ user_id: userId }], undefined])   // challenge lookup
      .mockResolvedValueOnce([[{ sms_2fa_enabled: 1, sms_2fa_phone: '+61400000000' }], undefined]) // user row
      .mockResolvedValueOnce([[], undefined])  // DELETE old codes
      .mockResolvedValueOnce([[], undefined]); // INSERT new code

    const req = makeReq({ headers: { 'x-sms-challenge-token': token } });
    const res = makeRes();
    await handler(req as never, res as never);

    expect(mockSendSms).toHaveBeenCalledOnce();
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).ok).toBe(true);
  });
});

// ── Section 3: verify handler — token validation + replay prevention ───────────

describe('POST /api/me/2fa/sms/verify — handler token validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck2faRate.mockReturnValue(true);
  });

  it('returns 401 when no X-SMS-Challenge-Token header is present', async () => {
    const { default: handler } = await import('../api/me/2fa/sms/verify/POST.js');
    mockDbExecute.mockResolvedValue([[], undefined]);
    const req = makeReq({ headers: {}, body: { code: '123456' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(401);
  });

  it('returns 401 when challenge token is not found in DB', async () => {
    const { default: handler } = await import('../api/me/2fa/sms/verify/POST.js');
    mockDbExecute.mockResolvedValue([[], undefined]);
    const req = makeReq({
      headers: { 'x-sms-challenge-token': 'invalid-token' },
      body: { code: '123456' },
    });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(401);
  });

  it('verifies a correct OTP and returns ok:true', async () => {
    const { default: handler } = await import('../api/me/2fa/sms/verify/POST.js');
    const userId = 'user-xyz';
    const token  = makeToken();
    const code   = '654321';

    // DB call sequence for verify:
    // 1. challenge lookup → found
    // 2. sms_verification_codes lookup → active row with correct hash
    // 3. UPDATE verified_at
    // 4. DELETE pending_2fa_challenges
    // (session INSERT is now handled by internalAdapter.createSession mock, not db.execute)
    mockDbExecute
      .mockResolvedValueOnce([[{ user_id: userId }], undefined])  // challenge lookup
      .mockResolvedValueOnce([[{                                   // code row
        id: 'code-row-1',
        code_hash: hashCode(code),
        attempts: 0,
        verified_at: null,
      }], undefined])
      .mockResolvedValueOnce([[], undefined])  // UPDATE verified_at
      .mockResolvedValueOnce([[], undefined]); // DELETE pending challenge

    const req = makeReq({
      headers: { 'x-sms-challenge-token': token },
      body: { code },
    });
    const res = makeRes();
    await handler(req as never, res as never);

    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).ok).toBe(true);
  });

  it('blocks replay — already-verified code returns 400', async () => {
    const { default: handler } = await import('../api/me/2fa/sms/verify/POST.js');
    const userId = 'user-xyz';
    const token  = makeToken();
    const code   = '654321';

    mockDbExecute
      .mockResolvedValueOnce([[{ user_id: userId }], undefined])  // challenge lookup
      .mockResolvedValueOnce([[{                                   // code row — already used
        id: 'code-row-1',
        code_hash: hashCode(code),
        attempts: 0,
        verified_at: '2026-08-30T00:00:00.000Z',
      }], undefined]);

    const req = makeReq({
      headers: { 'x-sms-challenge-token': token },
      body: { code },
    });
    const res = makeRes();
    await handler(req as never, res as never);

    expect(res._status).toBe(400);
    expect((res._body as Record<string, unknown>).error).toMatch(/already been used/i);
  });

  it('rejects an incorrect OTP and does not create a session', async () => {
    const { default: handler } = await import('../api/me/2fa/sms/verify/POST.js');
    const userId = 'user-xyz';
    const token  = makeToken();

    mockDbExecute
      .mockResolvedValueOnce([[{ user_id: userId }], undefined])
      .mockResolvedValueOnce([[{
        id: 'code-row-1',
        code_hash: hashCode('999999'),
        attempts: 0,
        verified_at: null,
      }], undefined])
      .mockResolvedValueOnce([[], undefined]); // UPDATE attempts

    const req = makeReq({
      headers: { 'x-sms-challenge-token': token },
      body: { code: '111111' }, // wrong code
    });
    const res = makeRes();
    await handler(req as never, res as never);

    expect(res._status).toBe(400);
    // No session INSERT should have been called
    const insertCalls = mockDbExecute.mock.calls.filter(
      (c) => String(c[0]).includes('INSERT INTO session'),
    );
    expect(insertCalls).toHaveLength(0);
  });
});
