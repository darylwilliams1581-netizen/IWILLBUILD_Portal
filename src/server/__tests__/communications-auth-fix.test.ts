/**
 * Regression tests — communications GET auth fix
 * ─────────────────────────────────────────────────────────────────────────────
 * Proves:
 *  1. GET /api/dazza/v3/communications uses profile.companyId (not company_users)
 *  2. Returns safely when getSessionAndProfile returns null (unauthenticated)
 *  3. The string "company_users" does not appear anywhere in the handler source
 *  4. All six endpoints that previously called getSessionAndProfile(req) without
 *     res now call it with (req, res) and handle null correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/auth.js', () => ({
  getAuth: () => ({
    api: { getSession: vi.fn().mockResolvedValue(null) },
  }),
}));

vi.mock('../db/client.js', () => ({
  db: {
    query: { profiles: { findFirst: vi.fn().mockResolvedValue(null) } },
    execute: vi.fn().mockResolvedValue([[]]),
  },
}));

vi.mock('../db/schema.js', () => ({ profiles: {} }));

vi.mock('../lib/sms.js', () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
  isSmsConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('#airo/secrets', () => ({ getSecret: vi.fn().mockReturnValue(null) }));

vi.mock('../lib/platform-owner-guard.js', () => ({
  getPlatformOwnerInfo: vi.fn().mockResolvedValue(null),
}));

vi.mock('../lib/dazza-v3-brain.js', () => ({
  ingestIncident: vi.fn().mockResolvedValue({ isNew: false, incidentId: 'test-id', severity: 'low' }),
  notifyOwnerOfIncident: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides: Record<string, unknown> = {}) {
  return { headers: {}, query: {}, params: {}, body: {}, ...overrides } as unknown as import('express').Request;
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

// ── Source-level assertions: no company_users, correct call pattern ───────────

describe('GET /api/dazza/v3/communications — source integrity', () => {
  const src = readFileSync(
    resolve('src/server/api/dazza/v3/communications/GET.ts'),
    'utf-8',
  );

  it('does not reference company_users', () => {
    expect(src).not.toContain('company_users');
  });

  it('calls getSessionAndProfile with two arguments (req, res)', () => {
    expect(src).toMatch(/getSessionAndProfile\s*\(\s*req\s*,\s*res\s*\)/);
  });

  it('uses profile.companyId', () => {
    expect(src).toContain('profile.companyId');
  });

  it('handles null result from getSessionAndProfile', () => {
    expect(src).toMatch(/if\s*\(!result\)/);
  });
});

// ── Runtime: unauthenticated → null result → handler exits cleanly ────────────

describe('GET /api/dazza/v3/communications — unauthenticated (null result)', () => {
  beforeEach(() => vi.resetModules());

  it('resolves without throwing when getSessionAndProfile returns null', async () => {
    // Override auth-middleware to return null (simulates 401 already sent)
    vi.doMock('../lib/auth-middleware.js', () => ({
      getSessionAndProfile: vi.fn().mockResolvedValue(null),
    }));

    const { default: handler } = await import('../api/dazza/v3/communications/GET');
    const res = makeRes();
    await expect(handler(makeReq() as never, res as never)).resolves.toBeUndefined();
    // Status must not have been set to 500 (no crash)
    expect(res._status).not.toBe(500);
  });
});

// ── Runtime: authenticated → returns ok:true with empty communications ─────────

describe('GET /api/dazza/v3/communications — authenticated', () => {
  beforeEach(() => vi.resetModules());

  it('returns ok:true and empty communications array when db returns no rows', async () => {
    vi.doMock('../lib/auth-middleware.js', () => ({
      getSessionAndProfile: vi.fn().mockResolvedValue({
        session: { user: { id: 'user-abc', email: 'test@example.com', name: 'Test User' } },
        profile: { id: 1, userId: 'user-abc', companyId: 99, role: 'owner', status: 'active' },
      }),
    }));
    vi.doMock('../db/client.js', () => ({
      db: { execute: vi.fn().mockResolvedValue([[]]) },
    }));

    const { default: handler } = await import('../api/dazza/v3/communications/GET');
    const res = makeRes();
    await handler(makeReq() as never, res as never);

    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).ok).toBe(true);
    expect((res._body as Record<string, unknown>).communications).toEqual([]);
  });
});

// ── Source-level: all six endpoints use two-arg pattern + null guard ──────────

describe('Auth fix — all six endpoints use getSessionAndProfile(req, res)', () => {
  const endpoints = [
    'src/server/api/dazza/v3/communications/GET.ts',
    'src/server/api/bug-reports/my-reports/GET.ts',
    'src/server/api/dazza/v3/communications/[id]/dismiss/POST.ts',
    'src/server/api/dazza/v3/communications/[id]/still-having-trouble/POST.ts',
    'src/server/api/dazza/v3/incidents/POST.ts',
    'src/server/api/fleet/[id]/driver-sessions/manual/POST.ts',
  ];

  for (const relPath of endpoints) {
    describe(relPath, () => {
      const src = readFileSync(resolve(relPath), 'utf-8');

      it('does NOT call getSessionAndProfile with only one argument', () => {
        // Pattern: getSessionAndProfile(req) with nothing after req before closing paren
        expect(src).not.toMatch(/getSessionAndProfile\s*\(\s*req\s*\)/);
      });

      it('handles null return from getSessionAndProfile with early return', () => {
        // incidents/POST uses authResult instead of result to avoid name collision
        const usesResult = src.match(/if\s*\(!result\)/) !== null;
        const usesAuthResult = src.match(/if\s*\(!authResult\)/) !== null;
        expect(usesResult || usesAuthResult).toBe(true);
      });
    });
  }
});
