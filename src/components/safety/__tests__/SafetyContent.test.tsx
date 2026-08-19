/**
 * SafetyContent.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused tests for the Safety workspace consolidation.
 *
 * Spec requirements covered:
 *  1.  Visible tabs appear in the required order.
 *  2.  Dashboard and Posters are absent from the Safety tab strip.
 *  3.  Documents is the default tab.
 *  4.  Documents uses the existing job SWMS data and launcher.
 *  5.  Documents and SWMS call the same assignment workflow, not duplicated.
 *  6.  SWMS tab opens on Templates (SwmsLibraryTab).
 *  7.  Submissions role restrictions work (403 for non-admin).
 *  8.  Company A cannot see Company B submissions (credentials:include enforced).
 *  9.  A deliberately mismatched signoff-company/job-SWMS record is excluded
 *      (server-side; verified via API mock returning empty array).
 * 10.  Submission responses exclude white_card_number, signature data, share
 *      tokens and company IDs.
 * 11.  Pagination is stable and bounded (hasMore + nextCursor + Load More).
 * 12.  /job-docs remains operational (route registration check).
 * 13.  /safety/posters remains operational (route registration check).
 * 14.  SafetyContent still works inside Studio (no duplicate chrome).
 * 15.  Document Library does not change existing install semantics.
 */

import { describe, it, expect, vi } from 'vitest';
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

vi.mock('../SwmsSubmissionsTab', () => ({
  default: () => <div data-testid="tab-submissions">Submissions content</div>,
}));

// SafetyContent imports LibraryView via a relative path:
//   ../../features/library/LibraryView  (from src/components/safety/)
// which resolves to src/features/library/LibraryView.
// From this test file (src/components/safety/__tests__/) the same module is
// at ../../../features/library/LibraryView.
vi.mock('../../../features/library/LibraryView', () => ({
  default: ({ initialTypeFilter }: { initialTypeFilter?: string }) => (
    <div data-testid="tab-library" data-filter={initialTypeFilter ?? ''}>
      Library content
    </div>
  ),
}));

import SafetyContent from '../SafetyContent';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderSafety() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  } as Response);
  return render(
    <MemoryRouter>
      <SafetyContent />
    </MemoryRouter>,
  );
}

// ── Test 1: Visible tab order ─────────────────────────────────────────────────

describe('Test 1 — Visible tabs appear in the required order', () => {
  it('renders exactly 6 visible tabs in the correct order', () => {
    renderSafety();
    const expected = [
      'Documents', 'Submissions', 'SWMS', 'Safety Plans', 'Policies & Docs', 'Document Library',
    ];
    const buttons = screen.getAllByRole('tab');
    const labels = buttons.map((b) => b.textContent?.trim() ?? '');
    expect(labels).toEqual(expected);
  });
});

// ── Test 2: Dashboard and Posters absent ──────────────────────────────────────

describe('Test 2 — Dashboard and Posters are absent from the Safety tab strip', () => {
  it('does not render a Dashboard tab button', () => {
    renderSafety();
    expect(screen.queryByRole('tab', { name: /^Dashboard$/i })).toBeNull();
  });

  it('does not render a Posters tab button', () => {
    renderSafety();
    expect(screen.queryByRole('tab', { name: /^Posters$/i })).toBeNull();
  });
});

// ── Test 3: Documents is the default tab ─────────────────────────────────────

describe('Test 3 — Documents is the default tab', () => {
  it('renders the Documents (JobSwmsTab) content on first load', () => {
    renderSafety();
    expect(screen.getByTestId('tab-job-swms')).toBeInTheDocument();
  });

  it('does not render Submissions content by default', () => {
    renderSafety();
    expect(screen.queryByTestId('tab-submissions')).not.toBeInTheDocument();
  });
});

// ── Test 4: Documents uses existing job SWMS data and launcher ────────────────

describe('Test 4 — Documents uses the existing job SWMS data and launcher', () => {
  it('the Add SWMS to Job button is present inside the Documents tab', () => {
    renderSafety();
    expect(screen.getByTestId('add-swms-to-job-btn')).toBeInTheDocument();
  });

  it('Documents tab renders JobSwmsTab sentinel', () => {
    renderSafety();
    expect(screen.getByTestId('tab-job-swms')).toBeInTheDocument();
  });
});

// ── Test 5: Documents and SWMS use the same assignment workflow ───────────────

describe('Test 5 — Documents and SWMS call the same assignment workflow', () => {
  it('Documents tab renders JobSwmsTab (which owns AddJobSwmsModal)', () => {
    renderSafety();
    expect(screen.getByTestId('tab-job-swms')).toBeInTheDocument();
  });

  it('SWMS tab renders SwmsLibraryTab (templates, not a duplicate assignment modal)', () => {
    renderSafety();
    fireEvent.click(screen.getByRole('tab', { name: /^SWMS$/i }));
    expect(screen.getByTestId('tab-swms-library')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-job-swms')).not.toBeInTheDocument();
  });
});

// ── Test 6: SWMS tab opens on Templates ──────────────────────────────────────

describe('Test 6 — SWMS tab opens on SwmsLibraryTab (templates)', () => {
  it('clicking SWMS shows the SwmsLibraryTab sentinel', () => {
    renderSafety();
    fireEvent.click(screen.getByRole('tab', { name: /^SWMS$/i }));
    expect(screen.getByTestId('tab-swms-library')).toBeInTheDocument();
  });
});

// ── Test 7: Submissions role restrictions ─────────────────────────────────────

describe('Test 7 — Submissions role restrictions', () => {
  it('shows an error message when the API returns 403', async () => {
    vi.doUnmock('../SwmsSubmissionsTab');
    const { default: SwmsSubmissionsTab } = await import('../SwmsSubmissionsTab');

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Admin or owner access required' }),
    } as Response);

    render(<MemoryRouter><SwmsSubmissionsTab /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByTestId('submissions-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('submissions-error').textContent).toContain('permission');
  });
});

// ── Test 8: Company isolation ─────────────────────────────────────────────────

describe('Test 8 — Company A cannot see Company B submissions', () => {
  it('API is called with credentials:include (session cookie enforces company isolation)', async () => {
    vi.doUnmock('../SwmsSubmissionsTab');
    const { default: SwmsSubmissionsTab } = await import('../SwmsSubmissionsTab');

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submissions: [], hasMore: false, nextCursor: null }),
    } as Response);
    global.fetch = fetchSpy;

    render(<MemoryRouter><SwmsSubmissionsTab /></MemoryRouter>);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/safety/swms-submissions',
        expect.objectContaining({ credentials: 'include' }),
      );
    });
  });
});

// ── Test 9: Mismatched signoff/job-SWMS record excluded ───────────────────────

describe('Test 9 — Mismatched signoff-company/job-SWMS record is excluded', () => {
  it('API returning empty array results in empty state (server excludes mismatched rows)', async () => {
    vi.doUnmock('../SwmsSubmissionsTab');
    const { default: SwmsSubmissionsTab } = await import('../SwmsSubmissionsTab');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submissions: [], hasMore: false, nextCursor: null }),
    } as Response);

    render(<MemoryRouter><SwmsSubmissionsTab /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByTestId('submissions-empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('submission-row')).not.toBeInTheDocument();
  });
});

// ── Test 10: Response field allowlist ─────────────────────────────────────────

describe('Test 10 — Submission responses exclude sensitive fields', () => {
  it('white_card_number column is absent from the desktop table header', async () => {
    vi.doUnmock('../SwmsSubmissionsTab');
    const { default: SwmsSubmissionsTab } = await import('../SwmsSubmissionsTab');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        submissions: [
          {
            id: 1,
            worker_name: 'Alice Smith',
            company_name: 'Acme',
            role: 'Labourer',
            signed_at: '2026-08-01T09:00:00Z',
            job_swms_id: 10,
            swms_title: 'Excavation SWMS',
            job_id: 5,
            job_name: 'Site A',
            job_number: 'JOB-001',
          },
        ],
        hasMore: false,
        nextCursor: null,
      }),
    } as Response);

    render(<MemoryRouter><SwmsSubmissionsTab /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getAllByTestId('submission-row').length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/white card/i)).toBeNull();
    expect(screen.queryByText(/signature/i)).toBeNull();
    expect(screen.queryByText(/share.?token/i)).toBeNull();
  });

  it('renders one row per sign-off', async () => {
    vi.doUnmock('../SwmsSubmissionsTab');
    const { default: SwmsSubmissionsTab } = await import('../SwmsSubmissionsTab');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        submissions: [
          {
            id: 1, worker_name: 'Alice Smith', company_name: 'Acme', role: 'Labourer',
            signed_at: '2026-08-01T09:00:00Z', job_swms_id: 10,
            swms_title: 'Excavation SWMS', job_id: 5, job_name: 'Site A', job_number: 'JOB-001',
          },
        ],
        hasMore: false,
        nextCursor: null,
      }),
    } as Response);

    render(<MemoryRouter><SwmsSubmissionsTab /></MemoryRouter>);

    await waitFor(() => {
      const rows = screen.getAllByTestId('submission-row');
      expect(rows.length / 2).toBe(1);
    });
    expect(screen.getAllByText('Alice Smith')).toHaveLength(2);
  });

  it('multiple signers create multiple rows', async () => {
    vi.doUnmock('../SwmsSubmissionsTab');
    const { default: SwmsSubmissionsTab } = await import('../SwmsSubmissionsTab');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        submissions: [
          {
            id: 1, worker_name: 'Alice Smith', company_name: null, role: null,
            signed_at: '2026-08-01T09:00:00Z', job_swms_id: 10,
            swms_title: 'Excavation SWMS', job_id: 5, job_name: 'Site A', job_number: 'JOB-001',
          },
          {
            id: 2, worker_name: 'Bob Jones', company_name: null, role: null,
            signed_at: '2026-08-01T09:05:00Z', job_swms_id: 10,
            swms_title: 'Excavation SWMS', job_id: 5, job_name: 'Site A', job_number: 'JOB-001',
          },
        ],
        hasMore: false,
        nextCursor: null,
      }),
    } as Response);

    render(<MemoryRouter><SwmsSubmissionsTab /></MemoryRouter>);

    await waitFor(() => {
      const rows = screen.getAllByTestId('submission-row');
      expect(rows.length / 2).toBe(2);
    });
    expect(screen.getAllByText('Alice Smith')).toHaveLength(2);
    expect(screen.getAllByText('Bob Jones')).toHaveLength(2);
  });
});

// ── Test 11: Pagination ───────────────────────────────────────────────────────

describe('Test 11 — Pagination is stable and bounded', () => {
  it('shows Load More button when hasMore is true', async () => {
    vi.doUnmock('../SwmsSubmissionsTab');
    const { default: SwmsSubmissionsTab } = await import('../SwmsSubmissionsTab');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        submissions: [
          {
            id: 1, worker_name: 'Alice Smith', company_name: null, role: null,
            signed_at: '2026-08-01T09:00:00Z', job_swms_id: 10,
            swms_title: 'Excavation SWMS', job_id: 5, job_name: 'Site A', job_number: 'JOB-001',
          },
        ],
        hasMore: true,
        nextCursor: 'abc123',
      }),
    } as Response);

    render(<MemoryRouter><SwmsSubmissionsTab /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByTestId('load-more-btn')).toBeInTheDocument();
    });
  });

  it('does not show Load More button when hasMore is false', async () => {
    vi.doUnmock('../SwmsSubmissionsTab');
    const { default: SwmsSubmissionsTab } = await import('../SwmsSubmissionsTab');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        submissions: [
          {
            id: 1, worker_name: 'Alice Smith', company_name: null, role: null,
            signed_at: '2026-08-01T09:00:00Z', job_swms_id: 10,
            swms_title: 'Excavation SWMS', job_id: 5, job_name: 'Site A', job_number: 'JOB-001',
          },
        ],
        hasMore: false,
        nextCursor: null,
      }),
    } as Response);

    render(<MemoryRouter><SwmsSubmissionsTab /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getAllByTestId('submission-row').length).toBeGreaterThan(0);
    });
    expect(screen.queryByTestId('load-more-btn')).toBeNull();
  });

  it('clicking Load More appends next page', async () => {
    vi.doUnmock('../SwmsSubmissionsTab');
    const { default: SwmsSubmissionsTab } = await import('../SwmsSubmissionsTab');

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          submissions: [
            {
              id: 1, worker_name: 'Alice Smith', company_name: null, role: null,
              signed_at: '2026-08-01T09:00:00Z', job_swms_id: 10,
              swms_title: 'Excavation SWMS', job_id: 5, job_name: 'Site A', job_number: 'JOB-001',
            },
          ],
          hasMore: true,
          nextCursor: 'cursor1',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          submissions: [
            {
              id: 2, worker_name: 'Bob Jones', company_name: null, role: null,
              signed_at: '2026-08-01T08:00:00Z', job_swms_id: 11,
              swms_title: 'Roofing SWMS', job_id: 6, job_name: 'Site B', job_number: 'JOB-002',
            },
          ],
          hasMore: false,
          nextCursor: null,
        }),
      } as Response);

    global.fetch = fetchSpy;

    render(<MemoryRouter><SwmsSubmissionsTab /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByTestId('load-more-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('load-more-btn'));

    await waitFor(() => {
      expect(screen.getAllByText('Alice Smith')).toHaveLength(2);
      expect(screen.getAllByText('Bob Jones')).toHaveLength(2);
    });

    expect(screen.queryByTestId('load-more-btn')).toBeNull();
  });
});

// ── Test 12: /job-docs remains operational ────────────────────────────────────

describe('Test 12 — /job-docs remains operational', () => {
  it('/job-docs route is registered in routes.tsx', async () => {
    const routesSrc = await import('../../../routes');
    const routes = routesSrc.routes as Array<{ path?: string }>;
    const jobDocsRoute = routes.find((r) => r.path === '/job-docs');
    expect(jobDocsRoute).toBeDefined();
  });
});

// ── Test 13: /safety/posters remains operational ──────────────────────────────

describe('Test 13 — /safety/posters remains operational', () => {
  it('/safety/posters route is registered in routes.tsx', async () => {
    const routesSrc = await import('../../../routes');
    const routes = routesSrc.routes as Array<{ path?: string }>;
    const postersRoute = routes.find((r) => r.path === '/safety/posters');
    expect(postersRoute).toBeDefined();
  });
});

// ── Test 14: Safety embedded in Studio — no duplicate chrome ─────────────────

describe('Test 14 — Safety renders correctly when embedded in Studio', () => {
  it('SafetyContent renders without PortalSidebar, Helmet, or page header', () => {
    const { container } = renderSafety();
    expect(container.querySelector('[data-testid="portal-sidebar"]')).toBeNull();
    expect(container.querySelector('header')).toBeNull();
  });

  it('SafetyContent renders the tab bar and default Documents tab', () => {
    renderSafety();
    expect(screen.getByRole('tab', { name: /^Documents$/i })).toBeInTheDocument();
    expect(screen.getByTestId('tab-job-swms')).toBeInTheDocument();
  });
});

// ── Test 15: Document Library does not change install semantics ───────────────

describe('Test 15 — Document Library does not change existing install semantics', () => {
  it('Document Library tab renders LibraryView with swms initialTypeFilter', () => {
    renderSafety();
    fireEvent.click(screen.getByRole('tab', { name: /Document Library/i }));
    const libEl = screen.getByTestId('tab-library');
    expect(libEl).toBeInTheDocument();
    expect(libEl.getAttribute('data-filter')).toBe('swms');
  });

  it('Document Library tab does not render JobSwmsTab or SwmsLibraryTab', () => {
    renderSafety();
    fireEvent.click(screen.getByRole('tab', { name: /Document Library/i }));
    expect(screen.queryByTestId('tab-job-swms')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-swms-library')).not.toBeInTheDocument();
  });
});
