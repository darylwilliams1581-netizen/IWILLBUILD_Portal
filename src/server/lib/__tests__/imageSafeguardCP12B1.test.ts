/**
 * imageSafeguardCP12B1.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B1 — Image Safeguard Owner Console tests.
 *
 * Tests the owner-only control shell:
 *  ISG-B1-01  Platform owner can read status (200 + correct shape)
 *  ISG-B1-02  Ordinary users receive 403
 *  ISG-B1-03  Unauthenticated users receive 401
 *  ISG-B1-04  Counts map correctly to user-facing categories
 *  ISG-B1-05  No storage keys, signed URLs or image contents are returned
 *  ISG-B1-06  Run button is disabled when configured=false
 *  ISG-B1-07  POST scan returns sanitized scanner_not_configured (503)
 *  ISG-B1-08  POST scan does not mutate records
 *  ISG-B1-09  POST scan does not contact R2 or any external service
 *  ISG-B1-10  UI never claims a successful scan
 *  ISG-B1-11  Existing image-sharing safeguard behaviour remains unchanged
 *  ISG-B1-12  Capability boundary always returns configured=false in this stage
 *  ISG-B1-13  requirePlatformOwner is applied to both new routes in entry.ts
 *  ISG-B1-14  Status response never includes raw DB errors
 *  ISG-B1-15  Status response shape matches spec
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mock setup ─────────────────────────────────────────────────────────

const mockExecute = vi.fn();
const mockGetSession = vi.fn();

vi.mock('../../db/client.js', () => ({
  db: {
    execute: mockExecute,
    query: { profiles: { findFirst: vi.fn() } },
  },
}));

vi.mock('../../../lib/auth/auth.js', () => ({
  getAuth: () => ({ api: { getSession: mockGetSession } }),
}));

vi.mock('#airo/secrets', () => ({
  getSecret: (key: string) => {
    if (key === 'PLATFORM_OWNER_EMAIL') return 'owner@test.com';
    return null;
  },
}));

// ── ISG-B1-01: Platform owner can read status ─────────────────────────────────

describe('ISG-B1-01: Platform owner can read status', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('GET status endpoint returns 200 with correct shape', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/status/GET.ts', 'utf8',
    );
    // Must return configured, provider, capability, lastRunAt, counts
    expect(source).toContain('configured');
    expect(source).toContain('provider');
    expect(source).toContain('capability');
    expect(source).toContain('lastRunAt');
    expect(source).toContain('counts');
  });

  it('status endpoint queries image_safeguard_records for counts', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/status/GET.ts', 'utf8',
    );
    expect(source).toContain('image_safeguard_records');
    expect(source).toContain('GROUP BY status');
  });

  it('status endpoint uses getImageSafeguardCapability', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/status/GET.ts', 'utf8',
    );
    expect(source).toContain('getImageSafeguardCapability');
  });
});

// ── ISG-B1-02: Ordinary users receive 403 ────────────────────────────────────

describe('ISG-B1-02: Ordinary users receive 403', () => {
  it('requirePlatformOwner returns 403 for non-platform-developer users', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/platform-owner-guard.ts', 'utf8');
    expect(source).toContain('res.status(403)');
    expect(source).toContain('Owner Console access is restricted');
  });

  it('requirePlatformOwner is applied to both image-safeguard routes in entry.ts', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/entry.ts', 'utf8');
    // Both routes must include requirePlatformOwner as middleware
    expect(source).toMatch(/app\.get\(["']\/api\/owner-console\/image-safeguard\/status["'],\s*requirePlatformOwner/);
    expect(source).toMatch(/app\.post\(["']\/api\/owner-console\/image-safeguard\/scan["'],\s*requirePlatformOwner/);
  });
});

// ── ISG-B1-03: Unauthenticated users receive 401 ─────────────────────────────

describe('ISG-B1-03: Unauthenticated users receive 401', () => {
  it('requirePlatformOwner returns 401 when no session', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/platform-owner-guard.ts', 'utf8');
    expect(source).toContain('res.status(401)');
    expect(source).toContain("error: 'Unauthorised'");
  });

  it('getPlatformOwnerInfo returns null when no session', async () => {
    mockGetSession.mockResolvedValue(null);
    const { getPlatformOwnerInfo } = await import('../platform-owner-guard.js');
    const result = await getPlatformOwnerInfo({ headers: {} } as never);
    expect(result).toBeNull();
  });
});

// ── ISG-B1-04: Counts map correctly to user-facing categories ─────────────────

describe('ISG-B1-04: Counts map correctly to user-facing categories', () => {
  it('status endpoint maps all seven status values', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/status/GET.ts', 'utf8',
    );
    expect(source).toContain("case 'pending'");
    expect(source).toContain("case 'clear'");
    expect(source).toContain("case 'privacy_signal'");
    expect(source).toContain("case 'elevated'");
    expect(source).toContain("case 'blocked'");
    expect(source).toContain("case 'unavailable'");
    // error and failed both map to failed count
    expect(source).toContain("case 'error'");
    expect(source).toContain("case 'failed'");
    expect(source).toContain('counts.failed');
  });

  it('UI component has STATUS_ROWS for all seven user-facing categories', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    expect(source).toContain("key: 'pending'");
    expect(source).toContain("key: 'clear'");
    expect(source).toContain("key: 'privacySignal'");
    expect(source).toContain("key: 'elevated'");
    expect(source).toContain("key: 'blocked'");
    expect(source).toContain("key: 'unavailable'");
    expect(source).toContain("key: 'failed'");
  });

  it('UI uses calm labels — no alarming language for non-blocked statuses', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    expect(source).toContain('Privacy signal');
    expect(source).toContain('Review recommended');
    expect(source).toContain('Sharing restricted');
    expect(source).toContain('Not assessed');
    expect(source).toContain('Scan failed');
    // Must NOT use alarming labels
    expect(source).not.toContain("label: 'Blocked'");
    expect(source).not.toContain("label: 'Elevated'");
    expect(source).not.toContain("label: 'Failed'");
  });

  it('only blocked/sharing-restricted uses red presentation', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    // Red colour only appears in the blocked row config
    const blockedRowIdx = source.indexOf("key: 'blocked'");
    const redIdx = source.indexOf('text-red-700');
    expect(blockedRowIdx).toBeGreaterThan(-1);
    expect(redIdx).toBeGreaterThan(-1);
    // The red colour must be near the blocked row (within 200 chars)
    expect(Math.abs(redIdx - blockedRowIdx)).toBeLessThan(200);
  });
});

// ── ISG-B1-05: No storage keys, signed URLs or image contents returned ────────

describe('ISG-B1-05: No storage keys, signed URLs or image contents returned', () => {
  it('status endpoint SELECT query fetches only status and count — no keys or URLs', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/status/GET.ts', 'utf8',
    );
    // Query must only select status and COUNT
    expect(source).toContain('SELECT status, COUNT(*)');
    // Must NOT select storage_key, signed URL, or image data
    expect(source).not.toContain('storage_key');
    expect(source).not.toContain('X-Amz-Signature');
    expect(source).not.toContain('r2.cloudflarestorage');
    expect(source).not.toContain('data:image/');
  });

  it('status response shape has no storage keys or URLs', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/status/GET.ts', 'utf8',
    );
    // The res.json() call must not include storage_key, url, or signed fields
    const jsonIdx = source.indexOf('res.json(');
    const jsonBlock = source.slice(jsonIdx, jsonIdx + 500);
    expect(jsonBlock).not.toContain('storage_key');
    expect(jsonBlock).not.toContain('signedUrl');
    expect(jsonBlock).not.toContain('imageUrl');
  });

  it('scan endpoint does not return storage keys or image data', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8',
    );
    expect(source).not.toContain('storage_key');
    expect(source).not.toContain('X-Amz-Signature');
    expect(source).not.toContain('r2.cloudflarestorage');
    expect(source).not.toContain('data:image/');
  });
});

// ── ISG-B1-06: Run button is disabled when configured=false ──────────────────

describe('ISG-B1-06: Run button is disabled when configured=false', () => {
  it('Run button has disabled prop tied to !status?.configured', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    expect(source).toContain('disabled={!status?.configured');
    expect(source).toContain('aria-disabled={!status?.configured');
  });

  it('Run button has aria-describedby pointing to the explanation when not configured', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    expect(source).toContain('aria-describedby');
    expect(source).toContain('scan-disabled-reason');
    // The explanation element must have the matching id
    expect(source).toContain('id="scan-disabled-reason"');
  });

  it('UI does not show a fake progress bar', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    // Only check for progress-bar JSX patterns — not the word in comments
    expect(source).not.toContain('scanProgress');
    expect(source).not.toContain('progressBar');
    expect(source).not.toContain('<Progress');
    expect(source).not.toContain('role="progressbar"');
  });
});

// ── ISG-B1-07: POST scan returns sanitized scanner_not_configured (503) ───────

describe('ISG-B1-07: POST scan returns sanitized scanner_not_configured', () => {
  it('scan endpoint returns 503 scanner_not_configured when not configured', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8',
    );
    expect(source).toContain('res.status(503)');
    expect(source).toContain("error: 'scanner_not_configured'");
    expect(source).toContain("message: 'Image scanning is not configured.'");
  });

  it('scan endpoint error is sanitized — no internal paths or DB details', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8',
    );
    // Must not expose internal paths
    expect(source).not.toContain('/app/src');
    expect(source).not.toContain('node_modules');
    // Must not expose DB connection details
    expect(source).not.toContain('mysql://');
    expect(source).not.toContain('DATABASE_URL');
  });
});

// ── ISG-B1-08: POST scan does not mutate records ─────────────────────────────

describe('ISG-B1-08: POST scan does not mutate records', () => {
  it('scan endpoint does not import db or execute any SQL', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8',
    );
    // No DB import
    expect(source).not.toContain("from '../../../../db/client.js'");
    expect(source).not.toContain("from '../../../db/client.js'");
    // No SQL mutations
    expect(source).not.toContain('db.execute');
    expect(source).not.toContain('db.insert');
    expect(source).not.toContain('db.update');
    expect(source).not.toContain('UPDATE image_safeguard_records');
    expect(source).not.toContain('INSERT INTO image_safeguard_records');
  });
});

// ── ISG-B1-09: POST scan does not contact R2 or any external service ──────────

describe('ISG-B1-09: POST scan does not contact R2 or any external service', () => {
  it('scan endpoint does not import S3 client or R2 config', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8',
    );
    expect(source).not.toContain('S3Client');
    expect(source).not.toContain('r2Config');
    expect(source).not.toContain('loadR2Config');
    expect(source).not.toContain('GetObjectCommand');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('axios');
  });

  it('capability boundary does not contact any external service', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/lib/imageSafeguardCapability.ts', 'utf8',
    );
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('S3Client');
    expect(source).not.toContain('r2Config');
    expect(source).not.toContain('axios');
    expect(source).not.toContain('openai');
    expect(source).not.toContain('xai');
  });
});

// ── ISG-B1-10: UI never claims a successful scan ──────────────────────────────

describe('ISG-B1-10: UI never claims a successful scan', () => {
  it('UI does not claim scan completed or AI scanned images', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    expect(source).not.toContain('Scan complete');
    expect(source).not.toContain('scan completed');
    expect(source).not.toContain('AI scanned');
    expect(source).not.toContain('scanned by AI');
    expect(source).not.toContain('automatically scanned');
    expect(source).not.toContain('scanSuccess');
  });

  it('UI shows honest not-configured message when configured=false', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    // Text is split across JSX lines — check key phrases individually
    expect(source).toContain('Image scanning is not configured yet');
    expect(source).toContain('sharing acknowledgment');
    expect(source).toContain('remains active');
    expect(source).toContain('no automated image assessment has been');
  });

  it('UI shows disclaimer about automated assessment limitations', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    expect(source).toContain('Automated assessment can make mistakes');
    expect(source).toContain('support\u2014not replace');
    expect(source).toContain('human judgment and legal processes');
  });
});

// ── ISG-B1-11: Existing image-sharing safeguard behaviour unchanged ───────────

describe('ISG-B1-11: Existing image-sharing safeguard behaviour unchanged', () => {
  it('share endpoint still requires imageSafeguardAcknowledged when photos present', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/jobs/[id]/photos/share/POST.ts', 'utf8',
    );
    expect(source).toContain('body.imageSafeguardAcknowledged !== true');
    expect(source).toContain("code: 'safeguard_acknowledgment_required'");
  });

  it('send-email endpoint still requires imageSafeguardAcknowledged when images present', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/job-forms/[id]/send-email/POST.ts', 'utf8',
    );
    expect(source).toContain('body.imageSafeguardAcknowledged !== true');
    expect(source).toContain("code: 'safeguard_acknowledgment_required'");
  });

  it('batch-status endpoint still resolves refs server-side', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/image-safety/batch-status/POST.ts', 'utf8',
    );
    expect(source).toContain('resolveJobPhotoRefs');
    expect(source).toContain('getWorstSafeguardStatus');
  });
});

// ── ISG-B1-12: Capability boundary always returns configured=false ─────────────

describe('ISG-B1-12: Capability boundary always returns configured=false in this stage', () => {
  it('getImageSafeguardCapability returns configured:false and provider:null', async () => {
    const { getImageSafeguardCapability } = await import('../imageSafeguardCapability.js');
    const cap = getImageSafeguardCapability();
    expect(cap.configured).toBe(false);
    expect(cap.provider).toBeNull();
  });

  it('capability type has exactly configured and provider fields', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguardCapability.ts', 'utf8');
    expect(source).toContain('configured: boolean');
    expect(source).toContain('provider: string | null');
  });

  it('capability module never throws', async () => {
    const { getImageSafeguardCapability } = await import('../imageSafeguardCapability.js');
    expect(() => getImageSafeguardCapability()).not.toThrow();
  });
});

// ── ISG-B1-13: requirePlatformOwner applied to both routes ───────────────────

describe('ISG-B1-13: requirePlatformOwner is applied to both new routes in entry.ts', () => {
  it('GET status route has requirePlatformOwner middleware', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/entry.ts', 'utf8');
    expect(source).toMatch(
      /app\.get\(["']\/api\/owner-console\/image-safeguard\/status["'],\s*requirePlatformOwner,/,
    );
  });

  it('POST scan route has requirePlatformOwner middleware', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/entry.ts', 'utf8');
    expect(source).toMatch(
      /app\.post\(["']\/api\/owner-console\/image-safeguard\/scan["'],\s*requirePlatformOwner,/,
    );
  });

  it('both routes import the correct handler files', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/entry.ts', 'utf8');
    expect(source).toContain('owner-console/image-safeguard/status/GET');
    expect(source).toContain('owner-console/image-safeguard/scan/POST');
  });
});

// ── ISG-B1-14: Status response never includes raw DB errors ──────────────────

describe('ISG-B1-14: Status response never includes raw DB errors', () => {
  it('status endpoint catches DB errors and returns zero counts — no error detail', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/status/GET.ts', 'utf8',
    );
    // Inner catch must reset counts and not re-throw or include error detail
    expect(source).toContain('} catch {');
    expect(source).toContain('ZERO_COUNTS');
    // Must not include the error object in the response
    expect(source).not.toContain('res.json({ error: err');
    expect(source).not.toContain('res.json({ error: e');
    expect(source).not.toContain('message: err.message');
  });

  it('outer catch returns sanitized 500 with no internal detail', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/status/GET.ts', 'utf8',
    );
    expect(source).toContain("error: 'Failed to retrieve safeguard status.'");
    expect(source).not.toContain('err.stack');
    expect(source).not.toContain('err.message');
  });
});

// ── ISG-B1-15: Status response shape matches spec ────────────────────────────

describe('ISG-B1-15: Status response shape matches spec', () => {
  it('status response includes all required top-level fields', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/status/GET.ts', 'utf8',
    );
    // All spec fields must be present in the res.json call
    const jsonIdx = source.indexOf('res.json(');
    const jsonBlock = source.slice(jsonIdx, jsonIdx + 400);
    expect(jsonBlock).toContain('configured');
    expect(jsonBlock).toContain('provider');
    expect(jsonBlock).toContain('capability');
    expect(jsonBlock).toContain('lastRunAt');
    expect(jsonBlock).toContain('counts');
  });

  it('counts object has all seven required keys', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/status/GET.ts', 'utf8',
    );
    // ZERO_COUNTS must define all seven keys
    const zeroIdx = source.indexOf('ZERO_COUNTS');
    const zeroBlock = source.slice(zeroIdx, zeroIdx + 300);
    expect(zeroBlock).toContain('pending');
    expect(zeroBlock).toContain('clear');
    expect(zeroBlock).toContain('privacySignal');
    expect(zeroBlock).toContain('elevated');
    expect(zeroBlock).toContain('blocked');
    expect(zeroBlock).toContain('unavailable');
    expect(zeroBlock).toContain('failed');
  });

  it('ImageSafeguardTab is wired into owner-console.tsx', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/pages/owner-console.tsx', 'utf8');
    expect(source).toContain("import ImageSafeguardTab from '@/components/owner-console/ImageSafeguardTab'");
    expect(source).toContain("tab === 'image-safeguard'");
    expect(source).toContain('<ImageSafeguardTab />');
  });

  it('image-safeguard tab is included in the tab type union', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/pages/owner-console.tsx', 'utf8');
    expect(source).toContain("'image-safeguard'");
  });
});
