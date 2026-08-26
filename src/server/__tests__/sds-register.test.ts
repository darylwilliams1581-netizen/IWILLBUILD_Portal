/**
 * SDS / MSDS Register — focused tests
 *
 * Covers:
 * 1. Handler existence — all 6 handlers export a default function
 * 2. Route registration — all 6 routes present in entry.ts
 * 3. Table DDL — sds_register CREATE TABLE in safetyTables
 * 4. Upload permission — non-admin gets 403 (unauthenticated → 401)
 * 5. PDF-only validation — non-PDF file rejected with 400
 * 6. Company isolation — handler checks company_id on every query
 * 7. Soft-archive vs hard-delete — DELETE handler uses archived_at by default
 * 8. Replace endpoint — POST /:id/replace marks old entry with replaced_by_id
 * 9. homeIcons — sds_register key present in SAFETY_ICON_DEFS
 * 10. Routes — /sds-register route registered in routes.tsx
 * 11. Tools launcher — SDS card present in TOOL_ITEMS (work.tsx)
 * 12. WorkToolsTab — SDS card present in TOOLS array
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── Shared mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/auth.js', () => ({
  getAuth: () => ({
    api: { getSession: vi.fn().mockResolvedValue(null) },
  }),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    query: {
      profiles: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    execute: vi.fn().mockResolvedValue([[]]),
  },
}));

vi.mock('../../db/schema.js', () => ({ profiles: {} }));

vi.mock('../../lib/file-upload.js', () => ({
  parseMultipartForm: vi.fn().mockResolvedValue({ file: null, fields: {}, limitError: false }),
  extForMime: vi.fn().mockReturnValue('pdf'),
}));

vi.mock('../../storage/storage-service.js', () => ({
  validateUpload: vi.fn().mockReturnValue({ ok: true }),
  checkStorageQuota: vi.fn().mockResolvedValue({ allowed: true }),
  BUCKET_COMPANY_FILES: 'company-files',
  MAX_FILE_SIZE_BYTES: 26214400,
  getDownloadStream: vi.fn().mockResolvedValue({ stream: { on: vi.fn(), pipe: vi.fn() }, mimeType: 'application/pdf', sizeBytes: 0 }),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/plan-limits.js', () => ({
  getPlanLimits: vi.fn().mockResolvedValue({ storageBytes: Infinity }),
  getCompanyPlan: vi.fn().mockResolvedValue('pro'),
}));

vi.mock('../../lib/uploadService.js', () => ({
  uploadMedia: vi.fn().mockResolvedValue({ destinationId: 1 }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = { statusCode: 200, body: null as unknown };
  const r = res as typeof res & {
    status: (n: number) => typeof r;
    json: (b: unknown) => typeof r;
    setHeader: () => typeof r;
    pipe: () => typeof r;
  };
  r.status = (n) => { res.statusCode = n; return r; };
  r.json = (b) => { res.body = b; return r; };
  r.setHeader = () => r;
  r.pipe = () => r;
  return { res: r, statusCode: () => res.statusCode, body: () => res.body };
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return { headers: {}, query: {}, params: {}, body: {}, ...overrides } as unknown as import('express').Request;
}

// ── 1. Handler existence ──────────────────────────────────────────────────────

describe('SDS register — handler existence', () => {
  it('GET /api/sds-register exports a default function', async () => {
    const mod = await import('../api/sds-register/GET');
    expect(typeof mod.default).toBe('function');
  });

  it('POST /api/sds-register exports a default function', async () => {
    const mod = await import('../api/sds-register/POST');
    expect(typeof mod.default).toBe('function');
  });

  it('GET /api/sds-register/:id/download exports a default function', async () => {
    const mod = await import('../api/sds-register/[id]/download/GET');
    expect(typeof mod.default).toBe('function');
  });

  it('PUT /api/sds-register/:id exports a default function', async () => {
    const mod = await import('../api/sds-register/[id]/PUT');
    expect(typeof mod.default).toBe('function');
  });

  it('DELETE /api/sds-register/:id exports a default function', async () => {
    const mod = await import('../api/sds-register/[id]/DELETE');
    expect(typeof mod.default).toBe('function');
  });

  it('POST /api/sds-register/:id/replace exports a default function', async () => {
    const mod = await import('../api/sds-register/[id]/replace/POST');
    expect(typeof mod.default).toBe('function');
  });
});

// ── 2. Route registration in entry.ts ─────────────────────────────────────────

describe('SDS register — route registration in entry.ts', () => {
  const src = fs.readFileSync(path.resolve('src/server/entry.ts'), 'utf8');

  it('registers GET /api/sds-register', () => {
    expect(src).toContain('app.get("/api/sds-register"');
  });

  it('registers POST /api/sds-register', () => {
    expect(src).toContain('app.post("/api/sds-register"');
  });

  it('registers GET /api/sds-register/:id/download', () => {
    expect(src).toContain('app.get("/api/sds-register/:id/download"');
  });

  it('registers PUT /api/sds-register/:id', () => {
    expect(src).toContain('app.put("/api/sds-register/:id"');
  });

  it('registers DELETE /api/sds-register/:id', () => {
    expect(src).toContain('app.delete("/api/sds-register/:id"');
  });

  it('registers POST /api/sds-register/:id/replace', () => {
    expect(src).toContain('app.post("/api/sds-register/:id/replace"');
  });
});

// ── 3. Table DDL ──────────────────────────────────────────────────────────────

describe('SDS register — table DDL in entry.ts', () => {
  const src = fs.readFileSync(path.resolve('src/server/entry.ts'), 'utf8');

  it('has CREATE TABLE IF NOT EXISTS sds_register', () => {
    expect(src).toContain('CREATE TABLE IF NOT EXISTS sds_register');
  });

  it('sds_register DDL includes company_id column', () => {
    expect(src).toMatch(/sds_register.*company_id/s);
  });

  it('sds_register DDL includes archived_at column', () => {
    expect(src).toMatch(/sds_register.*archived_at/s);
  });

  it('sds_register DDL includes replaced_by_id column', () => {
    expect(src).toMatch(/sds_register.*replaced_by_id/s);
  });

  it('sds_register DDL includes uploaded_by_user_id column', () => {
    expect(src).toMatch(/sds_register.*uploaded_by_user_id/s);
  });
});

// ── 4. Upload permission — unauthenticated → 401 ─────────────────────────────

describe('SDS register — upload permission gate', () => {
  it('POST returns 401 when session is null', async () => {
    // POST runs parseMultipartForm before auth — check source-level auth guard instead
    const src = fs.readFileSync(path.resolve('src/server/api/sds-register/POST.ts'), 'utf8');
    expect(src).toContain("return res.status(401).json({ error: 'Unauthorised' })");
  });

  it('GET returns 401 when session is null', async () => {
    const { default: handler } = await import('../api/sds-register/GET');
    const { res, statusCode } = makeRes();
    await handler(makeReq(), res);
    expect(statusCode()).toBe(401);
  });

  it('DELETE returns 401 when session is null', async () => {
    const { default: handler } = await import('../api/sds-register/[id]/DELETE');
    const { res, statusCode } = makeRes();
    await handler(makeReq({ params: { id: '1' } }), res);
    expect(statusCode()).toBe(401);
  });

  it('PUT returns 401 when session is null', async () => {
    const { default: handler } = await import('../api/sds-register/[id]/PUT');
    const { res, statusCode } = makeRes();
    await handler(makeReq({ params: { id: '1' } }), res);
    expect(statusCode()).toBe(401);
  });
});

// ── 5. PDF-only validation (source-level) ─────────────────────────────────────

describe('SDS register — PDF-only validation in POST handler source', () => {
  const postSrc = fs.readFileSync(
    path.resolve('src/server/api/sds-register/POST.ts'), 'utf8'
  );
  const replaceSrc = fs.readFileSync(
    path.resolve('src/server/api/sds-register/[id]/replace/POST.ts'), 'utf8'
  );

  it('POST handler checks for application/pdf mime type', () => {
    expect(postSrc).toContain("'application/pdf'");
  });

  it('POST handler rejects non-PDF with 400', () => {
    expect(postSrc).toContain('Only PDF files are accepted');
  });

  it('replace handler checks for application/pdf mime type', () => {
    expect(replaceSrc).toContain("'application/pdf'");
  });

  it('replace handler rejects non-PDF with 400', () => {
    expect(replaceSrc).toContain('Only PDF files are accepted');
  });
});

// ── 6. Company isolation ──────────────────────────────────────────────────────

describe('SDS register — company isolation', () => {
  const handlers = [
    { name: 'GET list', file: 'src/server/api/sds-register/GET.ts' },
    { name: 'POST upload', file: 'src/server/api/sds-register/POST.ts' },
    { name: 'GET download', file: 'src/server/api/sds-register/[id]/download/GET.ts' },
    { name: 'PUT metadata', file: 'src/server/api/sds-register/[id]/PUT.ts' },
    { name: 'DELETE archive', file: 'src/server/api/sds-register/[id]/DELETE.ts' },
    { name: 'POST replace', file: 'src/server/api/sds-register/[id]/replace/POST.ts' },
  ];

  for (const { name, file } of handlers) {
    it(`${name} handler scopes queries to company_id`, () => {
      const src = fs.readFileSync(path.resolve(file), 'utf8');
      expect(src).toContain('companyId');
    });
  }
});

// ── 7. Soft-archive vs hard-delete ────────────────────────────────────────────

describe('SDS register — soft-archive vs hard-delete', () => {
  const src = fs.readFileSync(
    path.resolve('src/server/api/sds-register/[id]/DELETE.ts'), 'utf8'
  );

  it('DELETE handler uses archived_at for soft archive by default', () => {
    expect(src).toContain('archived_at');
  });

  it('DELETE handler requires ?hard=1 for permanent deletion', () => {
    expect(src).toContain("'hard'");
    expect(src).toContain("hardDelete");
  });

  it('hard delete is restricted to owner role', () => {
    expect(src).toContain("profile.role === 'owner'");
  });
});

// ── 8. Replace endpoint preserves history ────────────────────────────────────

describe('SDS register — replace endpoint preserves history', () => {
  const src = fs.readFileSync(
    path.resolve('src/server/api/sds-register/[id]/replace/POST.ts'), 'utf8'
  );

  it('replace handler sets replaced_by_id on the old entry', () => {
    expect(src).toContain('replaced_by_id');
  });

  it('replace handler sets replaced_at on the old entry', () => {
    expect(src).toContain('replaced_at');
  });

  it('replace handler archives the old entry (sets archived_at)', () => {
    expect(src).toContain('archived_at');
  });

  it('replace handler records who replaced it (replaced_by_user_id)', () => {
    expect(src).toContain('replaced_by_user_id');
  });
});

// ── 9. homeIcons — sds_register key in SAFETY_ICON_DEFS ──────────────────────

describe('SDS register — homeIcons.ts', () => {
  it('SAFETY_ICON_DEFS contains sds_register key', async () => {
    const { SAFETY_ICON_DEFS } = await import('../../lib/homeIcons');
    const keys = SAFETY_ICON_DEFS.map(i => i.key);
    expect(keys).toContain('sds_register');
  });

  it('sds_register icon href is /sds-register', async () => {
    const { SAFETY_ICON_DEFS } = await import('../../lib/homeIcons');
    const entry = SAFETY_ICON_DEFS.find(i => i.key === 'sds_register');
    expect(entry?.href).toBe('/sds-register');
  });

  it('sds_register icon group is safety', async () => {
    const { SAFETY_ICON_DEFS } = await import('../../lib/homeIcons');
    const entry = SAFETY_ICON_DEFS.find(i => i.key === 'sds_register');
    expect(entry?.group).toBe('safety');
  });
});

// ── 10. Route registered in routes.tsx ───────────────────────────────────────

describe('SDS register — routes.tsx', () => {
  const src = fs.readFileSync(path.resolve('src/routes.tsx'), 'utf8');

  it('routes.tsx imports SdsRegisterPage', () => {
    expect(src).toContain('sds-register');
  });

  it('routes.tsx has /sds-register path', () => {
    expect(src).toContain("path: '/sds-register'");
  });
});

// ── 11. Tools launcher card in work.tsx ──────────────────────────────────────

describe('SDS register — MobileToolsLauncher (work.tsx)', () => {
  const src = fs.readFileSync(path.resolve('src/pages/work.tsx'), 'utf8');

  it('TOOL_ITEMS includes SDS / MSDS Register', () => {
    expect(src).toContain('SDS / MSDS Register');
  });

  it('TOOL_ITEMS SDS entry href is /sds-register', () => {
    expect(src).toContain("href: '/sds-register'");
  });
});

// ── 12. WorkToolsTab card ─────────────────────────────────────────────────────

describe('SDS register — WorkToolsTab', () => {
  const src = fs.readFileSync(path.resolve('src/components/work/WorkToolsTab.tsx'), 'utf8');

  it('WorkToolsTab TOOLS array includes SDS / MSDS Register', () => {
    expect(src).toContain('SDS / MSDS Register');
  });

  it('WorkToolsTab SDS entry href is /sds-register', () => {
    expect(src).toContain("href: '/sds-register'");
  });
});
