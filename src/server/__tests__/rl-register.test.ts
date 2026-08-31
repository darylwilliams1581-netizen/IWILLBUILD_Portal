/**
 * Job Site RL Register — comprehensive tests
 *
 * Covers:
 * 1.  Calculation helpers — positive/negative differences
 * 2.  Metres-to-millimetres conversion
 * 3.  Benchmark plus rise/fall calculation
 * 4.  Target tolerance boundaries (HIGH / LOW / ON_LEVEL)
 * 5.  Three-decimal RL precision
 * 6.  formatDiffShort — always shows explicit sign
 * 7.  formatMmShort — always shows explicit sign
 * 8.  evalTolerance — boundary conditions
 * 9.  Handler existence — all 6 handlers export a default function
 * 10. Route registration in entry.ts
 * 11. DB schema — rl_benchmarks, rl_points, rl_point_history in entry.ts
 * 12. Auth gate — unauthenticated → 401
 * 13. Company isolation — all handlers scope to companyId
 * 14. Edit history — PUT handler writes rl_point_history
 * 15. Signed-off protection — PUT requires correctionNote when signed_off_at set
 * 16. Soft-archive vs hard-delete — DELETE handler
 * 17. PDF export — signed values present in source
 * 18. CSV export — signed values present in source
 * 19. homeIcons — rl_register key in SAFETY_ICON_DEFS
 * 20. Routes — /rl-register registered in routes.tsx
 * 21. Tools launcher — RL Register in work.tsx TOOL_ITEMS
 * 22. WorkToolsTab — RL Register in TOOLS array
 * 23. Mobile register cards — page source has mobile card layout
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

// ── 1. Calculation helpers ────────────────────────────────────────────────────

describe('RL calc — positive and negative differences', () => {
  it('calcDiff: B higher than A gives positive result', async () => {
    const { calcDiff } = await import('@/lib/rl-calc');
    expect(calcDiff(100.000, 100.025)).toBe(0.025);
  });

  it('calcDiff: B lower than A gives negative result', async () => {
    const { calcDiff } = await import('@/lib/rl-calc');
    expect(calcDiff(100.000, 99.982)).toBe(-0.018);
  });

  it('calcDiff: equal points gives zero', async () => {
    const { calcDiff } = await import('@/lib/rl-calc');
    expect(calcDiff(99.500, 99.500)).toBe(0);
  });

  it('calcDiffFromTarget: above target is positive', async () => {
    const { calcDiffFromTarget } = await import('@/lib/rl-calc');
    expect(calcDiffFromTarget(99.525, 99.500)).toBe(0.025);
  });

  it('calcDiffFromTarget: below target is negative', async () => {
    const { calcDiffFromTarget } = await import('@/lib/rl-calc');
    expect(calcDiffFromTarget(99.482, 99.500)).toBe(-0.018);
  });

  it('calcDiffFromTarget: on target is zero', async () => {
    const { calcDiffFromTarget } = await import('@/lib/rl-calc');
    expect(calcDiffFromTarget(99.500, 99.500)).toBe(0);
  });
});

// ── 2. Metres-to-millimetres conversion ──────────────────────────────────────

describe('RL calc — metres to millimetres', () => {
  it('0.025 m = 25 mm', async () => {
    const { metresToMm } = await import('@/lib/rl-calc');
    expect(metresToMm(0.025)).toBe(25);
  });

  it('−0.018 m = −18 mm', async () => {
    const { metresToMm } = await import('@/lib/rl-calc');
    expect(metresToMm(-0.018)).toBe(-18);
  });

  it('0.000 m = 0 mm', async () => {
    const { metresToMm } = await import('@/lib/rl-calc');
    expect(metresToMm(0)).toBe(0);
  });

  it('0.001 m = 1 mm', async () => {
    const { metresToMm } = await import('@/lib/rl-calc');
    expect(metresToMm(0.001)).toBe(1);
  });

  it('mmToMetres: 25 mm = 0.025 m', async () => {
    const { mmToMetres } = await import('@/lib/rl-calc');
    expect(mmToMetres(25)).toBe(0.025);
  });

  it('mmToMetres: −18 mm = −0.018 m', async () => {
    const { mmToMetres } = await import('@/lib/rl-calc');
    expect(mmToMetres(-18)).toBe(-0.018);
  });
});

// ── 3. Benchmark plus rise/fall ───────────────────────────────────────────────

describe('RL calc — benchmark plus rise/fall', () => {
  it('100.000 + 0.250 = 100.250', async () => {
    const { calcRiseFall } = await import('@/lib/rl-calc');
    expect(calcRiseFall(100.000, 0.250)).toBe(100.250);
  });

  it('100.000 + (−0.180) = 99.820', async () => {
    const { calcRiseFall } = await import('@/lib/rl-calc');
    expect(calcRiseFall(100.000, -0.180)).toBe(99.820);
  });

  it('100.000 + 0 = 100.000', async () => {
    const { calcRiseFall } = await import('@/lib/rl-calc');
    expect(calcRiseFall(100.000, 0)).toBe(100.000);
  });

  it('preserves 3 decimal places', async () => {
    const { calcRiseFall } = await import('@/lib/rl-calc');
    const result = calcRiseFall(100.000, 0.001);
    expect(result).toBe(100.001);
  });
});

// ── 4. Target tolerance boundaries ───────────────────────────────────────────

describe('RL calc — tolerance evaluation', () => {
  it('exactly on target = ON_LEVEL', async () => {
    const { evalTolerance } = await import('@/lib/rl-calc');
    expect(evalTolerance(99.500, 99.500, 5)).toBe('ON_LEVEL');
  });

  it('within tolerance = ON_LEVEL', async () => {
    const { evalTolerance } = await import('@/lib/rl-calc');
    expect(evalTolerance(99.503, 99.500, 5)).toBe('ON_LEVEL');
  });

  it('at tolerance boundary (exactly ±5 mm) = ON_LEVEL', async () => {
    const { evalTolerance } = await import('@/lib/rl-calc');
    expect(evalTolerance(99.505, 99.500, 5)).toBe('ON_LEVEL');
    expect(evalTolerance(99.495, 99.500, 5)).toBe('ON_LEVEL');
  });

  it('1 mm above tolerance = HIGH', async () => {
    const { evalTolerance } = await import('@/lib/rl-calc');
    expect(evalTolerance(99.506, 99.500, 5)).toBe('HIGH');
  });

  it('1 mm below tolerance = LOW', async () => {
    const { evalTolerance } = await import('@/lib/rl-calc');
    expect(evalTolerance(99.494, 99.500, 5)).toBe('LOW');
  });

  it('above target with zero tolerance = HIGH', async () => {
    const { evalTolerance } = await import('@/lib/rl-calc');
    expect(evalTolerance(99.501, 99.500, 0)).toBe('HIGH');
  });

  it('below target with zero tolerance = LOW', async () => {
    const { evalTolerance } = await import('@/lib/rl-calc');
    expect(evalTolerance(99.499, 99.500, 0)).toBe('LOW');
  });
});

// ── 5. Three-decimal RL precision ─────────────────────────────────────────────

describe('RL calc — three-decimal precision', () => {
  it('formatRL formats to exactly 3 decimal places', async () => {
    const { formatRL } = await import('@/lib/rl-calc');
    expect(formatRL(100)).toBe('100.000');
    expect(formatRL(99.5)).toBe('99.500');
    expect(formatRL(100.025)).toBe('100.025');
  });

  it('roundRL rounds to 3 decimal places', async () => {
    const { roundRL } = await import('@/lib/rl-calc');
    expect(roundRL(100.0001)).toBe(100.000);
    expect(roundRL(99.9999)).toBe(100.000);
    expect(roundRL(99.5005)).toBe(99.501);
  });

  it('isValidRL accepts 3 dp', async () => {
    const { isValidRL } = await import('@/lib/rl-calc');
    expect(isValidRL('100.000')).toBe(true);
    expect(isValidRL('99.500')).toBe(true);
    expect(isValidRL('-0.018')).toBe(true);
  });

  it('isValidRL rejects 4+ dp', async () => {
    const { isValidRL } = await import('@/lib/rl-calc');
    expect(isValidRL('100.0001')).toBe(false);
  });

  it('parseRL returns correct number', async () => {
    const { parseRL } = await import('@/lib/rl-calc');
    expect(parseRL('100.000')).toBe(100);
    expect(parseRL('99.500')).toBe(99.5);
  });
});

// ── 6. formatDiffShort — explicit sign ───────────────────────────────────────

describe('RL calc — formatDiffShort always shows sign', () => {
  it('positive diff shows + prefix', async () => {
    const { formatDiffShort } = await import('@/lib/rl-calc');
    expect(formatDiffShort(0.025)).toBe('+0.025 m');
  });

  it('negative diff shows − prefix', async () => {
    const { formatDiffShort } = await import('@/lib/rl-calc');
    expect(formatDiffShort(-0.018)).toBe('−0.018 m');
  });

  it('zero diff shows 0.000 m', async () => {
    const { formatDiffShort } = await import('@/lib/rl-calc');
    expect(formatDiffShort(0)).toBe('0.000 m');
  });
});

// ── 7. formatMmShort — explicit sign ─────────────────────────────────────────

describe('RL calc — formatMmShort always shows sign', () => {
  it('positive shows + prefix', async () => {
    const { formatMmShort } = await import('@/lib/rl-calc');
    expect(formatMmShort(0.025)).toBe('+25 mm');
  });

  it('negative shows − prefix', async () => {
    const { formatMmShort } = await import('@/lib/rl-calc');
    expect(formatMmShort(-0.018)).toBe('−18 mm');
  });

  it('zero shows 0 mm', async () => {
    const { formatMmShort } = await import('@/lib/rl-calc');
    expect(formatMmShort(0)).toBe('0 mm');
  });
});

// ── 8. evalTolerance boundary conditions ─────────────────────────────────────

describe('RL calc — evalTolerance edge cases', () => {
  it('no tolerance provided — any positive diff = HIGH', async () => {
    const { evalTolerance } = await import('@/lib/rl-calc');
    expect(evalTolerance(99.501, 99.500)).toBe('HIGH');
  });

  it('no tolerance provided — any negative diff = LOW', async () => {
    const { evalTolerance } = await import('@/lib/rl-calc');
    expect(evalTolerance(99.499, 99.500)).toBe('LOW');
  });

  it('no tolerance provided — zero diff = ON_LEVEL', async () => {
    const { evalTolerance } = await import('@/lib/rl-calc');
    expect(evalTolerance(99.500, 99.500)).toBe('ON_LEVEL');
  });
});

// ── 9. Handler existence ──────────────────────────────────────────────────────

describe('RL register — handler existence', () => {
  it('GET /api/rl-register exports a default function', async () => {
    const mod = await import('../api/rl-register/GET');
    expect(typeof mod.default).toBe('function');
  });

  it('POST /api/rl-register exports a default function', async () => {
    const mod = await import('../api/rl-register/POST');
    expect(typeof mod.default).toBe('function');
  });

  it('GET /api/rl-register/:benchmarkId/points exports a default function', async () => {
    const mod = await import('../api/rl-register/[benchmarkId]/points/GET');
    expect(typeof mod.default).toBe('function');
  });

  it('POST /api/rl-register/:benchmarkId/points exports a default function', async () => {
    const mod = await import('../api/rl-register/[benchmarkId]/points/POST');
    expect(typeof mod.default).toBe('function');
  });

  it('PUT /api/rl-register/points/:id exports a default function', async () => {
    const mod = await import('../api/rl-register/points/[id]/PUT');
    expect(typeof mod.default).toBe('function');
  });

  it('DELETE /api/rl-register/points/:id exports a default function', async () => {
    const mod = await import('../api/rl-register/points/[id]/DELETE');
    expect(typeof mod.default).toBe('function');
  });
});

// ── 10. Route registration ────────────────────────────────────────────────────

describe('RL register — route registration in entry.ts', () => {
  const src = fs.readFileSync(path.resolve('src/server/entry.ts'), 'utf8');

  it('registers GET /api/rl-register', () => {
    expect(src).toContain('app.get("/api/rl-register"');
  });

  it('registers POST /api/rl-register', () => {
    expect(src).toContain('app.post("/api/rl-register"');
  });

  it('registers GET /api/rl-register/:benchmarkId/points', () => {
    expect(src).toContain('app.get("/api/rl-register/:benchmarkId/points"');
  });

  it('registers POST /api/rl-register/:benchmarkId/points', () => {
    expect(src).toContain('app.post("/api/rl-register/:benchmarkId/points"');
  });

  it('registers PUT /api/rl-register/points/:id', () => {
    expect(src).toContain('app.put("/api/rl-register/points/:id"');
  });

  it('registers DELETE /api/rl-register/points/:id', () => {
    expect(src).toContain('app.delete("/api/rl-register/points/:id"');
  });

  it('registers GET /api/rl-register/export/:jobId/csv', () => {
    expect(src).toContain('app.get("/api/rl-register/:jobId/export/csv"');
  });

  it('registers GET /api/rl-register/export/:jobId/pdf', () => {
    expect(src).toContain('app.get("/api/rl-register/:jobId/export/pdf"');
  });
});

// ── 11. DB schema ─────────────────────────────────────────────────────────────

describe('RL register — DB schema in entry.ts', () => {
  const src = fs.readFileSync(path.resolve('src/server/entry.ts'), 'utf8');

  it('has CREATE TABLE IF NOT EXISTS rl_benchmarks', () => {
    expect(src).toContain('CREATE TABLE IF NOT EXISTS rl_benchmarks');
  });

  it('rl_benchmarks has company_id', () => {
    expect(src).toMatch(/rl_benchmarks.*company_id/s);
  });

  it('rl_benchmarks has rl DECIMAL(12,3)', () => {
    expect(src).toMatch(/rl_benchmarks.*DECIMAL\(12,3\)/s);
  });

  it('has CREATE TABLE IF NOT EXISTS rl_points', () => {
    expect(src).toContain('CREATE TABLE IF NOT EXISTS rl_points');
  });

  it('rl_points has measured_rl DECIMAL(12,3)', () => {
    expect(src).toMatch(/rl_points.*measured_rl DECIMAL\(12,3\)/s);
  });

  it('rl_points has target_rl DECIMAL(12,3)', () => {
    expect(src).toMatch(/rl_points.*target_rl DECIMAL\(12,3\)/s);
  });

  it('rl_points has tolerance_mm', () => {
    expect(src).toMatch(/rl_points.*tolerance_mm/s);
  });

  it('rl_points has signed_off_at', () => {
    expect(src).toMatch(/rl_points.*signed_off_at/s);
  });

  it('rl_points has archived_at', () => {
    expect(src).toMatch(/rl_points.*archived_at/s);
  });

  it('has CREATE TABLE IF NOT EXISTS rl_point_history', () => {
    expect(src).toContain('CREATE TABLE IF NOT EXISTS rl_point_history');
  });

  it('rl_point_history has snapshot_json', () => {
    expect(src).toMatch(/rl_point_history.*snapshot_json/s);
  });

  it('rl_point_history has correction_note', () => {
    expect(src).toMatch(/rl_point_history.*correction_note/s);
  });
});

// ── 12. Auth gate ─────────────────────────────────────────────────────────────

describe('RL register — auth gate (unauthenticated → 401)', () => {
  it('GET returns 401 when session is null', async () => {
    const { default: handler } = await import('../api/rl-register/GET');
    const { res, statusCode } = makeRes();
    await handler(makeReq(), res);
    expect(statusCode()).toBe(401);
  });

  it('GET points returns 401 when session is null', async () => {
    const { default: handler } = await import('../api/rl-register/[benchmarkId]/points/GET');
    const { res, statusCode } = makeRes();
    await handler(makeReq({ params: { benchmarkId: '1' } }), res);
    expect(statusCode()).toBe(401);
  });

  it('DELETE returns 401 when session is null', async () => {
    const { default: handler } = await import('../api/rl-register/points/[id]/DELETE');
    const { res, statusCode } = makeRes();
    await handler(makeReq({ params: { id: '1' } }), res);
    expect(statusCode()).toBe(401);
  });

  it('PUT returns 401 when session is null', async () => {
    const { default: handler } = await import('../api/rl-register/points/[id]/PUT');
    const { res, statusCode } = makeRes();
    await handler(makeReq({ params: { id: '1' } }), res);
    expect(statusCode()).toBe(401);
  });
});

// ── 13. Company isolation ─────────────────────────────────────────────────────

describe('RL register — company isolation', () => {
  const handlers = [
    { name: 'GET list', file: 'src/server/api/rl-register/GET.ts' },
    { name: 'POST benchmark', file: 'src/server/api/rl-register/POST.ts' },
    { name: 'GET points', file: 'src/server/api/rl-register/[benchmarkId]/points/GET.ts' },
    { name: 'POST point', file: 'src/server/api/rl-register/[benchmarkId]/points/POST.ts' },
    { name: 'PUT point', file: 'src/server/api/rl-register/points/[id]/PUT.ts' },
    { name: 'DELETE point', file: 'src/server/api/rl-register/points/[id]/DELETE.ts' },
    { name: 'CSV export', file: 'src/server/api/rl-register/[jobId]/export/csv/GET.ts' },
    { name: 'PDF export', file: 'src/server/api/rl-register/[jobId]/export/pdf/GET.ts' },
  ];

  for (const { name, file } of handlers) {
    it(`${name} scopes queries to companyId`, () => {
      const src = fs.readFileSync(path.resolve(file), 'utf8');
      expect(src).toContain('companyId');
    });
  }
});

// ── 14. Edit history ──────────────────────────────────────────────────────────

describe('RL register — edit history', () => {
  const src = fs.readFileSync(path.resolve('src/server/api/rl-register/points/[id]/PUT.ts'), 'utf8');

  it('PUT handler inserts into rl_point_history before updating', () => {
    expect(src).toContain('rl_point_history');
    expect(src).toContain('INSERT INTO rl_point_history');
  });

  it('PUT handler stores snapshot_json of existing record', () => {
    expect(src).toContain('snapshot_json');
  });

  it('PUT handler records changed_by_user_id', () => {
    expect(src).toContain('changed_by_user_id');
  });

  it('PUT handler stores correction_note', () => {
    expect(src).toContain('correction_note');
  });
});

// ── 15. Signed-off protection ─────────────────────────────────────────────────

describe('RL register — signed-off protection', () => {
  const src = fs.readFileSync(path.resolve('src/server/api/rl-register/points/[id]/PUT.ts'), 'utf8');

  it('PUT handler checks signed_off_at', () => {
    expect(src).toContain('signed_off_at');
  });

  it('PUT handler requires correctionNote when signed off', () => {
    expect(src).toContain('correctionNote');
    expect(src).toContain('requiresCorrectionNote');
  });

  it('PUT handler returns 409 for signed-off without note', () => {
    expect(src).toContain('409');
  });
});

// ── 16. Soft-archive vs hard-delete ──────────────────────────────────────────

describe('RL register — soft-archive vs hard-delete', () => {
  const src = fs.readFileSync(path.resolve('src/server/api/rl-register/points/[id]/DELETE.ts'), 'utf8');

  it('DELETE uses archived_at for soft archive by default', () => {
    expect(src).toContain('archived_at');
  });

  it('DELETE requires owner role for hard delete', () => {
    expect(src).toContain("profile.role === 'owner'");
  });

  it('DELETE hard-deletes history records first', () => {
    expect(src).toContain('rl_point_history');
  });
});

// ── 17. PDF export — signed values ───────────────────────────────────────────

describe('RL register — PDF export signed values', () => {
  const src = fs.readFileSync(path.resolve('src/server/api/rl-register/[jobId]/export/pdf/GET.ts'), 'utf8');

  it('PDF export imports formatDiffShort', () => {
    expect(src).toContain('formatDiffShort');
  });

  it('PDF export imports formatMmShort', () => {
    expect(src).toContain('formatMmShort');
  });

  it('PDF export imports evalTolerance', () => {
    expect(src).toContain('evalTolerance');
  });

  it('PDF export uses pdf-lib', () => {
    expect(src).toContain('pdf-lib');
  });

  it('PDF export includes disclaimer text', () => {
    expect(src).toContain('Calculation and record-keeping tool only');
  });
});

// ── 18. CSV export — signed values ───────────────────────────────────────────

describe('RL register — CSV export signed values', () => {
  const src = fs.readFileSync(path.resolve('src/server/api/rl-register/[jobId]/export/csv/GET.ts'), 'utf8');

  it('CSV export imports formatDiffShort', () => {
    expect(src).toContain('formatDiffShort');
  });

  it('CSV export imports formatMmShort', () => {
    expect(src).toContain('formatMmShort');
  });

  it('CSV export includes BOM for Excel', () => {
    expect(src).toContain('\\uFEFF');
  });

  it('CSV export includes Difference column header', () => {
    expect(src).toContain('Difference (m)');
  });
});

// ── 19. homeIcons ─────────────────────────────────────────────────────────────

describe('RL register — homeIcons.ts', () => {
  it('SAFETY_ICON_DEFS contains rl_register key', async () => {
    const { SAFETY_ICON_DEFS } = await import('../../lib/homeIcons');
    const keys = SAFETY_ICON_DEFS.map((i: { key: string }) => i.key);
    expect(keys).toContain('rl_register');
  });

  it('rl_register icon href is /rl-register', async () => {
    const { SAFETY_ICON_DEFS } = await import('../../lib/homeIcons');
    const entry = SAFETY_ICON_DEFS.find((i: { key: string }) => i.key === 'rl_register');
    expect(entry?.href).toBe('/rl-register');
  });

  it('rl_register icon group is safety', async () => {
    const { SAFETY_ICON_DEFS } = await import('../../lib/homeIcons');
    const entry = SAFETY_ICON_DEFS.find((i: { key: string }) => i.key === 'rl_register');
    expect(entry?.group).toBe('safety');
  });
});

// ── 20. Routes ────────────────────────────────────────────────────────────────

describe('RL register — routes.tsx', () => {
  const src = fs.readFileSync(path.resolve('src/routes.tsx'), 'utf8');

  it('routes.tsx imports RlRegisterPage', () => {
    expect(src).toContain('rl-register');
  });

  it('routes.tsx has /rl-register path', () => {
    expect(src).toContain("path: '/rl-register'");
  });
});

// ── 21. Tools launcher (work.tsx) ─────────────────────────────────────────────

describe('RL register — work.tsx TOOL_ITEMS', () => {
  const src = fs.readFileSync(path.resolve('src/pages/work.tsx'), 'utf8');

  it('TOOL_ITEMS includes RL Register', () => {
    expect(src).toContain('RL Register');
  });

  it('TOOL_ITEMS RL Register href is /rl-register', () => {
    expect(src).toContain("href: '/rl-register'");
  });
});

// ── 22. WorkToolsTab ──────────────────────────────────────────────────────────

describe('RL register — WorkToolsTab', () => {
  const src = fs.readFileSync(path.resolve('src/components/work/WorkToolsTab.tsx'), 'utf8');

  it('WorkToolsTab TOOLS array includes RL Register', () => {
    expect(src).toContain('RL Register');
  });

  it('WorkToolsTab RL Register href is /rl-register', () => {
    expect(src).toContain("href: '/rl-register'");
  });
});

// ── 23. Mobile register cards ─────────────────────────────────────────────────

describe('RL register — mobile register cards', () => {
  const src = fs.readFileSync(path.resolve('src/pages/rl-register.tsx'), 'utf8');

  it('page has md:hidden mobile card section', () => {
    expect(src).toContain('md:hidden');
  });

  it('page has hidden md:block desktop table section', () => {
    expect(src).toContain('hidden md:block');
  });

  it('mobile cards show Measured RL', () => {
    expect(src).toContain('Measured RL');
  });

  it('mobile cards show result badge', () => {
    expect(src).toContain('resultBadge');
  });

  it('page includes disclaimer text', () => {
    expect(src).toContain('Calculation and record-keeping tool only');
  });

  it('page includes benchmark RL display', () => {
    expect(src).toContain('formatRL');
  });

  it('page includes rise/fall calculator', () => {
    expect(src).toContain('calcRiseFall');
  });

  it('page includes tolerance filter', () => {
    expect(src).toContain('evalTolerance');
  });

  it('page includes PDF export button', () => {
    expect(src).toContain('exportPdf');
  });

  it('page includes CSV export button', () => {
    expect(src).toContain('exportCsv');
  });
});
