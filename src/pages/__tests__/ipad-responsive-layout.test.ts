/**
 * iPad responsive layout + ledger regression tests
 *
 * Covers:
 *   1. Safe-area: DesktopTopBar height includes env(safe-area-inset-top)
 *   2. Safe-area: DesktopDock top offset uses TOPBAR_HEIGHT_CSS
 *   3. Tablet nav: sidebar hidden at md (768px), visible at lg (1024px)
 *   4. Tablet nav: Dock visible at md, hidden at lg
 *   5. Portal layout: no sidebar left-offset at tablet (md range)
 *   6. Portal layout: sidebar left-offset present at desktop (lg range)
 *   7. Finance tab strip: overflow-x-auto + WebkitOverflowScrolling
 *   8. Finance page: no h-[100dvh] on portal-content (would ignore topbar)
 *   9. Ledger GET: selects contact_name AS supplier_name, reference AS reference_number
 *  10. Ledger GET: does NOT select non-existent supplier_name or reference_number columns
 *  11. lg-portal CSS: tablet range has top padding, no left padding
 *  12. lg-portal CSS: desktop range has both top and left padding
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// __dirname = src/pages/__tests__ → go up 3 levels to reach src/
const SRC = path.resolve(__dirname, '../../');

function readSrc(rel: string) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

// ── 1. DesktopTopBar safe-area height ─────────────────────────────────────────
describe('DesktopTopBar — safe-area-inset-top', () => {
  const src = readSrc('components/DesktopTopBar.tsx');

  it('height includes env(safe-area-inset-top)', () => {
    expect(src).toContain('safe-area-inset-top');
    // The height calc must reference the safe-area inset
    expect(src).toMatch(/height.*calc.*safe-area-inset-top/s);
  });

  it('exports TOPBAR_HEIGHT_CSS constant', () => {
    expect(src).toContain('export const TOPBAR_HEIGHT_CSS');
    expect(src).toContain('safe-area-inset-top');
  });

  it('paddingTop uses env(safe-area-inset-top) to push content below status bar', () => {
    expect(src).toContain("paddingTop: 'env(safe-area-inset-top");
  });
});

// ── 2. DesktopDock safe-area top offset ───────────────────────────────────────
describe('DesktopDock — safe-area top offset', () => {
  const src = readSrc('components/DesktopDock.tsx');

  it('imports TOPBAR_HEIGHT_CSS from DesktopTopBar', () => {
    expect(src).toContain('TOPBAR_HEIGHT_CSS');
    expect(src).toContain('DesktopTopBar');
  });

  it('uses TOPBAR_HEIGHT_CSS as top value (not hardcoded 56)', () => {
    expect(src).toContain('top: TOPBAR_HEIGHT_CSS');
    // Must NOT use the old hardcoded value
    expect(src).not.toMatch(/top:\s*56[^p]/);
  });
});

// ── 3 & 4. Tablet nav: sidebar lg-only, dock md-only ─────────────────────────
describe('PortalSidebar — tablet breakpoints', () => {
  const src = readSrc('components/PortalSidebar.tsx');

  it('desktop sidebar uses hidden lg:flex (not hidden md:flex)', () => {
    // Should be lg:flex for the fixed sidebar aside
    expect(src).toContain('hidden lg:flex');
    // Must NOT use md:flex for the fixed sidebar (that would show it on tablet)
    // The mobile drawer uses md:hidden — that's fine. We check the aside element.
    const asideMatch = src.match(/aria-label="Desktop sidebar navigation"[^>]*className="([^"]+)"/);
    if (asideMatch) {
      expect(asideMatch[1]).toContain('lg:flex');
      expect(asideMatch[1]).not.toContain('md:flex');
    }
  });

  it('uses TOPBAR_HEIGHT_CSS for sidebar top (not hardcoded 56)', () => {
    expect(src).toContain('TOPBAR_HEIGHT_CSS');
    expect(src).toContain('top: TOPBAR_HEIGHT_CSS');
  });

  it('mobile drawer has safe-area-inset-top padding', () => {
    expect(src).toContain("paddingTop: 'env(safe-area-inset-top");
  });
});

describe('DesktopDock — tablet visibility', () => {
  const src = readSrc('components/DesktopDock.tsx');

  it('dock is hidden md:flex lg:hidden (tablet only)', () => {
    expect(src).toContain('hidden md:flex lg:hidden');
  });
});

// ── 5 & 6. Portal layout CSS — tablet vs desktop offsets ─────────────────────
describe('globals.css — portal layout breakpoints', () => {
  const css = readSrc('styles/globals.css');

  it('portal-content at tablet (768–1023px) has NO sidebar left offset', () => {
    // Extract the tablet portal-content block
    const tabletBlock = css.match(
      /@media \(min-width: 768px\) and \(max-width: 1023px\)\s*\{[^}]*\.portal-content[^}]*\}/s
    );
    expect(tabletBlock).not.toBeNull();
    if (tabletBlock) {
      expect(tabletBlock[0]).not.toContain('iwb-sidebar-w');
      expect(tabletBlock[0]).not.toContain('padding-left: calc(var(--iwb-sidebar-w');
    }
  });

  it('portal-content at desktop (1024px+) has sidebar left offset', () => {
    const desktopBlock = css.match(
      /@media \(min-width: 1024px\)\s*\{[^}]*\.portal-content[^}]*\}/s
    );
    expect(desktopBlock).not.toBeNull();
    if (desktopBlock) {
      expect(desktopBlock[0]).toContain('iwb-sidebar-w');
    }
  });

  it('portal-main at tablet includes safe-area-inset-top in padding-top', () => {
    const tabletMain = css.match(
      /@media \(min-width: 768px\) and \(max-width: 1023px\)\s*\{[^}]*\.portal-main[^}]*\}/s
    );
    expect(tabletMain).not.toBeNull();
    if (tabletMain) {
      expect(tabletMain[0]).toContain('safe-area-inset-top');
    }
  });

  it('portal-main at desktop includes safe-area-inset-top in padding-top', () => {
    const desktopMain = css.match(
      /@media \(min-width: 1024px\)\s*\{[^}]*\.portal-main[^}]*\}/s
    );
    expect(desktopMain).not.toBeNull();
    if (desktopMain) {
      expect(desktopMain[0]).toContain('safe-area-inset-top');
    }
  });

  it('lg-portal at tablet has top padding but no sidebar left offset', () => {
    const tabletLgPortal = css.match(
      /@media \(min-width: 768px\) and \(max-width: 1023px\)\s*\{[^}]*\.lg-portal[^}]*\}/s
    );
    expect(tabletLgPortal).not.toBeNull();
    if (tabletLgPortal) {
      expect(tabletLgPortal[0]).toContain('padding-top');
      expect(tabletLgPortal[0]).not.toContain('iwb-sidebar-w');
    }
  });

  it('lg-portal at desktop has both top padding and sidebar left offset', () => {
    const desktopLgPortal = css.match(
      /@media \(min-width: 1024px\)\s*\{[^}]*\.lg-portal[^}]*\}/s
    );
    expect(desktopLgPortal).not.toBeNull();
    if (desktopLgPortal) {
      expect(desktopLgPortal[0]).toContain('padding-top');
      expect(desktopLgPortal[0]).toContain('iwb-sidebar-w');
    }
  });
});

// ── 7 & 8. Finance page tab strip + no h-[100dvh] ────────────────────────────
describe('finance.tsx — tablet tab strip', () => {
  const src = readSrc('pages/finance.tsx');

  it('tab strip has overflow-x-auto', () => {
    expect(src).toContain('overflow-x-auto');
  });

  it('tab strip has WebkitOverflowScrolling touch for iOS momentum scroll', () => {
    expect(src).toContain('WebkitOverflowScrolling');
    expect(src).toContain('touch');
  });

  it('portal-content does NOT use h-[100dvh] (would ignore topbar height)', () => {
    // h-[100dvh] on portal-content causes content to start at 0 ignoring fixed bars
    expect(src).not.toContain('h-[100dvh]');
  });
});

// ── 9 & 10. Ledger GET — correct column aliases ───────────────────────────────
describe('finance/ledger GET.ts — column aliases', () => {
  const src = readSrc('server/api/finance/ledger/GET.ts');

  it('aliases contact_name AS supplier_name', () => {
    expect(src).toContain('contact_name');
    expect(src).toMatch(/contact_name\s+AS\s+supplier_name/i);
  });

  it('aliases reference AS reference_number', () => {
    expect(src).toContain('reference');
    expect(src).toMatch(/reference\s+AS\s+reference_number/i);
  });

  it('does NOT select non-existent supplier_name column directly', () => {
    // Should not have bare "l.supplier_name" (without AS alias)
    expect(src).not.toMatch(/l\.supplier_name(?!\s*,|\s*AS)/);
  });

  it('does NOT select non-existent reference_number column directly', () => {
    // Should not have bare "l.reference_number"
    expect(src).not.toMatch(/l\.reference_number(?!\s*,|\s*AS)/);
  });

  it('source_module column is selected directly (it exists in DDL)', () => {
    expect(src).toContain('l.source_module');
  });
});
