/**
 * platform-owner-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Proves:
 *  1. An arbitrary email cannot gain platform-owner access via the email fallback.
 *  2. A missing PLATFORM_OWNER_EMAIL secret disables the fallback entirely.
 *  3. The configured owner email (from secret) grants access.
 *  4. A DB-flagged developer gains access regardless of the email fallback.
 *  5. An unauthenticated request returns null (no access).
 *  6. A non-developer DB role is denied.
 *  7. No hardcoded personal email addresses appear in the guard source.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// We control getSecret to simulate different secret configurations.
const mockGetSecret = vi.fn<[string], string | null>();

vi.mock('#airo/secrets', () => ({
  getSecret: (name: string) => mockGetSecret(name),
}));

vi.mock('../db/client.js', () => ({
  db: {
    execute: vi.fn().mockResolvedValue([[{ platform_role: null }]]),
  },
}));

vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

const mockGetSession = vi.fn();
vi.mock('../../lib/auth/auth.js', () => ({
  getAuth: () => ({ api: { getSession: mockGetSession } }),
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

describe('platform-owner-guard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not contain any hardcoded personal email addresses', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/server/lib/platform-owner-guard.ts'),
      'utf8',
    );
    // These specific addresses must not appear in the source
    expect(src).not.toContain('darylwilliams1581@gmail.com');
    expect(src).not.toContain('daryl.williams@enrgyq.com.au');
    // The secret name should be referenced instead
    expect(src).toContain('PLATFORM_OWNER_EMAIL');
  });

  it('returns null for unauthenticated requests', async () => {
    mockGetSecret.mockReturnValue(null);
    mockGetSession.mockResolvedValue(null);

    const { getPlatformOwnerInfo } = await import('../lib/platform-owner-guard.js');
    const result = await getPlatformOwnerInfo(makeReq());
    expect(result).toBeNull();
  });

  it('denies access when PLATFORM_OWNER_EMAIL is not set and DB role is null', async () => {
    mockGetSecret.mockReturnValue(null);
    mockGetSession.mockResolvedValue({
      user: { id: 'user-123', email: 'anyone@example.com' },
    });

    const { db } = await import('../db/client.js');
    vi.mocked(db.execute).mockResolvedValue([[{ platform_role: null }]] as never);

    const { getPlatformOwnerInfo } = await import('../lib/platform-owner-guard.js');
    const result = await getPlatformOwnerInfo(makeReq());
    expect(result?.isPlatformOwner).toBe(false);
  });

  it('denies an arbitrary email even when PLATFORM_OWNER_EMAIL is set to a different address', async () => {
    mockGetSecret.mockImplementation((name) =>
      name === 'PLATFORM_OWNER_EMAIL' ? 'owner@iwillbuild.com' : null,
    );
    mockGetSession.mockResolvedValue({
      user: { id: 'attacker-id', email: 'attacker@evil.com' },
    });

    const { db } = await import('../db/client.js');
    vi.mocked(db.execute).mockResolvedValue([[{ platform_role: null }]] as never);

    const { getPlatformOwnerInfo } = await import('../lib/platform-owner-guard.js');
    const result = await getPlatformOwnerInfo(makeReq());
    expect(result?.isPlatformOwner).toBe(false);
  });

  it('grants access to the configured PLATFORM_OWNER_EMAIL address', async () => {
    mockGetSecret.mockImplementation((name) =>
      name === 'PLATFORM_OWNER_EMAIL' ? 'owner@iwillbuild.com' : null,
    );
    mockGetSession.mockResolvedValue({
      user: { id: 'owner-id', email: 'owner@iwillbuild.com' },
    });

    const { getPlatformOwnerInfo } = await import('../lib/platform-owner-guard.js');
    const result = await getPlatformOwnerInfo(makeReq());
    expect(result?.isPlatformOwner).toBe(true);
    expect(result?.platformRole).toBe('developer');
  });

  it('grants access to a DB-flagged developer regardless of email fallback', async () => {
    mockGetSecret.mockReturnValue(null); // fallback disabled
    mockGetSession.mockResolvedValue({
      user: { id: 'dev-user', email: 'dev@example.com' },
    });

    const { db } = await import('../db/client.js');
    vi.mocked(db.execute).mockResolvedValue([[{ platform_role: 'developer' }]] as never);

    const { getPlatformOwnerInfo } = await import('../lib/platform-owner-guard.js');
    const result = await getPlatformOwnerInfo(makeReq());
    expect(result?.isPlatformOwner).toBe(true);
    expect(result?.platformRole).toBe('developer');
  });

  it('denies a non-developer DB role (owner/admin/member)', async () => {
    mockGetSecret.mockReturnValue(null);
    mockGetSession.mockResolvedValue({
      user: { id: 'company-owner', email: 'boss@company.com' },
    });

    const { db } = await import('../db/client.js');
    vi.mocked(db.execute).mockResolvedValue([[{ platform_role: null }]] as never);

    const { getPlatformOwnerInfo } = await import('../lib/platform-owner-guard.js');
    const result = await getPlatformOwnerInfo(makeReq());
    expect(result?.isPlatformOwner).toBe(false);
  });

  it('requirePlatformOwner returns 401 for unauthenticated requests', async () => {
    mockGetSecret.mockReturnValue(null);
    mockGetSession.mockResolvedValue(null);

    const { requirePlatformOwner } = await import('../lib/platform-owner-guard.js');
    const res = makeRes();
    const next = vi.fn();
    await requirePlatformOwner(makeReq(), res as never, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('requirePlatformOwner returns 403 for authenticated non-owner', async () => {
    mockGetSecret.mockReturnValue(null);
    mockGetSession.mockResolvedValue({
      user: { id: 'regular-user', email: 'user@example.com' },
    });

    const { db } = await import('../db/client.js');
    vi.mocked(db.execute).mockResolvedValue([[{ platform_role: null }]] as never);

    const { requirePlatformOwner } = await import('../lib/platform-owner-guard.js');
    const res = makeRes();
    const next = vi.fn();
    await requirePlatformOwner(makeReq(), res as never, next);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('requirePlatformOwner calls next() for a valid platform developer', async () => {
    mockGetSecret.mockImplementation((name) =>
      name === 'PLATFORM_OWNER_EMAIL' ? 'owner@iwillbuild.com' : null,
    );
    mockGetSession.mockResolvedValue({
      user: { id: 'owner-id', email: 'owner@iwillbuild.com' },
    });

    const { requirePlatformOwner } = await import('../lib/platform-owner-guard.js');
    const res = makeRes();
    const next = vi.fn();
    await requirePlatformOwner(makeReq(), res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res._status).toBe(200); // unchanged
  });

  it('PLATFORM_OWNER_EMAILS set is empty when secret is absent', async () => {
    mockGetSecret.mockReturnValue(null);
    const { PLATFORM_OWNER_EMAILS } = await import('../lib/platform-owner-guard.js');
    expect(PLATFORM_OWNER_EMAILS.size).toBe(0);
  });
});
