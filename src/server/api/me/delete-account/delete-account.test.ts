import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  deleteUser: vi.fn(),
  findProfile: vi.fn(),
  findProfiles: vi.fn(),
  platformInfo: vi.fn(),
  ownerToken: vi.fn(() => 'server-signed-owner-token'),
}));

vi.mock('../../../../lib/auth/auth.js', () => ({
  createAccountDeletionAuthorization: mocks.ownerToken,
  getAuth: () => ({ api: { getSession: mocks.getSession, deleteUser: mocks.deleteUser } }),
}));
vi.mock('../../../lib/platform-owner-guard.js', () => ({
  getPlatformOwnerInfo: mocks.platformInfo,
}));
vi.mock('../../../db/client.js', () => ({
  db: { query: { profiles: { findFirst: mocks.findProfile, findMany: mocks.findProfiles } } },
}));
vi.mock('../../../db/schema.js', () => ({
  profiles: { userId: 'user_id', companyId: 'company_id', status: 'status' },
}));

import handler from './POST.js';

function response() {
  const res = {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.payload = payload; return this; },
  };
  return res;
}

function request(body: Record<string, unknown> = {}) {
  return { headers: {}, body } as never;
}

describe('POST /api/me/delete-account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1', email: 'person@example.com' } });
    mocks.platformInfo.mockResolvedValue({ isPlatformOwner: false });
    mocks.findProfile.mockResolvedValue({ userId: 'user-1', companyId: 7, role: 'member' });
    mocks.findProfiles.mockResolvedValue([]);
    mocks.deleteUser.mockResolvedValue({ success: true });
  });

  it('requires authentication', async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = response();
    await handler(request({ confirmation: 'DELETE', password: 'secret' }), res as never);
    expect(res.statusCode).toBe(401);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('protects the platform developer account', async () => {
    mocks.platformInfo.mockResolvedValue({ isPlatformOwner: true });
    const res = response();
    await handler(request({ confirmation: 'DELETE', password: 'secret' }), res as never);
    expect(res.statusCode).toBe(403);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('requires exact typed confirmation', async () => {
    const res = response();
    await handler(request({ confirmation: 'delete', password: 'secret' }), res as never);
    expect(res.statusCode).toBe(400);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('deletes a team member only after BetterAuth verifies the password', async () => {
    const res = response();
    await handler(request({ confirmation: 'DELETE', password: 'secret' }), res as never);
    expect(res.statusCode).toBe(200);
    expect(mocks.deleteUser).toHaveBeenCalledOnce();
    expect(mocks.deleteUser.mock.calls[0][0].body).toEqual({ password: 'secret' });
    expect(mocks.deleteUser.mock.calls[0][0].headers.get('x-iwb-account-delete-authorization')).toBe('server-signed-owner-token');
  });

  it('requires an owner to transfer ownership while active members remain', async () => {
    mocks.findProfile.mockResolvedValue({ userId: 'user-1', companyId: 7, role: 'owner' });
    mocks.findProfiles.mockResolvedValue([{ id: 22 }]);
    const res = response();
    await handler(request({ confirmation: 'DELETE', password: 'secret', deleteCompanyData: true }), res as never);
    expect(res.statusCode).toBe(409);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('adds server authorization for a confirmed sole-owner deletion', async () => {
    mocks.findProfile.mockResolvedValue({ userId: 'user-1', companyId: 7, role: 'owner' });
    const res = response();
    await handler(request({ confirmation: 'DELETE', password: 'secret', deleteCompanyData: true }), res as never);
    expect(res.statusCode).toBe(200);
    expect(mocks.ownerToken).toHaveBeenCalledWith('user-1');
    expect(mocks.deleteUser.mock.calls[0][0].headers.get('x-iwb-account-delete-authorization')).toBe('server-signed-owner-token');
  });
});
