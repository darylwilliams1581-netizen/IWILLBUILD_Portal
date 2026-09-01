/**
 * @vitest-environment jsdom
 *
 * ImageSafeguardTabCSV.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B5-UI — Focused tests for the CSV download controls added to
 * ImageSafeguardTab in CP12B5-UI.
 *
 * Test IDs: ISG-UI-01 through ISG-UI-14
 *
 * ISG-UI-01  Header CSV button absent when no completed run exists
 * ISG-UI-02  Header CSV button present when a completed run exists
 * ISG-UI-03  Header CSV button has correct accessible label
 * ISG-UI-04  Header CSV button is not shown for running/failed/pending runs
 * ISG-UI-05  Per-row CSV button absent for non-completed runs
 * ISG-UI-06  Per-row CSV button present for completed runs
 * ISG-UI-07  Per-row CSV button has correct accessible label
 * ISG-UI-08  Clicking header CSV button triggers fetch to correct endpoint
 * ISG-UI-09  Clicking row CSV button triggers fetch to correct endpoint
 * ISG-UI-10  Button is disabled and aria-busy during download
 * ISG-UI-11  Duplicate click while in-flight is ignored
 * ISG-UI-12  HTTP error response shows inline error message with role=alert
 * ISG-UI-13  Network error shows inline error message with role=alert
 * ISG-UI-14  Successful download resets button to idle (no error shown)
 *
 * All tests use mocked fetch — no real network, no R2, no DB.
 *
 * act() discipline (ISG-UI-10, ISG-UI-11):
 *   Controlled pending promises are resolved inside `await act(async () => { … })`
 *   so every resulting React state update is flushed before the test ends.
 *   A console.error spy is installed for the whole file; ISG-UI-10 and ISG-UI-11
 *   assert it was never called with a "not wrapped in act" message.
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Shared fetch mock ─────────────────────────────────────────────────────────

// We stub global.fetch before importing the component so the component's
// useEffect calls resolve immediately without hitting a real server.

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ── Stub URL.createObjectURL / revokeObjectURL ────────────────────────────────
// jsdom does not implement these; we need them for the download path.

global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// ── console.error spy ─────────────────────────────────────────────────────────
// Installed globally so every test in this file can assert that no
// "not wrapped in act" warning was emitted.  The spy is reset before each test
// and restored after each test so it does not bleed into other test files.

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A minimal completed ScanRunRecord shape. */
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
    rangeEnd: '2026-09-01T00:00:00.000Z',
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

/** Minimal SafeguardStatus shape. */
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
    configured: true,
    provider: 'cloudflare-workers-ai',
    capability: 'face_detection',
    lastSuccessfulScanAt: '2026-09-01T08:01:00.000Z',
    lastRun: makeRun(),
    counts: {
      pending: 0, clear: 5, privacySignal: 1,
      elevated: 0, blocked: 0, unavailable: 0, failed: 0,
    },
    maxBatchSize: 50,
    ...overrides,
  };
}

/**
 * Set up fetch to return:
 *  - status endpoint → statusPayload
 *  - runs endpoint   → { runs: runsPayload }
 *  - findings endpoint → { findings: [] }
 *  - export endpoint → exportResponse (optional, defaults to a successful CSV blob)
 */
function setupFetchMocks(
  statusPayload: ReturnType<typeof makeStatus>,
  runsPayload: ReturnType<typeof makeRun>[],
  exportResponse?: { ok: boolean; status?: number; body?: Blob; headers?: Record<string, string>; jsonBody?: object },
) {
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/status')) {
      return Promise.resolve({
        ok: true,
        json: async () => statusPayload,
      });
    }
    if (typeof url === 'string' && url.includes('/runs?')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ runs: runsPayload }),
      });
    }
    if (typeof url === 'string' && url.includes('/findings')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ findings: [] }),
      });
    }
    if (typeof url === 'string' && url.includes('/export.csv')) {
      const exp = exportResponse ?? {
        ok: true,
        status: 200,
        body: new Blob(['\uFEFFrun_id,finding_id\n'], { type: 'text/csv' }),
        headers: { 'Content-Disposition': 'attachment; filename="safeguard-run-aaaaaaaa.csv"' },
      };
      if (exp.ok) {
        return Promise.resolve({
          ok: true,
          status: exp.status ?? 200,
          blob: async () => exp.body ?? new Blob([]),
          headers: {
            get: (h: string) => (exp.headers ?? {})[h] ?? null,
          },
        });
      } else {
        return Promise.resolve({
          ok: false,
          status: exp.status ?? 500,
          json: async () => exp.jsonBody ?? { error: 'export_failed' },
          headers: { get: () => null },
        });
      }
    }
    // Default: 404
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  });
}

// ── Import component (after mocks) ────────────────────────────────────────────

// Dynamic import so vi.mock hoisting takes effect before the module loads.
async function getComponent() {
  const mod = await import('../ImageSafeguardTab');
  return mod.default;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ISG-UI-01: Header CSV button absent when no completed run exists', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not render the header download button when recentRuns is empty', async () => {
    setupFetchMocks(makeStatus({ lastRun: null }), []);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    expect(screen.queryByTestId('csv-download-header')).toBeNull();
  });

  it('does not render the header download button when all runs are non-completed', async () => {
    const runs = [
      makeRun({ id: 'run1run1-run1-run1-run1-run1run1run1', runStatus: 'running' }),
      makeRun({ id: 'run2run2-run2-run2-run2-run2run2run2', runStatus: 'failed' }),
    ];
    setupFetchMocks(makeStatus(), runs);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    expect(screen.queryByTestId('csv-download-header')).toBeNull();
  });
});

describe('ISG-UI-02: Header CSV button present when a completed run exists', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the header download button when at least one completed run exists', async () => {
    const runs = [makeRun()];
    setupFetchMocks(makeStatus(), runs);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    expect(screen.getByTestId('csv-download-header')).toBeTruthy();
    expect(screen.getByTestId('csv-download-header').textContent).toContain('Download latest CSV');
  });

  it('uses the first completed run when mixed statuses are present', async () => {
    const completedId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const runs = [
      makeRun({ id: 'run1run1-run1-run1-run1-run1run1run1', runStatus: 'failed' }),
      makeRun({ id: completedId, runStatus: 'completed' }),
    ];
    setupFetchMocks(makeStatus(), runs);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    // The header button should exist (completed run found)
    expect(screen.getByTestId('csv-download-header')).toBeTruthy();
  });
});

describe('ISG-UI-03: Header CSV button has correct accessible label', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aria-label contains the run ID prefix', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    setupFetchMocks(makeStatus(), [makeRun({ id: runId })]);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const btn = screen.getByTestId('csv-download-header');
    const label = btn.getAttribute('aria-label') ?? '';
    expect(label).toContain('aaaaaaaa');
  });
});

describe('ISG-UI-04: Header CSV button not shown for running/failed/pending runs only', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['running', 'failed', 'pending', 'cancelled'] as const)(
    'no header button when only a %s run exists',
    async (status) => {
      const runs = [makeRun({ id: 'run1run1-run1-run1-run1-run1run1run1', runStatus: status })];
      setupFetchMocks(makeStatus(), runs);
      const ImageSafeguardTab = await getComponent();

      await act(async () => { render(<ImageSafeguardTab />); });
      await waitFor(() => expect(mockFetch).toHaveBeenCalled());

      expect(screen.queryByTestId('csv-download-header')).toBeNull();
    },
  );
});

describe('ISG-UI-05: Per-row CSV button absent for non-completed runs', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['running', 'failed', 'pending', 'cancelled'] as const)(
    'no row button for %s run',
    async (runStatus) => {
      const runId = 'run1run1-run1-run1-run1-run1run1run1';
      const runs = [makeRun({ id: runId, runStatus })];
      setupFetchMocks(makeStatus(), runs);
      const ImageSafeguardTab = await getComponent();

      await act(async () => { render(<ImageSafeguardTab />); });
      await waitFor(() => expect(mockFetch).toHaveBeenCalled());

      // Open the runs panel
      const runsToggle = screen.getByRole('button', { name: /recent scan runs/i });
      await userEvent.click(runsToggle);

      expect(screen.queryByTestId(`csv-download-run-${runId}`)).toBeNull();
    },
  );
});

describe('ISG-UI-06: Per-row CSV button present for completed runs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a row download button for a completed run', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    setupFetchMocks(makeStatus(), [makeRun({ id: runId, runStatus: 'completed' })]);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const runsToggle = screen.getByRole('button', { name: /recent scan runs/i });
    await userEvent.click(runsToggle);

    const btn = screen.getByTestId(`csv-download-run-${runId}`);
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain('Download CSV');
  });

  it('renders row buttons only for completed runs in a mixed list', async () => {
    const completedId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const failedId    = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const runs = [
      makeRun({ id: completedId, runStatus: 'completed' }),
      makeRun({ id: failedId,    runStatus: 'failed' }),
    ];
    setupFetchMocks(makeStatus(), runs);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const runsToggle = screen.getByRole('button', { name: /recent scan runs/i });
    await userEvent.click(runsToggle);

    expect(screen.getByTestId(`csv-download-run-${completedId}`)).toBeTruthy();
    expect(screen.queryByTestId(`csv-download-run-${failedId}`)).toBeNull();
  });
});

describe('ISG-UI-07: Per-row CSV button has correct accessible label', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aria-label contains the run ID prefix', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    setupFetchMocks(makeStatus(), [makeRun({ id: runId })]);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const runsToggle = screen.getByRole('button', { name: /recent scan runs/i });
    await userEvent.click(runsToggle);

    const btn = screen.getByTestId(`csv-download-run-${runId}`);
    const label = btn.getAttribute('aria-label') ?? '';
    expect(label).toContain('aaaaaaaa');
  });
});

describe('ISG-UI-08: Clicking header CSV button triggers fetch to correct endpoint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the export.csv endpoint with the correct run ID', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    setupFetchMocks(makeStatus(), [makeRun({ id: runId })]);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const btn = screen.getByTestId('csv-download-header');
    await userEvent.click(btn);

    await waitFor(() => {
      const exportCall = (mockFetch.mock.calls as unknown[][]).find(
        (args) => typeof args[0] === 'string' && (args[0] as string).includes('/export.csv'),
      );
      expect(exportCall).toBeTruthy();
      expect(exportCall![0]).toContain(`/runs/${runId}/export.csv`);
    });
  });

  it('passes credentials: include to the export fetch', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    setupFetchMocks(makeStatus(), [makeRun({ id: runId })]);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    await userEvent.click(screen.getByTestId('csv-download-header'));

    await waitFor(() => {
      const exportCall = (mockFetch.mock.calls as unknown[][]).find(
        (args) => typeof args[0] === 'string' && (args[0] as string).includes('/export.csv'),
      );
      expect(exportCall).toBeTruthy();
      expect((exportCall![1] as RequestInit).credentials).toBe('include');
    });
  });
});

describe('ISG-UI-09: Clicking row CSV button triggers fetch to correct endpoint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the export.csv endpoint with the correct run ID', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    setupFetchMocks(makeStatus(), [makeRun({ id: runId })]);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const runsToggle = screen.getByRole('button', { name: /recent scan runs/i });
    await userEvent.click(runsToggle);

    const btn = screen.getByTestId(`csv-download-run-${runId}`);
    await userEvent.click(btn);

    await waitFor(() => {
      const exportCall = (mockFetch.mock.calls as unknown[][]).find(
        (args) => typeof args[0] === 'string' && (args[0] as string).includes('/export.csv'),
      );
      expect(exportCall).toBeTruthy();
      expect(exportCall![0]).toContain(`/runs/${runId}/export.csv`);
    });
  });
});

describe('ISG-UI-10: Button is disabled and aria-busy during download', () => {
  beforeEach(() => vi.clearAllMocks());

  it('header button is disabled while fetch is in flight', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    // resolveExport is called inside act() later so the resulting state
    // update (setState('error')) is flushed before the test ends.
    let resolveExport!: (v: unknown) => void;
    const hangingExport = new Promise(r => { resolveExport = r; });

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/export.csv')) return hangingExport;
      if (typeof url === 'string' && url.includes('/status')) {
        return Promise.resolve({ ok: true, json: async () => makeStatus() });
      }
      if (typeof url === 'string' && url.includes('/runs?')) {
        return Promise.resolve({ ok: true, json: async () => ({ runs: [makeRun({ id: runId })] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ findings: [] }) });
    });

    const ImageSafeguardTab = await getComponent();
    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const btn = screen.getByTestId('csv-download-header');

    // Click starts the download; userEvent wraps the click in act internally.
    await userEvent.click(btn);

    // ── Assert in-flight state ────────────────────────────────────────────────
    // The button must be disabled and aria-busy while the promise is pending.
    await waitFor(() => {
      expect(btn).toBeDisabled();
      expect(btn.getAttribute('aria-busy')).toBe('true');
    });

    // ── Resolve inside act so the resulting setState('error') is flushed ──────
    // Without this, React would update state after the test ends and emit the
    // "not wrapped in act" warning.
    await act(async () => {
      resolveExport({ ok: false, status: 500, json: async () => ({}), headers: { get: () => null } });
    });

    // Drain: wait for the component to settle back to idle/error state.
    await waitFor(() => {
      expect(btn).not.toBeDisabled();
    });

    // ── Prove no act warning was emitted ─────────────────────────────────────
    const actWarnings = (consoleErrorSpy.mock.calls as unknown[][]).filter(
      (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('not wrapped in act'),
    );
    expect(actWarnings).toHaveLength(0);
  });
});

describe('ISG-UI-11: Duplicate click while in-flight is ignored', () => {
  beforeEach(() => vi.clearAllMocks());

  it('export endpoint is called exactly once even if button is clicked twice', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    let resolveExport!: (v: unknown) => void;
    const hangingExport = new Promise(r => { resolveExport = r; });

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/export.csv')) return hangingExport;
      if (typeof url === 'string' && url.includes('/status')) {
        return Promise.resolve({ ok: true, json: async () => makeStatus() });
      }
      if (typeof url === 'string' && url.includes('/runs?')) {
        return Promise.resolve({ ok: true, json: async () => ({ runs: [makeRun({ id: runId })] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ findings: [] }) });
    });

    const ImageSafeguardTab = await getComponent();
    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const btn = screen.getByTestId('csv-download-header');

    // First click starts the download.
    await userEvent.click(btn);

    // Confirm in-flight: button is disabled, so the second click is a no-op
    // at the DOM level.  The inFlightRef guard provides a second layer of
    // protection even if the disabled attribute were bypassed.
    await waitFor(() => { expect(btn).toBeDisabled(); });

    // Second click — button is disabled; userEvent skips it.
    await userEvent.click(btn);

    // ── Assert exactly one export call ────────────────────────────────────────
    const exportCalls = (mockFetch.mock.calls as unknown[][]).filter(
      (args) => typeof args[0] === 'string' && (args[0] as string).includes('/export.csv'),
    );
    expect(exportCalls).toHaveLength(1);

    // ── Resolve inside act so setState('error') is flushed before cleanup ─────
    await act(async () => {
      resolveExport({ ok: false, status: 500, json: async () => ({}), headers: { get: () => null } });
    });

    // Drain: wait for the component to settle.
    await waitFor(() => {
      expect(btn).not.toBeDisabled();
    });

    // ── Prove no act warning was emitted ─────────────────────────────────────
    const actWarnings = (consoleErrorSpy.mock.calls as unknown[][]).filter(
      (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('not wrapped in act'),
    );
    expect(actWarnings).toHaveLength(0);
  });
});

describe('ISG-UI-12: HTTP error response shows inline error with role=alert', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows an error message when the server returns 413', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    setupFetchMocks(
      makeStatus(),
      [makeRun({ id: runId })],
      { ok: false, status: 413, jsonBody: { error: 'export_too_large', message: 'Export exceeds 1,000 row limit.' } },
    );
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    await userEvent.click(screen.getByTestId('csv-download-header'));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Export exceeds 1,000 row limit.');
    });
  });

  it('shows a generic error message when the server returns 500 with no message', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    setupFetchMocks(
      makeStatus(),
      [makeRun({ id: runId })],
      { ok: false, status: 500, jsonBody: {} },
    );
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    await userEvent.click(screen.getByTestId('csv-download-header'));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Export failed (HTTP 500)');
    });
  });
});

describe('ISG-UI-13: Network error shows inline error with role=alert', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a network error message when fetch throws', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/export.csv')) {
        return Promise.reject(new Error('Network failure'));
      }
      if (typeof url === 'string' && url.includes('/status')) {
        return Promise.resolve({ ok: true, json: async () => makeStatus() });
      }
      if (typeof url === 'string' && url.includes('/runs?')) {
        return Promise.resolve({ ok: true, json: async () => ({ runs: [makeRun({ id: runId })] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ findings: [] }) });
    });

    const ImageSafeguardTab = await getComponent();
    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    await userEvent.click(screen.getByTestId('csv-download-header'));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Network error');
    });
  });
});

describe('ISG-UI-14: Successful download resets button to idle (no error shown)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('no error alert is shown after a successful download', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    setupFetchMocks(makeStatus(), [makeRun({ id: runId })]);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    await userEvent.click(screen.getByTestId('csv-download-header'));

    await waitFor(() => {
      // Button should return to idle (not disabled, not aria-busy)
      const btn = screen.getByTestId('csv-download-header');
      expect(btn).not.toBeDisabled();
      expect(btn.getAttribute('aria-busy')).toBe('false');
    });

    // No error alert
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('button text returns to "Download latest CSV" after success', async () => {
    const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    setupFetchMocks(makeStatus(), [makeRun({ id: runId })]);
    const ImageSafeguardTab = await getComponent();

    await act(async () => { render(<ImageSafeguardTab />); });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    await userEvent.click(screen.getByTestId('csv-download-header'));

    await waitFor(() => {
      expect(screen.getByTestId('csv-download-header').textContent).toContain('Download latest CSV');
    });
  });
});
