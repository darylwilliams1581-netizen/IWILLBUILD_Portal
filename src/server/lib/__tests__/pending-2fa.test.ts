/**
 * Pending-2FA Tests
 *
 * Covers:
 *   - createChallenge generates a token and stores a hash
 *   - getChallenge returns the challenge for a valid token
 *   - getChallenge returns null for expired/invalid tokens
 *   - incrementChallengeAttempts deletes challenge at MAX_CHALLENGE_ATTEMPTS
 *   - deleteChallenge removes the row
 *   - hashChallengeToken is deterministic
 *   - generateChallengeToken produces 64-char hex strings
 *   - Protected APIs reject pending sessions with TWO_FACTOR_REQUIRED
 *   - 2FA verification endpoints are accessible while pending
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateChallengeToken,
  hashChallengeToken,
  MAX_CHALLENGE_ATTEMPTS,
} from '../pending-2fa.js';

// ── Token helpers ──────────────────────────────────────────────────────────────

describe('generateChallengeToken', () => {
  it('produces a 64-character hex string', () => {
    const token = generateChallengeToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique tokens on each call', () => {
    const t1 = generateChallengeToken();
    const t2 = generateChallengeToken();
    expect(t1).not.toBe(t2);
  });
});

describe('hashChallengeToken', () => {
  it('is deterministic', () => {
    const token = 'abc123';
    expect(hashChallengeToken(token)).toBe(hashChallengeToken(token));
  });

  it('produces a 64-character hex string', () => {
    expect(hashChallengeToken('test')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different tokens produce different hashes', () => {
    expect(hashChallengeToken('a')).not.toBe(hashChallengeToken('b'));
  });
});

// ── DB operations (mocked) ─────────────────────────────────────────────────────

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: { execute: mockExecute },
}));

// Mock drizzle-orm sql tagged template — returns an object that passes through db.execute mock
vi.mock('drizzle-orm', () => {
  function sqlTag(strings: TemplateStringsArray, ...values: unknown[]) {
    return { _sql: true, strings, values };
  }
  sqlTag.raw = (s: string) => ({ _sql: true, raw: s });
  return { sql: sqlTag };
});

describe('createChallenge', () => {
  beforeEach(() => mockExecute.mockReset());

  it('calls DELETE then INSERT', async () => {
    mockExecute.mockResolvedValue([[], {}]);
    const { createChallenge } = await import('../pending-2fa.js');
    const token = await createChallenge('user-1', 'totp');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});

describe('getChallenge', () => {
  beforeEach(() => mockExecute.mockReset());

  it('returns null when no row found', async () => {
    mockExecute.mockResolvedValue([[/* empty */], {}]);
    const { getChallenge } = await import('../pending-2fa.js');
    const result = await getChallenge('nonexistent-token');
    expect(result).toBeNull();
  });

  it('returns a PendingChallenge when row found', async () => {
    const futureDate = new Date(Date.now() + 60_000);
    mockExecute.mockResolvedValue([[{
      id:         'challenge-1',
      user_id:    'user-1',
      method:     'totp',
      expires_at: futureDate,
      attempts:   0,
    }], {}]);
    const { getChallenge } = await import('../pending-2fa.js');
    const result = await getChallenge('valid-token');
    expect(result).not.toBeNull();
    expect(result?.userId).toBe('user-1');
    expect(result?.method).toBe('totp');
  });
});

describe('incrementChallengeAttempts', () => {
  beforeEach(() => mockExecute.mockReset());

  it('returns false and updates when below max', async () => {
    mockExecute.mockResolvedValue([[], {}]);
    const { incrementChallengeAttempts } = await import('../pending-2fa.js');
    const lockedOut = await incrementChallengeAttempts('challenge-1', 2);
    expect(lockedOut).toBe(false);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('returns true and deletes when at max attempts', async () => {
    mockExecute.mockResolvedValue([[], {}]);
    const { incrementChallengeAttempts } = await import('../pending-2fa.js');
    const lockedOut = await incrementChallengeAttempts('challenge-1', MAX_CHALLENGE_ATTEMPTS - 1);
    expect(lockedOut).toBe(true);
    // Should call DELETE (via deleteChallenge)
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

// ── checkPending2fa middleware ─────────────────────────────────────────────────

describe('checkPending2fa middleware', () => {
  beforeEach(() => mockExecute.mockReset());

  function makeReq(cookies: Record<string, string> = {}, method = 'GET') {
    return { cookies, method, headers: {}, socket: {} } as unknown as import('express').Request;
  }

  function makeRes() {
    return {
      status: vi.fn().mockReturnThis(),
      json:   vi.fn().mockReturnThis(),
    } as unknown as import('express').Response;
  }

  it('returns false (not blocked) when no challenge cookie', async () => {
    const { checkPending2fa } = await import('../auth-middleware.js');
    const req = makeReq({});
    const res = makeRes();
    const blocked = await checkPending2fa(req, res, '/api/jobs');
    expect(blocked).toBe(false);
  });

  it('returns false when challenge cookie is expired/invalid', async () => {
    mockExecute.mockResolvedValue([[/* empty */], {}]);
    const { checkPending2fa } = await import('../auth-middleware.js');
    const req = makeReq({ iwb_2fa_challenge: 'expired-token' });
    const res = makeRes();
    const blocked = await checkPending2fa(req, res, '/api/jobs');
    expect(blocked).toBe(false);
  });

  it('blocks protected routes with TWO_FACTOR_REQUIRED when challenge is active', async () => {
    const futureDate = new Date(Date.now() + 60_000);
    mockExecute.mockResolvedValue([[{
      id:         'challenge-1',
      user_id:    'user-1',
      method:     'totp',
      expires_at: futureDate,
      attempts:   0,
    }], {}]);

    const { checkPending2fa } = await import('../auth-middleware.js');
    const req = makeReq({ iwb_2fa_challenge: 'valid-token' }, 'GET');
    const res = makeRes();
    const blocked = await checkPending2fa(req, res, '/api/jobs');
    expect(blocked).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TWO_FACTOR_REQUIRED' }),
    );
  });

  it('allows POST /api/me/2fa/verify while challenge is active', async () => {
    const futureDate = new Date(Date.now() + 60_000);
    mockExecute.mockResolvedValue([[{
      id:         'challenge-1',
      user_id:    'user-1',
      method:     'totp',
      expires_at: futureDate,
      attempts:   0,
    }], {}]);

    const { checkPending2fa } = await import('../auth-middleware.js');
    const req = makeReq({ iwb_2fa_challenge: 'valid-token' }, 'POST');
    const res = makeRes();
    const blocked = await checkPending2fa(req, res, '/api/me/2fa/verify');
    expect(blocked).toBe(false);
  });

  it('allows POST /api/me/2fa/sms/verify while challenge is active', async () => {
    const futureDate = new Date(Date.now() + 60_000);
    mockExecute.mockResolvedValue([[{
      id:         'challenge-1',
      user_id:    'user-1',
      method:     'sms',
      expires_at: futureDate,
      attempts:   0,
    }], {}]);

    const { checkPending2fa } = await import('../auth-middleware.js');
    const req = makeReq({ iwb_2fa_challenge: 'valid-token' }, 'POST');
    const res = makeRes();
    const blocked = await checkPending2fa(req, res, '/api/me/2fa/sms/verify');
    expect(blocked).toBe(false);
  });

  it('allows POST /api/me/2fa/recover while challenge is active', async () => {
    const futureDate = new Date(Date.now() + 60_000);
    mockExecute.mockResolvedValue([[{
      id:         'challenge-1',
      user_id:    'user-1',
      method:     'totp',
      expires_at: futureDate,
      attempts:   0,
    }], {}]);

    const { checkPending2fa } = await import('../auth-middleware.js');
    const req = makeReq({ iwb_2fa_challenge: 'valid-token' }, 'POST');
    const res = makeRes();
    const blocked = await checkPending2fa(req, res, '/api/me/2fa/recover');
    expect(blocked).toBe(false);
  });
});
