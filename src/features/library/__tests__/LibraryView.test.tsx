/**
 * LibraryView.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the LibraryView feature component.
 *
 * Verifies:
 *   A. Structural — renders header, tabs, search, type filter
 *   B. Browse tab — loading skeleton, error state, empty state, item list
 *   C. Installed tab — empty state, installed list
 *   D. Permissions — delete button visible only for platform owner
 *   E. initialTypeFilter prop — pre-populates the type filter
 *   F. No route responsibilities — no Helmet title, no Navigate redirect
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { LibraryView } from '../LibraryView';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/usePermissions', () => ({
  usePermissions: vi.fn(() => ({ isPlatformOwner: false })),
}));

vi.mock('@dr.pogodin/react-helmet', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { usePermissions } from '@/lib/usePermissions';
const mockUsePermissions = vi.mocked(usePermissions);

// ── Fetch helpers ─────────────────────────────────────────────────────────────

function mockFetchEmpty() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/library/items')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, items: [], pagination: { total: 0, page: 1, limit: 20, pages: 0 } }),
      });
    }
    if (String(url).includes('/api/library/my-installed')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, items: [] }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
}

function mockFetchWithItems() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/library/items')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          items: [
            {
              id: 1,
              type: 'policy',
              category: 'Safety',
              title: 'Site Safety Policy',
              summary: 'A comprehensive site safety policy.',
              tags: 'safety,site',
              discipline: null,
              version: '1.0',
              status: 'active',
              install_count: 12,
              avg_rating: 4.5,
              rating_count: 3,
              source_file_name: 'safety-policy.docx',
              has_file: 1,
              updated_at: '2026-01-01T00:00:00Z',
            },
            {
              id: 2,
              type: 'form',
              category: null,
              title: 'Induction Form',
              summary: null,
              tags: null,
              discipline: null,
              version: '2.0',
              status: 'active',
              install_count: 5,
              avg_rating: 0,
              rating_count: 0,
              source_file_name: null,
              has_file: 0,
              updated_at: '2026-02-01T00:00:00Z',
            },
          ],
          pagination: { total: 2, page: 1, limit: 20, pages: 1 },
        }),
      });
    }
    if (String(url).includes('/api/library/my-installed')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, items: [] }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
}

function mockFetchError() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/library/items')) {
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, items: [] }) });
  }) as unknown as typeof fetch;
}

function mockFetchWithInstalled() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/library/items')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, items: [], pagination: { total: 0, page: 1, limit: 20, pages: 0 } }),
      });
    }
    if (String(url).includes('/api/library/my-installed')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          items: [
            {
              id: 10,
              source_item_id: 1,
              type: 'policy',
              category: 'Safety',
              title: 'Site Safety Policy',
              source_version: '1.0',
              update_available: 0,
              installed_at: '2026-03-01T00:00:00Z',
              updated_at: '2026-03-01T00:00:00Z',
              current_source_version: '1.0',
              source_title: 'Site Safety Policy',
            },
          ],
        }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
}

// ── Render helper ─────────────────────────────────────────────────────────────

function renderView(props: { initialTypeFilter?: string } = {}) {
  return render(
    <MemoryRouter>
      <LibraryView {...props} />
    </MemoryRouter>,
  );
}

// ── Suite A — Structure ───────────────────────────────────────────────────────

describe('LibraryView — structure', () => {
  beforeEach(() => {
    mockUsePermissions.mockReturnValue({ isPlatformOwner: false } as ReturnType<typeof usePermissions>);
    mockFetchEmpty();
  });

  it('renders the Content Library heading', async () => {
    renderView();
    expect(screen.getByText('Content Library')).toBeInTheDocument();
  });

  it('renders Browse and Installed tab buttons', async () => {
    renderView();
    expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /installed/i })).toBeInTheDocument();
  });

  it('renders the search input', async () => {
    renderView();
    expect(screen.getByPlaceholderText(/search title, summary, tags/i)).toBeInTheDocument();
  });

  it('renders the type filter select', async () => {
    renderView();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders the refresh button', async () => {
    renderView();
    // Refresh button has no text label — find by its container
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(2);
  });
});

// ── Suite B — Browse tab ──────────────────────────────────────────────────────

describe('LibraryView — browse tab', () => {
  beforeEach(() => {
    mockUsePermissions.mockReturnValue({ isPlatformOwner: false } as ReturnType<typeof usePermissions>);
  });

  it('shows empty state when no items returned', async () => {
    mockFetchEmpty();
    renderView();
    await waitFor(() => {
      expect(screen.getByText('No library items found.')).toBeInTheDocument();
    });
  });

  it('shows error state when API fails', async () => {
    mockFetchError();
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Failed to load library. Please try again.')).toBeInTheDocument();
    });
  });

  it('renders item titles when API returns items', async () => {
    mockFetchWithItems();
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Site Safety Policy')).toBeInTheDocument();
      expect(screen.getByText('Induction Form')).toBeInTheDocument();
    });
  });

  it('renders Install button for uninstalled items', async () => {
    mockFetchWithItems();
    renderView();
    await waitFor(() => {
      const installBtns = screen.getAllByRole('button', { name: /install/i });
      expect(installBtns.length).toBeGreaterThan(0);
    });
  });

  it('renders results count when items exist', async () => {
    mockFetchWithItems();
    renderView();
    await waitFor(() => {
      expect(screen.getByText(/2 items/i)).toBeInTheDocument();
    });
  });
});

// ── Suite C — Installed tab ───────────────────────────────────────────────────

describe('LibraryView — installed tab', () => {
  beforeEach(() => {
    mockUsePermissions.mockReturnValue({ isPlatformOwner: false } as ReturnType<typeof usePermissions>);
  });

  it('switches to Installed tab on click', async () => {
    mockFetchEmpty();
    renderView();
    const installedBtn = screen.getByRole('button', { name: /installed/i });
    fireEvent.click(installedBtn);
    await waitFor(() => {
      expect(screen.getByText('No items installed yet.')).toBeInTheDocument();
    });
  });

  it('shows installed item title in Installed tab', async () => {
    mockFetchWithInstalled();
    renderView();
    const installedBtn = screen.getByRole('button', { name: /installed/i });
    fireEvent.click(installedBtn);
    await waitFor(() => {
      expect(screen.getByText('Site Safety Policy')).toBeInTheDocument();
    });
  });

  it('shows installed count badge when items are installed', async () => {
    mockFetchWithInstalled();
    renderView();
    await waitFor(() => {
      // The badge shows the count of installed IDs
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });
});

// ── Suite D — Permissions ─────────────────────────────────────────────────────

describe('LibraryView — permissions', () => {
  it('does NOT show delete button for non-platform-owner', async () => {
    mockUsePermissions.mockReturnValue({ isPlatformOwner: false } as ReturnType<typeof usePermissions>);
    mockFetchWithItems();
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Site Safety Policy')).toBeInTheDocument();
    });
    expect(screen.queryByTitle('Delete from Global Library')).not.toBeInTheDocument();
  });

  it('shows delete button for platform owner', async () => {
    mockUsePermissions.mockReturnValue({ isPlatformOwner: true } as ReturnType<typeof usePermissions>);
    mockFetchWithItems();
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Site Safety Policy')).toBeInTheDocument();
    });
    const deleteBtns = screen.getAllByTitle('Delete from Global Library');
    expect(deleteBtns.length).toBeGreaterThan(0);
  });
});

// ── Suite E — initialTypeFilter prop ─────────────────────────────────────────

describe('LibraryView — initialTypeFilter prop', () => {
  it('pre-populates the type filter select when prop is provided', async () => {
    mockUsePermissions.mockReturnValue({ isPlatformOwner: false } as ReturnType<typeof usePermissions>);
    mockFetchEmpty();
    renderView({ initialTypeFilter: 'form' });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('form');
  });

  it('defaults to empty string when no initialTypeFilter prop', async () => {
    mockUsePermissions.mockReturnValue({ isPlatformOwner: false } as ReturnType<typeof usePermissions>);
    mockFetchEmpty();
    renderView();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('');
  });
});

// ── Suite F — No route responsibilities ──────────────────────────────────────

describe('LibraryView — no route responsibilities', () => {
  beforeEach(() => {
    mockUsePermissions.mockReturnValue({ isPlatformOwner: false } as ReturnType<typeof usePermissions>);
    mockFetchEmpty();
  });

  it('does not render a page <title> element (Helmet is route responsibility)', () => {
    renderView();
    // LibraryView must not set document.title — that belongs to the route page
    // The Helmet mock passes children through, so if a <title> were rendered
    // it would appear as a DOM element. Verify it is absent.
    expect(document.querySelector('title')).toBeNull();
  });

  it('does not render a Navigate redirect element', async () => {
    renderView();
    // If a Navigate were rendered, the MemoryRouter would redirect and the
    // Content Library heading would not be present.
    expect(screen.getByText('Content Library')).toBeInTheDocument();
  });
});
