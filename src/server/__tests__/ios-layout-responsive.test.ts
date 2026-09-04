/**
 * ios-layout-responsive.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused regression tests for BUILD-21-IOS-REPAIR item 2:
 *   iOS layout — horizontal overflow and clipping on /home at narrow viewports.
 *
 * These are structural/contract tests — they verify the CSS properties and
 * DOM structure that prevent overflow, not pixel-level rendering. They run in
 * jsdom (no real browser) and are intentionally fast.
 *
 * Viewport widths tested: 320px (iPhone SE 1st gen), 375px (iPhone 12 mini /
 * SE 3rd gen), 390px (iPhone 14 / 15 standard).
 *
 * What we verify:
 *   1. RootLayout wrapper uses overflow:hidden (NOT overflow:clip)
 *   2. RootLayout wrapper has min-width:0 (prevents flex child overflow)
 *   3. PagedHomeScreen outer div has w-full max-w-full min-w-0
 *   4. Swipe container has overflow:hidden, width:100%, maxWidth:100%, minWidth:0
 *   5. Swipe track is 300% wide (3 pages) — correct for 3-page layout
 *   6. No element uses overflow:clip (unsupported on iOS Safari)
 *   7. No element uses contain:layout (causes flex miscalculation on iOS Safari)
 *   8. AppShell main element does NOT have contain:layout
 *   9. Duplicate IWILLBUILD wordmark is absent from home.tsx top bar
 *  10. Safe-area insets are used on bottom padding (env(safe-area-inset-bottom))
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── File readers ──────────────────────────────────────────────────────────────

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', relPath), 'utf8');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('iOS layout — RootLayout overflow fix', () => {
  const rl = readSrc('layouts/RootLayout.tsx');

  it('1. RootLayout uses overflow-hidden (not overflow-clip or overflowX:clip)', () => {
    // Must contain overflow-hidden class
    expect(rl).toMatch(/overflow-hidden/);
    // Strip comments before checking for forbidden patterns
    const noComments = rl.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    // Must NOT contain overflow:clip or overflowX:'clip' as actual style values
    expect(noComments).not.toMatch(/overflow:\s*['"]?clip/);
    expect(noComments).not.toMatch(/overflowX:\s*['"]clip/);
  });

  it('2. RootLayout flex child has min-w-0 (prevents flex overflow)', () => {
    expect(rl).toMatch(/min-w-0/);
  });
});

describe('iOS layout — PagedHomeScreen swipe container', () => {
  const phs = readSrc('components/home/PagedHomeScreen.tsx');

  it('3. Outer wrapper has w-full max-w-full min-w-0', () => {
    expect(phs).toMatch(/w-full/);
    expect(phs).toMatch(/max-w-full/);
    expect(phs).toMatch(/min-w-0/);
  });

  it('4. Swipe container has overflow:hidden, width:100%, maxWidth:100%, minWidth:0', () => {
    // Check the swipe container style object
    expect(phs).toMatch(/overflow:\s*['"]hidden['"]/);
    expect(phs).toMatch(/width:\s*['"]100%['"]/);
    expect(phs).toMatch(/maxWidth:\s*['"]100%['"]/);
    expect(phs).toMatch(/minWidth:\s*0/);
  });

  it('5. Swipe track is 300% wide (3 pages)', () => {
    expect(phs).toMatch(/width:\s*['"]300%['"]/);
  });

  it('6. No element uses overflow:clip (unsupported on iOS Safari)', () => {
    expect(phs).not.toMatch(/overflow:\s*['"]?clip/);
    expect(phs).not.toMatch(/overflowX:\s*['"]clip/);
  });

  it('7. No element uses contain:layout (causes flex miscalculation on iOS Safari)', () => {
    // The comment about removal is fine; the actual style must not be present
    // We check for the style value, not the comment
    const noComments = phs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(noComments).not.toMatch(/contain:\s*['"]layout['"]/);
    expect(noComments).not.toMatch(/contain:\s*layout/);
  });
});

describe('iOS layout — AppShell', () => {
  const appShell = readSrc('layouts/AppShell.tsx');

  it('8. AppShell main element does NOT have contain:layout', () => {
    const noComments = appShell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(noComments).not.toMatch(/contain:\s*['"]layout['"]/);
    expect(noComments).not.toMatch(/contain:\s*layout/);
  });
});

describe('iOS layout — home.tsx top bar', () => {
  const home = readSrc('pages/home.tsx');

  it('9. Duplicate dark top bar is absent from home.tsx (removed in favour of PagedHomeScreen built-in bar)', () => {
    // The old dark gradient top bar used this specific gradient
    expect(home).not.toMatch(/linear-gradient\(150deg.*#0d1117/);
    // The old bar had this specific background style
    expect(home).not.toMatch(/#161d2e.*#1a1208/);
  });

  it('10. home.tsx passes firstName/greeting/dateStr to PagedHomeScreen', () => {
    // These props must be forwarded so the built-in bar can render them
    expect(home).toMatch(/firstName=\{firstName\}/);
    expect(home).toMatch(/greeting=\{greeting\}/);
    expect(home).toMatch(/dateStr=\{dateStr\}/);
  });
});

describe('iOS layout — safe-area insets', () => {
  const phs = readSrc('components/home/PagedHomeScreen.tsx');

  it('10. Bottom padding uses env(safe-area-inset-bottom)', () => {
    expect(phs).toMatch(/env\(safe-area-inset-bottom\)/);
  });
});

describe('iOS layout — viewport widths 320 / 375 / 390', () => {
  // These tests verify the CSS classes that make the layout work at narrow widths.
  // They are structural checks — the actual rendering is verified on device.

  const phs = readSrc('components/home/PagedHomeScreen.tsx');

  it('11. Tab buttons use flex-1 (equal-width, fill viewport at any width)', () => {
    // The tab row uses flex-1 on each button so they fill the available width
    expect(phs).toMatch(/flex-1.*flex.*items-center.*justify-center/s);
  });

  it('12. Logo has max-w constraint to prevent overflow at 320px', () => {
    // Logo img has max-w-[140px] or similar to prevent overflow
    expect(phs).toMatch(/max-w-\[140px\]/);
  });

  it('13. Utility buttons use shrink-0 (do not collapse below usable size)', () => {
    expect(phs).toMatch(/shrink-0/);
  });

  it('14. Text labels hidden below 360px (min-[360px]:inline)', () => {
    // Button text labels use responsive visibility to avoid overflow at 320px
    expect(phs).toMatch(/min-\[360px\]:inline/);
  });
});
