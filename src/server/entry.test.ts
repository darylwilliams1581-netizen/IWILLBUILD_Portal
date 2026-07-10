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

// ── Entry import (after mocks are hoisted) ─────────────────────────────────
import express from 'express';
import type { Server } from 'node:http';

import { renderSsrDocument, registerAdSenseTextRoutes } from './entry';

// ── Helpers ────────────────────────────────────────────────────────────────

const publisherId = 'ca-pub-1234567890123456';
const canonicalScript = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}" crossorigin="anonymous"></script>`;

async function withServer<T>(
  app: express.Express,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  let server: Server | null = null;
  try {
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP listener');
    }
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    if (server) {
      const listeningServer = server;
      await new Promise<void>((resolve, reject) => {
        listeningServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('entry AdSense text routes', () => {
  it('serves enabled ads.txt as text/plain with no-cache', async () => {
    const app = express();
    registerAdSenseTextRoutes(app, {
      publisherId: null,
      scriptHtml: '',
      adsTxt: 'google.com, pub-123, DIRECT, f08c47fec0942fa0',
      appAdsTxt: null,
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ads.txt`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(await response.text()).toBe('google.com, pub-123, DIRECT, f08c47fec0942fa0');
    });
  });

  it('serves enabled app-ads.txt as text/plain with no-cache', async () => {
    const app = express();
    registerAdSenseTextRoutes(app, {
      publisherId: null,
      scriptHtml: '',
      adsTxt: null,
      appAdsTxt: 'google.com, pub-456, DIRECT, f08c47fec0942fa0',
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/app-ads.txt`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(await response.text()).toBe('google.com, pub-456, DIRECT, f08c47fec0942fa0');
    });
  });

  it('returns 404 for disabled AdSense text routes', async () => {
    const app = express();
    registerAdSenseTextRoutes(app, {
      publisherId: null,
      scriptHtml: '',
      adsTxt: null,
      appAdsTxt: null,
    });

    await withServer(app, async (baseUrl) => {
      const adsTxt = await fetch(`${baseUrl}/ads.txt`);
      const appAdsTxt = await fetch(`${baseUrl}/app-ads.txt`);

      expect(adsTxt.status).toBe(404);
      expect(adsTxt.headers.get('content-type')).toContain('text/plain');
      expect(adsTxt.headers.get('cache-control')).toBe('no-cache');
      expect(appAdsTxt.status).toBe(404);
      expect(appAdsTxt.headers.get('content-type')).toContain('text/plain');
      expect(appAdsTxt.headers.get('cache-control')).toBe('no-cache');
    });
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
