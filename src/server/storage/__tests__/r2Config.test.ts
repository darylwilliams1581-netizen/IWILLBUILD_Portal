/**
 * CP10 — r2Config unit tests
 *
 * R2C1  loadR2Config — fails closed on missing secrets
 * R2C2  loadR2Config — succeeds with all secrets present
 * R2C3  getStorageStatus — safe fields only, no credentials
 * R2C4  isValidKeySegment — traversal rejection
 * R2C5  isValidObjectKey — full key validation
 * R2C6  buildObjectKey — canonical key construction
 * R2C7  keyBelongsToCompany — cross-company guard
 * R2C8  redactStorageUrl — credential stripping
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadR2Config,
  getStorageStatus,
  isValidKeySegment,
  isValidObjectKey,
  buildObjectKey,
  keyBelongsToCompany,
  redactStorageUrl,
} from '../r2Config.js';

// ── Mock getSecret ────────────────────────────────────────────────────────────

vi.mock('#airo/secrets', () => ({
  getSecret: vi.fn(),
}));

import { getSecret } from '#airo/secrets';
const mockGetSecret = vi.mocked(getSecret);

function setSecrets(map: Record<string, string | null>) {
  mockGetSecret.mockImplementation((name: string) => map[name] ?? null);
}

const FULL_SECRETS: Record<string, string> = {
  STORAGE_PROVIDER:    'r2',
  R2_ACCOUNT_ID:       'test-account-id',
  R2_ACCESS_KEY_ID:    'test-access-key',
  R2_SECRET_ACCESS_KEY:'test-secret-key',
  R2_BUCKET:           'test-bucket',
};

// ── R2C1: loadR2Config fails closed ──────────────────────────────────────────

describe('R2C1 loadR2Config — fails closed on missing secrets', () => {
  it('throws when all R2 secrets are absent', () => {
    setSecrets({});
    expect(() => loadR2Config()).toThrow(/r2Config/);
  });

  it('throws when R2_ACCOUNT_ID is missing', () => {
    setSecrets({ ...FULL_SECRETS, R2_ACCOUNT_ID: '' });
    expect(() => loadR2Config()).toThrow(/R2_ACCOUNT_ID/);
  });

  it('throws when R2_ACCESS_KEY_ID is missing', () => {
    setSecrets({ ...FULL_SECRETS, R2_ACCESS_KEY_ID: '' });
    expect(() => loadR2Config()).toThrow(/R2_ACCESS_KEY_ID/);
  });

  it('throws when R2_SECRET_ACCESS_KEY is missing', () => {
    setSecrets({ ...FULL_SECRETS, R2_SECRET_ACCESS_KEY: '' });
    expect(() => loadR2Config()).toThrow(/R2_SECRET_ACCESS_KEY/);
  });

  it('throws when R2_BUCKET is missing', () => {
    setSecrets({ ...FULL_SECRETS, R2_BUCKET: '' });
    expect(() => loadR2Config()).toThrow(/R2_BUCKET/);
  });

  it('error message lists missing secret NAMES — never values', () => {
    setSecrets({ ...FULL_SECRETS, R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '' });
    let msg = '';
    try { loadR2Config(); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain('R2_ACCESS_KEY_ID');
    expect(msg).toContain('R2_SECRET_ACCESS_KEY');
    // Must not contain any credential value
    expect(msg).not.toContain('test-account-id');
    expect(msg).not.toContain('test-secret-key');
  });
});

// ── R2C2: loadR2Config succeeds ───────────────────────────────────────────────

describe('R2C2 loadR2Config — succeeds with all secrets', () => {
  it('returns config with correct fields', () => {
    setSecrets(FULL_SECRETS);
    const cfg = loadR2Config();
    expect(cfg.accountId).toBe('test-account-id');
    expect(cfg.accessKeyId).toBe('test-access-key');
    expect(cfg.secretAccessKey).toBe('test-secret-key');
    expect(cfg.bucket).toBe('test-bucket');
    expect(cfg.publicUrl).toBeUndefined();
  });

  it('includes publicUrl when R2_PUBLIC_URL is set', () => {
    setSecrets({ ...FULL_SECRETS, R2_PUBLIC_URL: 'https://cdn.example.com/' });
    const cfg = loadR2Config();
    expect(cfg.publicUrl).toBe('https://cdn.example.com');
  });

  it('strips trailing slash from publicUrl', () => {
    setSecrets({ ...FULL_SECRETS, R2_PUBLIC_URL: 'https://cdn.example.com///' });
    const cfg = loadR2Config();
    expect(cfg.publicUrl).toBe('https://cdn.example.com');
  });
});

// ── R2C3: getStorageStatus — safe fields only ─────────────────────────────────

describe('R2C3 getStorageStatus — never returns credentials', () => {
  it('returns local status when STORAGE_PROVIDER is local', () => {
    setSecrets({ STORAGE_PROVIDER: 'local' });
    const s = getStorageStatus();
    expect(s.provider).toBe('local');
    expect(s.configured).toBe(true);
    expect(s.bucket).toBeNull();
  });

  it('returns r2 configured=false when credentials missing', () => {
    setSecrets({ STORAGE_PROVIDER: 'r2' });
    const s = getStorageStatus();
    expect(s.provider).toBe('r2');
    expect(s.configured).toBe(false);
    expect(s.error).toBe('missing_credentials');
  });

  it('returns r2 configured=false when bucket missing', () => {
    setSecrets({ ...FULL_SECRETS, R2_BUCKET: '' });
    const s = getStorageStatus();
    expect(s.configured).toBe(false);
    expect(s.error).toBe('missing_bucket');
  });

  it('returns r2 configured=true with all secrets', () => {
    setSecrets(FULL_SECRETS);
    const s = getStorageStatus();
    expect(s.provider).toBe('r2');
    expect(s.configured).toBe(true);
    expect(s.bucket).toBe('test-bucket');
    expect(s.error).toBeUndefined();
  });

  it('status object contains no credential values', () => {
    setSecrets(FULL_SECRETS);
    const s = getStorageStatus();
    const json = JSON.stringify(s);
    expect(json).not.toContain('test-account-id');
    expect(json).not.toContain('test-access-key');
    expect(json).not.toContain('test-secret-key');
  });
});

// ── R2C4: isValidKeySegment ───────────────────────────────────────────────────

describe('R2C4 isValidKeySegment — traversal rejection', () => {
  it('accepts normal filename', () => expect(isValidKeySegment('file.jpg')).toBe(true));
  it('accepts UUID', () => expect(isValidKeySegment('550e8400-e29b-41d4-a716-446655440000')).toBe(true));
  it('accepts alphanumeric', () => expect(isValidKeySegment('abc123')).toBe(true));
  it('rejects empty string', () => expect(isValidKeySegment('')).toBe(false));
  it('rejects ..', () => expect(isValidKeySegment('..')).toBe(false));
  it('rejects .', () => expect(isValidKeySegment('.')).toBe(false));
  it('rejects backslash', () => expect(isValidKeySegment('a\\b')).toBe(false));
  it('rejects absolute path', () => expect(isValidKeySegment('/etc/passwd')).toBe(false));
  it('rejects control character', () => expect(isValidKeySegment('a\x00b')).toBe(false));
  it('rejects null byte', () => expect(isValidKeySegment('\x00')).toBe(false));
  it('rejects percent-encoded traversal %2e%2e', () => expect(isValidKeySegment('%2e%2e')).toBe(false));
  it('rejects percent-encoded slash %2f', () => expect(isValidKeySegment('a%2fb')).toBe(false));
  it('rejects percent-encoded backslash %5c', () => expect(isValidKeySegment('a%5cb')).toBe(false));
});

// ── R2C5: isValidObjectKey ────────────────────────────────────────────────────

describe('R2C5 isValidObjectKey — full key validation', () => {
  it('accepts canonical key', () => expect(isValidObjectKey('companies/1/job-photos/uuid/file.jpg')).toBe(true));
  it('accepts legacy key', () => expect(isValidObjectKey('job-photos/uuid.jpg')).toBe(true));
  it('rejects empty', () => expect(isValidObjectKey('')).toBe(false));
  it('rejects absolute path', () => expect(isValidObjectKey('/companies/1/file.jpg')).toBe(false));
  it('rejects traversal segment', () => expect(isValidObjectKey('companies/../etc/passwd')).toBe(false));
  it('rejects double slash (empty segment)', () => expect(isValidObjectKey('companies//1/file.jpg')).toBe(false));
  it('rejects backslash in segment', () => expect(isValidObjectKey('companies/1\\2/file.jpg')).toBe(false));
  it('rejects percent-encoded traversal', () => expect(isValidObjectKey('companies/%2e%2e/file.jpg')).toBe(false));
});

// ── R2C6: buildObjectKey ──────────────────────────────────────────────────────

describe('R2C6 buildObjectKey — canonical key construction', () => {
  it('produces expected format', () => {
    const key = buildObjectKey({ companyId: 42, category: 'job-photos', uuid: 'abc-123', originalName: 'photo.jpg' });
    expect(key).toBe('companies/42/job-photos/abc-123/photo.jpg');
  });

  it('sanitises path separators in filename', () => {
    const key = buildObjectKey({ companyId: 1, category: 'files', uuid: 'u1', originalName: '../../../etc/passwd' });
    expect(key).not.toContain('..');
    expect(key).not.toContain('/etc/passwd');
  });

  it('sanitises backslashes in filename', () => {
    const key = buildObjectKey({ companyId: 1, category: 'files', uuid: 'u1', originalName: 'a\\b.pdf' });
    expect(key).not.toContain('\\');
  });

  it('caps filename at 200 chars', () => {
    const long = 'a'.repeat(300) + '.pdf';
    const key = buildObjectKey({ companyId: 1, category: 'files', uuid: 'u1', originalName: long });
    const filename = key.split('/').pop()!;
    expect(filename.length).toBeLessThanOrEqual(200);
  });

  it('falls back to "file" for empty filename', () => {
    const key = buildObjectKey({ companyId: 1, category: 'files', uuid: 'u1', originalName: '' });
    expect(key.endsWith('/file')).toBe(true);
  });

  it('result passes isValidObjectKey', () => {
    const key = buildObjectKey({ companyId: 99, category: 'safety-documents', uuid: 'x-y-z', originalName: 'report.pdf' });
    expect(isValidObjectKey(key)).toBe(true);
  });
});

// ── R2C7: keyBelongsToCompany ─────────────────────────────────────────────────

describe('R2C7 keyBelongsToCompany — cross-company guard', () => {
  it('accepts key for correct company', () => {
    expect(keyBelongsToCompany('companies/42/job-photos/uuid/file.jpg', 42)).toBe(true);
  });

  it('rejects key for different company', () => {
    expect(keyBelongsToCompany('companies/99/job-photos/uuid/file.jpg', 42)).toBe(false);
  });

  it('accepts legacy key (no companies/ prefix)', () => {
    expect(keyBelongsToCompany('job-photos/uuid.jpg', 42)).toBe(true);
  });

  it('rejects key starting with companies/ but wrong ID', () => {
    expect(keyBelongsToCompany('companies/1/file.jpg', 2)).toBe(false);
  });
});

// ── R2C8: redactStorageUrl ────────────────────────────────────────────────────

describe('R2C8 redactStorageUrl — credential stripping', () => {
  it('strips query parameters from presigned URL', () => {
    const url = 'https://bucket.accountid.r2.cloudflarestorage.com/key.jpg?X-Amz-Credential=AKID%2F20260101&X-Amz-Signature=abc123';
    const redacted = redactStorageUrl(url);
    expect(redacted).not.toContain('X-Amz-Credential');
    expect(redacted).not.toContain('X-Amz-Signature');
    expect(redacted).not.toContain('AKID');
    expect(redacted).not.toContain('abc123');
  });

  it('strips host (contains accountId)', () => {
    const url = 'https://bucket.myaccountid.r2.cloudflarestorage.com/path/to/file.jpg';
    const redacted = redactStorageUrl(url);
    expect(redacted).not.toContain('myaccountid');
    expect(redacted).toBe('/path/to/file.jpg');
  });

  it('returns path for normal URL', () => {
    const url = 'https://example.com/companies/1/photos/uuid/file.jpg';
    expect(redactStorageUrl(url)).toBe('/companies/1/photos/uuid/file.jpg');
  });

  it('returns placeholder for invalid URL', () => {
    expect(redactStorageUrl('not-a-url')).toBe('[redacted-url]');
  });

  it('returns placeholder for empty string', () => {
    expect(redactStorageUrl('')).toBe('[redacted-url]');
  });
});
