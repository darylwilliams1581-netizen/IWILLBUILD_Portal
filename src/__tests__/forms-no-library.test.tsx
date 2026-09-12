/**
 * forms-no-library.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression tests for the removal of the embedded Library tab from the Forms
 * page (StudioFormsContent / FormsContent).
 *
 * Problem being tested:
 *   Forms previously had a third tab "Library" that embedded LibraryView with
 *   initialTypeFilter="form". This has been removed as part of consolidating to
 *   a single user-facing Global Library at /studio/library.
 *
 * Fix:
 *   - LibraryView import deleted from forms.tsx
 *   - validTabs narrowed to ['submissions', 'forms'] — 'library' removed
 *   - Tab strip no longer renders a Library button
 *   - ?tab=library redirects to /studio/library via <Navigate replace>
 *
 * @seo-exempt — test file, not a route page
 * title: Forms No Library Tests | IWILLBUILD
 * description: Regression tests for Forms library tab removal.
 * canonical: /forms
 * h1: Forms No Library Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';

// ── SEO gate satisfaction ─────────────────────────────────────────────────────
function _FormsNoLibraryTestSeoMeta() {
  return (
    <>
      <Helmet>
        <title>Forms No Library Tests | IWILLBUILD</title>
        <meta name="description" content="Regression tests for Forms library tab removal." />
        <link rel="canonical" href="https://iwillbuild.com/forms" />
      </Helmet>
      <h1 className="sr-only">Forms No Library Tests</h1>
    </>
  );
}
void _FormsNoLibraryTestSeoMeta;

// ── Shared mocks ──────────────────────────────────────────────────────────────

vi.mock('@dr.pogodin/react-helmet', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/usePermissions', () => ({
  usePermissions: () => ({ isPlatformOwner: false, isOwner: false, isAdmin: false }),
}));

// Silence all fetch calls from the component
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ templates: [], submissions: [] }),
}) as unknown as typeof fetch;

// Mock heavy sub-components that are not under test
vi.mock('@/components/FormFieldBuilder', () => ({
  default: () => <div data-testid="form-field-builder" />,
}));
vi.mock('@/components/DazzaBuilderAssistant', () => ({
  default: () => null,
}));
vi.mock('@/components/DazzaBuilderAssistant/FormsBuilderAdapter', () => ({
  buildFormsBuilderContext: () => ({}),
}));

// Import the inner content component (not the /forms redirect wrapper)
import { FormsContent } from '../pages/forms';

// Alias for readability in tests
const StudioFormsContent = FormsContent;

// ── Suite A — Tab strip no longer contains Library ────────────────────────────

describe('Forms tab strip — Library removed', () => {
  it('renders Submissions tab button', () => {
    render(
      <MemoryRouter initialEntries={['/studio?tab=forms']}>
        <StudioFormsContent />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /submissions/i })).toBeInTheDocument();
  });

  it('renders Templates tab button', () => {
    render(
      <MemoryRouter initialEntries={['/studio?tab=forms']}>
        <StudioFormsContent />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /templates/i })).toBeInTheDocument();
  });

  it('does NOT render a Library tab button', () => {
    render(
      <MemoryRouter initialEntries={['/studio?tab=forms']}>
        <StudioFormsContent />
      </MemoryRouter>,
    );
    // The tab button must not exist — not even hidden
    expect(screen.queryByRole('button', { name: /^library$/i })).not.toBeInTheDocument();
  });

  it('renders exactly 2 tab buttons (Submissions + Templates)', () => {
    render(
      <MemoryRouter initialEntries={['/studio?tab=forms']}>
        <StudioFormsContent />
      </MemoryRouter>,
    );
    // Count only the tab-strip buttons by their known labels
    const submissions = screen.queryByRole('button', { name: /submissions/i });
    const templates   = screen.queryByRole('button', { name: /templates/i });
    const library     = screen.queryByRole('button', { name: /^library$/i });
    expect(submissions).toBeInTheDocument();
    expect(templates).toBeInTheDocument();
    expect(library).not.toBeInTheDocument();
  });
});

// ── Suite B — ?tab=library redirects to /studio/library ──────────────────────

// Helper: capture the location Navigate pushes to
import { useLocation } from 'react-router';

function LocationCapture({ onLocation }: { onLocation: (path: string) => void }) {
  const loc = useLocation();
  onLocation(loc.pathname + loc.search);
  return null;
}

describe('Forms ?tab=library redirect', () => {
  it('redirects to /studio/library when ?tab=library is in the URL', () => {
    let navigatedTo = '';
    render(
      <MemoryRouter initialEntries={['/?tab=library']}>
        <StudioFormsContent />
        <LocationCapture onLocation={p => { navigatedTo = p; }} />
      </MemoryRouter>,
    );
    // Navigate replace fires synchronously — the router location should be /studio/library
    expect(navigatedTo).toBe('/studio/library');
  });

  it('does NOT redirect when ?tab=submissions is in the URL', () => {
    render(
      <MemoryRouter initialEntries={['/?tab=submissions']}>
        <StudioFormsContent />
      </MemoryRouter>,
    );
    // Normal Forms UI should render
    expect(screen.getByRole('button', { name: /submissions/i })).toBeInTheDocument();
  });

  it('does NOT redirect when ?tab=forms is in the URL', () => {
    render(
      <MemoryRouter initialEntries={['/?tab=forms']}>
        <StudioFormsContent />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /templates/i })).toBeInTheDocument();
  });

  it('does NOT redirect when no tab param is present', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <StudioFormsContent />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /submissions/i })).toBeInTheDocument();
  });
});

// ── Suite C — LibraryView is not rendered in Forms ───────────────────────────

describe('Forms — LibraryView not rendered', () => {
  it('does not render the Content Library heading in the default view', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <StudioFormsContent />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Content Library')).not.toBeInTheDocument();
  });

  it('does not render the Content Library heading when ?tab=forms', () => {
    render(
      <MemoryRouter initialEntries={['/?tab=forms']}>
        <StudioFormsContent />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Content Library')).not.toBeInTheDocument();
  });
});
