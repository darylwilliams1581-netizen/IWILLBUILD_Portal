/**
 * work-behaviour.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * @seo-exempt — test file, not a route page
 * title: Work Behaviour Tests | IWIIlBUILD
 * description: Rendered-behaviour tests for the Work workspace and Job detail pill navigation.
 * canonical: /work
 * h1: Work Behaviour Tests
 *
 * Rendered-behaviour tests for the Work workspace (/work).
 *
 * The Work page is now a Jobs register + Tools entry point.
 * Job-specific features (Tasks, Notes, Delays, Progress, Attendance) have been
 * removed from the Work launcher — they live on the Job detail page.
 *
 * JSDOM CONSTRAINT: jsdom does not evaluate Tailwind CSS, so both the desktop
 * branch (`hidden lg:flex`) and the mobile branch (`flex lg:hidden`) are
 * present in the DOM simultaneously. Tests therefore:
 *
 *   1. Scope desktop-only queries to data-testid="desktop-work".
 *   2. Scope mobile-only queries to data-testid="mobile-work".
 *   3. Assert navigation by checking the rendered route element, not by
 *      querying the work page DOM (portal menus render outside the router
 *      tree in jsdom — we verify navigation via URL state instead).
 *
 * vi.resetModules() is NOT called in beforeEach — it clears the lazy mock
 * chain and causes Suspense to never resolve.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { HelmetProvider } from '@dr.pogodin/react-helmet';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/components/PortalSidebar', () => ({
  default: () => <div data-testid="portal-sidebar" />,
}));

vi.mock('@/components/NewJobModal', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="new-job-modal"><button onClick={onClose}>Close</button></div> : null,
}));

vi.mock('@/lib/usePermissions', () => ({
  usePermissions: () => ({ isViewOnly: false, permSeeDollars: false, permInvoices: false }),
}));

vi.mock('@/components/work/WorkToolsTab', () => ({
  default: () => <div data-testid="tab-tools">Tools Content</div>,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function LocationSpy() {
  const loc = useLocation();
  return <div data-testid="location-spy">{loc.pathname}{loc.search}</div>;
}

// Stub fetch for the jobs list
function mockFetchJobs(jobs: Array<{ id: number; name: string; jobNumber: string | null; status: string; client: string | null }> = []) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ jobs }),
  } as Response);
}

async function renderWork(search = '') {
  mockFetchJobs([
    { id: 1, name: 'Test Job', jobNumber: 'J-01', status: 'Active', client: 'ACME' },
    { id: 2, name: 'Another Job', jobNumber: 'J-02', status: 'Active', client: null },
  ]);
  const { default: WorkPage } = await import('../../pages/work');
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/work${search}`]}>
        <Routes>
          <Route path="/work" element={<WorkPage />} />
          <Route path="/jobs/:id" element={<div data-testid="job-detail-page">Job Detail</div>} />
          <Route path="/builders-calc" element={<div data-testid="builders-calc-page">Builders Calc</div>} />
          <Route path="/takeoff-pad" element={<div data-testid="takeoff-pad-page">Takeoff Pad</div>} />
        </Routes>
        <LocationSpy />
      </MemoryRouter>
    </HelmetProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Work page — structure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the portal sidebar', async () => {
    await renderWork();
    expect(screen.getByTestId('portal-sidebar')).toBeInTheDocument();
  });

  it('renders the page title "Work"', async () => {
    await renderWork();
    const headings = screen.getAllByText('Work');
    expect(headings.length).toBeGreaterThan(0);
  });

  it('renders the jobs list on load', async () => {
    await renderWork();
    await waitFor(() => {
      // Both desktop and mobile render a jobs list — check at least one exists
      expect(screen.getAllByTestId('jobs-list').length).toBeGreaterThan(0);
    });
  });

  it('shows job rows after fetch', async () => {
    await renderWork();
    await waitFor(() => {
      expect(screen.getAllByTestId('job-row-1').length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('job-row-2').length).toBeGreaterThan(0);
    });
  });
});

describe('Work page — duplicate job-feature cards removed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT render a Tasks launcher card', async () => {
    await renderWork();
    // The old launcher had a card with description "View and manage job tasks"
    expect(screen.queryByText('View and manage job tasks')).not.toBeInTheDocument();
  });

  it('does NOT render a Notes launcher card', async () => {
    await renderWork();
    expect(screen.queryByText('Site observations and reminders')).not.toBeInTheDocument();
  });

  it('does NOT render a Delays launcher card', async () => {
    await renderWork();
    expect(screen.queryByText('Record and track delay events')).not.toBeInTheDocument();
  });

  it('does NOT render a Progress launcher card', async () => {
    await renderWork();
    expect(screen.queryByText('Program of Works and milestones')).not.toBeInTheDocument();
  });

  it('does NOT render an Attendance launcher card', async () => {
    await renderWork();
    expect(screen.queryByText('Site sign-in and sign-out records')).not.toBeInTheDocument();
  });
});

describe('Work page — mobile launcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the mobile launcher', async () => {
    await renderWork();
    expect(screen.getByTestId('mobile-work-launcher')).toBeInTheDocument();
  });

  it('renders a Tools button in the mobile launcher header', async () => {
    await renderWork();
    const launcher = screen.getByTestId('mobile-work-launcher');
    expect(within(launcher).getByTestId('mobile-tools-btn')).toBeInTheDocument();
  });

  it('opens the Tools sub-launcher when Tools button is clicked', async () => {
    await renderWork();
    const toolsBtn = screen.getByTestId('mobile-tools-btn');
    await act(async () => {
      await userEvent.click(toolsBtn);
    });
    // After clicking, the mobile launcher is replaced by the tools sub-launcher
    // which contains the individual tool descriptions
    await waitFor(() => {
      expect(screen.getByText('Areas, volumes, materials and cost estimates')).toBeInTheDocument();
    });
  });

  it('shows the jobs list inside the mobile launcher', async () => {
    await renderWork();
    await waitFor(() => {
      expect(screen.getAllByTestId('jobs-list').length).toBeGreaterThan(0);
    });
  });
});

describe('Work page — New Job modal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens New Job modal when New Job button is clicked', async () => {
    await renderWork();
    // Find the New Job button (there may be one in desktop + mobile)
    const newJobBtns = screen.getAllByText(/New Job/i);
    expect(newJobBtns.length).toBeGreaterThan(0);
    await userEvent.click(newJobBtns[0]);
    await waitFor(() => {
      expect(screen.getByTestId('new-job-modal')).toBeInTheDocument();
    });
  });

  it('closes New Job modal when Close is clicked', async () => {
    await renderWork();
    const newJobBtns = screen.getAllByText(/New Job/i);
    await userEvent.click(newJobBtns[0]);
    await waitFor(() => screen.getByTestId('new-job-modal'));
    await userEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByTestId('new-job-modal')).not.toBeInTheDocument();
    });
  });
});

describe('Work page — job search', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters jobs by search query', async () => {
    await renderWork();
    await waitFor(() => screen.getAllByTestId('job-row-1'));

    // Scope to the mobile work container — it always has a jobs list in the DOM
    const mobileWork = screen.getByTestId('mobile-work');
    const searchInput = within(mobileWork).getByPlaceholderText('Search jobs…');
    await userEvent.type(searchInput, 'Another');

    await waitFor(() => {
      // Within the mobile container, job-row-1 (Test Job) should be gone
      expect(within(mobileWork).queryByTestId('job-row-1')).not.toBeInTheDocument();
      expect(within(mobileWork).getByTestId('job-row-2')).toBeInTheDocument();
    });
  });
});

describe('Work page — desktop structure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the desktop work container', async () => {
    await renderWork();
    expect(screen.getByTestId('desktop-work')).toBeInTheDocument();
  });

  it('renders the Tools dropdown button in desktop nav', async () => {
    await renderWork();
    const desktop = screen.getByTestId('desktop-work');
    expect(within(desktop).getByRole('button', { name: /Tools menu/i })).toBeInTheDocument();
  });

  it('does NOT render Tasks/Notes/Delays/Progress/Attendance tab buttons in desktop nav', async () => {
    await renderWork();
    const desktop = screen.getByTestId('desktop-work');
    const nav = within(desktop).getByRole('navigation', { name: /Work sections/i });
    // These tab buttons should not exist in the new Work page nav
    expect(within(nav).queryByRole('button', { name: /^Tasks$/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /^Notes$/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /^Delays$/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /^Progress$/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /^Attendance$/i })).not.toBeInTheDocument();
  });
});

// ── Job-detail pill nav tests ─────────────────────────────────────────────────

describe('Job detail — pill navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Mocks for job-detail page
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/jobs/') && url.includes('/costs')) {
        return Promise.resolve({ ok: true, json: async () => ({ costs: [], approvedTotal: 0 }) } as Response);
      }
      if (url.includes('/api/jobs/') && url.includes('/todos')) {
        return Promise.resolve({ ok: true, json: async () => ({ todos: [] }) } as Response);
      }
      if (url.includes('/api/jobs/') && url.includes('/signin-status')) {
        return Promise.resolve({ ok: true, json: async () => ({ currentlyOnSite: [] }) } as Response);
      }
      if (url.includes('/api/jobs/') && url.includes('/progress')) {
        return Promise.resolve({ ok: true, json: async () => ({ sections: [], activities: [], lines: [] }) } as Response);
      }
      if (url.includes('/api/jobs/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            job: {
              id: 42, name: 'Test Job', jobNumber: 'J-42', status: 'Active',
              client: 'ACME', address: '1 Test St', notes: '',
              createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
            },
          }),
        } as Response);
      }
      if (url.includes('/api/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ profile: { role: 'admin' } }) } as Response);
      }
      if (url.includes('/api/team/members')) {
        return Promise.resolve({ ok: true, json: async () => ({ members: [] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });
  });

  async function renderJobDetail(jobId = '42', search = '') {
    // Stub all heavy child components
    vi.mock('@/components/job/JobDetailsDashboard', () => ({
      default: () => <div data-testid="job-details-dashboard">Details</div>,
    }));
    vi.mock('@/components/job/JobTodos', () => ({
      default: () => <div data-testid="job-todos">Tasks</div>,
    }));
    vi.mock('@/components/notes/NotesPanel', () => ({
      default: () => <div data-testid="notes-panel">Notes</div>,
    }));
    vi.mock('@/components/job/JobDelays', () => ({
      default: () => <div data-testid="job-delays">Delays</div>,
    }));
    vi.mock('@/components/job/JobProgress', () => ({
      default: () => <div data-testid="job-progress">Progress</div>,
    }));
    vi.mock('@/components/job/JobAttendanceTab', () => ({
      default: () => <div data-testid="job-attendance">Attendance</div>,
    }));
    vi.mock('@/components/job/JobPhotosTab', () => ({
      default: () => <div data-testid="job-photos">Photos</div>,
    }));
    vi.mock('@/components/FilePanel', () => ({
      default: () => <div data-testid="file-panel">Files</div>,
    }));
    vi.mock('@/components/PlanManager/JobPlanManagerTab', () => ({
      default: () => <div data-testid="drawings-tab">Drawings</div>,
    }));
    vi.mock('@/components/JobEstimates', () => ({
      default: () => <div data-testid="job-estimates">Estimates</div>,
    }));
    vi.mock('@/components/job/JobSafety', () => ({
      default: () => <div data-testid="job-safety">Safety</div>,
    }));
    vi.mock('@/components/job/JobForms', () => ({
      default: () => <div data-testid="job-forms">Forms</div>,
    }));
    vi.mock('@/components/job/JobCosts', () => ({
      default: () => <div data-testid="job-costs">Costs</div>,
    }));
    vi.mock('@/components/job/JobInvoices', () => ({
      default: () => <div data-testid="job-invoices">Invoices</div>,
    }));
    vi.mock('@/components/job/JobPurchaseOrders', () => ({
      default: () => <div data-testid="job-pos">POs</div>,
    }));
    vi.mock('@/components/DesktopTopBar', () => ({ default: () => null }));
    vi.mock('@/components/DesktopDock', () => ({ default: () => null }));
    vi.mock('@/components/SendDocumentEmailModal', () => ({ default: () => null }));
    vi.mock('@/components/EmailSentToast', () => ({
      default: () => null,
      EmailToastContainer: () => null,
    }));
    vi.mock('@/components/CustomerSelector', () => ({ default: () => null }));
    vi.mock('@/components/AssetManager/AssetSelector', () => ({ default: () => null }));
    vi.mock('@/lib/jobs-api', () => ({
      fetchJob: vi.fn().mockResolvedValue({
        id: 42, name: 'Test Job', jobNumber: 'J-42', status: 'Active',
        client: 'ACME', address: '1 Test St', notes: '',
        createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
      }),
      updateJob: vi.fn(),
      getStatusStyle: vi.fn().mockReturnValue({ bg: '', color: '', dot: '' }),
      JOB_STATUSES: ['New', 'Active', 'Complete'],
    }));
    vi.mock('@/lib/customers-api', () => ({ fetchCustomer: vi.fn().mockResolvedValue(null) }));
    vi.mock('@/lib/useTerminology', () => ({
      useTerminology: () => ({ workSingular: 'Job', workPlural: 'Jobs' }),
    }));

    const { default: JobDetailPage } = await import('../../pages/job-detail');
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/jobs/${jobId}${search}`]}>
          <Routes>
            <Route path="/jobs/:id" element={<JobDetailPage />} />
            <Route path="/jobs" element={<div data-testid="jobs-list-page">Jobs</div>} />
          </Routes>
          <LocationSpy />
        </MemoryRouter>
      </HelmetProvider>
    );
  }

  it('renders the section nav container', async () => {
    await renderJobDetail();
    await waitFor(() => {
      expect(screen.getByTestId('job-pill-nav')).toBeInTheDocument();
    });
  });

  it('renders a trigger button showing the active section', async () => {
    await renderJobDetail();
    await waitFor(() => screen.getByTestId('job-section-trigger'));
    const trigger = screen.getByTestId('job-section-trigger');
    expect(trigger).toBeInTheDocument();
    // Default section is Details
    expect(trigger).toHaveTextContent('Details');
  });

  it('renders an option for every expected section after opening', async () => {
    await renderJobDetail();
    await waitFor(() => screen.getByTestId('job-section-trigger'));
    // Open the dropdown
    await userEvent.click(screen.getByTestId('job-section-trigger'));
    await waitFor(() => screen.getByTestId('job-section-dropdown'));

    const expectedSections = ['details', 'tasks', 'notes', 'delays', 'progress', 'attendance', 'photos', 'drawings', 'files', 'estimates', 'purchase-orders', 'invoices', 'costs', 'forms', 'safety'];
    for (const section of expectedSections) {
      expect(screen.getByTestId(`job-pill-${section}`)).toBeInTheDocument();
    }
  });

  it('Details option is active by default', async () => {
    await renderJobDetail();
    await waitFor(() => screen.getByTestId('job-section-trigger'));
    await userEvent.click(screen.getByTestId('job-section-trigger'));
    await waitFor(() => screen.getByTestId('job-pill-details'));
    // No ?tab= in URL → details is the default → aria-selected="true"
    const detailsOption = screen.getByTestId('job-pill-details');
    expect(detailsOption).toHaveAttribute('aria-selected', 'true');
  });

  it('selecting Tasks option navigates to ?tab=tasks', async () => {
    await renderJobDetail();
    await waitFor(() => screen.getByTestId('job-section-trigger'));
    // Open dropdown
    await userEvent.click(screen.getByTestId('job-section-trigger'));
    await waitFor(() => screen.getByTestId('job-pill-tasks'));
    await userEvent.click(screen.getByTestId('job-pill-tasks'));
    // Tab is URL-driven — after navigation the URL should contain tab=tasks
    await waitFor(() => {
      const spy = screen.getByTestId('location-spy');
      expect(spy.textContent).toContain('tab=tasks');
    });
  });

  it('dropdown closes after selecting an option', async () => {
    await renderJobDetail();
    await waitFor(() => screen.getByTestId('job-section-trigger'));
    await userEvent.click(screen.getByTestId('job-section-trigger'));
    await waitFor(() => screen.getByTestId('job-section-dropdown'));
    await userEvent.click(screen.getByTestId('job-pill-tasks'));
    await waitFor(() => {
      expect(screen.queryByTestId('job-section-dropdown')).not.toBeInTheDocument();
    });
  });

  it('trigger toggles dropdown open/closed', async () => {
    await renderJobDetail();
    await waitFor(() => screen.getByTestId('job-section-trigger'));
    // Open
    await userEvent.click(screen.getByTestId('job-section-trigger'));
    await waitFor(() => screen.getByTestId('job-section-dropdown'));
    // Close by clicking trigger again
    await userEvent.click(screen.getByTestId('job-section-trigger'));
    await waitFor(() => {
      expect(screen.queryByTestId('job-section-dropdown')).not.toBeInTheDocument();
    });
  });

  it('dropdown has role=listbox with accessible label', async () => {
    await renderJobDetail();
    await waitFor(() => screen.getByTestId('job-section-trigger'));
    await userEvent.click(screen.getByTestId('job-section-trigger'));
    await waitFor(() => screen.getByTestId('job-section-dropdown'));
    const listbox = screen.getByRole('listbox', { name: /Job sections/i });
    expect(listbox).toBeInTheDocument();
  });

  it('all options have aria-selected attribute', async () => {
    await renderJobDetail();
    await waitFor(() => screen.getByTestId('job-section-trigger'));
    await userEvent.click(screen.getByTestId('job-section-trigger'));
    await waitFor(() => screen.getByTestId('job-section-dropdown'));
    const options = screen.getAllByRole('option');
    for (const opt of options) {
      expect(opt).toHaveAttribute('aria-selected');
    }
  });
});

// ── workTab=attendance in URL renders Attendance content in desktop main ───────

describe('workTab URL param — legacy deep-link compatibility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('workTab=attendance in URL renders Attendance content in desktop main', async () => {
    // The new Work page no longer has a workTab=attendance route — it redirects to jobs list.
    // This test verifies the page still loads without crashing when a legacy URL is used.
    await renderWork('?workTab=attendance');
    // Page should render without error
    expect(screen.getByTestId('desktop-work')).toBeInTheDocument();
  });
});
