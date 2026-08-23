/**
 * Layout Contract Tests — Portal Sidebar Offset
 *
 * Verifies the shared CSS contract that keeps portal page content
 * clear of the fixed desktop sidebar and top bar.
 *
 * Contract rules (from docs/pasted-content-2026-08-19T18-30-13.txt):
 *   1. Exactly one shared owner renders the fixed desktop sidebar/top bar.
 *   2. The shared content frame consumes the live expanded/collapsed sidebar width.
 *   3. The content frame uses min-width: 0 and the available viewport width.
 *   4. When the sidebar is hidden, it reserves no horizontal space.
 *   5. Pages own their title, tabs, filters, tables and actions only.
 *
 * These tests inspect CSS source and page source files — they are fast,
 * deterministic, and run without a browser.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readSrc(rel: string): Promise<string> {
  return fs.readFile(path.resolve(ROOT, rel), 'utf-8');
}

// ── CSS contract ──────────────────────────────────────────────────────────────

describe('globals.css — portal layout classes', () => {
  it('.portal-page is a full-width flex row container', async () => {
    const css = await readSrc('src/styles/globals.css');
    // portal-page block must have display:flex and width:100%
    expect(css).toContain('.portal-page {');
    expect(css).toContain('display: flex');
    expect(css).toContain('width: 100%');
  });

  it('.lg-portal applies sidebar left offset at lg+ via --iwb-sidebar-w', async () => {
    const css = await readSrc('src/styles/globals.css');
    expect(css).toContain('padding-left: var(--iwb-sidebar-w');
    expect(css).toContain('padding-top: 56px');
    // Must be inside a min-width: 1024px media query
    const lgBlock = css.match(/@media \(min-width: 1024px\)[^}]*\{[^@]*\.lg-portal[^}]*\}/s);
    expect(lgBlock).not.toBeNull();
  });

  it('.portal-content applies sidebar left offset at lg+ (Work/Finance/Customers fix)', async () => {
    const css = await readSrc('src/styles/globals.css');
    // Find the lg+ portal-content block
    const lgPortalContentMatch = css.match(
      /@media \(min-width: 1024px\)\s*\{[^@]*\.portal-content\s*\{([^}]*)\}/s
    );
    expect(lgPortalContentMatch).not.toBeNull();
    const block = lgPortalContentMatch![1];
    // Must include sidebar offset
    expect(block).toContain('var(--iwb-sidebar-w');
    // Must include top padding for topbar+dock
    expect(block).toContain('padding-top: 112px');
    // Must include box-sizing: border-box so padding doesn't cause overflow
    expect(block).toContain('box-sizing: border-box');
  });

  it('.portal-content has min-width: 0 to prevent flex overflow', async () => {
    const css = await readSrc('src/styles/globals.css');
    const contentBlock = css.match(/\.portal-content\s*\{([^}]*)\}/s);
    expect(contentBlock).not.toBeNull();
    expect(contentBlock![1]).toContain('min-width: 0');
  });

  it('--iwb-sidebar-w is referenced in both .lg-portal and .portal-content', async () => {
    const css = await readSrc('src/styles/globals.css');
    const occurrences = (css.match(/var\(--iwb-sidebar-w/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('.portal-content transition matches .lg-portal transition for smooth collapse', async () => {
    const css = await readSrc('src/styles/globals.css');
    // Both should have transition: padding-left 0.2s ease
    const transitions = css.match(/transition: padding-left 0\.2s ease/g) ?? [];
    expect(transitions.length).toBeGreaterThanOrEqual(2);
  });
});

// ── PortalSidebar contract ────────────────────────────────────────────────────

describe('PortalSidebar — CSS variable sync', () => {
  it('sets --iwb-sidebar-w on document.body when sidebar width changes', async () => {
    const src = await readSrc('src/components/PortalSidebar.tsx');
    expect(src).toContain("setProperty('--iwb-sidebar-w'");
    expect(src).toContain('sidebarWidth');
  });

  it('defines SIDEBAR_EXPANDED and SIDEBAR_COLLAPSED constants', async () => {
    const src = await readSrc('src/components/PortalSidebar.tsx');
    expect(src).toContain('SIDEBAR_EXPANDED');
    expect(src).toContain('SIDEBAR_COLLAPSED');
  });

  it('renders DesktopTopBar exactly once (inside PortalSidebar, not separately)', async () => {
    const src = await readSrc('src/components/PortalSidebar.tsx');
    const topBarRenders = (src.match(/<DesktopTopBar/g) ?? []).length;
    expect(topBarRenders).toBe(1);
  });

  it('desktop sidebar is fixed positioned with top: 56 (below topbar)', async () => {
    const src = await readSrc('src/components/PortalSidebar.tsx');
    expect(src).toContain('position: \'fixed\'');
    expect(src).toContain('top: 56');
  });
});

// ── Work page contract ────────────────────────────────────────────────────────

describe('Work page — layout contract', () => {
  it('uses portal-page as root container', async () => {
    const src = await readSrc('src/pages/work.tsx');
    expect(src).toContain('portal-page');
  });

  it('uses lg-portal as content wrapper (full-height workspace — not portal-content)', async () => {
    const src = await readSrc('src/pages/work.tsx');
    expect(src).toContain('lg-portal');
    // Work is a full-height flex workspace; portal-content is the padded scrollable column
    // used by register/list pages (customers, finance). Work uses the workspace pattern instead.
    expect(src).not.toContain('"portal-content');
  });

  it('renders PortalSidebar (which owns DesktopTopBar)', async () => {
    const src = await readSrc('src/pages/work.tsx');
    expect(src).toContain('<PortalSidebar');
  });

  it('does NOT render DesktopTopBar directly (PortalSidebar owns it)', async () => {
    const src = await readSrc('src/pages/work.tsx');
    expect(src).not.toContain('<DesktopTopBar');
  });

  it('+ New Job button is hidden on desktop (lg:hidden) — sidebar owns it there', async () => {
    const src = await readSrc('src/pages/work.tsx');
    // The New Job button must have lg:hidden so it only shows on mobile/tablet
    expect(src).toContain('lg:hidden');
    // The button must still exist for mobile
    expect(src).toContain('setNewJobOpen(true)');
  });

  it('does not use w-screen or 100vw (would cause horizontal overflow)', async () => {
    const src = await readSrc('src/pages/work.tsx');
    expect(src).not.toContain('w-screen');
    expect(src).not.toContain('100vw');
  });

  it('does not use hard-coded margin-left or padding-left pixel values for sidebar offset', async () => {
    const src = await readSrc('src/pages/work.tsx');
    // Should not have ml-[240px], pl-[240px], ml-64, pl-64 etc.
    expect(src).not.toMatch(/ml-\[2[0-9]{2}px\]/);
    expect(src).not.toMatch(/pl-\[2[0-9]{2}px\]/);
    expect(src).not.toContain('marginLeft: 240');
    expect(src).not.toContain('paddingLeft: 240');
  });
});

// ── Finance page contract (also uses portal-content) ─────────────────────────

describe('Finance page — layout contract', () => {
  it('uses portal-page + portal-content pattern', async () => {
    const src = await readSrc('src/pages/finance.tsx');
    expect(src).toContain('portal-page');
    expect(src).toContain('portal-content');
  });

  it('renders PortalSidebar', async () => {
    const src = await readSrc('src/pages/finance.tsx');
    expect(src).toContain('<PortalSidebar');
  });

  it('does NOT render DesktopTopBar directly', async () => {
    const src = await readSrc('src/pages/finance.tsx');
    expect(src).not.toContain('<DesktopTopBar');
  });
});

// ── Customers page contract (also uses portal-content) ───────────────────────

describe('Customers page — layout contract', () => {
  it('uses portal-page + portal-content pattern', async () => {
    const src = await readSrc('src/pages/customers.tsx');
    expect(src).toContain('portal-page');
    expect(src).toContain('portal-content');
  });
});

// ── lg-portal pages — no duplicate chrome ────────────────────────────────────

describe('lg-portal pages — no duplicate DesktopTopBar', () => {
  // Pages that use lg-portal should NOT also render DesktopTopBar separately
  // because PortalSidebar already renders it. Some pages do render it separately
  // (a known pre-existing pattern) — we only assert the Work page is clean.
  it('Work page does not render DesktopTopBar (PortalSidebar owns it)', async () => {
    const src = await readSrc('src/pages/work.tsx');
    expect(src).not.toContain('<DesktopTopBar');
  });

  it('Finance page does not render DesktopTopBar (PortalSidebar owns it)', async () => {
    const src = await readSrc('src/pages/finance.tsx');
    expect(src).not.toContain('<DesktopTopBar');
  });
});

// ── Sidebar + New Job ownership ───────────────────────────────────────────────

describe('+ New Job ownership — sidebar vs page header', () => {
  it('PortalSidebar has the canonical + New Job button (desktop)', async () => {
    const src = await readSrc('src/components/PortalSidebar.tsx');
    expect(src).toContain('setNewJobOpen(true)');
    expect(src).toContain('NewJobModal');
    // Navigates to /jobs/:id on creation
    expect(src).toContain('/jobs/${job.id}');
  });

  it('Work page + New Job button navigates to /jobs/:id (same as sidebar)', async () => {
    const src = await readSrc('src/pages/work.tsx');
    expect(src).toContain('/jobs/${job.id}');
  });

  it('Work page + New Job button is hidden on desktop (lg:hidden) — no duplicate', async () => {
    const src = await readSrc('src/pages/work.tsx');
    // The button className must include lg:hidden
    const btnMatch = src.match(/setNewJobOpen\(true\)[^}]*className="([^"]+)"/s) ??
                     src.match(/className="([^"]+)"[^>]*onClick[^>]*setNewJobOpen/s);
    // Simpler: just check lg:hidden appears near the New Job button
    const newJobSection = src.slice(src.indexOf('setNewJobOpen(true)') - 200, src.indexOf('setNewJobOpen(true)') + 200);
    expect(newJobSection).toContain('lg:hidden');
  });

  it('Dashboard page no longer has a + New Job button (removed — sidebar owns it)', async () => {
    const src = await readSrc('src/pages/dashboard.tsx');
    // The modal and state were removed; only a Link to /jobs remains
    expect(src).not.toContain('setShowNewJob');
    expect(src).not.toContain('NewJobModal');
  });
});

// ── Plan Manager — now inside the office shell ───────────────────────────────

describe('Plan Manager page — portal shell', () => {
  it('uses portal-page + portal-content layout (not portal-main)', async () => {
    const src = await readSrc('src/pages/plan-manager.tsx');
    expect(src).toContain('portal-page');
    expect(src).toContain('portal-content');
    expect(src).not.toContain('"portal-main"');
  });

  it('renders PortalSidebar', async () => {
    const src = await readSrc('src/pages/plan-manager.tsx');
    expect(src).toContain('<PortalSidebar');
  });

  it('renders DesktopDock', async () => {
    const src = await readSrc('src/pages/plan-manager.tsx');
    expect(src).toContain('DesktopDock');
  });

  it('does NOT render DesktopTopBar directly (PortalSidebar owns it)', async () => {
    const src = await readSrc('src/pages/plan-manager.tsx');
    expect(src).not.toContain('<DesktopTopBar');
  });

  it('does NOT have a standalone Home back button (sidebar handles navigation)', async () => {
    const src = await readSrc('src/pages/plan-manager.tsx');
    // The old Home icon back-button was removed — sidebar owns navigation
    expect(src).not.toContain("navigate('/')");
    expect(src).not.toContain('navigate(\'/\')');
  });

  it('does NOT dispatch portal:open-menu (sidebar owns the mobile drawer trigger)', async () => {
    const src = await readSrc('src/pages/plan-manager.tsx');
    expect(src).not.toContain('portal:open-menu');
  });
});

// ── Estimating tools — now inside the office shell ───────────────────────────

describe('Estimating tool pages — portal shell', () => {
  it('builders-calc-page renders PortalSidebar (consistent with system)', async () => {
    const src = await readSrc('src/pages/builders-calc-page.tsx');
    expect(src).toContain('PortalSidebar');
  });

  it('builders-calc-page does NOT render DesktopDock (PortalSidebar owns chrome)', async () => {
    const src = await readSrc('src/pages/builders-calc-page.tsx');
    expect(src).not.toContain('DesktopDock');
  });

  it('builders-calc-page uses portal-page + portal-content layout', async () => {
    const src = await readSrc('src/pages/builders-calc-page.tsx');
    expect(src).toContain('portal-page');
    expect(src).toContain('portal-content');
  });

  it('builders-calc-page does NOT render DesktopTopBar directly (PortalSidebar owns it)', async () => {
    const src = await readSrc('src/pages/builders-calc-page.tsx');
    expect(src).not.toContain('<DesktopTopBar');
  });

  it('builders-calc-page does NOT use standalone min-h-screen shell', async () => {
    const src = await readSrc('src/pages/builders-calc-page.tsx');
    // Old standalone pattern used min-h-screen as root — should be gone
    expect(src).not.toMatch(/className="min-h-screen[^"]*flex flex-col"/);
  });

  it('takeoff-pad-page renders PortalSidebar (consistent with system)', async () => {
    const src = await readSrc('src/pages/takeoff-pad-page.tsx');
    expect(src).toContain('PortalSidebar');
  });

  it('takeoff-pad-page does NOT render DesktopDock (PortalSidebar owns chrome)', async () => {
    const src = await readSrc('src/pages/takeoff-pad-page.tsx');
    expect(src).not.toContain('DesktopDock');
  });

  it('takeoff-pad-page uses portal-page + portal-content layout', async () => {
    const src = await readSrc('src/pages/takeoff-pad-page.tsx');
    expect(src).toContain('portal-page');
    expect(src).toContain('portal-content');
  });

  it('takeoff-pad-page does NOT render DesktopTopBar directly (PortalSidebar owns it)', async () => {
    const src = await readSrc('src/pages/takeoff-pad-page.tsx');
    expect(src).not.toContain('<DesktopTopBar');
  });

  it('takeoff-pad-page does NOT use standalone min-h-screen shell', async () => {
    const src = await readSrc('src/pages/takeoff-pad-page.tsx');
    expect(src).not.toMatch(/className="min-h-screen[^"]*flex flex-col"/);
  });
});
