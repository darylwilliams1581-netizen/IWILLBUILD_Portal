/**
 * CP10A3 — r2Provider integration tests
 *
 * PI1  saveFile — new-format key: Bucket=iwillbuild-files, no double namespace
 * PI2  saveFile — legacy key: Bucket=iwillbuild-files, bucket prefix prepended
 * PI3  getDownloadStream — new-format key resolves correctly
 * PI4  deleteFile — new-format key, Bucket and Key assertions
 * PI5  getSignedUrl — new-format key, Bucket and Key assertions
 * PI6  objectKey helper — new-format passthrough, legacy prefix
 * PI7  cross-namespace: key from namespace A not accessible via namespace B
 * PI8  saveFile — auto-generated key (no storageKey) uses bucket prefix
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock AWS SDK ──────────────────────────────────────────────────────────────

const mockSend = vi.fn();
const mockGetSignedUrl = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = mockSend;
  }
  class GetObjectCommand {
    Bucket: string; Key: string; _type = 'GetObject';
    constructor(params: { Bucket: string; Key: string }) {
      this.Bucket = params.Bucket;
      this.Key = params.Key;
    }
  }
  class DeleteObjectCommand {
    Bucket: string; Key: string; _type = 'DeleteObject';
    constructor(params: { Bucket: string; Key: string }) {
      this.Bucket = params.Bucket;
      this.Key = params.Key;
    }
  }
  class HeadObjectCommand {
    Bucket: string; Key: string; _type = 'HeadObject';
    constructor(params: { Bucket: string; Key: string }) {
      this.Bucket = params.Bucket;
      this.Key = params.Key;
    }
  }
  return { S3Client, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

// ── Mock getSecret ────────────────────────────────────────────────────────────

vi.mock('#airo/secrets', () => ({
  getSecret: vi.fn(),
}));

import { getSecret } from '#airo/secrets';
const mockGetSecret = vi.mocked(getSecret);

const R2_SECRETS: Record<string, string> = {
  STORAGE_PROVIDER:     'r2',
  R2_ACCOUNT_ID:        'test-account-id',
  R2_ACCESS_KEY_ID:     'test-access-key',
  R2_SECRET_ACCESS_KEY: 'test-secret-key',
  R2_BUCKET:            'iwillbuild-files',
  // Use public URL mode for saveFile tests so getClient() is not called
  // (avoids the S3Client constructor path for PUT operations)
  R2_PUBLIC_URL:        'https://cdn.test.example.com',
};

function setSecrets(overrides: Record<string, string> = {}) {
  const map = { ...R2_SECRETS, ...overrides };
  mockGetSecret.mockImplementation((name: string) => map[name] ?? null);
}

// ── Mock fetch (used by putObjectDirect) ──────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockSuccessfulPut() {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '',
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBuffer(size = 100): Buffer {
  const b = Buffer.alloc(size, 0);
  // JPEG magic bytes
  b[0] = 0xFF; b[1] = 0xD8; b[2] = 0xFF;
  return b;
}

function captureLastPutCall(): { url: string; key: string } {
  const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  const url: string = call[0];
  // URL format: https://{bucket}.{accountId}.r2.cloudflarestorage.com/{encodedKey}
  const urlObj = new URL(url);
  const key = decodeURIComponent(urlObj.pathname.slice(1)); // strip leading /
  return { url, key };
}

// ── PI6: objectKey helper (unit test — no network) ────────────────────────────

describe('PI6 objectKey helper — new-format passthrough, legacy prefix', () => {
  // We test the behaviour indirectly through saveFile, but also expose the
  // logic directly by importing the module and checking the PUT key.

  beforeEach(() => {
    setSecrets();
    mockSuccessfulPut();
    mockFetch.mockClear();
    // Reset module singleton so each test gets a fresh client
    vi.resetModules();
  });

  it('new-format key: storageKey starts with bucket — no double prefix', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const storageKey = 'job-photos/companies/42/job-photos/uuid-abc/photo.jpg';
    await r2Provider.saveFile({
      buffer: makeBuffer(),
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      bucket: 'job-photos',
      storageKey,
    });
    const { key } = captureLastPutCall();
    expect(key).toBe('job-photos/companies/42/job-photos/uuid-abc/photo.jpg');
    expect(key).not.toContain('job-photos/job-photos');
  });

  it('legacy key: storageKey does NOT start with bucket — prefix is prepended', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const storageKey = 'uuid-legacy.jpg';
    await r2Provider.saveFile({
      buffer: makeBuffer(),
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      bucket: 'job-photos',
      storageKey,
    });
    const { key } = captureLastPutCall();
    expect(key).toBe('job-photos/uuid-legacy.jpg');
  });

  it('dazza key already prefixed — no double prefix', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const storageKey = 'dazza-sources/user-1/uuid-abc-filename.pdf';
    await r2Provider.saveFile({
      buffer: makeBuffer(),
      originalName: 'doc.pdf',
      mimeType: 'application/pdf',
      bucket: 'dazza-sources',
      storageKey,
    });
    const { key } = captureLastPutCall();
    expect(key).toBe('dazza-sources/user-1/uuid-abc-filename.pdf');
    expect(key).not.toContain('dazza-sources/dazza-sources');
  });

  it('source-documents legacy key — prefix prepended', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const storageKey = '42/99/rev1/template.pdf';
    await r2Provider.saveFile({
      buffer: makeBuffer(),
      originalName: 'template.pdf',
      mimeType: 'application/pdf',
      bucket: 'source-documents',
      storageKey,
    });
    const { key } = captureLastPutCall();
    expect(key).toBe('source-documents/42/99/rev1/template.pdf');
  });
});

// ── PI1: saveFile — new-format key ────────────────────────────────────────────

describe('PI1 saveFile — new-format key: Bucket=iwillbuild-files, no double namespace', () => {
  beforeEach(() => {
    setSecrets();
    mockSuccessfulPut();
    mockFetch.mockClear();
    vi.resetModules();
  });

  it('PUT goes to Bucket=iwillbuild-files', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    await r2Provider.saveFile({
      buffer: makeBuffer(),
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      bucket: 'job-photos',
      storageKey: 'job-photos/companies/42/job-photos/uuid/photo.jpg',
    });
    const { url } = captureLastPutCall();
    // Virtual-hosted URL: https://iwillbuild-files.{accountId}.r2.cloudflarestorage.com/...
    expect(url).toContain('iwillbuild-files.');
    expect(url).not.toContain('/iwillbuild-files/'); // not path-style
  });

  it('PUT key has no double namespace segment', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const storageKey = 'company-files/companies/99/company-files/uuid/report.pdf';
    await r2Provider.saveFile({
      buffer: makeBuffer(),
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      bucket: 'company-files',
      storageKey,
    });
    const { key } = captureLastPutCall();
    expect(key).toBe(storageKey);
    expect(key.split('/').filter(s => s === 'company-files').length).toBe(2); // namespace + category
    // But the first two path segments must not both be 'company-files'
    const segs = key.split('/');
    expect(segs[0]).toBe('company-files');
    expect(segs[1]).toBe('companies'); // NOT 'company-files' again
  });

  it('PUT key contains authenticated company ID', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const storageKey = 'job-photos/companies/77/job-photos/uuid/photo.jpg';
    await r2Provider.saveFile({
      buffer: makeBuffer(),
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      bucket: 'job-photos',
      storageKey,
    });
    const { key } = captureLastPutCall();
    expect(key).toContain('/companies/77/');
  });

  it('result.storageKey equals the input storageKey (not the full R2 key)', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const storageKey = 'job-photos/companies/42/job-photos/uuid/photo.jpg';
    const result = await r2Provider.saveFile({
      buffer: makeBuffer(),
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      bucket: 'job-photos',
      storageKey,
    });
    // The storageKey stored in DB is the input storageKey, not the R2 key
    expect(result.storageKey).toBe(storageKey);
  });
});

// ── PI2: saveFile — legacy key ────────────────────────────────────────────────

describe('PI2 saveFile — legacy key: bucket prefix prepended exactly once', () => {
  beforeEach(() => {
    setSecrets();
    mockSuccessfulPut();
    mockFetch.mockClear();
    vi.resetModules();
  });

  it('legacy UUID key gets bucket prefix', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const legacyKey = 'abc123-uuid.jpg';
    await r2Provider.saveFile({
      buffer: makeBuffer(),
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      bucket: 'job-photos',
      storageKey: legacyKey,
    });
    const { key } = captureLastPutCall();
    expect(key).toBe(`job-photos/${legacyKey}`);
  });

  it('auto-generated key (no storageKey) uses bucket prefix', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const result = await r2Provider.saveFile({
      buffer: makeBuffer(),
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      bucket: 'job-photos',
      // storageKey omitted — provider generates UUID
    });
    const { key } = captureLastPutCall();
    // Auto-generated key: {uuid}.jpg — gets bucket prefix
    expect(key).toMatch(/^job-photos\/[0-9a-f-]+\.jpg$/);
    // result.storageKey is the UUID part (without bucket prefix)
    expect(result.storageKey).toMatch(/^[0-9a-f-]+\.jpg$/);
  });
});

// ── PI3: getDownloadStream — key resolution ───────────────────────────────────

describe('PI3 getDownloadStream — key resolution', () => {
  beforeEach(() => {
    setSecrets();
    vi.resetModules();
    mockSend.mockClear();
  });

  it('new-format key: GetObjectCommand receives correct Bucket and Key', async () => {
    const { Readable } = await import('node:stream');
    const mockStream = new Readable({ read() {} });
    mockStream.push(null);
    mockSend.mockResolvedValue({
      Body: mockStream,
      ContentType: 'image/jpeg',
      ContentLength: 100,
      Metadata: {},
    });

    const { r2Provider } = await import('../providers/r2Provider.js');
    const storageKey = 'job-photos/companies/42/job-photos/uuid/photo.jpg';
    await r2Provider.getDownloadStream(storageKey, 'job-photos');

    const lastCall = mockSend.mock.calls[mockSend.mock.calls.length - 1];
    const cmd = lastCall[0];
    expect(cmd.Bucket).toBe('iwillbuild-files');
    expect(cmd.Key).toBe('job-photos/companies/42/job-photos/uuid/photo.jpg');
    expect(cmd.Key).not.toContain('job-photos/job-photos');
  });

  it('legacy key: GetObjectCommand receives bucket-prefixed Key', async () => {
    const { Readable } = await import('node:stream');
    const mockStream = new Readable({ read() {} });
    mockStream.push(null);
    mockSend.mockResolvedValue({
      Body: mockStream,
      ContentType: 'image/jpeg',
      ContentLength: 50,
      Metadata: {},
    });

    const { r2Provider } = await import('../providers/r2Provider.js');
    await r2Provider.getDownloadStream('legacy-uuid.jpg', 'job-photos');

    const lastCall = mockSend.mock.calls[mockSend.mock.calls.length - 1];
    const cmd = lastCall[0];
    expect(cmd.Bucket).toBe('iwillbuild-files');
    expect(cmd.Key).toBe('job-photos/legacy-uuid.jpg');
  });
});

// ── PI4: deleteFile — Bucket and Key assertions ───────────────────────────────

describe('PI4 deleteFile — Bucket and Key assertions', () => {
  beforeEach(() => {
    setSecrets();
    vi.resetModules();
    mockSend.mockClear();
    mockSend.mockResolvedValue({});
  });

  it('new-format key: DeleteObjectCommand receives correct Bucket and Key', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const storageKey = 'company-files/companies/5/company-files/uuid/report.pdf';
    await r2Provider.deleteFile(storageKey, 'company-files');

    const lastCall = mockSend.mock.calls[mockSend.mock.calls.length - 1];
    const cmd = lastCall[0];
    expect(cmd.Bucket).toBe('iwillbuild-files');
    expect(cmd.Key).toBe('company-files/companies/5/company-files/uuid/report.pdf');
    expect(cmd.Key).not.toContain('company-files/company-files');
  });

  it('legacy key: DeleteObjectCommand receives bucket-prefixed Key', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    await r2Provider.deleteFile('sds/uuid.pdf', 'company-files');

    const lastCall = mockSend.mock.calls[mockSend.mock.calls.length - 1];
    const cmd = lastCall[0];
    expect(cmd.Bucket).toBe('iwillbuild-files');
    expect(cmd.Key).toBe('company-files/sds/uuid.pdf');
  });

  it('deleteFile does not throw on SDK error (best-effort)', async () => {
    mockSend.mockRejectedValue(new Error('NoSuchKey'));
    const { r2Provider } = await import('../providers/r2Provider.js');
    await expect(
      r2Provider.deleteFile('job-photos/companies/1/job-photos/uuid/photo.jpg', 'job-photos'),
    ).resolves.toBeUndefined();
  });
});

// ── PI5: getSignedUrl — Bucket and Key assertions ─────────────────────────────

describe('PI5 getSignedUrl — Bucket and Key assertions', () => {
  beforeEach(() => {
    // No public URL — force signed URL path
    setSecrets({ R2_PUBLIC_URL: '' });
    vi.resetModules();
    mockSend.mockClear();
    mockGetSignedUrl.mockResolvedValue('https://signed-url.example.com/key?X-Amz-Signature=abc');
  });

  it('new-format key: GetObjectCommand receives correct Bucket and Key', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const storageKey = 'job-photos/companies/42/job-photos/uuid/photo.jpg';
    await r2Provider.getSignedUrl(storageKey, 'job-photos', 900);

    const lastCall = mockGetSignedUrl.mock.calls[mockGetSignedUrl.mock.calls.length - 1];
    const cmd = lastCall[1]; // second arg is the command
    expect(cmd.Bucket).toBe('iwillbuild-files');
    expect(cmd.Key).toBe('job-photos/companies/42/job-photos/uuid/photo.jpg');
    expect(cmd.Key).not.toContain('job-photos/job-photos');
  });

  it('legacy key: GetObjectCommand receives bucket-prefixed Key', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    await r2Provider.getSignedUrl('legacy-uuid.jpg', 'job-photos', 900);

    const lastCall = mockGetSignedUrl.mock.calls[mockGetSignedUrl.mock.calls.length - 1];
    const cmd = lastCall[1];
    expect(cmd.Bucket).toBe('iwillbuild-files');
    expect(cmd.Key).toBe('job-photos/legacy-uuid.jpg');
  });

  it('public URL mode: returns direct URL without SDK call', async () => {
    // Default secrets include R2_PUBLIC_URL — reset module to get fresh config
    setSecrets(); // restores R2_PUBLIC_URL
    vi.resetModules();
    mockGetSignedUrl.mockClear();
    const { r2Provider } = await import('../providers/r2Provider.js');
    const storageKey = 'job-photos/companies/42/job-photos/uuid/photo.jpg';
    const url = await r2Provider.getSignedUrl(storageKey, 'job-photos', 900);
    expect(url).toBe('https://cdn.test.example.com/job-photos/companies/42/job-photos/uuid/photo.jpg');
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });
});

// ── PI7: cross-namespace key isolation ───────────────────────────────────────

describe('PI7 cross-namespace: key from namespace A not accessible via namespace B', () => {
  beforeEach(() => {
    // No public URL — force signed URL path
    setSecrets({ R2_PUBLIC_URL: '' });
    vi.resetModules();
    mockSend.mockClear();
    mockGetSignedUrl.mockResolvedValue('https://signed.example.com/key');
  });

  it('company-files key requested via job-photos bucket: resolves to wrong R2 key', async () => {
    // This test documents that the DB ownership check (not the key itself) is the
    // primary cross-company guard. The key composition must still be deterministic.
    const { r2Provider } = await import('../providers/r2Provider.js');
    const companyFilesKey = 'company-files/companies/42/company-files/uuid/report.pdf';

    // Requesting via wrong bucket: key starts with 'company-files', not 'job-photos'
    // so the legacy prefix IS prepended (wrong bucket)
    await r2Provider.getSignedUrl(companyFilesKey, 'job-photos', 900);
    const lastCall = mockGetSignedUrl.mock.calls[mockGetSignedUrl.mock.calls.length - 1];
    const cmd = lastCall[1];
    // The key does NOT start with 'job-photos/' so it gets prefixed
    expect(cmd.Key).toBe('job-photos/company-files/companies/42/company-files/uuid/report.pdf');
    // This is a different R2 object — the DB ownership check prevents this path
  });

  it('correct bucket: company-files key via company-files bucket resolves correctly', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const companyFilesKey = 'company-files/companies/42/company-files/uuid/report.pdf';
    await r2Provider.getSignedUrl(companyFilesKey, 'company-files', 900);
    const lastCall = mockGetSignedUrl.mock.calls[mockGetSignedUrl.mock.calls.length - 1];
    const cmd = lastCall[1];
    expect(cmd.Key).toBe('company-files/companies/42/company-files/uuid/report.pdf');
  });
});

// ── PI8: saveFile — auto-generated key ───────────────────────────────────────

describe('PI8 saveFile — auto-generated key (no storageKey provided)', () => {
  beforeEach(() => {
    setSecrets();
    mockSuccessfulPut();
    mockFetch.mockClear();
    vi.resetModules();
  });

  it('auto-generated key is UUID-based and gets bucket prefix', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    const result = await r2Provider.saveFile({
      buffer: makeBuffer(),
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      bucket: 'job-photos',
    });
    const { key } = captureLastPutCall();
    expect(key).toMatch(/^job-photos\/[0-9a-f-]+\.jpg$/);
    // result.storageKey is the UUID part (without bucket prefix) — stored in DB
    expect(result.storageKey).not.toContain('/');
    expect(result.storageKey).toMatch(/^[0-9a-f-]+\.jpg$/);
  });

  it('auto-generated key for PDF uses correct extension', async () => {
    const { r2Provider } = await import('../providers/r2Provider.js');
    await r2Provider.saveFile({
      buffer: makeBuffer(),
      originalName: 'doc.pdf',
      mimeType: 'application/pdf',
      bucket: 'company-files',
    });
    const { key } = captureLastPutCall();
    expect(key).toMatch(/^company-files\/[0-9a-f-]+\.pdf$/);
  });
});
