/**
 * entry.test.ts — AdSense text routes + SSR document rendering
 *
 * WHY THE vi.mock CALLS:
 * entry.ts statically imports ~200 API handler modules plus auth.ts and
 * several lib files. Every one of them imports src/server/db/client.ts,
 * which calls getDatabaseCredentials() at module-load time. That function
 * reads /local/config.json (a Nomad task-local file absent in test/local
 * environments) and throws before a single test assertion runs.
 *
 * Two-layer defence:
 *  1. vitest.config.ts resolve.alias — cross-platform regex rules redirect
 *     every resolved path ending in db/client(.ts|.js) and db/config(.ts|.js)
 *     to no-op stubs. Covers the common case on both POSIX and Windows.
 *  2. vi.mock() calls below — belt-and-braces for specifiers the alias regex
 *     might miss (e.g. the bare "./db/client.js" relative specifier used by
 *     entry.ts itself, or @/server/db/* alias forms).
 *
 * vi.mock() is hoisted by Vitest to before any imports execute, so these
 * mocks are in place before `./entry` is resolved.
 *
 * Production runtime is NOT affected — vi.mock() only runs inside Vitest.
 */

import { describe, expect, it, vi } from 'vitest';

// ── DB mocks (hoisted before ./entry import) ───────────────────────────────

// Relative specifier used by entry.ts itself: `import { db } from "./db/client.js"`
vi.mock('./db/client.js', async () => {
  return import('../test/stubs/db-client.stub');
});

// Alias form used by auth.ts and other lib files: `import { db } from "@/server/db/client"`
vi.mock('@/server/db/client', async () => {
  return import('../test/stubs/db-client.stub');
});

// Config module — belt-and-braces so getDatabaseCredentials() never hits the FS
vi.mock('./db/config', async () => {
  return import('../test/stubs/db-config.stub');
});

vi.mock('@/server/db/config', async () => {
  return import('../test/stubs/db-config.stub');
});

// po-auth — belt-and-braces for new Finance handlers
vi.mock('/app/src/server/lib/po-auth.ts', async () => {
  return import('../test/stubs/po-auth.stub');
});
vi.mock('/app/src/server/lib/po-auth.js', async () => {
  return import('../test/stubs/po-auth.stub');
});

// po-service — new shared service used by Finance handlers
vi.mock('/app/src/server/lib/po-service.ts', async () => {
  return import('../test/stubs/po-service.stub');
});
vi.mock('/app/src/server/lib/po-service.js', async () => {
  return import('../test/stubs/po-service.stub');
});

// purchase-order-pdf-document — new PDF builder
vi.mock('/app/src/server/lib/purchase-order-pdf-document.ts', async () => {
  return import('../test/stubs/purchase-order-pdf-document.stub');
});
vi.mock('/app/src/server/lib/purchase-order-pdf-document.js', async () => {
  return import('../test/stubs/purchase-order-pdf-document.stub');
});

// Finance PO handlers — stub the entire modules so entry.ts can import them
// without triggering the po-auth/po-service import chain
vi.mock('./api/finance/purchase-orders/GET', () => ({ default: async () => {} }));
vi.mock('./api/finance/purchase-orders/POST', () => ({ default: async () => {} }));
vi.mock('./api/finance/purchase-orders/[poId]/GET', () => ({ default: async () => {} }));
vi.mock('./api/finance/purchase-orders/[poId]/PUT', () => ({ default: async () => {} }));
vi.mock('./api/finance/purchase-orders/[poId]/DELETE', () => ({ default: async () => {} }));
vi.mock('./api/finance/purchase-orders/[poId]/pdf/GET', () => ({ default: async () => {} }));
vi.mock('./api/purchase-orders/[poId]/compose-defaults/GET', () => ({ default: async () => {} }));
vi.mock('./api/purchase-orders/[poId]/send-email/POST', () => ({ default: async () => {} }));
vi.mock('./api/finance/timesheets/GET', () => ({ default: async () => {} }));
vi.mock('./api/finance/timesheets/POST', () => ({ default: async () => {} }));
vi.mock('./api/finance/timesheets/me/GET', () => ({ default: async () => {} }));
vi.mock('./api/finance/timesheets/employees/GET', () => ({ default: async () => {} }));
vi.mock('./api/finance/timesheets/[id]/GET', () => ({ default: async () => {} }));
vi.mock('./api/finance/timesheets/[id]/PUT', () => ({ default: async () => {} }));
vi.mock('./api/finance/timesheets/[id]/DELETE', () => ({ default: async () => {} }));
vi.mock('./lib/timesheet-service.ts', () => ({
  ensureTimesheetSchema: async () => {},
  listTimesheets: async () => ({ timesheets: [], hasMore: false, nextCursor: null, counts: {} }),
  getTimesheet: async () => null,
  createTimesheet: async () => ({ ok: true, data: { id: 1 } }),
  updateTimesheet: async () => ({ ok: true, data: { id: 1 } }),
  transitionTimesheet: async () => ({ ok: true, data: { id: 1, status: 'submitted' } }),
  deleteTimesheet: async () => ({ ok: true, data: { id: 1 } }),
}));
vi.mock('./lib/timesheet-service.js', () => ({
  ensureTimesheetSchema: async () => {},
  listTimesheets: async () => ({ timesheets: [], hasMore: false, nextCursor: null, counts: {} }),
  getTimesheet: async () => null,
  createTimesheet: async () => ({ ok: true, data: { id: 1 } }),
  updateTimesheet: async () => ({ ok: true, data: { id: 1 } }),
  transitionTimesheet: async () => ({ ok: true, data: { id: 1, status: 'submitted' } }),
  deleteTimesheet: async () => ({ ok: true, data: { id: 1 } }),
}));

// ── Entry import (after mocks are hoisted) ─────────────────────────────────
import type { Request, Response } from 'express';

import { renderSsrDocument, registerAdSenseTextRoutes } from './entry';

// ── Helpers ────────────────────────────────────────────────────────────────

const publisherId = 'ca-pub-1234567890123456';
const canonicalScript = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}" crossorigin="anonymous"></script>`;

/**
 * Minimal chainable Express res stand-in — same pattern as llms-txt.test.ts.
 * Records status, content-type, cache-control header, and body so we can
 * assert on them without spinning up a real TCP server (which is blocked in
 * the sandbox environment).
 */
function mockRes() {
  const calls: {
    status?: number;
    contentType?: string;
    cacheControl?: string;
    body?: string;
  } = {};
  const res = {
    status(code: number) { calls.status = code; return res; },
    type(t: string)      { calls.contentType = t; return res; },
    set(key: string, value: string) {
      if (key === 'Cache-Control') calls.cacheControl = value;
      return res;
    },
    send(body: string)   { calls.body = body; return res; },
  };
  return { res: res as unknown as Response, calls };
}

/**
 * Capture the route handlers registered by registerAdSenseTextRoutes without
 * a real Express app. Returns a map of path → handler function so tests can
 * invoke handlers directly.
 */
function captureHandlers(config: Parameters<typeof registerAdSenseTextRoutes>[1]) {
  const handlers: Record<string, (req: Request, res: Response) => void> = {};
  const fakeApp = {
    get(path: string, handler: (req: Request, res: Response) => void) {
      handlers[path] = handler;
    },
  };
  registerAdSenseTextRoutes(fakeApp as never, config);
  return handlers;
}

const fakeReq = {} as Request;

// ── Tests ──────────────────────────────────────────────────────────────────

describe('entry AdSense text routes', () => {
  it('serves enabled ads.txt as text/plain with no-cache', () => {
    const handlers = captureHandlers({
      publisherId: null,
      scriptHtml: '',
      adsTxt: 'google.com, pub-123, DIRECT, f08c47fec0942fa0',
      appAdsTxt: null,
    });
    const { res, calls } = mockRes();
    handlers['/ads.txt'](fakeReq, res);

    expect(calls.status).toBeUndefined(); // 200 — no explicit status call
    expect(calls.contentType).toContain('text/plain');
    expect(calls.cacheControl).toBe('no-cache');
    expect(calls.body).toBe('google.com, pub-123, DIRECT, f08c47fec0942fa0');
  });

  it('serves enabled app-ads.txt as text/plain with no-cache', () => {
    const handlers = captureHandlers({
      publisherId: null,
      scriptHtml: '',
      adsTxt: null,
      appAdsTxt: 'google.com, pub-456, DIRECT, f08c47fec0942fa0',
    });
    const { res, calls } = mockRes();
    handlers['/app-ads.txt'](fakeReq, res);

    expect(calls.status).toBeUndefined();
    expect(calls.contentType).toContain('text/plain');
    expect(calls.cacheControl).toBe('no-cache');
    expect(calls.body).toBe('google.com, pub-456, DIRECT, f08c47fec0942fa0');
  });

  it('returns 404 for disabled AdSense text routes', () => {
    const handlers = captureHandlers({
      publisherId: null,
      scriptHtml: '',
      adsTxt: null,
      appAdsTxt: null,
    });

    const { res: resAds, calls: callsAds } = mockRes();
    handlers['/ads.txt'](fakeReq, resAds);
    expect(callsAds.status).toBe(404);
    expect(callsAds.contentType).toContain('text/plain');
    expect(callsAds.cacheControl).toBe('no-cache');

    const { res: resApp, calls: callsApp } = mockRes();
    handlers['/app-ads.txt'](fakeReq, resApp);
    expect(callsApp.status).toBe(404);
    expect(callsApp.contentType).toContain('text/plain');
    expect(callsApp.cacheControl).toBe('no-cache');
  });
});

describe('entry SSR rendering', () => {
  it('appends the canonical AdSense script to existing head output', () => {
    const html = renderSsrDocument(
      '<html><head><!--app-head--></head><body><!--app-html--></body></html>',
      {
        head: '<title>Generated Site</title>',
        html: '<main>Rendered app</main>',
      },
      {
        scriptHtml: canonicalScript,
      },
    );

    expect(html).toContain(`<title>Generated Site</title>\n${canonicalScript}`);
    expect(html).toContain('<main>Rendered app</main>');
    expect(html).not.toContain('<!--app-head-->');
    expect(html).not.toContain('<!--app-html-->');
  });

  it('keeps SSR head output unchanged when AdSense script output is disabled', () => {
    const html = renderSsrDocument(
      '<html><head><!--app-head--></head><body><!--app-html--></body></html>',
      {
        head: '<title>Generated Site</title>',
        html: '<main>Rendered app</main>',
      },
      {
        scriptHtml: '',
      },
    );

    expect(html).toContain('<title>Generated Site</title>');
    expect(html).not.toContain('pagead2.googlesyndication.com');
    expect(html).toContain('<main>Rendered app</main>');
  });
});
