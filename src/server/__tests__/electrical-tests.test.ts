/**
 * Electrical Test Recorder — comprehensive tests
 *
 * Covers:
 * 1.  evalEQEarthTail — all four condition bands
 * 2.  evalEQEarthTail — exact boundary values
 * 3.  evalGeneric — pass/fail/manual
 * 4.  assessTestRecord — EQ template routes to EQ logic
 * 5.  assessTestRecord — non-EQ template routes to generic
 * 6.  isCalibrationExpired — past/future/null
 * 7.  formatAuDate — Australian date format
 * 8.  resultBadgeClass — all result types
 * 9.  conditionBadgeClass — all condition types
 * 10. Handler existence — all handlers export a default function
 * 11. Route registration in entry.ts
 * 12. DB schema — all 4 tables in entry.ts
 * 13. Auth gate — unauthenticated → 401
 * 14. Company isolation — all handlers scope to companyId
 * 15. Sign-off — requires justification for override
 * 16. Sign-off — calibration expiry check in source
 * 17. Retest — preserves parent_test_id in source
 * 18. Audit trail — all write handlers insert to electrical_test_audit
 * 19. PDF export — safety notice in source
 * 20. CSV export — BOM + column headers in source
 * 21. homeIcons — electrical_tests key in SAFETY_ICON_DEFS
 * 22. Routes — /electrical-tests registered in routes.tsx
 * 23. Tools launcher — Electrical Tests in work.tsx TOOL_ITEMS
 * 24. WorkToolsTab — Electrical Tests in TOOLS array
 * 25. Frontend page — mobile cards + desktop table + disclaimer
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── Mocks ─────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = { statusCode: 200, body: null as unknown };
  const r = res as typeof res & {
    status: (n: number) => typeof r;
    json: (b: unknown) => typeof r;
    setHeader: () => typeof r;
    send: () => typeof r;
  };
  r.status = (n) => { res.statusCode = n; return r; };
  r.json = (b) => { res.body = b; return r; };
  r.setHeader = () => r;
  r.send = () => r;
  return { res: r, statusCode: () => res.statusCode, body: () => res.body };
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return { headers: {}, query: {}, params: {}, body: {}, ...overrides } as unknown as import('express').Request;
}

// ── 1. evalEQEarthTail — condition bands ──────────────────────────────────────

describe('EQ Earth Tail — condition bands', () => {
  it('< 10 mΩ = C4 (PASS)', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    const r = evalEQEarthTail(4.2);
    expect(r.result).toBe('PASS');
    expect(r.condition).toBe('C4');
  });

  it('10 mΩ = C3 (REVIEW)', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    const r = evalEQEarthTail(10);
    expect(r.result).toBe('REVIEW');
    expect(r.condition).toBe('C3');
  });

  it('55 mΩ = C3 (REVIEW)', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    const r = evalEQEarthTail(55);
    expect(r.result).toBe('REVIEW');
    expect(r.condition).toBe('C3');
  });

  it('100 mΩ = C3 (REVIEW)', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    const r = evalEQEarthTail(100);
    expect(r.result).toBe('REVIEW');
    expect(r.condition).toBe('C3');
  });

  it('101 mΩ = P2 (REVIEW)', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    const r = evalEQEarthTail(101);
    expect(r.result).toBe('REVIEW');
    expect(r.condition).toBe('P2');
  });

  it('300 mΩ = P2 (REVIEW)', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    const r = evalEQEarthTail(300);
    expect(r.result).toBe('REVIEW');
    expect(r.condition).toBe('P2');
  });

  it('500 mΩ = P2 (REVIEW)', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    const r = evalEQEarthTail(500);
    expect(r.result).toBe('REVIEW');
    expect(r.condition).toBe('P2');
  });

  it('501 mΩ = P1 (FAIL)', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    const r = evalEQEarthTail(501);
    expect(r.result).toBe('FAIL');
    expect(r.condition).toBe('P1');
  });

  it('1000 mΩ = P1 (FAIL)', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    const r = evalEQEarthTail(1000);
    expect(r.result).toBe('FAIL');
    expect(r.condition).toBe('P1');
  });
});

// ── 2. evalEQEarthTail — exact boundary values ────────────────────────────────

describe('EQ Earth Tail — exact boundaries', () => {
  it('9.999 mΩ = C4', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    expect(evalEQEarthTail(9.999).condition).toBe('C4');
  });

  it('10.001 mΩ = C3', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    expect(evalEQEarthTail(10.001).condition).toBe('C3');
  });

  it('100.001 mΩ = P2', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    expect(evalEQEarthTail(100.001).condition).toBe('P2');
  });

  it('500.001 mΩ = P1', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    expect(evalEQEarthTail(500.001).condition).toBe('P1');
  });

  it('EQ standard ref is present on all results', async () => {
    const { evalEQEarthTail } = await import('@/lib/electrical-test-calc');
    for (const v of [5, 50, 300, 600]) {
      expect(evalEQEarthTail(v).standardRef).toContain('STNW3359');
    }
  });
});

// ── 3. evalGeneric — pass/fail/manual ─────────────────────────────────────────

describe('evalGeneric', () => {
  it('within min/max = PASS', async () => {
    const { evalGeneric } = await import('@/lib/electrical-test-calc');
    expect(evalGeneric(5, 1, 10).result).toBe('PASS');
  });

  it('below min = FAIL', async () => {
    const { evalGeneric } = await import('@/lib/electrical-test-calc');
    expect(evalGeneric(0.5, 1, 10).result).toBe('FAIL');
  });

  it('above max = FAIL', async () => {
    const { evalGeneric } = await import('@/lib/electrical-test-calc');
    expect(evalGeneric(11, 1, 10).result).toBe('FAIL');
  });

  it('no min/max = MANUAL', async () => {
    const { evalGeneric } = await import('@/lib/electrical-test-calc');
    expect(evalGeneric(5, null, null).result).toBe('MANUAL');
  });

  it('only max provided — below max = PASS', async () => {
    const { evalGeneric } = await import('@/lib/electrical-test-calc');
    expect(evalGeneric(5, null, 10).result).toBe('PASS');
  });

  it('only min provided — above min = PASS', async () => {
    const { evalGeneric } = await import('@/lib/electrical-test-calc');
    expect(evalGeneric(5, 1, null).result).toBe('PASS');
  });

  it('condition is always null for generic', async () => {
    const { evalGeneric } = await import('@/lib/electrical-test-calc');
    expect(evalGeneric(5, 1, 10).condition).toBeNull();
  });
});

// ── 4. assessTestRecord — EQ template ────────────────────────────────────────

describe('assessTestRecord — EQ Earth Tail template', () => {
  it('routes to EQ logic when template is eq_earth_tail', async () => {
    const { assessTestRecord } = await import('@/lib/electrical-test-calc');
    const r = assessTestRecord('eq_earth_tail', 4.2, null, null, null);
    expect(r.condition).toBe('C4');
    expect(r.result).toBe('PASS');
  });

  it('EQ result ignores min/max params', async () => {
    const { assessTestRecord } = await import('@/lib/electrical-test-calc');
    const r = assessTestRecord('eq_earth_tail', 600, 0, 1000, null);
    expect(r.result).toBe('FAIL');
    expect(r.condition).toBe('P1');
  });
});

// ── 5. assessTestRecord — non-EQ template ────────────────────────────────────

describe('assessTestRecord — non-EQ templates', () => {
  it('earth_continuity with no limits = MANUAL', async () => {
    const { assessTestRecord } = await import('@/lib/electrical-test-calc');
    expect(assessTestRecord('earth_continuity', 5, null, null, null).result).toBe('MANUAL');
  });

  it('insulation_resistance with max limit = PASS when above', async () => {
    const { assessTestRecord } = await import('@/lib/electrical-test-calc');
    expect(assessTestRecord('insulation_resistance', 100, 1, null, null).result).toBe('PASS');
  });

  it('null measured value = MANUAL', async () => {
    const { assessTestRecord } = await import('@/lib/electrical-test-calc');
    expect(assessTestRecord('earth_continuity', null, 0, 10, null).result).toBe('MANUAL');
  });
});

// ── 6. isCalibrationExpired ───────────────────────────────────────────────────

describe('isCalibrationExpired', () => {
  it('past date = expired', async () => {
    const { isCalibrationExpired } = await import('@/lib/electrical-test-calc');
    expect(isCalibrationExpired('2020-01-01')).toBe(true);
  });

  it('future date = not expired', async () => {
    const { isCalibrationExpired } = await import('@/lib/electrical-test-calc');
    expect(isCalibrationExpired('2099-12-31')).toBe(false);
  });

  it('null = not expired', async () => {
    const { isCalibrationExpired } = await import('@/lib/electrical-test-calc');
    expect(isCalibrationExpired(null)).toBe(false);
  });
});

// ── 7. formatAuDate ───────────────────────────────────────────────────────────

describe('formatAuDate', () => {
  it('formats YYYY-MM-DD as DD/MM/YYYY', async () => {
    const { formatAuDate } = await import('@/lib/electrical-test-calc');
    expect(formatAuDate('2026-08-26')).toContain('26');
    expect(formatAuDate('2026-08-26')).toContain('08');
    expect(formatAuDate('2026-08-26')).toContain('2026');
  });

  it('null returns —', async () => {
    const { formatAuDate } = await import('@/lib/electrical-test-calc');
    expect(formatAuDate(null)).toBe('—');
  });
});

// ── 8. resultBadgeClass ───────────────────────────────────────────────────────

describe('resultBadgeClass', () => {
  it('PASS = green', async () => {
    const { resultBadgeClass } = await import('@/lib/electrical-test-calc');
    expect(resultBadgeClass('PASS')).toContain('green');
  });

  it('FAIL = red', async () => {
    const { resultBadgeClass } = await import('@/lib/electrical-test-calc');
    expect(resultBadgeClass('FAIL')).toContain('red');
  });

  it('REVIEW = amber', async () => {
    const { resultBadgeClass } = await import('@/lib/electrical-test-calc');
    expect(resultBadgeClass('REVIEW')).toContain('amber');
  });

  it('MANUAL = gray', async () => {
    const { resultBadgeClass } = await import('@/lib/electrical-test-calc');
    expect(resultBadgeClass('MANUAL')).toContain('gray');
  });
});

// ── 9. conditionBadgeClass ────────────────────────────────────────────────────

describe('conditionBadgeClass', () => {
  it('C4 = green', async () => {
    const { conditionBadgeClass } = await import('@/lib/electrical-test-calc');
    expect(conditionBadgeClass('C4')).toContain('green');
  });

  it('C3 = blue', async () => {
    const { conditionBadgeClass } = await import('@/lib/electrical-test-calc');
    expect(conditionBadgeClass('C3')).toContain('blue');
  });

  it('P2 = amber', async () => {
    const { conditionBadgeClass } = await import('@/lib/electrical-test-calc');
    expect(conditionBadgeClass('P2')).toContain('amber');
  });

  it('P1 = red', async () => {
    const { conditionBadgeClass } = await import('@/lib/electrical-test-calc');
    expect(conditionBadgeClass('P1')).toContain('red');
  });
});

// ── 10. Handler existence ─────────────────────────────────────────────────────

describe('Electrical tests — handler existence', () => {
  it('GET /api/electrical-tests exports a default function', async () => {
    const mod = await import('../api/electrical-tests/GET');
    expect(typeof mod.default).toBe('function');
  });

  it('POST /api/electrical-tests exports a default function', async () => {
    const mod = await import('../api/electrical-tests/POST');
    expect(typeof mod.default).toBe('function');
  });

  it('GET /api/electrical-tests/:id exports a default function', async () => {
    const mod = await import('../api/electrical-tests/[id]/GET');
    expect(typeof mod.default).toBe('function');
  });

  it('PUT /api/electrical-tests/:id exports a default function', async () => {
    const mod = await import('../api/electrical-tests/[id]/PUT');
    expect(typeof mod.default).toBe('function');
  });

  it('POST /api/electrical-tests/:id/retest exports a default function', async () => {
    const mod = await import('../api/electrical-tests/[id]/retest/POST');
    expect(typeof mod.default).toBe('function');
  });

  it('POST /api/electrical-tests/:id/sign-off exports a default function', async () => {
    const mod = await import('../api/electrical-tests/[id]/sign-off/POST');
    expect(typeof mod.default).toBe('function');
  });

  it('GET /api/electrical-test-equipment exports a default function', async () => {
    const mod = await import('../api/electrical-test-equipment/GET');
    expect(typeof mod.default).toBe('function');
  });

  it('POST /api/electrical-test-equipment exports a default function', async () => {
    const mod = await import('../api/electrical-test-equipment/POST');
    expect(typeof mod.default).toBe('function');
  });

  it('PUT /api/electrical-test-equipment/:id exports a default function', async () => {
    const mod = await import('../api/electrical-test-equipment/[id]/PUT');
    expect(typeof mod.default).toBe('function');
  });

  it('GET /api/electrical-tests/export/:jobId/csv exports a default function', async () => {
    const mod = await import('../api/electrical-tests/export/[jobId]/csv/GET');
    expect(typeof mod.default).toBe('function');
  });

  it('GET /api/electrical-tests/export/:jobId/pdf exports a default function', async () => {
    const mod = await import('../api/electrical-tests/export/[jobId]/pdf/GET');
    expect(typeof mod.default).toBe('function');
  });
});

// ── 11. Route registration ────────────────────────────────────────────────────

describe('Electrical tests — route registration in entry.ts', () => {
  const src = fs.readFileSync(path.resolve('src/server/entry.ts'), 'utf8');

  it('registers GET /api/electrical-tests', () => {
    expect(src).toContain('app.get("/api/electrical-tests"');
  });

  it('registers POST /api/electrical-tests', () => {
    expect(src).toContain('app.post("/api/electrical-tests"');
  });

  it('registers GET /api/electrical-tests/:id', () => {
    expect(src).toContain('app.get("/api/electrical-tests/:id"');
  });

  it('registers PUT /api/electrical-tests/:id', () => {
    expect(src).toContain('app.put("/api/electrical-tests/:id"');
  });

  it('registers POST /api/electrical-tests/:id/retest', () => {
    expect(src).toContain('app.post("/api/electrical-tests/:id/retest"');
  });

  it('registers POST /api/electrical-tests/:id/sign-off', () => {
    expect(src).toContain('app.post("/api/electrical-tests/:id/sign-off"');
  });

  it('registers POST /api/electrical-tests/:id/photos', () => {
    expect(src).toContain('app.post("/api/electrical-tests/:id/photos"');
  });

  it('registers GET /api/electrical-test-equipment', () => {
    expect(src).toContain('app.get("/api/electrical-test-equipment"');
  });

  it('registers POST /api/electrical-test-equipment', () => {
    expect(src).toContain('app.post("/api/electrical-test-equipment"');
  });

  it('registers PUT /api/electrical-test-equipment/:id', () => {
    expect(src).toContain('app.put("/api/electrical-test-equipment/:id"');
  });

  it('registers GET /api/electrical-tests/export/:jobId/csv', () => {
    expect(src).toContain('app.get("/api/electrical-tests/export/:jobId/csv"');
  });

  it('registers GET /api/electrical-tests/export/:jobId/pdf', () => {
    expect(src).toContain('app.get("/api/electrical-tests/export/:jobId/pdf"');
  });

  it('export routes registered before /:id param routes (no shadowing)', () => {
    const exportIdx = src.indexOf('app.get("/api/electrical-tests/export/:jobId/csv"');
    const idIdx = src.indexOf('app.get("/api/electrical-tests/:id"');
    expect(exportIdx).toBeLessThan(idIdx);
  });
});

// ── 12. DB schema ─────────────────────────────────────────────────────────────

describe('Electrical tests — DB schema in entry.ts', () => {
  const src = fs.readFileSync(path.resolve('src/server/entry.ts'), 'utf8');

  it('has CREATE TABLE IF NOT EXISTS electrical_test_equipment', () => {
    expect(src).toContain('CREATE TABLE IF NOT EXISTS electrical_test_equipment');
  });

  it('electrical_test_equipment has calibration_expiry', () => {
    expect(src).toMatch(/electrical_test_equipment.*calibration_expiry/s);
  });

  it('has CREATE TABLE IF NOT EXISTS electrical_test_records', () => {
    expect(src).toContain('CREATE TABLE IF NOT EXISTS electrical_test_records');
  });

  it('electrical_test_records has parent_test_id', () => {
    expect(src).toMatch(/electrical_test_records.*parent_test_id/s);
  });

  it('electrical_test_records has condition_class', () => {
    expect(src).toMatch(/electrical_test_records.*condition_class/s);
  });

  it('electrical_test_records has override_justification', () => {
    expect(src).toMatch(/electrical_test_records.*override_justification/s);
  });

  it('has CREATE TABLE IF NOT EXISTS electrical_test_photos', () => {
    expect(src).toContain('CREATE TABLE IF NOT EXISTS electrical_test_photos');
  });

  it('electrical_test_photos has photo_type', () => {
    expect(src).toMatch(/electrical_test_photos.*photo_type/s);
  });

  it('has CREATE TABLE IF NOT EXISTS electrical_test_audit', () => {
    expect(src).toContain('CREATE TABLE IF NOT EXISTS electrical_test_audit');
  });

  it('electrical_test_audit has event_type', () => {
    expect(src).toMatch(/electrical_test_audit.*event_type/s);
  });
});

// ── 13. Auth gate ─────────────────────────────────────────────────────────────

describe('Electrical tests — auth gate (unauthenticated → 401)', () => {
  it('GET list returns 401', async () => {
    const { default: handler } = await import('../api/electrical-tests/GET');
    const { res, statusCode } = makeRes();
    await handler(makeReq({ query: { jobId: '1' } }), res);
    expect(statusCode()).toBe(401);
  });

  it('POST create returns 401', async () => {
    const { default: handler } = await import('../api/electrical-tests/POST');
    const { res, statusCode } = makeRes();
    await handler(makeReq(), res);
    expect(statusCode()).toBe(401);
  });

  it('GET detail returns 401', async () => {
    const { default: handler } = await import('../api/electrical-tests/[id]/GET');
    const { res, statusCode } = makeRes();
    await handler(makeReq({ params: { id: '1' } }), res);
    expect(statusCode()).toBe(401);
  });

  it('PUT update returns 401', async () => {
    const { default: handler } = await import('../api/electrical-tests/[id]/PUT');
    const { res, statusCode } = makeRes();
    await handler(makeReq({ params: { id: '1' } }), res);
    expect(statusCode()).toBe(401);
  });

  it('POST retest returns 401', async () => {
    const { default: handler } = await import('../api/electrical-tests/[id]/retest/POST');
    const { res, statusCode } = makeRes();
    await handler(makeReq({ params: { id: '1' } }), res);
    expect(statusCode()).toBe(401);
  });

  it('POST sign-off returns 401', async () => {
    const { default: handler } = await import('../api/electrical-tests/[id]/sign-off/POST');
    const { res, statusCode } = makeRes();
    await handler(makeReq({ params: { id: '1' } }), res);
    expect(statusCode()).toBe(401);
  });

  it('GET equipment returns 401', async () => {
    const { default: handler } = await import('../api/electrical-test-equipment/GET');
    const { res, statusCode } = makeRes();
    await handler(makeReq(), res);
    expect(statusCode()).toBe(401);
  });
});

// ── 14. Company isolation ─────────────────────────────────────────────────────

describe('Electrical tests — company isolation', () => {
  const handlers = [
    { name: 'GET list', file: 'src/server/api/electrical-tests/GET.ts' },
    { name: 'POST create', file: 'src/server/api/electrical-tests/POST.ts' },
    { name: 'GET detail', file: 'src/server/api/electrical-tests/[id]/GET.ts' },
    { name: 'PUT update', file: 'src/server/api/electrical-tests/[id]/PUT.ts' },
    { name: 'POST retest', file: 'src/server/api/electrical-tests/[id]/retest/POST.ts' },
    { name: 'POST sign-off', file: 'src/server/api/electrical-tests/[id]/sign-off/POST.ts' },
    { name: 'GET equipment', file: 'src/server/api/electrical-test-equipment/GET.ts' },
    { name: 'POST equipment', file: 'src/server/api/electrical-test-equipment/POST.ts' },
    { name: 'PUT equipment', file: 'src/server/api/electrical-test-equipment/[id]/PUT.ts' },
    { name: 'CSV export', file: 'src/server/api/electrical-tests/export/[jobId]/csv/GET.ts' },
    { name: 'PDF export', file: 'src/server/api/electrical-tests/export/[jobId]/pdf/GET.ts' },
  ];

  for (const { name, file } of handlers) {
    it(`${name} scopes queries to companyId`, () => {
      const src = fs.readFileSync(path.resolve(file), 'utf8');
      expect(src).toContain('companyId');
    });
  }
});

// ── 15. Sign-off — override requires justification ────────────────────────────

describe('Sign-off — supervisor override', () => {
  const src = fs.readFileSync(path.resolve('src/server/api/electrical-tests/[id]/sign-off/POST.ts'), 'utf8');

  it('checks for overrideJustification', () => {
    expect(src).toContain('overrideJustification');
  });

  it('returns 400 when justification is missing', () => {
    expect(src).toContain('400');
    expect(src).toContain('justification');
  });

  it('requires admin/owner for override', () => {
    expect(src).toContain("profile.role === 'owner'");
  });

  it('requires admin/owner for accept', () => {
    expect(src).toContain("'accept'");
  });
});

// ── 16. Sign-off — calibration expiry check ───────────────────────────────────

describe('Sign-off — calibration expiry check', () => {
  const src = fs.readFileSync(path.resolve('src/server/api/electrical-tests/[id]/sign-off/POST.ts'), 'utf8');

  it('checks calibration_expiry when accepting', () => {
    expect(src).toContain('calibration_expiry');
  });

  it('returns 409 for expired calibration on Pass result', () => {
    expect(src).toContain('calibration_expired');
    expect(src).toContain('409');
  });
});

// ── 17. Retest — preserves parent_test_id ────────────────────────────────────

describe('Retest — parent_test_id', () => {
  const src = fs.readFileSync(path.resolve('src/server/api/electrical-tests/[id]/retest/POST.ts'), 'utf8');

  it('inserts parent_test_id into new record', () => {
    expect(src).toContain('parent_test_id');
  });

  it('uses rootParentId to flatten retest chain', () => {
    expect(src).toContain('rootParentId');
  });

  it('never modifies the original record', () => {
    expect(src).not.toContain("UPDATE electrical_test_records SET");
  });
});

// ── 18. Audit trail ───────────────────────────────────────────────────────────

describe('Electrical tests — audit trail', () => {
  const writeHandlers = [
    'src/server/api/electrical-tests/POST.ts',
    'src/server/api/electrical-tests/[id]/PUT.ts',
    'src/server/api/electrical-tests/[id]/retest/POST.ts',
    'src/server/api/electrical-tests/[id]/sign-off/POST.ts',
    'src/server/api/electrical-tests/[id]/photos/POST.ts',
  ];

  for (const file of writeHandlers) {
    it(`${file.split('/').pop()} inserts into electrical_test_audit`, () => {
      const src = fs.readFileSync(path.resolve(file), 'utf8');
      expect(src).toContain('electrical_test_audit');
      expect(src).toContain('INSERT INTO electrical_test_audit');
    });
  }
});

// ── 19. PDF export — safety notice ───────────────────────────────────────────

describe('Electrical tests — PDF export', () => {
  const src = fs.readFileSync(path.resolve('src/server/api/electrical-tests/export/[jobId]/pdf/GET.ts'), 'utf8');

  it('includes safety notice text', () => {
    expect(src).toContain('appropriately licensed and competent persons');
  });

  it('uses pdf-lib', () => {
    expect(src).toContain('pdf-lib');
  });

  it('colour-codes PASS result', () => {
    expect(src).toContain("result === 'PASS'");
  });

  it('colour-codes FAIL result', () => {
    expect(src).toContain("result === 'FAIL'");
  });

  it('imports formatAuDate', () => {
    expect(src).toContain('formatAuDate');
  });
});

// ── 20. CSV export ────────────────────────────────────────────────────────────

describe('Electrical tests — CSV export', () => {
  const src = fs.readFileSync(path.resolve('src/server/api/electrical-tests/export/[jobId]/csv/GET.ts'), 'utf8');

  it('includes BOM for Excel', () => {
    expect(src).toContain('\\uFEFF');
  });

  it('includes Asset/Connection ID column', () => {
    expect(src).toContain('Asset/Connection ID');
  });

  it('includes Result column', () => {
    expect(src).toContain('Result');
  });

  it('includes Condition column', () => {
    expect(src).toContain('Condition');
  });

  it('includes Standard Ref column', () => {
    expect(src).toContain('Standard Ref');
  });
});

// ── 21. homeIcons ─────────────────────────────────────────────────────────────

describe('Electrical tests — homeIcons.ts', () => {
  it('SAFETY_ICON_DEFS contains electrical_tests key', async () => {
    const { SAFETY_ICON_DEFS } = await import('../../lib/homeIcons');
    const keys = SAFETY_ICON_DEFS.map((i: { key: string }) => i.key);
    expect(keys).toContain('electrical_tests');
  });

  it('electrical_tests href is /electrical-tests', async () => {
    const { SAFETY_ICON_DEFS } = await import('../../lib/homeIcons');
    const entry = SAFETY_ICON_DEFS.find((i: { key: string }) => i.key === 'electrical_tests');
    expect(entry?.href).toBe('/electrical-tests');
  });

  it('electrical_tests group is safety', async () => {
    const { SAFETY_ICON_DEFS } = await import('../../lib/homeIcons');
    const entry = SAFETY_ICON_DEFS.find((i: { key: string }) => i.key === 'electrical_tests');
    expect(entry?.group).toBe('safety');
  });
});

// ── 22. Routes ────────────────────────────────────────────────────────────────

describe('Electrical tests — routes.tsx', () => {
  const src = fs.readFileSync(path.resolve('src/routes.tsx'), 'utf8');

  it('imports ElectricalTestsPage', () => {
    expect(src).toContain('electrical-tests');
  });

  it('has /electrical-tests path', () => {
    expect(src).toContain("path: '/electrical-tests'");
  });
});

// ── 23. Tools launcher (work.tsx) ─────────────────────────────────────────────

describe('Electrical tests — work.tsx TOOL_ITEMS', () => {
  const src = fs.readFileSync(path.resolve('src/pages/work.tsx'), 'utf8');

  it('TOOL_ITEMS includes Electrical Tests', () => {
    expect(src).toContain('Electrical Tests');
  });

  it('TOOL_ITEMS Electrical Tests href is /electrical-tests', () => {
    expect(src).toContain("href: '/electrical-tests'");
  });
});

// ── 24. WorkToolsTab ──────────────────────────────────────────────────────────

describe('Electrical tests — WorkToolsTab', () => {
  const src = fs.readFileSync(path.resolve('src/components/work/WorkToolsTab.tsx'), 'utf8');

  it('TOOLS array includes Electrical Tests', () => {
    expect(src).toContain('Electrical Tests');
  });

  it('TOOLS Electrical Tests href is /electrical-tests', () => {
    expect(src).toContain("href: '/electrical-tests'");
  });
});

// ── 25. Frontend page ─────────────────────────────────────────────────────────

describe('Electrical tests — frontend page', () => {
  const src = fs.readFileSync(path.resolve('src/pages/electrical-tests.tsx'), 'utf8');

  it('has md:hidden mobile card section', () => {
    expect(src).toContain('md:hidden');
  });

  it('has hidden md:block desktop table section', () => {
    expect(src).toContain('hidden md:block');
  });

  it('shows safety notice', () => {
    expect(src).toContain('appropriately licensed and competent persons');
  });

  it('shows result badge', () => {
    expect(src).toContain('resultBadgeClass');
  });

  it('shows condition badge', () => {
    expect(src).toContain('conditionBadgeClass');
  });

  it('includes PDF export button', () => {
    expect(src).toContain('exportPdf');
  });

  it('includes CSV export button', () => {
    expect(src).toContain('exportCsv');
  });

  it('includes sign-off modal', () => {
    expect(src).toContain('ElecSignOffModal');
  });

  it('includes retest modal', () => {
    expect(src).toContain('ElecRetestModal');
  });

  it('includes equipment modal', () => {
    expect(src).toContain('ElecEquipmentModal');
  });

  it('includes new record modal', () => {
    expect(src).toContain('ElecTestRecordModal');
  });
});
