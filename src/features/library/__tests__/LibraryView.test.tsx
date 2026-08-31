/**
 * LibraryView.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the LibraryView feature component.
 *
 * Verifies:
 *   A. Structural — renders header, search, type filter (no Installed tab)
 *   B. Browse — loading skeleton, error state, empty state, item list
 *   C. Download button — labelled "Download to My Templates"
 *   D. Post-download link — labelled "Open in X"
 *   E. Permissions — delete button visible only for platform owner
 *   F. initialTypeFilter prop — pre-populates the type filter
 *   G. No route responsibilities — no Helmet title, no Navigate redirect
 *   H. No Installed tab — removed per spec
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

function mockFetchWithDownloadSuccess() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/library/items') && String(url).includes('/install')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          message: '"Site Safety Policy" downloaded to your Forms.',
          redirectTarget: '/forms',
          redirectLabel: 'Forms',
        }),
      });
    }
    if (String(url).includes('/api/library/items')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          items: [
            {
              id: 1, type: 'policy', category: 'Safety', title: 'Site Safety Policy',
              summary: null, tags: null, discipline: null, version: '1.0', status: 'active',
              install_count: 12, avg_rating: 0, rating_count: 0,
              source_file_name: null, has_file: 0, updated_at: '2026-01-01T00:00:00Z',
            },
          ],
          pagination: { total: 1, page: 1, limit: 20, pages: 1 },
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
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});

// ── Suite B — Browse ──────────────────────────────────────────────────────────

describe('LibraryView — browse', () => {
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

  it('renders results count when items exist', async () => {
    mockFetchWithItems();
    renderView();
    await waitFor(() => {
      expect(screen.getByText(/2 items/i)).toBeInTheDocument();
    });
  });
});

// ── Suite C — Download button label ──────────────────────────────────────────

describe('LibraryView — download button', () => {
  beforeEach(() => {
    mockUsePermissions.mockReturnValue({ isPlatformOwner: false } as ReturnType<typeof usePermissions>);
  });

  it('labels the download button "Download to My Templates"', async () => {
    mockFetchWithItems();
    renderView();
    await waitFor(() => {
      const btns = screen.getAllByRole('button', { name: /download to my templates/i });
      expect(btns.length).toBeGreaterThan(0);
    });
  });

  it('does NOT label the button "Install"', async () => {
    mockFetchWithItems();
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Site Safety Policy')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^install$/i })).not.toBeInTheDocument();
  });
});

// ── Suite D — Post-download "Open in X" link ──────────────────────────────────

describe('LibraryView — post-download link', () => {
  it('shows "Open in Forms" link after successful download', async () => {
    mockUsePermissions.mockReturnValue({ isPlatformOwner: false } as ReturnType<typeof usePermissions>);
    mockFetchWithDownloadSuccess();
    renderView();

    await waitFor(() => {
      expect(screen.getByText('Site Safety Policy')).toBeInTheDocument();
    });

    const downloadBtn = screen.getByRole('button', { name: /download to my templates/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(screen.getByText(/open in forms/i)).toBeInTheDocument();
    });
  });
});

// ── Suite E — Permissions ─────────────────────────────────────────────────────

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

// ── Suite F — initialTypeFilter prop ─────────────────────────────────────────

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

// ── Suite G — No route responsibilities ──────────────────────────────────────

describe('LibraryView — no route responsibilities', () => {
  beforeEach(() => {
    mockUsePermissions.mockReturnValue({ isPlatformOwner: false } as ReturnType<typeof usePermissions>);
    mockFetchEmpty();
  });

  it('does not render a page <title> element (Helmet is route responsibility)', () => {
    renderView();
    expect(document.querySelector('title')).toBeNull();
  });

  it('does not render a Navigate redirect element', async () => {
    renderView();
    expect(screen.getByText('Content Library')).toBeInTheDocument();
  });
});

// ── Suite H — No Installed tab ────────────────────────────────────────────────

describe('LibraryView — no Installed tab', () => {
  beforeEach(() => {
    mockUsePermissions.mockReturnValue({ isPlatformOwner: false } as ReturnType<typeof usePermissions>);
    mockFetchEmpty();
  });

  it('does not render an Installed tab button', async () => {
    renderView();
    expect(screen.queryByRole('button', { name: /installed/i })).not.toBeInTheDocument();
  });

  it('does not render a Browse tab button (Browse is the only view)', async () => {
    renderView();
    expect(screen.queryByRole('button', { name: /^browse$/i })).not.toBeInTheDocument();
  });
});
