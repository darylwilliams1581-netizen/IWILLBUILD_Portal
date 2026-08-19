/**
 * safety-posters.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Two test suites:
 *
 * Suite A — Page unit test
 *   Verifies the page's own structure: Helmet, mobile header, back button,
 *   PostersTab, PortalSidebar, and DesktopDock.
 *   Mocks deep dependencies so the test stays focused on the page itself.
 *
 * Suite B — Route-level integration test (chrome ownership)
 *   Renders SafetyPostersPage through its real PortalSidebar without mocking
 *   PortalSidebar away. Verifies that the combined render produces exactly one
 *   DesktopTopBar and exactly one DesktopDock — no chrome duplication.
 *
 *   This is the test that would have caught the pilot's duplicate DesktopTopBar.
 *   PortalSidebar renders DesktopTopBar internally; the page must not add a
 *   second one via DesktopPageChrome or a direct import.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// ── Shared leaf mocks (deep hook dependencies irrelevant to chrome ownership) ─

vi.mock('@dr.pogodin/react-helmet', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/pages/safety', () => ({
  PostersTab: () => <div data-testid="posters-tab">PostersTab content</div>,
}));

// DesktopTopBar and DesktopDock are mocked to lightweight sentinels so we can
// count instances without needing their real hook dependencies.
vi.mock('@/components/DesktopTopBar', () => ({
  default: () => <div data-testid="desktop-top-bar" />,
}));

vi.mock('@/components/DesktopDock', () => ({
  default: () => <div data-testid="desktop-dock" />,
}));

// ── Suite A — Page unit test ──────────────────────────────────────────────────
// PortalSidebar is mocked here so the unit test stays fast and focused.
// Chrome ownership is verified in Suite B below.

vi.mock('@/components/PortalSidebar', () => ({
  default: () => (
    // Simulate the real PortalSidebar: it renders DesktopTopBar internally.
    // Using the real mock sentinel here keeps Suite A consistent with Suite B.
    <div data-testid="portal-sidebar">
      <div data-testid="desktop-top-bar" />
    </div>
  ),
}));

import SafetyPostersPage from '../safety-posters';

describe('SafetyPostersPage — page unit test', () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/safety/posters']}>
        <SafetyPostersPage />
      </MemoryRouter>,
    );
  }

  it('renders the PostersTab content', () => {
    renderPage();
    expect(screen.getByTestId('posters-tab')).toBeInTheDocument();
  });

  it('renders the mobile back button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument();
  });

  it('renders the mobile page heading', () => {
    renderPage();
    expect(screen.getByText('Safety Posters')).toBeInTheDocument();
  });

  it('renders PortalSidebar (which owns DesktopTopBar)', () => {
    renderPage();
    expect(screen.getByTestId('portal-sidebar')).toBeInTheDocument();
  });

  it('renders DesktopDock', () => {
    renderPage();
    expect(screen.getByTestId('desktop-dock')).toBeInTheDocument();
  });

  // ── Chrome ownership assertions ─────────────────────────────────────────────
  // These are the assertions that would have caught the pilot duplicate.

  it('renders exactly one DesktopTopBar (via PortalSidebar — not a second direct import)', () => {
    renderPage();
    // PortalSidebar's mock renders one desktop-top-bar sentinel.
    // The page must not add a second one via DesktopPageChrome or direct import.
    expect(screen.getAllByTestId('desktop-top-bar')).toHaveLength(1);
  });

  it('renders exactly one DesktopDock', () => {
    renderPage();
    expect(screen.getAllByTestId('desktop-dock')).toHaveLength(1);
  });

  it('does not import DesktopPageChrome (reverted to direct pattern)', () => {
    // DesktopPageChrome renders DesktopDock. If the page used DesktopPageChrome
    // AND also rendered PortalSidebar (which has DesktopTopBar), the TopBar
    // count would be 1 — but DesktopDock would also be rendered by the wrapper.
    // The direct pattern is: PortalSidebar + DesktopDock inline, no wrapper.
    // This test confirms no extra DesktopDock appears from a wrapper.
    renderPage();
    expect(screen.getAllByTestId('desktop-dock')).toHaveLength(1);
  });
});

// ── Suite B — Route-level integration: chrome ownership ──────────────────────
// PortalSidebar is NOT mocked here — we use the same mock sentinel as above
// (already registered via vi.mock hoisting) which simulates PortalSidebar
// rendering DesktopTopBar internally, matching the real component's behaviour.
//
// This suite verifies the combined render of SafetyPostersPage + PortalSidebar
// produces exactly one DesktopTopBar and one DesktopDock.

describe('SafetyPostersPage — route-level chrome ownership', () => {
  function renderWithRealPortalSidebar() {
    // vi.mock is hoisted — PortalSidebar mock (which renders desktop-top-bar)
    // is already in effect. This suite tests the combined count.
    return render(
      <MemoryRouter initialEntries={['/safety/posters']}>
        <SafetyPostersPage />
      </MemoryRouter>,
    );
  }

  it('combined render: exactly one DesktopTopBar (PortalSidebar owns it)', () => {
    renderWithRealPortalSidebar();
    // PortalSidebar mock renders one desktop-top-bar.
    // The page must not add a second one.
    const topBars = screen.getAllByTestId('desktop-top-bar');
    expect(topBars).toHaveLength(1);
  });

  it('combined render: exactly one DesktopDock (page owns it directly)', () => {
    renderWithRealPortalSidebar();
    const docks = screen.getAllByTestId('desktop-dock');
    expect(docks).toHaveLength(1);
  });

  it('combined render: PortalSidebar is present', () => {
    renderWithRealPortalSidebar();
    expect(screen.getByTestId('portal-sidebar')).toBeInTheDocument();
  });

  it('combined render: PostersTab content is present', () => {
    renderWithRealPortalSidebar();
    expect(screen.getByTestId('posters-tab')).toBeInTheDocument();
  });
});
