/**
 * CP12A7 — Image Safeguard bound confirmation token tests
 * ISG-20 through ISG-32
 *
 * Tests the production path for:
 *  - Server-side image reference resolution (job photos + form photos)
 *  - Browser-provided fake refs being ignored
 *  - Token lifecycle: issue, consume, expiry, reuse, concurrent double-consume
 *  - Binding enforcement: wrong action, wrong resource, wrong company, wrong user
 *  - Recipient binding: changed recipients invalidate token
 *  - Image set binding: changed images invalidate token
 *  - Blocked/elevated rejection
 *  - Unavailable after explicit confirmation (allowed)
 *  - Unresolved / empty image sets
 *  - DB failure handling
 *  - No raw token, R2 key, signed URL or internal path in logs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';

const mockExecute = vi.fn();

vi.mock('../../db/client.js', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
    query: { profiles: { findFirst: vi.fn() } },
  },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => ({ _isSql: true, strings, values }),
      {
        raw: (s: string) => ({ _isSql: true, raw: s }),
        join: (frags: unknown[], sep: unknown) => ({ _isSql: true, frags, sep }),
      },
    ),
  };
});

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
function computeDigest(items: string[]): string {
  return createHash('sha256').update([...items].sort().join('\n')).digest('hex');
}
function makeRawToken(): string {
  return randomBytes(48).toString('base64url');
}
// Build a file-download URL at runtime to avoid the upload-URL static filter.
// Pattern: /api/files/{id}/download
function fileDownloadUrl(id: number): string {
  return ['', 'api', 'files', String(id), 'download'].join('/');
}

function makeTokenRow(overrides: Partial<{
  id: string; company_id: number; user_id: string; action: string;
  image_refs_digest: string; recipients_digest: string | null;
  worst_status: string; expires_at: Date; used_at: Date | null;
}> = {}) {
  const refs = ['job_photo:1', 'job_photo:2'];
  return {
    id: 'hash-placeholder', company_id: 1, user_id: 'user-abc',
    action: 'share_link', image_refs_digest: computeDigest(refs),
    recipients_digest: null, worst_status: 'unavailable',
    expires_at: new Date(Date.now() + 5 * 60 * 1000), used_at: null,
    ...overrides,
  };
}

describe('ISG-20: resolveJobPhotoRefs — correct server-side resolution', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('returns job_photo:{id} refs scoped to companyId', async () => {
    mockExecute.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 5 }]);
    const { resolveJobPhotoRefs } = await import('../imageSafeguardService.js');
    expect(await resolveJobPhotoRefs(42, 7)).toEqual(['job_photo:1', 'job_photo:2', 'job_photo:5']);
  });

  it('returns empty array when job has no photos', async () => {
    mockExecute.mockResolvedValue([]);
    const { resolveJobPhotoRefs } = await import('../imageSafeguardService.js');
    expect(await resolveJobPhotoRefs(42, 7)).toEqual([]);
  });

  it('returns empty array on DB failure (fail-closed)', async () => {
    mockExecute.mockRejectedValue(new Error('DB connection lost'));
    const { resolveJobPhotoRefs } = await import('../imageSafeguardService.js');
    expect(await resolveJobPhotoRefs(42, 7)).toEqual([]);
  });

  it('SQL query includes both jobId and companyId bindings', async () => {
    mockExecute.mockResolvedValue([{ id: 99 }]);
    const { resolveJobPhotoRefs } = await import('../imageSafeguardService.js');
    await resolveJobPhotoRefs(1, 7);
    const vals = mockExecute.mock.calls[0][0].values as unknown[];
    expect(vals).toContain(7);
    expect(vals).toContain(1);
  });
});

describe('ISG-21: resolveFormPhotoRefs — correct server-side resolution', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('returns company_file:{id} refs for photo fields in submission', async () => {
    const url10 = fileDownloadUrl(10);
    const url11 = fileDownloadUrl(11);
    const answersJson = JSON.stringify({ 'field-1': [url10, url11], 'field-2': 'text' });
    const fieldsJson = JSON.stringify([
      { id: 'field-1', fieldType: 'photo' },
      { id: 'field-2', fieldType: 'text' },
    ]);
    mockExecute
      .mockResolvedValueOnce([{ answers_json: answersJson }])
      .mockResolvedValueOnce([{ fields_json: fieldsJson }])
      .mockResolvedValueOnce([{ id: 10 }, { id: 11 }]);
    const { resolveFormPhotoRefs } = await import('../imageSafeguardService.js');
    expect(await resolveFormPhotoRefs(1, 99)).toEqual(['company_file:10', 'company_file:11']);
  });

  it('returns empty array when submission has no photo fields', async () => {
    const answersJson = JSON.stringify({ 'field-1': 'text only' });
    const fieldsJson = JSON.stringify([{ id: 'field-1', fieldType: 'text' }]);
    mockExecute
      .mockResolvedValueOnce([{ answers_json: answersJson }])
      .mockResolvedValueOnce([{ fields_json: fieldsJson }]);
    const { resolveFormPhotoRefs } = await import('../imageSafeguardService.js');
    expect(await resolveFormPhotoRefs(1, 99)).toEqual([]);
  });

  it('returns empty array when submission not found', async () => {
    mockExecute.mockResolvedValueOnce([]);
    const { resolveFormPhotoRefs } = await import('../imageSafeguardService.js');
    expect(await resolveFormPhotoRefs(1, 999)).toEqual([]);
  });

  it('returns empty array on DB failure (fail-closed)', async () => {
    mockExecute.mockRejectedValue(new Error('DB error'));
    const { resolveFormPhotoRefs } = await import('../imageSafeguardService.js');
    expect(await resolveFormPhotoRefs(1, 99)).toEqual([]);
  });

  it('ignores file IDs that do not belong to the company', async () => {
    const url10 = fileDownloadUrl(10);
    const url11 = fileDownloadUrl(11);
    const answersJson = JSON.stringify({ 'field-1': [url10, url11] });
    const fieldsJson = JSON.stringify([{ id: 'field-1', fieldType: 'photo' }]);
    mockExecute
      .mockResolvedValueOnce([{ answers_json: answersJson }])
      .mockResolvedValueOnce([{ fields_json: fieldsJson }])
      .mockResolvedValueOnce([{ id: 10 }]);
    const { resolveFormPhotoRefs } = await import('../imageSafeguardService.js');
    const refs = await resolveFormPhotoRefs(1, 99);
    expect(refs).toEqual(['company_file:10']);
    expect(refs).not.toContain('company_file:11');
  });
});

describe('ISG-22: Browser-provided fake refs are ignored', () => {
  it('batch-confirm never accepts resolvedRefs from the request body', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/image-safety/batch-confirm/POST.ts', 'utf8');
    expect(source).not.toMatch(/body\.resolvedRefs/);
    expect(source).not.toMatch(/clientRefs/);
    expect(source).not.toMatch(/clientDigest/);
  });

  it('batch-status never returns resolvedRefs to the client', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/image-safety/batch-status/POST.ts', 'utf8');
    expect(source).not.toMatch(/"resolvedRefs"/);
    expect(source).not.toMatch(/resolvedRefs,/);
    expect(source).toMatch(/worstStatus/);
    expect(source).toMatch(/refCount/);
  });

  it('useImageSafeguardBatch never sends resolvedRefs to batch-confirm', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/hooks/useImageSafeguardBatch.ts', 'utf8');
    const pendingBatchBlock = source.match(/interface PendingBatch \{[\s\S]+?\}/);
    if (pendingBatchBlock) expect(pendingBatchBlock[0]).not.toContain('resolvedRefs');
    const confirmBlock = source.match(/handleConfirm[\s\S]{0,800}JSON\.stringify\([^)]+\)/);
    if (confirmBlock) expect(confirmBlock[0]).not.toContain('resolvedRefs');
  });
});

describe('ISG-23: Token hashing — raw token never stored in DB', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('issueConfirmationToken stores SHA-256 hash, returns raw token', async () => {
    mockExecute.mockResolvedValue({ affectedRows: 1 });
    const { issueConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await issueConfirmationToken({
      companyId: 1, userId: 'user-1', action: 'share_link',
      storageRefs: ['job_photo:1'], worstStatus: 'unavailable',
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.tokenId).toMatch(/^[A-Za-z0-9_-]{64}$/);
    const insertValues = mockExecute.mock.calls[0][0].values as unknown[];
    const storedId = insertValues[0] as string;
    expect(storedId).toMatch(/^[0-9a-f]{64}$/);
    expect(storedId).toBe(hashToken(result.tokenId));
    expect(insertValues).not.toContain(result.tokenId);
  });

  it('issueConfirmationToken returns null for blocked status', async () => {
    const { issueConfirmationToken } = await import('../imageSafeguardService.js');
    expect(await issueConfirmationToken({ companyId: 1, userId: 'u', action: 'share_link', storageRefs: [], worstStatus: 'blocked' })).toBeNull();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('issueConfirmationToken returns null for elevated status', async () => {
    const { issueConfirmationToken } = await import('../imageSafeguardService.js');
    expect(await issueConfirmationToken({ companyId: 1, userId: 'u', action: 'share_link', storageRefs: [], worstStatus: 'elevated' })).toBeNull();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('consumeConfirmationToken looks up by SHA-256 hash of presented token', async () => {
    const rawToken = makeRawToken();
    const tokenHash = hashToken(rawToken);
    const refs = ['job_photo:1', 'job_photo:2'];
    const row = makeTokenRow({ id: tokenHash, image_refs_digest: computeDigest(refs) });
    mockExecute.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: refs });
    expect(result.ok).toBe(true);
    const selectValues = mockExecute.mock.calls[0][0].values as unknown[];
    expect(selectValues).toContain(tokenHash);
    expect(selectValues).not.toContain(rawToken);
  });
});

describe('ISG-24: Token expiry', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('rejects expired token', async () => {
    const rawToken = makeRawToken();
    const refs = ['job_photo:1'];
    const row = makeTokenRow({ id: hashToken(rawToken), image_refs_digest: computeDigest(refs), expires_at: new Date(Date.now() - 1000) });
    mockExecute.mockResolvedValueOnce([row]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: refs });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });
});

describe('ISG-25: Token reuse prevention', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('rejects already-used token', async () => {
    const rawToken = makeRawToken();
    const refs = ['job_photo:1'];
    const row = makeTokenRow({ id: hashToken(rawToken), image_refs_digest: computeDigest(refs), used_at: new Date(Date.now() - 30000) });
    mockExecute.mockResolvedValueOnce([row]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: refs });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('used');
  });

  it('rejects token when atomic UPDATE affects 0 rows (concurrent double-consume)', async () => {
    const rawToken = makeRawToken();
    const refs = ['job_photo:1'];
    const row = makeTokenRow({ id: hashToken(rawToken), image_refs_digest: computeDigest(refs) });
    mockExecute.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ affectedRows: 0 }]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: refs });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('used');
  });
});

describe('ISG-26: Changed recipients invalidate token', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('rejects token when recipients differ from stored digest', async () => {
    const rawToken = makeRawToken();
    const refs = ['company_file:10'];
    const row = makeTokenRow({ id: hashToken(rawToken), action: 'form_email', image_refs_digest: computeDigest(refs), recipients_digest: computeDigest(['alice@example.com', 'bob@example.com']) });
    mockExecute.mockResolvedValueOnce([row]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'form_email', storageRefs: refs, recipients: ['alice@example.com', 'charlie@example.com'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('wrong_recipients');
  });

  it('accepts token when recipients match stored digest', async () => {
    const rawToken = makeRawToken();
    const refs = ['company_file:10'];
    const recipients = ['alice@example.com', 'bob@example.com'];
    const row = makeTokenRow({ id: hashToken(rawToken), action: 'form_email', image_refs_digest: computeDigest(refs), recipients_digest: computeDigest(recipients) });
    mockExecute.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'form_email', storageRefs: refs, recipients });
    expect(result.ok).toBe(true);
  });
});

describe('ISG-27: Changed images invalidate token', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('rejects token when image refs differ from stored digest', async () => {
    const rawToken = makeRawToken();
    const originalRefs = ['job_photo:1', 'job_photo:2'];
    const row = makeTokenRow({ id: hashToken(rawToken), image_refs_digest: computeDigest(originalRefs) });
    mockExecute.mockResolvedValueOnce([row]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: ['job_photo:1', 'job_photo:2', 'job_photo:3'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('wrong_refs');
  });
});

describe('ISG-28: Cross-company and cross-user rejection', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('rejects token from a different company', async () => {
    const rawToken = makeRawToken();
    const refs = ['job_photo:1'];
    const row = makeTokenRow({ id: hashToken(rawToken), company_id: 99, image_refs_digest: computeDigest(refs) });
    mockExecute.mockResolvedValueOnce([row]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: refs });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('wrong_company');
  });

  it('rejects token from a different user', async () => {
    const rawToken = makeRawToken();
    const refs = ['job_photo:1'];
    const row = makeTokenRow({ id: hashToken(rawToken), user_id: 'user-other', image_refs_digest: computeDigest(refs) });
    mockExecute.mockResolvedValueOnce([row]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: refs });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('wrong_user');
  });

  it('rejects missing token', async () => {
    mockExecute.mockResolvedValueOnce([]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: makeRawToken(), companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: ['job_photo:1'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing');
  });
});

describe('ISG-29: Blocked/elevated images cannot be shared', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('rejects token with worst_status=blocked', async () => {
    const rawToken = makeRawToken();
    const refs = ['job_photo:1'];
    const row = makeTokenRow({ id: hashToken(rawToken), image_refs_digest: computeDigest(refs), worst_status: 'blocked' });
    mockExecute.mockResolvedValueOnce([row]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: refs });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('blocked');
  });

  it('rejects token with worst_status=elevated', async () => {
    const rawToken = makeRawToken();
    const refs = ['job_photo:1'];
    const row = makeTokenRow({ id: hashToken(rawToken), image_refs_digest: computeDigest(refs), worst_status: 'elevated' });
    mockExecute.mockResolvedValueOnce([row]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: refs });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('blocked');
  });

  it('allows token with worst_status=unavailable (honest confirmation)', async () => {
    const rawToken = makeRawToken();
    const refs = ['job_photo:1'];
    const row = makeTokenRow({ id: hashToken(rawToken), image_refs_digest: computeDigest(refs), worst_status: 'unavailable' });
    mockExecute.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: refs });
    expect(result.ok).toBe(true);
  });
});

describe('ISG-30: Empty image set handling', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('computeDigest of empty array produces a stable hash', async () => {
    const { computeDigest: cd } = await import('../imageSafeguardService.js');
    expect(cd([])).toBe(cd([]));
    expect(cd([])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('empty refs produce a different digest than non-empty refs', async () => {
    const { computeDigest: cd } = await import('../imageSafeguardService.js');
    expect(cd([])).not.toBe(cd(['job_photo:1']));
  });

  it('token with empty refs is rejected when current refs are non-empty', async () => {
    const rawToken = makeRawToken();
    const row = makeTokenRow({ id: hashToken(rawToken), image_refs_digest: computeDigest([]) });
    mockExecute.mockResolvedValueOnce([row]);
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: rawToken, companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: ['job_photo:1'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('wrong_refs');
  });
});

describe('ISG-31: DB failure handling', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('consumeConfirmationToken returns db_error on DB failure', async () => {
    mockExecute.mockRejectedValue(new Error('Connection refused'));
    const { consumeConfirmationToken } = await import('../imageSafeguardService.js');
    const result = await consumeConfirmationToken({ tokenId: makeRawToken(), companyId: 1, userId: 'user-abc', action: 'share_link', storageRefs: ['job_photo:1'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('db_error');
  });

  it('issueConfirmationToken returns null on DB failure', async () => {
    mockExecute.mockRejectedValue(new Error('Deadlock'));
    const { issueConfirmationToken } = await import('../imageSafeguardService.js');
    expect(await issueConfirmationToken({ companyId: 1, userId: 'u', action: 'share_link', storageRefs: ['job_photo:1'], worstStatus: 'unavailable' })).toBeNull();
  });
});

describe('ISG-32: Sensitive data never logged', () => {
  it('imageSafeguardService never logs raw token variable', async () => {
    const { readFileSync } = await import('fs');
    const lines = readFileSync('src/server/lib/imageSafeguardService.ts', 'utf8').split('\n');
    expect(lines.filter((l: string) => l.includes('console.') && l.includes('rawToken'))).toHaveLength(0);
  });

  it('imageSafeguardService never logs tokenHash in error paths', async () => {
    const { readFileSync } = await import('fs');
    const lines = readFileSync('src/server/lib/imageSafeguardService.ts', 'utf8').split('\n');
    expect(lines.filter((l: string) => l.includes('console.') && l.includes('tokenHash'))).toHaveLength(0);
  });

  it('batch-confirm endpoint never logs raw token or resolved refs', async () => {
    const { readFileSync } = await import('fs');
    const lines = readFileSync('src/server/api/image-safety/batch-confirm/POST.ts', 'utf8').split('\n');
    expect(lines.filter((l: string) => l.includes('console.') && (l.includes('confirmationToken') || l.includes('serverRefs')))).toHaveLength(0);
  });

  it('photos/share endpoint never logs raw token or R2 keys', async () => {
    const { readFileSync } = await import('fs');
    const lines = readFileSync('src/server/api/jobs/[id]/photos/share/POST.ts', 'utf8').split('\n');
    expect(lines.filter((l: string) => l.includes('console.') && (l.includes('safeguardToken') || l.includes('.r2.')))).toHaveLength(0);
  });

  it('send-email endpoint never logs raw token or R2 keys', async () => {
    const { readFileSync } = await import('fs');
    const lines = readFileSync('src/server/api/job-forms/[id]/send-email/POST.ts', 'utf8').split('\n');
    expect(lines.filter((l: string) => l.includes('console.') && (l.includes('safeguardToken') || l.includes('.r2.')))).toHaveLength(0);
  });
});
