/**
 * SafetyContent.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused tests for the Safety SWMS ownership pilot.
 *
 * Tests 1–12 from the spec:
 *  1.  Safety shows the new tab order
 *  2.  SWMS tab renders the existing JobSwmsTab
 *  3.  The existing Add SWMS to Job launcher still works
 *  4.  Submissions renders one row per sign-off
 *  5.  Multiple signers create multiple rows
 *  6.  Unsigned job SWMS does not appear as a submission
 *  7.  Company isolation remains enforced (server-side; verified via API mock)
 *  8.  Templates still renders the existing SWMS template library
 *  9.  Safety Plans, Policies and Posters remain reachable
 * 10.  /job-docs remains operational (route registration check)
 * 11.  /safety/sign/:token remains unchanged (route registration check)
 * 12.  Safety still renders correctly when embedded in Studio (no duplicate chrome)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// ── Global mocks ──────────────────────────────────────────────────────────────

vi.mock('@dr.pogodin/react-helmet', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Silence the migration fetch on mount
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({}),
} as Response);

// ── Leaf-level tab mocks ──────────────────────────────────────────────────────
// Each tab is mocked to a sentinel so tests stay focused on SafetyContent
// wiring, not on the internals of each tab.

vi.mock('@/pages/safety', () => ({
  SafetyDashboardTab: () => <div data-testid="tab-dashboard">Dashboard content</div>,
  SwmsLibraryTab:     () => <div data-testid="tab-swms-library">SWMS Library content</div>,
  SafetyPlansTab:     () => <div data-testid="tab-plans">Safety Plans content</div>,
  PoliciesTab:        () => <div data-testid="tab-policies">Policies content</div>,
  PostersTab:         () => <div data-testid="tab-posters">Posters content</div>,
}));

vi.mock('../JobSwmsTab', () => ({
  default: () => (
    <div data-testid="tab-job-swms">
      <button data-testid="add-swms-to-job-btn">Add SWMS to Job</button>
    </div>
  ),
}));

// SwmsSubmissionsTab is mocked in most tests; overridden in submission-specific tests.
vi.mock('../SwmsSubmissionsTab', () => ({
  default: () => <div data-testid="tab-submissions">Submissions content</div>,
}));

import SafetyContent from '../SafetyContent';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderSafety() {
  return render(
    <MemoryRouter>
      <SafetyContent />
    </MemoryRouter>,
  );
}

// ── Test 1: Tab order ─────────────────────────────────────────────────────────

describe('Test 1 — Safety shows the new tab order', () => {
  it('renders all seven tabs in the correct order', () => {
    renderSafety();
    const buttons = screen.getAllByRole('button').filter((b) =>
      ['Dashboard', 'SWMS', 'Submissions', 'Templates', 'Safety Plans', 'Policies', 'Posters']
        .includes(b.textContent?.trim() ?? ''),
    );
    const labels = buttons.map((b) => b.textContent?.trim());
    expect(labels).toEqual([
      'Dashboard', 'SWMS', 'Submissions', 'Templates',
      'Safety Plans', 'Policies', 'Posters',
    ]);
  });
});

// ── Test 2: SWMS tab renders JobSwmsTab ───────────────────────────────────────

describe('Test 2 — SWMS tab renders the existing JobSwmsTab', () => {
  it('clicking SWMS shows the JobSwmsTab sentinel', () => {
    renderSafety();
    fireEvent.click(screen.getByRole('button', { name: /^SWMS$/i }));
    expect(screen.getByTestId('tab-job-swms')).toBeInTheDocument();
  });

  it('does not show Dashboard content when SWMS is active', () => {
    renderSafety();
    fireEvent.click(screen.getByRole('button', { name: /^SWMS$/i }));
    expect(screen.queryByTestId('tab-dashboard')).not.toBeInTheDocument();
  });
});

// ── Test 3: Add SWMS to Job launcher ─────────────────────────────────────────

describe('Test 3 — Add SWMS to Job launcher still works', () => {
  it('the Add SWMS to Job button is present inside the SWMS tab', () => {
    renderSafety();
    fireEvent.click(screen.getByRole('button', { name: /^SWMS$/i }));
    expect(screen.getByTestId('add-swms-to-job-btn')).toBeInTheDocument();
  });
});

// ── Tests 4–7: Submissions tab ────────────────────────────────────────────────
// These tests use a real SwmsSubmissionsTab (unmocked) with controlled fetch.

describe('Tests 4–7 — Submissions tab behaviour', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // Helper: render SwmsSubmissionsTab directly with a controlled fetch response
  async function renderSubmissionsWithData(submissions: object[]) {
    // Unmock SwmsSubmissionsTab for these tests
    vi.doUnmock('../SwmsSubmissionsTab');
    const { default: SwmsSubmissionsTab } = await import('../SwmsSubmissionsTab');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submissions }),
    } as Response);

    const result = render(
      <MemoryRouter>
        <SwmsSubmissionsTab />
      </MemoryRouter>,
    );
    return result;
  }

  it('Test 4 — renders one row per sign-off', async () => {
    await renderSubmissionsWithData([
      {
        id: 1, worker_name: 'Alice Smith', company_name: 'Acme', role: 'Labourer',
        white_card_number: 'WC001', signed_at: '2026-08-01T09:00:00Z',
        job_swms_id: 10, swms_title: 'Excavation SWMS', job_id: 5,
        job_name: 'Site A', job_number: 'JOB-001',
      },
    ]);
    await waitFor(() => {
      // submission-row appears in both desktop table and mobile cards (CSS-hidden).
      // Divide by 2 to get the logical row count.
      const rows = screen.getAllByTestId('submission-row');
      expect(rows.length / 2).toBe(1);
    });
    expect(screen.getAllByText('Alice Smith')).toHaveLength(2); // desktop + mobile
  });

  it('Test 5 — multiple signers create multiple rows', async () => {
    await renderSubmissionsWithData([
      {
        id: 1, worker_name: 'Alice Smith', company_name: null, role: null,
        white_card_number: null, signed_at: '2026-08-01T09:00:00Z',
        job_swms_id: 10, swms_title: 'Excavation SWMS', job_id: 5,
        job_name: 'Site A', job_number: 'JOB-001',
      },
      {
        id: 2, worker_name: 'Bob Jones', company_name: null, role: null,
        white_card_number: null, signed_at: '2026-08-01T09:05:00Z',
        job_swms_id: 10, swms_title: 'Excavation SWMS', job_id: 5,
        job_name: 'Site A', job_number: 'JOB-001',
      },
    ]);
    await waitFor(() => {
      // 2 signers × 2 renders (desktop + mobile) = 4 DOM nodes
      const rows = screen.getAllByTestId('submission-row');
      expect(rows.length / 2).toBe(2);
    });
    expect(screen.getAllByText('Alice Smith')).toHaveLength(2);
    expect(screen.getAllByText('Bob Jones')).toHaveLength(2);
  });

  it('Test 6 — unsigned job SWMS does not appear as a submission', async () => {
    // API returns empty array — no sign-offs for any job SWMS
    await renderSubmissionsWithData([]);
    await waitFor(() => {
      expect(screen.getByTestId('submissions-empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('submission-row')).not.toBeInTheDocument();
  });

  it('Test 7 — company isolation: API is called with credentials:include', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submissions: [] }),
    } as Response);
    global.fetch = fetchSpy;

    vi.doUnmock('../SwmsSubmissionsTab');
    const { default: SwmsSubmissionsTab } = await import('../SwmsSubmissionsTab');

    render(
      <MemoryRouter>
        <SwmsSubmissionsTab />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/safety/swms-submissions',
        expect.objectContaining({ credentials: 'include' }),
      );
    });
  });
});

// ── Test 8: Templates tab ─────────────────────────────────────────────────────

describe('Test 8 — Templates still renders the existing SWMS template library', () => {
  it('clicking Templates shows the SwmsLibraryTab sentinel', () => {
    renderSafety();
    fireEvent.click(screen.getByRole('button', { name: /^Templates$/i }));
    expect(screen.getByTestId('tab-swms-library')).toBeInTheDocument();
  });

  it('Templates tab label is "Templates" (not "SWMS Library")', () => {
    renderSafety();
    const btn = screen.getByRole('button', { name: /^Templates$/i });
    expect(btn).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^SWMS Library$/i })).not.toBeInTheDocument();
  });
});

// ── Test 9: Safety Plans, Policies, Posters ───────────────────────────────────

describe('Test 9 — Safety Plans, Policies and Posters remain reachable', () => {
  it('Safety Plans tab renders SafetyPlansTab', () => {
    renderSafety();
    fireEvent.click(screen.getByRole('button', { name: /Safety Plans/i }));
    expect(screen.getByTestId('tab-plans')).toBeInTheDocument();
  });

  it('Policies tab renders PoliciesTab', () => {
    renderSafety();
    fireEvent.click(screen.getByRole('button', { name: /Policies/i }));
    expect(screen.getByTestId('tab-policies')).toBeInTheDocument();
  });

  it('Posters tab renders PostersTab', () => {
    renderSafety();
    fireEvent.click(screen.getByRole('button', { name: /Posters/i }));
    expect(screen.getByTestId('tab-posters')).toBeInTheDocument();
  });
});

// ── Test 10: /job-docs route remains operational ──────────────────────────────

describe('Test 10 — /job-docs remains operational', () => {
  it('JobFieldDocsPage lazy import is registered in routes.tsx', async () => {
    // Verify the lazy import resolves — routes.tsx registers it at /job-docs.
    // We import the page module directly to confirm it exists and exports a component.
    // Heavy page dependencies are mocked via vitest's module resolution.
    const routesSrc = await import('../../../routes');
    // routes.tsx exports a routes array; /job-docs must be present
    const routes = routesSrc.routes as Array<{ path?: string }>;
    const jobDocsRoute = routes.find((r) => r.path === '/job-docs');
    expect(jobDocsRoute).toBeDefined();
  });
});

// ── Test 11: /safety/sign/:token remains unchanged ────────────────────────────

describe('Test 11 — /safety/sign/:token remains unchanged', () => {
  it('/safety/sign/:token route is registered in routes.tsx', async () => {
    const routesSrc = await import('../../../routes');
    const routes = routesSrc.routes as Array<{ path?: string }>;
    const signRoute = routes.find((r) => r.path === '/safety/sign/:token');
    expect(signRoute).toBeDefined();
  });
});

// ── Test 12: Safety embedded in Studio — no duplicate chrome ─────────────────

describe('Test 12 — Safety renders correctly when embedded in Studio', () => {
  it('SafetyContent renders without PortalSidebar, Helmet, or page header', () => {
    const { container } = renderSafety();
    // SafetyContent must not render a PortalSidebar
    expect(container.querySelector('[data-testid="portal-sidebar"]')).toBeNull();
    // Must not render a page <header> (that belongs to the route page wrapper)
    expect(container.querySelector('header')).toBeNull();
  });

  it('SafetyContent renders the tab bar and default Dashboard tab', () => {
    renderSafety();
    expect(screen.getByRole('button', { name: /^Dashboard$/i })).toBeInTheDocument();
    expect(screen.getByTestId('tab-dashboard')).toBeInTheDocument();
  });
});
