/**
 * @vitest-environment jsdom
 *
 * ImageSafeguardTabUX.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B5-UX — Focused tests for the three UX changes made in CP12B5-UX:
 *
 *   1. Revised "not configured" message (replaces outdated Python-worker text)
 *   2. Disabled CSV placeholder button shown when no completed scan exists
 *   3. Helper text always shown alongside the CSV area
 *
 * Test IDs: ISG-UX-01 through ISG-UX-12
 *
 * ISG-UX-01  Not-configured message contains the exact required text
 * ISG-UX-02  Not-configured message does NOT contain the old Python-worker text
 * ISG-UX-03  Not-configured message does NOT contain "glibc"
 * ISG-UX-04  Not-configured message is absent when scanner IS configured
 * ISG-UX-05  Disabled CSV placeholder is shown when no completed run exists
 * ISG-UX-06  Disabled CSV placeholder has aria-disabled="true"
 * ISG-UX-07  Disabled CSV placeholder is not shown when a completed run exists
 * ISG-UX-08  Active CSV download button is shown when a completed run exists
 * ISG-UX-09  Helper text is shown when no completed run exists
 * ISG-UX-10  Helper text is shown when a completed run exists
 * ISG-UX-11  Helper text contains the correct browser-download sentence
 * ISG-UX-12  Run Scan button remains disabled when configured=false
 *
 * All tests use mocked fetch — no real network, no R2, no DB.
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Shared fetch mock ─────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ── Stub URL helpers (needed for the download path in CsvDownloadButton) ──────

global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// ── console.error spy — catches any "not wrapped in act" warnings ─────────────

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// ── Data builders ─────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<{
  id: string;
  runStatus: string;
  rangeStart: string;
  rangeEnd: string;
  usedCursor: boolean;
  imagesConsidered: number;
  imagesScanned: number;
  imagesSkipped: number;
  imagesWithSignal: number;
  imagesFailed: number;
  detectorName: string | null;
  detectorVersion: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  errorCode: string | null;
}> = {}) {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    runStatus: 'completed',
    rangeStart: '2026-08-25T00:00:00.000Z',
    rangeEnd:   '2026-09-01T00:00:00.000Z',
    usedCursor: false,
    imagesConsidered: 10,
    imagesScanned: 8,
    imagesSkipped: 2,
    imagesWithSignal: 1,
    imagesFailed: 0,
    detectorName: 'cloudflare-workers-ai',
    detectorVersion: '1.0',
    startedAt: '2026-09-01T08:00:00.000Z',
    finishedAt: '2026-09-01T08:01:00.000Z',
    createdAt: '2026-09-01T08:00:00.000Z',
    errorCode: null,
    ...overrides,
  };
}

function makeStatus(overrides: Partial<{
  configured: boolean;
  provider: string | null;
  capability: string;
  lastSuccessfulScanAt: string | null;
  lastRun: ReturnType<typeof makeRun> | null;
  counts: Record<string, number>;
  maxBatchSize: number;
}> = {}) {
  return {
    configured: false,
    provider: null,
    capability: 'face_detection',
    lastSuccessfulScanAt: null,
    lastRun: null,
    counts: {
      pending: 0, clear: 0, privacySignal: 0,
      elevated: 0, blocked: 0, unavailable: 0, failed: 0,
    },
    maxBatchSize: 50,
    ...overrides,
  };
}

/**
 * Wire up fetch for the three endpoints the component calls on mount.
 * The export endpoint is not needed for these UX tests.
 */
function setupFetchMocks(
  statusPayload: ReturnType<typeof makeStatus>,
  runsPayload: ReturnType<typeof makeRun>[],
) {
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/status')) {
      return Promise.resolve({ ok: true, json: async () => statusPayload });
    }
    if (typeof url === 'string' && url.includes('/runs?')) {
      return Promise.resolve({ ok: true, json: async () => ({ runs: runsPayload }) });
    }
    if (typeof url === 'string' && url.includes('/findings')) {
      return Promise.resolve({ ok: true, json: async () => ({ findings: [] }) });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  });
}

// ── Lazy component import (after mocks are in place) ─────────────────────────

async function getComponent() {
  const mod = await import('../ImageSafeguardTab');
  return mod.default;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Render the component and wait for the initial fetch to settle. */
async function renderAndSettle(
  statusPayload: ReturnType<typeof makeStatus>,
  runsPayload: ReturnType<typeof makeRun>[] = [],
) {
  setupFetchMocks(statusPayload, runsPayload);
  const ImageSafeguardTab = await getComponent();
  await act(async () => { render(<ImageSafeguardTab />); });
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
}

// ── ISG-UX-01: Revised not-configured message — exact required text ───────────

describe('ISG-UX-01: Not-configured message contains the exact required text', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the "not active yet" sentence', async () => {
    await renderAndSettle(makeStatus({ configured: false }));
    const el = screen.getByTestId('scan-not-configured-message');
    expect(el.textContent).toContain('Image scanning is not active yet.');
  });

  it('shows the acknowledgements/manual-review sentence', async () => {
    await renderAndSettle(makeStatus({ configured: false }));
    const el = screen.getByTestId('scan-not-configured-message');
    expect(el.textContent).toContain(
      'Image Safeguard acknowledgements and manual review controls remain available',
    );
  });

  it('shows the "no automated image assessment" sentence', async () => {
    await renderAndSettle(makeStatus({ configured: false }));
    const el = screen.getByTestId('scan-not-configured-message');
    expect(el.textContent).toContain(
      'no automated image assessment has been performed',
    );
  });

  it('shows the synthetic-image test sentence', async () => {
    await renderAndSettle(makeStatus({ configured: false }));
    const el = screen.getByTestId('scan-not-configured-message');
    expect(el.textContent).toContain(
      'A private authenticated classifier service must pass the synthetic-image test before scanning can be enabled.',
    );
  });
});

// ── ISG-UX-02: Old Python-worker text is gone ─────────────────────────────────

describe('ISG-UX-02: Not-configured message does NOT contain the old Python-worker text', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not mention "Python worker"', async () => {
    await renderAndSettle(makeStatus({ configured: false }));
    const el = screen.getByTestId('scan-not-configured-message');
    expect(el.textContent).not.toContain('Python worker');
  });

  it('does not mention "Python"', async () => {
    await renderAndSettle(makeStatus({ configured: false }));
    const el = screen.getByTestId('scan-not-configured-message');
    expect(el.textContent).not.toContain('Python');
  });
});

// ── ISG-UX-03: "glibc" is gone ───────────────────────────────────────────────

describe('ISG-UX-03: Not-configured message does NOT contain "glibc"', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not mention glibc', async () => {
    await renderAndSettle(makeStatus({ configured: false }));
    const el = screen.getByTestId('scan-not-configured-message');
    expect(el.textContent).not.toContain('glibc');
  });
});

// ── ISG-UX-04: Message absent when configured ─────────────────────────────────

describe('ISG-UX-04: Not-configured message is absent when scanner IS configured', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not render the not-configured message when configured=true', async () => {
    await renderAndSettle(makeStatus({ configured: true, provider: 'cloudflare-workers-ai' }));
    expect(screen.queryByTestId('scan-not-configured-message')).toBeNull();
  });
});

// ── ISG-UX-05: Disabled CSV placeholder shown when no completed run ───────────

describe('ISG-UX-05: Disabled CSV placeholder is shown when no completed run exists', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the placeholder button when recentRuns is empty', async () => {
    await renderAndSettle(makeStatus(), []);
    const placeholder = screen.getByTestId('csv-download-placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder.textContent).toContain('Download CSV');
    expect(placeholder.textContent).toContain('available after a scan completes');
  });

  it('renders the placeholder when all runs are non-completed', async () => {
    const runs = [
      makeRun({ id: 'run1run1-run1-run1-run1-run1run1run1', runStatus: 'failed' }),
      makeRun({ id: 'run2run2-run2-run2-run2-run2run2run2', runStatus: 'running' }),
    ];
    await renderAndSettle(makeStatus(), runs);
    expect(screen.getByTestId('csv-download-placeholder')).toBeTruthy();
  });

  it.each(['running', 'failed', 'pending', 'cancelled'] as const)(
    'renders the placeholder when only a %s run exists',
    async (runStatus) => {
      const runs = [makeRun({ id: 'run1run1-run1-run1-run1-run1run1run1', runStatus })];
      await renderAndSettle(makeStatus(), runs);
      expect(screen.getByTestId('csv-download-placeholder')).toBeTruthy();
    },
  );
});

// ── ISG-UX-06: Placeholder has aria-disabled="true" ──────────────────────────

describe('ISG-UX-06: Disabled CSV placeholder has aria-disabled="true"', () => {
  beforeEach(() => vi.clearAllMocks());

  it('placeholder button is disabled', async () => {
    await renderAndSettle(makeStatus(), []);
    const placeholder = screen.getByTestId('csv-download-placeholder');
    expect(placeholder).toBeDisabled();
  });

  it('placeholder button has aria-disabled="true"', async () => {
    await renderAndSettle(makeStatus(), []);
    const placeholder = screen.getByTestId('csv-download-placeholder');
    expect(placeholder.getAttribute('aria-disabled')).toBe('true');
  });
});

// ── ISG-UX-07: Placeholder NOT shown when a completed run exists ──────────────

describe('ISG-UX-07: Disabled CSV placeholder is not shown when a completed run exists', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not render the placeholder when a completed run exists', async () => {
    await renderAndSettle(makeStatus({ configured: true }), [makeRun()]);
    expect(screen.queryByTestId('csv-download-placeholder')).toBeNull();
  });
});

// ── ISG-UX-08: Active download button shown when completed run exists ─────────

describe('ISG-UX-08: Active CSV download button is shown when a completed run exists', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the active header download button when a completed run exists', async () => {
    await renderAndSettle(makeStatus({ configured: true }), [makeRun()]);
    const btn = screen.getByTestId('csv-download-header');
    expect(btn).toBeTruthy();
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toContain('Download latest CSV');
  });
});

// ── ISG-UX-09: Helper text shown when no completed run ───────────────────────

describe('ISG-UX-09: Helper text is shown when no completed run exists', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the helper text element when recentRuns is empty', async () => {
    await renderAndSettle(makeStatus(), []);
    expect(screen.getByTestId('csv-helper-text')).toBeTruthy();
  });

  it('renders the helper text when all runs are non-completed', async () => {
    const runs = [makeRun({ id: 'run1run1-run1-run1-run1-run1run1run1', runStatus: 'failed' })];
    await renderAndSettle(makeStatus(), runs);
    expect(screen.getByTestId('csv-helper-text')).toBeTruthy();
  });
});

// ── ISG-UX-10: Helper text shown when a completed run exists ─────────────────

describe('ISG-UX-10: Helper text is shown when a completed run exists', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the helper text element alongside the active download button', async () => {
    await renderAndSettle(makeStatus({ configured: true }), [makeRun()]);
    expect(screen.getByTestId('csv-helper-text')).toBeTruthy();
  });
});

// ── ISG-UX-11: Helper text content ───────────────────────────────────────────

describe('ISG-UX-11: Helper text contains the correct sentences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('contains the browser-download sentence (no completed run)', async () => {
    await renderAndSettle(makeStatus(), []);
    const el = screen.getByTestId('csv-helper-text');
    expect(el.textContent).toContain(
      'Completed CSV reports download through your browser.',
    );
  });

  it('contains the findings sentence (no completed run)', async () => {
    await renderAndSettle(makeStatus(), []);
    const el = screen.getByTestId('csv-helper-text');
    expect(el.textContent).toContain(
      'Flagged images appear under Findings for review.',
    );
  });

  it('contains the browser-download sentence (completed run present)', async () => {
    await renderAndSettle(makeStatus({ configured: true }), [makeRun()]);
    const el = screen.getByTestId('csv-helper-text');
    expect(el.textContent).toContain(
      'Completed CSV reports download through your browser.',
    );
  });

  it('contains the findings sentence (completed run present)', async () => {
    await renderAndSettle(makeStatus({ configured: true }), [makeRun()]);
    const el = screen.getByTestId('csv-helper-text');
    expect(el.textContent).toContain(
      'Flagged images appear under Findings for review.',
    );
  });
});

// ── ISG-UX-12: Run Scan button disabled when configured=false ────────────────

describe('ISG-UX-12: Run Scan button remains disabled when configured=false', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Run Image Safeguard Scan button is disabled when configured=false', async () => {
    await renderAndSettle(makeStatus({ configured: false }));
    const btn = screen.getByRole('button', { name: /Run Image Safeguard Scan/i });
    expect(btn).toBeDisabled();
  });

  it('Run Image Safeguard Scan button has aria-disabled when configured=false', async () => {
    await renderAndSettle(makeStatus({ configured: false }));
    const btn = screen.getByRole('button', { name: /Run Image Safeguard Scan/i });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });

  it('Run Image Safeguard Scan button is NOT disabled when configured=true', async () => {
    await renderAndSettle(makeStatus({ configured: true, provider: 'cloudflare-workers-ai' }));
    const btn = screen.getByRole('button', { name: /Run Image Safeguard Scan/i });
    expect(btn).not.toBeDisabled();
  });
});
