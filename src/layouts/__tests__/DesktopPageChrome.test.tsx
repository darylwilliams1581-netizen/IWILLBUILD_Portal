/**
 * DesktopPageChrome.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the DesktopPageChrome layout wrapper.
 *
 * Scope:
 *   1. Renders its children
 *   2. Renders exactly one DesktopTopBar
 *   3. Renders exactly one DesktopDock
 *
 * DesktopTopBar and DesktopDock are mocked — they have deep hook dependencies
 * (usePermissions, useNavigate, useLocation, useDriverSessionSafe, etc.) that
 * are irrelevant to what this wrapper is responsible for.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DesktopPageChrome from '../DesktopPageChrome';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/components/DesktopTopBar', () => ({
  default: () => <div data-testid="desktop-top-bar" />,
}));

vi.mock('@/components/DesktopDock', () => ({
  default: () => <div data-testid="desktop-dock" />,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DesktopPageChrome', () => {
  it('renders its children', () => {
    render(
      <DesktopPageChrome>
        <p data-testid="child-content">Hello from child</p>
      </DesktopPageChrome>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Hello from child')).toBeInTheDocument();
  });

  it('renders exactly one DesktopTopBar', () => {
    render(
      <DesktopPageChrome>
        <span>content</span>
      </DesktopPageChrome>,
    );

    const topBars = screen.getAllByTestId('desktop-top-bar');
    expect(topBars).toHaveLength(1);
  });

  it('renders exactly one DesktopDock', () => {
    render(
      <DesktopPageChrome>
        <span>content</span>
      </DesktopPageChrome>,
    );

    const docks = screen.getAllByTestId('desktop-dock');
    expect(docks).toHaveLength(1);
  });

  it('renders children alongside the chrome components', () => {
    render(
      <DesktopPageChrome>
        <section data-testid="page-section">Page content</section>
      </DesktopPageChrome>,
    );

    // All three are present in the same render
    expect(screen.getByTestId('desktop-top-bar')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-dock')).toBeInTheDocument();
    expect(screen.getByTestId('page-section')).toBeInTheDocument();
  });

  it('renders multiple children correctly', () => {
    render(
      <DesktopPageChrome>
        <div data-testid="child-a">A</div>
        <div data-testid="child-b">B</div>
      </DesktopPageChrome>,
    );

    expect(screen.getByTestId('child-a')).toBeInTheDocument();
    expect(screen.getByTestId('child-b')).toBeInTheDocument();
  });
});
