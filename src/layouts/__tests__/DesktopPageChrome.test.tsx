/**
 * DesktopPageChrome.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the DesktopPageChrome layout wrapper.
 *
 * Ownership model:
 *   DesktopTopBar — owned by PortalSidebar; NOT rendered by this wrapper.
 *   DesktopDock   — NOT owned by PortalSidebar; rendered by this wrapper.
 *
 * Tests verify:
 *   1. Renders its children
 *   2. Renders exactly one DesktopDock
 *   3. Does NOT render DesktopTopBar (PortalSidebar owns it)
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

  it('renders exactly one DesktopDock', () => {
    render(
      <DesktopPageChrome>
        <span>content</span>
      </DesktopPageChrome>,
    );

    const docks = screen.getAllByTestId('desktop-dock');
    expect(docks).toHaveLength(1);
  });

  it('does NOT render DesktopTopBar — PortalSidebar owns it', () => {
    render(
      <DesktopPageChrome>
        <span>content</span>
      </DesktopPageChrome>,
    );

    // PortalSidebar renders DesktopTopBar; this wrapper must never add a second one.
    expect(screen.queryByTestId('desktop-top-bar')).not.toBeInTheDocument();
  });

  it('renders children alongside DesktopDock', () => {
    render(
      <DesktopPageChrome>
        <section data-testid="page-section">Page content</section>
      </DesktopPageChrome>,
    );

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
