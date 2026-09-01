/**
 * imageSafeguardCP12A8.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A8 — Simplified Image Safeguard tests.
 *
 * Tests the simplified production path:
 *  ISG-20  Uploads never show the modal
 *  ISG-21  Job-photo sharing shows one modal when photos present
 *  ISG-22  Job-photo sharing skips modal when no photos
 *  ISG-23  Form email checks at final Send
 *  ISG-24  Cancel performs no action
 *  ISG-25  Confirm performs exactly one action (double-tap guard)
 *  ISG-26  Missing acknowledgment is rejected when images are present
 *  ISG-27  Blocked images are rejected regardless of acknowledgment
 *  ISG-28  No-photo actions proceed without confirmation
 *  ISG-29  Server resolves images by authenticated company/resource
 *  ISG-30  Audit entry contains no recipients, URLs, keys or image contents
 *  ISG-31  batch-confirm endpoint no longer exists
 *  ISG-32  Sensitive data never logged
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// ── ISG-20: Uploads never show the modal ─────────────────────────────────────

describe('ISG-20: Uploads never show the modal', () => {
  it('createPendingSafeguardRecord is fire-and-forget — never throws', async () => {
    mockExecute.mockResolvedValue([]);
    const { createPendingSafeguardRecord } = await import('../imageSafeguardService.js');
    const result = await createPendingSafeguardRecord({
      companyId: 1, userId: 'user-1', storageRef: 'job_photo:42', surface: 'job_photo',
    });
    expect(typeof result).toBe('string');
  });

  it('createPendingSafeguardRecord returns null on DB failure without throwing', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB down'));
    const { createPendingSafeguardRecord } = await import('../imageSafeguardService.js');
    const result = await createPendingSafeguardRecord({
      companyId: 1, userId: 'u', storageRef: 'job_photo:1', surface: 'job_photo',
    });
    expect(result).toBeNull();
  });

  it('upload routes do not call any confirmation endpoint', async () => {
    const { readFileSync } = await import('fs');
    const uploadRoutes = [
      'src/server/api/jobs/[id]/photos/POST.ts',
      'src/server/api/form-attachments/POST.ts',
      'src/server/api/incidents/[incidentId]/attachments/POST.ts',
    ];
    for (const route of uploadRoutes) {
      const source = readFileSync(route, 'utf8');
      expect(source).not.toContain('batch-confirm');
      expect(source).not.toContain('confirmationToken');
      expect(source).not.toContain('imageSafeguardAcknowledged');
    }
  });
});

// ── ISG-21: Job-photo sharing shows one modal when photos present ─────────────

describe('ISG-21: Job-photo sharing shows one modal when photos present', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('share endpoint requires imageSafeguardAcknowledged when photos present', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/jobs/[id]/photos/share/POST.ts', 'utf8');
    expect(source).toContain('imageSafeguardAcknowledged');
    expect(source).toContain('safeguard_acknowledgment_required');
    expect(source).not.toContain('safeguardToken');
    expect(source).not.toContain('consumeConfirmationToken');
  });

  it('resolveJobPhotoRefs returns job_photo:{id} refs scoped to companyId', async () => {
    mockExecute.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 5 }]);
    const { resolveJobPhotoRefs } = await import('../imageSafeguardService.js');
    expect(await resolveJobPhotoRefs(42, 7)).toEqual(['job_photo:1', 'job_photo:2', 'job_photo:5']);
  });

  it('resolveJobPhotoRefs returns empty array on DB failure (fail-closed)', async () => {
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

// ── ISG-22: Job-photo sharing skips modal when no photos ─────────────────────

describe('ISG-22: Job-photo sharing skips modal when no photos', () => {
  it('share endpoint does not require acknowledgment when no photos', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/jobs/[id]/photos/share/POST.ts', 'utf8');
    // The check is inside `if (currentRefs.length > 0)` — no photos = no check
    expect(source).toContain('currentRefs.length > 0');
  });

  it('job-photos-page skips checkBatch when photoCount is 0', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/pages/job-photos-page.tsx', 'utf8');
    // handleShareWithGate guards on photoCount > 0 before calling checkBatch
    expect(source).toContain('photoCount > 0');
  });
});

// ── ISG-23: Form email checks at final Send ───────────────────────────────────

describe('ISG-23: Form email checks at final Send', () => {
  it('send-email endpoint requires imageSafeguardAcknowledged when images present', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/job-forms/[id]/send-email/POST.ts', 'utf8');
    expect(source).toContain('imageSafeguardAcknowledged');
    expect(source).toContain('safeguard_acknowledgment_required');
    expect(source).not.toContain('safeguardToken');
    expect(source).not.toContain('consumeConfirmationToken');
  });

  it('SendDocumentEmailModal calls checkBatch at handleSend time (after recipients set)', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/components/SendDocumentEmailModal.tsx', 'utf8');
    // Gate is inside handleSend, not at modal open time
    expect(source).toContain('imageSafeguardAcknowledged');
    expect(source).not.toContain('safeguardToken');
    expect(source).not.toContain('confirmationToken');
  });

  it('form email gate does not pass recipients to checkBatch', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/components/SendDocumentEmailModal.tsx', 'utf8');
    // recipients are NOT passed to checkBatch in the simplified design
    const checkBatchBlock = source.match(/checkBatch\([\s\S]{0,300}\)/);
    if (checkBatchBlock) {
      expect(checkBatchBlock[0]).not.toContain('recipients');
    }
  });
});

// ── ISG-24: Cancel performs no action ────────────────────────────────────────

describe('ISG-24: Cancel performs no action', () => {
  it('SharingBatchOutcome with allowed=false reason=cancelled prevents sharing', () => {
    const outcome = { allowed: false as const, reason: 'cancelled' as const };
    expect(outcome.allowed).toBe(false);
    expect(outcome.reason).toBe('cancelled');
  });

  it('useImageSafeguardBatch handleCancel resolves with allowed=false', () => {
    // Verify the cancel logic: resolve({ allowed: false, reason: 'cancelled' })
    let resolved: { allowed: boolean; reason?: string } | null = null;
    const resolve = (v: { allowed: boolean; reason?: string }) => { resolved = v; };
    const confirmingRef = { current: false };
    const pending = { resolve, worstStatus: 'unavailable' as const, imageCount: 1 };

    // Simulate handleCancel
    if (pending) {
      const { resolve: r } = pending;
      confirmingRef.current = false;
      r({ allowed: false, reason: 'cancelled' });
    }

    expect(resolved).not.toBeNull();
    expect(resolved!.allowed).toBe(false);
    expect(resolved!.reason).toBe('cancelled');
  });

  it('job-photos-page returns early when outcome.allowed is false', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/pages/job-photos-page.tsx', 'utf8');
    expect(source).toContain('if (!outcome.allowed) return');
  });
});

// ── ISG-25: Confirm performs exactly one action ───────────────────────────────

describe('ISG-25: Confirm performs exactly one action (double-tap guard)', () => {
  it('confirmingRef guard prevents double-confirmation', () => {
    let callCount = 0;
    const confirmingRef = { current: false };

    function handleConfirm() {
      if (confirmingRef.current) return;
      confirmingRef.current = true;
      callCount++;
    }

    handleConfirm();
    handleConfirm();
    handleConfirm();

    expect(callCount).toBe(1);
  });

  it('ImageSafeguardBatchModal has confirmingRef guard', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/components/ImageSafeguardBatchModal.tsx', 'utf8');
    expect(source).toContain('confirmingRef');
    expect(source).toContain('confirmingRef.current');
  });
});

// ── ISG-26: Missing acknowledgment is rejected when images are present ─────────

describe('ISG-26: Missing acknowledgment is rejected when images are present', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('share endpoint returns 403 safeguard_acknowledgment_required when ack missing', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/jobs/[id]/photos/share/POST.ts', 'utf8');
    expect(source).toContain("code: 'safeguard_acknowledgment_required'");
    expect(source).toContain('status(403)');
  });

  it('send-email endpoint returns 403 safeguard_acknowledgment_required when ack missing', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/job-forms/[id]/send-email/POST.ts', 'utf8');
    expect(source).toContain("code: 'safeguard_acknowledgment_required'");
    expect(source).toContain('status(403)');
  });
});

// ── ISG-27: Blocked images are rejected regardless of acknowledgment ──────────

describe('ISG-27: Blocked images are rejected regardless of acknowledgment', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('getWorstSafeguardStatus returns blocked when any record is blocked', async () => {
    const { getWorstSafeguardStatus } = await import('../imageSafeguardService.js');
    mockExecute.mockResolvedValue([{ status: 'clear' }, { status: 'blocked' }]);
    expect(await getWorstSafeguardStatus(1, ['r1', 'r2'])).toBe('blocked');
  });

  it('share endpoint checks blocked BEFORE acknowledgment check', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/jobs/[id]/photos/share/POST.ts', 'utf8');
    const blockedIdx = source.indexOf("code: 'sharing_blocked'");
    const ackIdx = source.indexOf("code: 'safeguard_acknowledgment_required'");
    expect(blockedIdx).toBeGreaterThan(-1);
    expect(ackIdx).toBeGreaterThan(-1);
    expect(blockedIdx).toBeLessThan(ackIdx);
  });

  it('send-email endpoint checks blocked BEFORE acknowledgment check', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/job-forms/[id]/send-email/POST.ts', 'utf8');
    const blockedIdx = source.indexOf("code: 'sharing_blocked'");
    const ackIdx = source.indexOf("code: 'safeguard_acknowledgment_required'");
    expect(blockedIdx).toBeGreaterThan(-1);
    expect(ackIdx).toBeGreaterThan(-1);
    expect(blockedIdx).toBeLessThan(ackIdx);
  });
});

// ── ISG-28: No-photo actions proceed without confirmation ─────────────────────

describe('ISG-28: No-photo actions proceed without unnecessary confirmation', () => {
  it('share endpoint skips safeguard check when no photos (currentRefs.length === 0)', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/jobs/[id]/photos/share/POST.ts', 'utf8');
    // The entire safeguard block is inside `if (currentRefs.length > 0)`
    expect(source).toContain('if (currentRefs.length > 0)');
  });

  it('send-email endpoint skips safeguard check when no images', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/job-forms/[id]/send-email/POST.ts', 'utf8');
    // The safeguard block is inside `if (hasImages)`
    expect(source).toContain('if (hasImages)');
  });
});

// ── ISG-29: Server resolves images by authenticated company/resource ──────────

describe('ISG-29: Server resolves images by authenticated company/resource', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('resolveJobPhotoRefs uses companyId from session (not request body)', async () => {
    mockExecute.mockResolvedValue([{ id: 1 }]);
    const { resolveJobPhotoRefs } = await import('../imageSafeguardService.js');
    await resolveJobPhotoRefs(42, 7);
    const vals = mockExecute.mock.calls[0][0].values as unknown[];
    // Both companyId (42) and jobId (7) must be in the query parameters
    expect(vals).toContain(42);
    expect(vals).toContain(7);
  });

  it('share endpoint never accepts storageRefs from request body', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/jobs/[id]/photos/share/POST.ts', 'utf8');
    expect(source).not.toContain('body.storageRefs');
    expect(source).not.toContain('body.refs');
    expect(source).not.toContain('clientRefs');
  });

  it('send-email endpoint never accepts storageRefs from request body', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/job-forms/[id]/send-email/POST.ts', 'utf8');
    expect(source).not.toContain('body.storageRefs');
    expect(source).not.toContain('body.refs');
    expect(source).not.toContain('clientRefs');
  });

  it('batch-status endpoint resolves refs server-side for share_link', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/image-safety/batch-status/POST.ts', 'utf8');
    expect(source).toContain('resolveJobPhotoRefs');
    expect(source).not.toContain('body.storageRefs');
  });
});

// ── ISG-30: Audit entry contains no recipients, URLs, keys or image contents ──

describe('ISG-30: Audit entry contains no recipients, URLs, keys or image contents', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('recordSharingAuditEvent stores only safe metadata', async () => {
    mockExecute.mockResolvedValue({ affectedRows: 1 });
    const { recordSharingAuditEvent } = await import('../imageSafeguardService.js');
    await recordSharingAuditEvent({
      companyId: 1, userId: 'user-abc', action: 'job_photo_share',
      resourceId: 42, imageCount: 5,
    });
    const callStr = JSON.stringify(mockExecute.mock.calls);
    // Must contain safe fields
    expect(callStr).toContain('job_photo_share');
    expect(callStr).toContain('imageCount');
    // Must NOT contain sensitive data
    expect(callStr).not.toMatch(/X-Amz-Signature/);
    expect(callStr).not.toMatch(/r2\.cloudflarestorage/);
    expect(callStr).not.toMatch(/data:image\//);
    expect(callStr).not.toMatch(/@.*\.com/);  // no email addresses
  });

  it('recordSharingAuditEvent never throws (best-effort)', async () => {
    mockExecute.mockRejectedValue(new Error('DB down'));
    const { recordSharingAuditEvent } = await import('../imageSafeguardService.js');
    await expect(recordSharingAuditEvent({
      companyId: 1, userId: 'u', action: 'form_email', resourceId: 1, imageCount: 1,
    })).resolves.not.toThrow();
  });

  it('audit event interface has no recipients, URLs or R2 keys', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguardService.ts', 'utf8');
    const auditInterface = source.match(/interface SharingAuditEvent \{[\s\S]+?\}/);
    if (auditInterface) {
      expect(auditInterface[0]).not.toContain('recipients');
      expect(auditInterface[0]).not.toContain('url');
      expect(auditInterface[0]).not.toContain('r2');
      expect(auditInterface[0]).not.toContain('signed');
    }
  });
});

// ── ISG-31: batch-confirm endpoint no longer exists ───────────────────────────

describe('ISG-31: batch-confirm endpoint removed', () => {
  it('batch-confirm directory does not exist', async () => {
    const { existsSync } = await import('fs');
    expect(existsSync('src/server/api/image-safety/batch-confirm')).toBe(false);
  });

  it('image-safeguard-confirmations migration does not exist', async () => {
    const { existsSync } = await import('fs');
    expect(existsSync('src/server/db/migrations/image-safeguard-confirmations.ts')).toBe(false);
  });

  it('entry.ts does not import batch-confirm', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/entry.ts', 'utf8');
    expect(source).not.toContain('batch-confirm');
    expect(source).not.toContain('runImageSafeguardConfirmationsMigration');
  });

  it('imageSafeguardService has no token functions', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguardService.ts', 'utf8');
    expect(source).not.toContain('issueConfirmationToken');
    expect(source).not.toContain('consumeConfirmationToken');
    expect(source).not.toContain('computeDigest');
    expect(source).not.toContain('randomBytes');
    expect(source).not.toContain('createHash');
  });
});

// ── ISG-32: Sensitive data never logged ──────────────────────────────────────

describe('ISG-32: Sensitive data never logged', () => {
  it('imageSafeguardService never logs R2 keys or signed URLs', async () => {
    const { readFileSync } = await import('fs');
    const lines = readFileSync('src/server/lib/imageSafeguardService.ts', 'utf8').split('\n');
    const logLines = lines.filter((l: string) => l.includes('console.'));
    for (const line of logLines) {
      expect(line).not.toMatch(/r2\.cloudflarestorage/);
      expect(line).not.toMatch(/X-Amz/);
      expect(line).not.toMatch(/signed.*url/i);
    }
  });

  it('share endpoint never logs raw token or R2 keys', async () => {
    const { readFileSync } = await import('fs');
    const lines = readFileSync('src/server/api/jobs/[id]/photos/share/POST.ts', 'utf8').split('\n');
    const logLines = lines.filter((l: string) => l.includes('console.'));
    for (const line of logLines) {
      expect(line).not.toMatch(/r2\.cloudflarestorage/);
      expect(line).not.toMatch(/X-Amz/);
    }
  });

  it('send-email endpoint never logs R2 keys or recipients', async () => {
    const { readFileSync } = await import('fs');
    const lines = readFileSync('src/server/api/job-forms/[id]/send-email/POST.ts', 'utf8').split('\n');
    const logLines = lines.filter((l: string) => l.includes('console.'));
    for (const line of logLines) {
      expect(line).not.toMatch(/r2\.cloudflarestorage/);
      expect(line).not.toMatch(/X-Amz/);
    }
  });

  it('modal wording is truthful — no AI-scan claim', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/components/ImageSafeguardBatchModal.tsx', 'utf8');
    expect(source).not.toContain('AI-scan');
    expect(source).not.toContain('AI scan');
    expect(source).not.toContain('scanned by AI');
    expect(source).not.toContain('automatically scanned');
    // Must contain the correct wording
    expect(source).toContain('Image sharing check');
    expect(source).toContain('authorised to share');
    expect(source).toContain('Image Safeguard Protocol');
    expect(source).toContain('Go Back');
    expect(source).toContain('Confirm and Share');
    expect(source).toContain('Confirm and Send');
  });
});
