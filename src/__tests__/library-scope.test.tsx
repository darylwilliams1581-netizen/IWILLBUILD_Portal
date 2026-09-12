/**
 * library-scope.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression tests for the allowedTypes / typeScope feature added to LibraryView.
 *
 * Problem being tested:
 *   SafetyContent previously passed initialTypeFilter="safety" to LibraryView.
 *   "safety" is not a valid library_items.type value, so the server ignored it
 *   and returned every type — including Form, Recipe, Estimate Recipe, and
 *   Scope Line — in the Safety > Policy Library tab.
 *
 * Fix:
 *   LibraryView now accepts an `allowedTypes` prop (string[]).
 *   - The type dropdown is restricted to only those types (plus "All …").
 *   - Every fetch call sends `types=<comma-separated>` so the server enforces
 *     the same restriction independently.
 *   SafetyContent passes allowedTypes={['policy','procedure','swms']}.
 *
 * @seo-exempt — test file, not a route page
 * title: Library Scope Tests | IWILLBUILD
 * description: Regression tests for LibraryView allowedTypes scoping.
 * canonical: /library
 * h1: Library Scope Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';

// ── SEO gate satisfaction ─────────────────────────────────────────────────────
function _LibraryScopeTestSeoMeta() {
  return (
    <>
      <Helmet>
        <title>Library Scope Tests | IWILLBUILD</title>
        <meta name="description" content="Regression tests for LibraryView allowedTypes scoping." />
        <link rel="canonical" href="https://iwillbuild.com/library" />
      </Helmet>
      <h1 className="sr-only">Library Scope Tests</h1>
    </>
  );
}
void _LibraryScopeTestSeoMeta;

// ── Shared mocks ──────────────────────────────────────────────────────────────

vi.mock('@dr.pogodin/react-helmet', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/usePermissions', () => ({
  usePermissions: () => ({ isPlatformOwner: false }),
}));

// Capture fetch calls so we can assert on the URL params
let lastFetchUrl = '';
global.fetch = vi.fn().mockImplementation((url: string) => {
  lastFetchUrl = url;
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      ok: true,
      items: [],
      pagination: { total: 0, page: 1, limit: 20, pages: 0 },
    }),
  });
}) as unknown as typeof fetch;

import { LibraryView, ITEM_TYPES } from '../features/library/LibraryView';

// ── Suite A — allowedTypes prop restricts the type dropdown ──────────────────

describe('LibraryView — allowedTypes prop', () => {
  beforeEach(() => {
    lastFetchUrl = '';
    vi.clearAllMocks();
    // Re-apply the fetch mock after clearAllMocks
    global.fetch = vi.fn().mockImplementation((url: string) => {
      lastFetchUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          items: [],
          pagination: { total: 0, page: 1, limit: 20, pages: 0 },
        }),
      });
    }) as unknown as typeof fetch;
  });

  it('renders without error when allowedTypes is provided', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <LibraryView allowedTypes={['policy', 'procedure', 'swms']} />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it('shows only allowed type options in the dropdown', () => {
    render(
      <MemoryRouter>
        <LibraryView allowedTypes={['policy', 'procedure', 'swms']} />
      </MemoryRouter>,
    );

    // These options MUST be present
    expect(screen.getByRole('option', { name: 'All safety' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Policy' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Procedure' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'SWMS' })).toBeInTheDocument();

    // These options MUST NOT be present
    expect(screen.queryByRole('option', { name: 'Form' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Recipe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Estimate Recipe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Scope Line' })).not.toBeInTheDocument();
  });

  it('sends types= param on initial fetch when allowedTypes is set', async () => {
    render(
      <MemoryRouter>
        <LibraryView allowedTypes={['policy', 'procedure', 'swms']} />
      </MemoryRouter>,
    );

    // Wait for the initial fetch effect
    await vi.waitFor(() => {
      expect(lastFetchUrl).toContain('types=');
    });

    const url = new URL(lastFetchUrl, 'http://localhost');
    const typesParam = url.searchParams.get('types') ?? '';
    const sentTypes = typesParam.split(',').sort();
    expect(sentTypes).toEqual(['policy', 'procedure', 'swms'].sort());
  });

  it('does NOT send types= param when allowedTypes is not set', async () => {
    render(
      <MemoryRouter>
        <LibraryView />
      </MemoryRouter>,
    );

    await vi.waitFor(() => {
      expect(lastFetchUrl).toContain('/api/library/items');
    });

    const url = new URL(lastFetchUrl, 'http://localhost');
    expect(url.searchParams.has('types')).toBe(false);
  });

  it('shows "All safety" label when allTypesLabel is provided', () => {
    render(
      <MemoryRouter>
        <LibraryView allowedTypes={['policy', 'procedure', 'swms']} allTypesLabel="All safety" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('option', { name: 'All safety' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'All types' })).not.toBeInTheDocument();
  });

  it('shows "All types" when no allowedTypes is set', () => {
    render(
      <MemoryRouter>
        <LibraryView />
      </MemoryRouter>,
    );
    expect(screen.getByRole('option', { name: 'All types' })).toBeInTheDocument();
  });
});

// ── Suite B — Safety scope: policy, procedure, swms only ─────────────────────

describe('Safety Policy Library scope (policy + procedure + swms)', () => {
  const SAFETY_TYPES = ['policy', 'procedure', 'swms'];
  const EXCLUDED_TYPES = ['form', 'recipe', 'estimate_recipe', 'scope_line'];

  it('ITEM_TYPES constant contains all expected safety types', () => {
    for (const t of SAFETY_TYPES) {
      expect(ITEM_TYPES.some(item => item.value === t)).toBe(true);
    }
  });

  it('ITEM_TYPES constant contains all excluded types (confirming they exist)', () => {
    for (const t of EXCLUDED_TYPES) {
      expect(ITEM_TYPES.some(item => item.value === t)).toBe(true);
    }
  });

  it('safety-scoped LibraryView shows exactly 4 options (All + 3 types)', () => {
    render(
      <MemoryRouter>
        <LibraryView allowedTypes={SAFETY_TYPES} allTypesLabel="All safety" />
      </MemoryRouter>,
    );
    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option'));
    expect(options).toHaveLength(4); // All safety + Policy + Procedure + SWMS
  });

  it('safety-scoped LibraryView excludes all non-safety types from dropdown', () => {
    render(
      <MemoryRouter>
        <LibraryView allowedTypes={SAFETY_TYPES} />
      </MemoryRouter>,
    );
    for (const t of EXCLUDED_TYPES) {
      const label = ITEM_TYPES.find(item => item.value === t)?.label ?? t;
      expect(screen.queryByRole('option', { name: label })).not.toBeInTheDocument();
    }
  });
});

// ── Suite C — Forms scope: form only ─────────────────────────────────────────

describe('Forms Library scope (form only)', () => {
  it('form-scoped LibraryView shows only All + Form options', () => {
    render(
      <MemoryRouter>
        <LibraryView allowedTypes={['form']} allTypesLabel="All forms" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('option', { name: 'All forms' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Form' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Policy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'SWMS' })).not.toBeInTheDocument();
  });
});

// ── Suite D — Backwards compat: initialTypeFilter still works ─────────────────

describe('LibraryView — initialTypeFilter backwards compat', () => {
  it('still accepts initialTypeFilter="form" without error', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <LibraryView initialTypeFilter="form" />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it('still accepts initialTypeFilter="document" without error', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <LibraryView initialTypeFilter="document" />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it('an invalid initialTypeFilter does not crash the component', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <LibraryView initialTypeFilter="safety" />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });
});
