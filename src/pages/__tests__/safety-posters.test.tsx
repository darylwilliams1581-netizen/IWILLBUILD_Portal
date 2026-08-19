/**
 * safety-posters.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies that /safety/posters retains its existing content and controls
 * after the DesktopPageChrome refactor.
 *
 * Mocks all deep dependencies so the test stays focused on the page's own
 * structure: Helmet metadata, mobile header, back button, and PostersTab.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@dr.pogodin/react-helmet', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/DesktopTopBar', () => ({
  default: () => <div data-testid="desktop-top-bar" />,
}));

vi.mock('@/components/DesktopDock', () => ({
  default: () => <div data-testid="desktop-dock" />,
}));

vi.mock('@/components/PortalSidebar', () => ({
  default: () => <div data-testid="portal-sidebar" />,
}));

vi.mock('@/layouts/DesktopPageChrome', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <>
      <div data-testid="desktop-top-bar" />
      <div data-testid="desktop-dock" />
      {children}
    </>
  ),
}));

vi.mock('@/pages/safety', () => ({
  PostersTab: () => <div data-testid="posters-tab">PostersTab content</div>,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

import SafetyPostersPage from '../safety-posters';

describe('SafetyPostersPage (/safety/posters)', () => {
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
    const backBtn = screen.getByRole('button', { name: /back to home/i });
    expect(backBtn).toBeInTheDocument();
  });

  it('renders the mobile page heading', () => {
    renderPage();
    expect(screen.getByText('Safety Posters')).toBeInTheDocument();
  });

  it('renders DesktopTopBar via DesktopPageChrome', () => {
    renderPage();
    expect(screen.getByTestId('desktop-top-bar')).toBeInTheDocument();
  });

  it('renders DesktopDock via DesktopPageChrome', () => {
    renderPage();
    expect(screen.getByTestId('desktop-dock')).toBeInTheDocument();
  });

  it('renders PortalSidebar', () => {
    renderPage();
    expect(screen.getByTestId('portal-sidebar')).toBeInTheDocument();
  });

  it('does not render two DesktopTopBars', () => {
    renderPage();
    expect(screen.getAllByTestId('desktop-top-bar')).toHaveLength(1);
  });

  it('does not render two DesktopDocks', () => {
    renderPage();
    expect(screen.getAllByTestId('desktop-dock')).toHaveLength(1);
  });
});
