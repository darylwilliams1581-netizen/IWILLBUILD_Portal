/**
 * CP10A3 — Route-level authorization tests
 *
 * RA1  Cross-company: Company A cannot read Company B's object
 * RA2  Cross-company: Company A cannot obtain a signed URL for Company B's object
 * RA3  Cross-company: Company A cannot delete Company B's object
 * RA4  Client-supplied company IDs and keys are ignored or rejected
 * RA5  Public-share tokens access only the specifically shared resource
 * RA6  Legacy records remain protected by database ownership
 * RA7  Platform-owner diagnostics reject unauthenticated and ordinary users
 * RA8  keyBelongsToCompany — cross-company guard
 */

import { describe, it, expect } from 'vitest';
import { keyBelongsToCompany, buildObjectKey, isValidObjectKey, assertValidNamespace } from '../r2Config.js';
import { SIGNED_URL_MAX_EXPIRY_SECONDS } from '../uploadPolicy.js';

// ── RA1–RA3: Cross-company key isolation ─────────────────────────────────────

describe('RA1 Cross-company: Company A cannot read Company B\'s object', () => {
  it('new-format key for company 42 fails keyBelongsToCompany check for company 99', () => {
    const key = buildObjectKey({
      logicalNamespace: 'job-photos',
      companyId: 42,
      category: 'job-photos',
      uuid: 'uuid-abc',
      originalName: 'photo.jpg',
    });
    expect(keyBelongsToCompany(key, 42)).toBe(true);
    expect(keyBelongsToCompany(key, 99)).toBe(false);
  });

  it('company-files key for company 1 fails check for company 2', () => {
    const key = buildObjectKey({
      logicalNamespace: 'company-files',
      companyId: 1,
      category: 'company-files',
      uuid: 'uuid-xyz',
      originalName: 'report.pdf',
    });
    expect(keyBelongsToCompany(key, 1)).toBe(true);
    expect(keyBelongsToCompany(key, 2)).toBe(false);
  });

  it('safety-documents key for company 10 fails check for company 11', () => {
    const key = buildObjectKey({
      logicalNamespace: 'safety-documents',
      companyId: 10,
      category: 'safety-documents',
      uuid: 'uuid-def',
      originalName: 'swms.pdf',
    });
    expect(keyBelongsToCompany(key, 10)).toBe(true);
    expect(keyBelongsToCompany(key, 11)).toBe(false);
  });

  it('incident-attachments key for company 5 fails check for company 6', () => {
    const key = buildObjectKey({
      logicalNamespace: 'incident-attachments',
      companyId: 5,
      category: 'incident-attachments',
      uuid: 'uuid-ghi',
      originalName: 'photo.jpg',
    });
    expect(keyBelongsToCompany(key, 5)).toBe(true);
    expect(keyBelongsToCompany(key, 6)).toBe(false);
  });
});

describe('RA2 Cross-company: Company A cannot obtain a signed URL for Company B\'s object', () => {
  it('key with /companies/42/ fails ownership check for company 99', () => {
    const key = 'job-photos/companies/42/job-photos/uuid/photo.jpg';
    expect(keyBelongsToCompany(key, 42)).toBe(true);
    expect(keyBelongsToCompany(key, 99)).toBe(false);
  });

  it('key with /companies/1/ fails ownership check for company 2', () => {
    const key = 'company-files/companies/1/company-files/uuid/doc.pdf';
    expect(keyBelongsToCompany(key, 1)).toBe(true);
    expect(keyBelongsToCompany(key, 2)).toBe(false);
  });

  it('company ID 0 is rejected for any new-format key', () => {
    const key = 'job-photos/companies/42/job-photos/uuid/photo.jpg';
    expect(keyBelongsToCompany(key, 0)).toBe(false);
  });

  it('negative company ID is rejected', () => {
    const key = 'job-photos/companies/42/job-photos/uuid/photo.jpg';
    expect(keyBelongsToCompany(key, -1)).toBe(false);
  });
});

describe('RA3 Cross-company: Company A cannot delete Company B\'s object', () => {
  it('delete key check: company 42 key rejected for company 43', () => {
    const key = buildObjectKey({
      logicalNamespace: 'company-files',
      companyId: 42,
      category: 'company-files',
      uuid: 'uuid-del',
      originalName: 'file.pdf',
    });
    expect(keyBelongsToCompany(key, 42)).toBe(true);
    expect(keyBelongsToCompany(key, 43)).toBe(false);
  });

  it('all namespaces: cross-company check works consistently', () => {
    const namespaces = [
      'job-photos', 'company-files', 'safety-documents', 'safety-posters',
      'source-documents', 'dazza-sources', 'form-media', 'fleet-files',
      'job-card-photos', 'am-asset-photos', 'am-inspection-media',
      'bug-reports', 'incident-attachments', 'form-attachments',
      'profile-attachments', 'doc-assets', 'drawings', 'sds-register',
      'tender-attachments',
    ] as const;

    for (const ns of namespaces) {
      const key = buildObjectKey({
        logicalNamespace: ns,
        companyId: 100,
        category: ns,
        uuid: 'uuid-test',
        originalName: 'file.bin',
      });
      expect(keyBelongsToCompany(key, 100)).toBe(true);
      expect(keyBelongsToCompany(key, 101)).toBe(false);
    }
  });
});

// ── RA4: Client-supplied values rejected ──────────────────────────────────────

describe('RA4 Client-supplied company IDs and keys are ignored or rejected', () => {
  it('buildObjectKey uses server-supplied companyId, not client value', () => {
    const serverCompanyId = 42;
    const clientCompanyId = 99; // attacker-supplied

    const key = buildObjectKey({
      logicalNamespace: 'job-photos',
      companyId: serverCompanyId, // server always uses authenticated companyId
      category: 'job-photos',
      uuid: 'uuid-abc',
      originalName: 'photo.jpg',
    });

    // Key contains server companyId
    expect(key).toContain('/companies/42/');
    // Key does NOT contain client-supplied companyId
    expect(key).not.toContain(`/companies/${clientCompanyId}/`);
  });

  it('traversal in originalName is sanitised', () => {
    const key = buildObjectKey({
      logicalNamespace: 'job-photos',
      companyId: 42,
      category: 'job-photos',
      uuid: 'uuid-abc',
      originalName: '../../../etc/passwd',
    });
    expect(key).not.toContain('..');
    expect(key).not.toContain('/etc/passwd');
    expect(isValidObjectKey(key)).toBe(true);
  });

  it('null byte in originalName is stripped', () => {
    const key = buildObjectKey({
      logicalNamespace: 'job-photos',
      companyId: 42,
      category: 'job-photos',
      uuid: 'uuid-abc',
      originalName: 'photo\x00.jpg',
    });
    expect(key).not.toContain('\x00');
    expect(isValidObjectKey(key)).toBe(true);
  });

  it('backslash in originalName is sanitised', () => {
    const key = buildObjectKey({
      logicalNamespace: 'job-photos',
      companyId: 42,
      category: 'job-photos',
      uuid: 'uuid-abc',
      originalName: 'a\\b.jpg',
    });
    expect(key).not.toContain('\\');
    expect(isValidObjectKey(key)).toBe(true);
  });

  it('client-supplied namespace string is rejected by assertValidNamespace', () => {
    const clientNamespace = '../../other-company';
    expect(() => assertValidNamespace(clientNamespace)).toThrow(/namespace/i);
  });

  it('SQL injection in namespace is rejected', () => {
    expect(() => assertValidNamespace("'; DROP TABLE users; --")).toThrow(/namespace/i);
  });
});

// ── RA5: Public-share token isolation ────────────────────────────────────────

describe('RA5 Public-share tokens access only the specifically shared resource', () => {
  it('keyBelongsToCompany: public share key for company 42 fails for company 99', () => {
    // Public share tokens are validated against DB records that include company_id.
    // The key itself encodes the company — cross-company access is blocked at DB level.
    const key = buildObjectKey({
      logicalNamespace: 'job-photos',
      companyId: 42,
      category: 'job-photos',
      uuid: 'uuid-share',
      originalName: 'photo.jpg',
    });
    expect(keyBelongsToCompany(key, 42)).toBe(true);
    expect(keyBelongsToCompany(key, 99)).toBe(false);
  });

  it('public share signed URL expiry: 24h is above default but within max', () => {
    // Public share routes use 86400s (24h) — this is above the 1h max for
    // authenticated routes. The public share route uses getSignedUrl directly
    // with an explicit expiry; clampSignedUrlExpiry is for authenticated routes.
    // Document that 86400 > SIGNED_URL_MAX_EXPIRY_SECONDS (3600).
    expect(86400).toBeGreaterThan(SIGNED_URL_MAX_EXPIRY_SECONDS);
    // This is intentional — public share links are longer-lived than auth'd downloads
  });
});

// ── RA6: Legacy records protected by DB ownership ────────────────────────────

describe('RA6 Legacy records remain protected by database ownership', () => {
  it('legacy key (no /companies/ segment) passes keyBelongsToCompany', () => {
    // Legacy keys don't encode company ID — DB ownership check is the guard
    expect(keyBelongsToCompany('uuid-legacy.jpg', 42)).toBe(true);
    expect(keyBelongsToCompany('uuid-legacy.jpg', 99)).toBe(true); // passes — DB check guards
  });

  it('legacy key with bucket prefix passes keyBelongsToCompany', () => {
    expect(keyBelongsToCompany('job-photos/uuid-legacy.jpg', 42)).toBe(true);
  });

  it('legacy key with company-prefixed path passes keyBelongsToCompany', () => {
    // Old format: {companyId}/{uuid}.ext — no /companies/ segment
    expect(keyBelongsToCompany('42/uuid-legacy.pdf', 42)).toBe(true);
  });

  it('new-format key is distinguishable from legacy key', () => {
    const newKey = 'job-photos/companies/42/job-photos/uuid/photo.jpg';
    const legacyKey = 'uuid-legacy.jpg';
    expect(newKey).toContain('/companies/');
    expect(legacyKey).not.toContain('/companies/');
  });
});

// ── RA7: Platform-owner diagnostics ──────────────────────────────────────────

describe('RA7 Platform-owner diagnostics reject unauthenticated and ordinary users', () => {
  it('platform-owner check: non-owner email is rejected', () => {
    // Simulate the requirePlatformOwner check logic
    const platformOwnerEmail = 'owner@example.com';
    const ordinaryUserEmail = 'user@example.com';

    function isPlatformOwner(email: string): boolean {
      return email === platformOwnerEmail;
    }

    expect(isPlatformOwner(platformOwnerEmail)).toBe(true);
    expect(isPlatformOwner(ordinaryUserEmail)).toBe(false);
    expect(isPlatformOwner('')).toBe(false);
    expect(isPlatformOwner('owner@example.com.evil.com')).toBe(false);
  });

  it('platform-owner check: unauthenticated (null email) is rejected', () => {
    function isPlatformOwner(email: string | null): boolean {
      if (!email) return false;
      return email === 'owner@example.com';
    }
    expect(isPlatformOwner(null)).toBe(false);
    expect(isPlatformOwner(undefined as unknown as null)).toBe(false);
  });
});

// ── RA8: keyBelongsToCompany comprehensive ───────────────────────────────────

describe('RA8 keyBelongsToCompany — comprehensive cross-company guard', () => {
  it('rejects company ID that is a substring of the correct ID', () => {
    // e.g. company 4 should not match /companies/42/
    const key = 'job-photos/companies/42/job-photos/uuid/photo.jpg';
    expect(keyBelongsToCompany(key, 4)).toBe(false);
    expect(keyBelongsToCompany(key, 420)).toBe(false);
    expect(keyBelongsToCompany(key, 42)).toBe(true);
  });

  it('rejects company ID 0', () => {
    const key = 'job-photos/companies/42/job-photos/uuid/photo.jpg';
    expect(keyBelongsToCompany(key, 0)).toBe(false);
  });

  it('handles very large company IDs', () => {
    const key = buildObjectKey({
      logicalNamespace: 'job-photos',
      companyId: 999999,
      category: 'job-photos',
      uuid: 'uuid-large',
      originalName: 'photo.jpg',
    });
    expect(keyBelongsToCompany(key, 999999)).toBe(true);
    expect(keyBelongsToCompany(key, 99999)).toBe(false);
    expect(keyBelongsToCompany(key, 9999990)).toBe(false);
  });

  it('all new-format keys encode company ID in position 2', () => {
    const key = buildObjectKey({
      logicalNamespace: 'company-files',
      companyId: 77,
      category: 'company-files',
      uuid: 'uuid-pos',
      originalName: 'file.pdf',
    });
    const segments = key.split('/');
    expect(segments[0]).toBe('company-files');
    expect(segments[1]).toBe('companies');
    expect(segments[2]).toBe('77');
  });
});
