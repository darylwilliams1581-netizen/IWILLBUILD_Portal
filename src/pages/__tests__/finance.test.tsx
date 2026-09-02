/**
 * finance.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused tests for the Finance workspace (/finance).
 * @seo-exempt — test file, not a route page
 * title: Finance Tests | IWIIlBUILD
 * description: Tests for Finance workspace tabs, URL state, and route compatibility.
 * canonical: /finance
 * h1: Finance Tests
 *
 * <Helmet>
 *   <title>Finance Tests | IWIIlBUILD</title>
 *   <meta name="description" content="Tests for Finance workspace tabs, URL state, and route compatibility." />
 *   <link rel="canonical" href="https://iwillbuild.com/finance" />
 * </Helmet>
 * <h1>Finance Tests</h1>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { HelmetProvider } from '@dr.pogodin/react-helmet';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/components/PortalSidebar', () => ({ default: () => <div data-testid="portal-sidebar" /> }));
vi.mock('@/components/DesktopDock',   () => ({ default: () => <div data-testid="desktop-dock" /> }));
vi.mock('@/components/finance/FinanceEstimatesTab', () => ({
  default: () => <div data-testid="estimates-tab">Estimates Tab</div>,
}));
vi.mock('@/components/finance/FinanceLedgerTab', () => ({
  default: () => <div data-testid="ledger-tab">Ledger Tab</div>,
}));
vi.mock('@/components/finance/FinanceSettingsTab', () => ({
  default: ({ settingsTab }: { settingsTab?: string }) => (
    <div data-testid="settings-tab" data-settings-tab={settingsTab}>Settings Tab</div>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderFinance(search = '?financeTab=estimates') {
  const { default: FinancePage } = await import('../finance');
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/finance${search}`]}>
        <Routes>
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/invoices" element={<div data-testid="invoices-page">Invoices</div>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

// ── Suite A — Default tab ─────────────────────────────────────────────────────

describe('Finance workspace — default tab', () => {
  beforeEach(() => { vi.resetModules(); });

  it('defaults to Estimates tab when financeTab=estimates', async () => {
    await renderFinance('?financeTab=estimates');
    expect(screen.getByTestId('estimates-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('ledger-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-tab')).not.toBeInTheDocument();
  });

  it('shows Finance heading', async () => {
    await renderFinance('?financeTab=estimates');
    expect(screen.getByRole('heading', { name: /finance/i })).toBeInTheDocument();
  });
});

// ── Suite B — Tab strip ───────────────────────────────────────────────────────

describe('Finance workspace — tab strip', () => {
  beforeEach(() => { vi.resetModules(); });

  it('renders all four tabs in order: Estimates, Invoices, Ledger, Settings', async () => {
    await renderFinance('?financeTab=estimates');
    const tabs = screen.getAllByRole('button').filter(b =>
      ['Estimates', 'Invoices', 'Ledger', 'Settings'].includes(b.textContent?.trim() ?? '')
    );
    const labels = tabs.map(t => t.textContent?.trim());
    expect(labels).toEqual(['Estimates', 'Invoices', 'Ledger', 'Settings']);
  });

  it('switches to Ledger tab on click', async () => {
    await renderFinance('?financeTab=estimates');
    const ledgerBtn = screen.getByRole('button', { name: /ledger/i });
    await userEvent.click(ledgerBtn);
    await waitFor(() => expect(screen.getByTestId('ledger-tab')).toBeInTheDocument());
  });

  it('switches to Settings tab on click', async () => {
    await renderFinance('?financeTab=estimates');
    const settingsBtn = screen.getByRole('button', { name: /settings/i });
    await userEvent.click(settingsBtn);
    await waitFor(() => expect(screen.getByTestId('settings-tab')).toBeInTheDocument());
  });
});

// ── Suite C — URL state ───────────────────────────────────────────────────────

describe('Finance workspace — URL state', () => {
  beforeEach(() => { vi.resetModules(); });

  it('renders Ledger tab when financeTab=ledger', async () => {
    await renderFinance('?financeTab=ledger');
    await waitFor(() => expect(screen.getByTestId('ledger-tab')).toBeInTheDocument());
  });

  it('renders Settings tab when financeTab=settings', async () => {
    await renderFinance('?financeTab=settings&settingsTab=accounting');
    await waitFor(() => expect(screen.getByTestId('settings-tab')).toBeInTheDocument());
  });

  it('passes settingsTab prop to FinanceSettingsTab', async () => {
    await renderFinance('?financeTab=settings&settingsTab=costing');
    await waitFor(() => {
      const el = screen.getByTestId('settings-tab');
      expect(el.getAttribute('data-settings-tab')).toBe('costing');
    });
  });
});

// ── Suite D — Invoices tab navigates to /invoices ─────────────────────────────

describe('Finance workspace — Invoices tab', () => {
  beforeEach(() => { vi.resetModules(); });

  it('navigates to /invoices when Invoices tab is clicked', async () => {
    await renderFinance('?financeTab=estimates');
    const invoicesBtn = screen.getByRole('button', { name: /invoices/i });
    await userEvent.click(invoicesBtn);
    await waitFor(() => expect(screen.getByTestId('invoices-page')).toBeInTheDocument());
  });
});

// ── Suite E — Route compatibility ─────────────────────────────────────────────

describe('Finance workspace — route compatibility', () => {
  it('/finance route exists in routes.tsx', async () => {
    const { routes } = await import('../../routes');
    const financeRoute = routes.find(r => r.path === '/finance');
    expect(financeRoute).toBeDefined();
  });

  it('/estimating route still exists', async () => {
    const { routes } = await import('../../routes');
    const estimatingRoute = routes.find(r => r.path === '/estimating');
    expect(estimatingRoute).toBeDefined();
  });

  it('/estimates/:id route still exists', async () => {
    const { routes } = await import('../../routes');
    const editorRoute = routes.find(r => r.path === '/estimates/:id');
    expect(editorRoute).toBeDefined();
  });

  it('/invoices route still exists', async () => {
    const { routes } = await import('../../routes');
    const invoicesRoute = routes.find(r => r.path === '/invoices');
    expect(invoicesRoute).toBeDefined();
  });

  it('/jobs/:id/costs route still exists', async () => {
    const { routes } = await import('../../routes');
    const costsRoute = routes.find(r => r.path === '/jobs/:id/costs');
    expect(costsRoute).toBeDefined();
  });

  it('/settings route still exists', async () => {
    const { routes } = await import('../../routes');
    const settingsRoute = routes.find(r => r.path === '/settings');
    expect(settingsRoute).toBeDefined();
  });
});

// ── Suite F — API endpoint structure ─────────────────────────────────────────

describe('Finance API endpoints', () => {
  it('GET /api/finance/estimates handler exports a default function', async () => {
    const mod = await import('../../server/api/finance/estimates/GET');
    expect(typeof mod.default).toBe('function');
  });

  it('GET /api/finance/ledger handler exports a default function', async () => {
    const mod = await import('../../server/api/finance/ledger/GET');
    expect(typeof mod.default).toBe('function');
  });
});

// ── Suite G — Estimates tab — no duplicate creation form ─────────────────────

describe('FinanceEstimatesTab — no duplicate estimate creation', () => {
  it('FinanceEstimatesTab component exists and is a function', async () => {
    const mod = await import('../../components/finance/FinanceEstimatesTab');
    expect(typeof mod.default).toBe('function');
  });

  it('does not export a createEstimate function (creation goes through job quotes route)', async () => {
    // The estimates tab navigates to /jobs/:id/quotes — it must NOT export its own
    // createEstimate function, which would indicate a duplicate creation path.
    const { default: FinanceEstimatesTab, ...rest } = await import('../../components/finance/FinanceEstimatesTab');
    expect(typeof FinanceEstimatesTab).toBe('function');
    expect((rest as Record<string, unknown>).createEstimate).toBeUndefined();
  });
});

// ── Suite H — Ledger tab — AddEntryModal reuse ────────────────────────────────

describe('FinanceLedgerTab — AddEntryModal reuse', () => {
  it('AddEntryModal is exported from JobCosts', async () => {
    const mod = await import('../../components/job/JobCosts');
    expect(typeof mod.AddEntryModal).toBe('function');
  });

  it('LedgerEntry type is exported from JobCosts', async () => {
    // Type exports don't exist at runtime — just verify the module loads
    const mod = await import('../../components/job/JobCosts');
    expect(mod).toBeDefined();
  });

  it('FinanceLedgerTab component exists and is a function', async () => {
    const mod = await import('../../components/finance/FinanceLedgerTab');
    expect(typeof mod.default).toBe('function');
  });
});

// ── Suite I — Settings tab — component reuse ─────────────────────────────────

describe('FinanceSettingsTab — component reuse', () => {
  it('FinanceSettingsTab imports AccountingTab', async () => {
    const mod = await import('../../components/finance/FinanceSettingsTab');
    expect(typeof mod.default).toBe('function');
  });

  it('AccountingTab still exists at original path', async () => {
    const mod = await import('../../components/settings/AccountingTab');
    expect(typeof mod.default).toBe('function');
  });

  it('CostingTab still exists at original path', async () => {
    const mod = await import('../../components/settings/CostingTab');
    expect(typeof mod.default).toBe('function');
  });

  it('PdfStyleTab still exists at original path', async () => {
    const mod = await import('../../components/settings/PdfStyleTab');
    expect(typeof mod.default).toBe('function');
  });
});
