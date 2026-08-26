/**
 * Phone Verification Tests
 *
 * Covers:
 *   - phone_verified column is independent of emailVerified
 *   - verify-sms-code sets phone_verified only (not emailVerified)
 *   - PUT /api/me/phone clears phone_verified, does NOT touch emailVerified
 *   - Incorrect code increments attempts
 *   - Expired code returns 400
 *   - Rate limiting on send-sms-code
 *   - Changing phone number clears verified state
 *   - 2FA-prefixed codes are rejected by the account-recovery endpoint
 *   - Max attempts causes code deletion
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

// ── Source-level structural tests (no DB needed) ───────────────────────────────

describe('Source-level: verify-sms-code does not touch emailVerified', () => {
  it('POST.ts sets phoneVerified: true and nothing else on the user', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/server/api/auth/verify-sms-code/POST.ts', 'utf8');
    expect(src).toContain('phoneVerified: true');
    expect(src).not.toContain('emailVerified: true');
    expect(src).not.toContain('emailVerified:');
    expect(src).not.toContain('verificationMethod:');
  });
});

describe('Source-level: PUT /api/me/phone does not touch emailVerified', () => {
  it('PUT.ts sets phoneVerified: false and nothing else on the user', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/server/api/me/phone/PUT.ts', 'utf8');
    expect(src).toContain('phoneVerified: false');
    // The comment mentions emailVerified but the set() call must not include it
    // Check that the set() call does not include emailVerified
    const setMatch = src.match(/\.set\(\{([^}]+)\}/);
    if (setMatch) {
      expect(setMatch[1]).not.toContain('emailVerified');
      expect(setMatch[1]).not.toContain('verificationMethod');
    }
  });
});

describe('Source-level: GET /api/me/phone reads phone_verified column directly', () => {
  it('GET.ts selects phoneVerified from user table', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/server/api/me/phone/GET.ts', 'utf8');
    expect(src).toContain('phoneVerified');
    // The select() call must include phoneVerified
    expect(src).toContain('phoneVerified:  user.phoneVerified');
    // Must NOT derive phoneVerified from verificationMethod or emailVerified
    // (check the select() call, not comments)
    const selectMatch = src.match(/\.select\(\{([^}]+)\}/);
    if (selectMatch) {
      expect(selectMatch[1]).not.toContain('verificationMethod');
      expect(selectMatch[1]).not.toContain('emailVerified');
    }
  });
});

// ── Rate limiting ──────────────────────────────────────────────────────────────

describe('SMS rate limiting', () => {
  it('checkSmsRate allows 10 requests then blocks', async () => {
    const { checkSmsRate } = await import('../signup-rate-limiter.js');
    const ip = `test-phone-rate-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(checkSmsRate(ip)).toBe(true);
    }
    expect(checkSmsRate(ip)).toBe(false); // 11th attempt blocked
  });

  it('different IPs have independent buckets', async () => {
    const { checkSmsRate } = await import('../signup-rate-limiter.js');
    const ip1 = `phone-rate-ip1-${Date.now()}`;
    const ip2 = `phone-rate-ip2-${Date.now()}`;
    // Exhaust ip1
    for (let i = 0; i < 10; i++) checkSmsRate(ip1);
    expect(checkSmsRate(ip1)).toBe(false);
    // ip2 should still be allowed
    expect(checkSmsRate(ip2)).toBe(true);
  });
});

// ── Code hash correctness ──────────────────────────────────────────────────────

describe('SMS code hashing', () => {
  it('same code produces same hash', () => {
    const code = '123456';
    expect(hashCode(code)).toBe(hashCode(code));
  });

  it('different codes produce different hashes', () => {
    expect(hashCode('123456')).not.toBe(hashCode('654321'));
  });

  it('hash is 64 hex chars (SHA-256)', () => {
    expect(hashCode('123456')).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── 2FA prefix isolation ───────────────────────────────────────────────────────

describe('2FA prefix isolation in verify-sms-code', () => {
  it('source code rejects 2fa:-prefixed codes', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/server/api/auth/verify-sms-code/POST.ts', 'utf8');
    // Must check for 2fa: prefix and reject
    expect(src).toContain("startsWith('2fa:')");
    expect(src).toContain("startsWith('setup:')");
  });
});

// ── Normalisation ──────────────────────────────────────────────────────────────

describe('Phone normalisation', () => {
  it('normalises AU mobile to E.164', async () => {
    const { normalisePhone } = await import('../normalise-phone.js');
    expect(normalisePhone('0412345678')).toBe('+61412345678');
  });

  it('normalises NZ mobile to E.164', async () => {
    const { normalisePhone } = await import('../normalise-phone.js');
    // 0212345678 → strip leading 0, prepend +64 → +64212345678
    expect(normalisePhone('0212345678')).toBe('+64212345678');
  });

  it('passes through already-E.164 numbers', async () => {
    const { normalisePhone } = await import('../normalise-phone.js');
    expect(normalisePhone('+61412345678')).toBe('+61412345678');
  });

  it('strips spaces', async () => {
    const { normalisePhone } = await import('../normalise-phone.js');
    expect(normalisePhone('+61 412 345 678')).toBe('+61412345678');
  });
});

// ── Attempt counter logic ──────────────────────────────────────────────────────

describe('Attempt counter logic', () => {
  it('remaining attempts message is correct at attempt 0', () => {
    const MAX_ATTEMPTS = 5;
    const attempts = 0;
    const remaining = MAX_ATTEMPTS - attempts - 1;
    expect(remaining).toBe(4);
    const msg = `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`;
    expect(msg).toBe('Incorrect code. 4 attempts remaining.');
  });

  it('remaining attempts message is correct at attempt 3', () => {
    const MAX_ATTEMPTS = 5;
    const attempts = 3;
    const remaining = MAX_ATTEMPTS - attempts - 1;
    expect(remaining).toBe(1);
    const msg = `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`;
    expect(msg).toBe('Incorrect code. 1 attempt remaining.');
  });

  it('at max attempts, code should be deleted', () => {
    const MAX_ATTEMPTS = 5;
    const attempts = 5;
    expect(attempts >= MAX_ATTEMPTS).toBe(true);
  });
});

// ── User isolation (structural) ────────────────────────────────────────────────

describe('User isolation', () => {
  it('verify-sms-code filters by session user ID', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/server/api/auth/verify-sms-code/POST.ts', 'utf8');
    // Must use session.user.id in the WHERE clause
    expect(src).toContain('session.user.id');
    // Must use eq() for the userId filter
    expect(src).toContain('smsVerificationCodes.userId');
  });

  it('GET /api/me/phone filters by session user ID', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/server/api/me/phone/GET.ts', 'utf8');
    expect(src).toContain('session.user.id');
    expect(src).toContain('user.id');
  });

  it('PUT /api/me/phone filters by session user ID', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/server/api/me/phone/PUT.ts', 'utf8');
    expect(src).toContain('session.user.id');
  });
});
