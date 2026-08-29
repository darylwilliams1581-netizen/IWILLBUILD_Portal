/**
 * block-canvas-page-surface — regression tests for Studio block canvas page surface colour
 * ─────────────────────────────────────────────────────────────────────────────
 * S1  The page div carries the bg-white Tailwind class (solid white surface)
 * S2  The workspace scroll container carries bg-slate-100 (neutral surround)
 * S3  The empty-state page div also carries bg-white
 * S4  A non-white theme.backgroundColor does NOT bleed onto the page surface
 *     (inline style must not set backgroundColor on the page div)
 * S5  Page shadow and rounded corners are unchanged
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import BlockCanvas from '../BlockCanvas';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('motion/react', () => ({
  motion: {
    div: React.forwardRef(
      ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>, ref: React.Ref<HTMLDivElement>) => (
        <div ref={ref} data-testid="motion-block" {...rest}>{children}</div>
      )
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Deliberately non-white theme.backgroundColor — if this bleeds onto the page
// surface the S4 assertion will catch it.
const NON_WHITE_THEME = {
  backgroundColor: '#c7d2fe', // slate-blue tint — the colour the bug would produce
  accentColor: '#7c3aed',
  textColor: '#1e293b',
  tableHeaderColor: '#1e293b',
  tableHeaderTextColor: '#ffffff',
};

vi.mock('../useDocumentStore', () => ({
  useDocumentStore: (selector?: (s: unknown) => unknown) => {
    const state = {
      blocks: [],
      selection: { blockId: null },
      mode: 'edit' as const,
      pageLayout: { margins: 'standard', orientation: 'portrait' as const },
      theme: NON_WHITE_THEME,
      logicRules: [],
      select: vi.fn(),
      deselect: vi.fn(),
      moveBlock: vi.fn(),
      removeBlock: vi.fn(),
      setFillValues: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── S1: Page div carries bg-white ───────────────────────────────────────────

describe('S1 — Page div carries bg-white class (solid white surface)', () => {
  it('studio-doc-page element has bg-white in its className', () => {
    const { container } = render(<BlockCanvas zoom={100} />);
    const page = container.querySelector('[data-doc-page]') as HTMLElement | null;
    expect(page).not.toBeNull();
    expect(page?.className).toContain('bg-white');
  });
});

// ─── S2: Workspace scroll container carries bg-slate-100 ─────────────────────

describe('S2 — Workspace scroll container carries bg-slate-100', () => {
  it('the outermost scroll div has bg-slate-100', () => {
    const { container } = render(<BlockCanvas zoom={100} />);
    const scrollDiv = container.querySelector('.overflow-auto') as HTMLElement | null;
    expect(scrollDiv).not.toBeNull();
    expect(scrollDiv?.className).toContain('bg-slate-100');
  });
});

// ─── S3: Empty-state page div also carries bg-white ──────────────────────────

describe('S3 — Empty-state page div carries bg-white', () => {
  it('data-doc-page in empty state has bg-white', () => {
    const { container } = render(<BlockCanvas zoom={100} />);
    const page = container.querySelector('[data-doc-page]') as HTMLElement | null;
    expect(page).not.toBeNull();
    expect(page?.className).toContain('bg-white');
  });
});

// ─── S4: Non-white theme.backgroundColor does NOT override the page surface ───

describe('S4 — Non-white theme.backgroundColor does not bleed onto page surface', () => {
  it('page div has no inline backgroundColor set (bg-white class is the sole authority)', () => {
    const { container } = render(<BlockCanvas zoom={100} />);
    const page = container.querySelector('[data-doc-page]') as HTMLElement | null;
    expect(page).not.toBeNull();
    // The inline style must NOT carry backgroundColor — if it did, the non-white
    // theme value (#c7d2fe) would override the bg-white class and tint the page.
    expect(page?.style.backgroundColor).toBe('');
  });

  it('page div className still contains bg-white even with non-white theme', () => {
    const { container } = render(<BlockCanvas zoom={100} />);
    const page = container.querySelector('[data-doc-page]') as HTMLElement | null;
    expect(page?.className).toContain('bg-white');
    // Confirm the tint colour is NOT present anywhere in the class string
    expect(page?.className).not.toContain('c7d2fe');
  });
});

// ─── S5: Page shadow and rounded corners unchanged ────────────────────────────

describe('S5 — Page shadow and rounded corners unchanged', () => {
  it('studio-doc-page retains shadow-xl and rounded-sm', () => {
    const { container } = render(<BlockCanvas zoom={100} />);
    const page = container.querySelector('[data-doc-page]') as HTMLElement | null;
    expect(page?.className).toContain('shadow-xl');
    expect(page?.className).toContain('rounded-sm');
  });
});
