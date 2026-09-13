/**
 * Finance shell — tab integration regression tests
 *
 * Verifies that Ledger, Purchase Orders, and Finance Settings
 * all render inside the shared Finance shell (portal-page + shared header +
 * shared tab row) and do NOT have their own standalone page chrome.
 *
 * Also verifies iPad portrait/landscape non-overlap and contained-overflow
 * for all tabs (CSS structure checks).
 *
 * NOTE: Timesheets was removed from the user-facing product (UI only).
 * Backend data and APIs are preserved. The /timesheets route redirects to /home.
 *
 * Covers:
 *  1.  Finance TABS array includes: estimates, purchase-orders, invoices, ledger, settings
 *  2.  Finance TABS array does NOT include timesheets
 *  3.  Finance page renders FinanceLedgerTab for ledger tab
 *  4.  Finance page renders FinancePurchaseOrdersTab for purchase-orders tab
 *  5.  Finance page renders FinanceSettingsTab for settings tab
 *  6.  Finance page does NOT import or render FinanceTimesheetsTab
 *  7.  FinanceLedgerTab has no standalone portal-page / PortalSidebar / DesktopDock
 *  8.  FinancePurchaseOrdersTab has no standalone portal-page / PortalSidebar / DesktopDock
 *  9.  FinanceSettingsTab has no standalone portal-page / PortalSidebar / DesktopDock
 * 10.  Finance page tab strip is overflow-x-auto (tablet scrollable)
 * 11.  Finance page tab content area uses flex-1 overflow-hidden (contained)
 * 12.  Finance page portal-content does NOT use h-[100dvh] (would ignore topbar)
 * 13.  Deep-link: financeTab=ledger is a valid TABS key
 * 14.  Deep-link: financeTab=purchase-orders is a valid TABS key
 * 15.  Deep-link: financeTab=settings is a valid TABS key
 * 16.  /timesheets standalone page redirects to /home (not Finance shell)
 * 17.  homeIcons does NOT include a timesheets entry
 * 18.  PortalSidebar does NOT include a timesheets href
 * 19.  FinanceLedgerTab root element uses h-full (fills Finance shell content area)
 * 20.  FinancePurchaseOrdersTab root element uses h-full overflow-hidden
 * 21.  Finance page shared header is always visible (not tab-conditional)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../');

function readSrc(rel: string) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

const finance      = readSrc('pages/finance.tsx');
const ledgerTab    = readSrc('components/finance/FinanceLedgerTab.tsx');
const poTab        = readSrc('components/finance/FinancePurchaseOrdersTab.tsx');
const settingsTab  = readSrc('components/finance/FinanceSettingsTab.tsx');
const timesheetsPg = readSrc('pages/timesheets.tsx');
const homeIcons    = readSrc('lib/homeIcons.ts');
const sidebar      = readSrc('components/PortalSidebar.tsx');

// ── 1–2. Finance TABS array ───────────────────────────────────────────────────

describe('Finance shell — TABS array', () => {
  it('includes estimates tab', () => {
    expect(finance).toContain("key: 'estimates'");
  });

  it('includes purchase-orders tab', () => {
    expect(finance).toContain("key: 'purchase-orders'");
  });

  it('includes ledger tab', () => {
    expect(finance).toContain("key: 'ledger'");
  });

  it('includes settings tab', () => {
    expect(finance).toContain("key: 'settings'");
  });

  it('does NOT include timesheets tab (removed from product)', () => {
    expect(finance).not.toContain("key: 'timesheets'");
  });
});

// ── 3–6. Finance tab component rendering ─────────────────────────────────────

describe('Finance shell — tab component rendering', () => {
  it('renders FinanceLedgerTab for ledger tab', () => {
    expect(finance).toContain('FinanceLedgerTab');
    expect(finance).toContain("activeTab === 'ledger'");
  });

  it('renders FinancePurchaseOrdersTab for purchase-orders tab', () => {
    expect(finance).toContain('FinancePurchaseOrdersTab');
    expect(finance).toContain("activeTab === 'purchase-orders'");
  });

  it('renders FinanceSettingsTab for settings tab', () => {
    expect(finance).toContain('FinanceSettingsTab');
    expect(finance).toContain("activeTab === 'settings'");
  });

  it('does NOT import FinanceTimesheetsTab (removed from product)', () => {
    expect(finance).not.toContain('FinanceTimesheetsTab');
  });

  it('does NOT render timesheets tab conditional (removed from product)', () => {
    expect(finance).not.toContain("activeTab === 'timesheets'");
  });
});

// ── 7–9. Tab components have no standalone page chrome ───────────────────────

const CHROME_MARKERS = ['portal-page', 'PortalSidebar', 'DesktopDock', 'DesktopTopBar'];

describe('FinanceLedgerTab — no standalone page chrome', () => {
  CHROME_MARKERS.forEach(marker => {
    it(`does not contain "${marker}"`, () => {
      expect(ledgerTab).not.toContain(marker);
    });
  });
});

describe('FinancePurchaseOrdersTab — no standalone page chrome', () => {
  CHROME_MARKERS.forEach(marker => {
    it(`does not contain "${marker}"`, () => {
      expect(poTab).not.toContain(marker);
    });
  });
});

describe('FinanceSettingsTab — no standalone page chrome', () => {
  CHROME_MARKERS.forEach(marker => {
    it(`does not contain "${marker}"`, () => {
      expect(settingsTab).not.toContain(marker);
    });
  });
});

// ── 10–12. iPad portrait/landscape non-overlap + contained overflow ───────────

describe('Finance shell — iPad layout (non-overlap + contained overflow)', () => {
  it('tab strip is overflow-x-auto (scrollable on tablet)', () => {
    expect(finance).toContain('overflow-x-auto');
  });

  it('tab strip has WebkitOverflowScrolling touch (iOS momentum scroll)', () => {
    expect(finance).toContain('WebkitOverflowScrolling');
    expect(finance).toContain('touch');
  });

  it('tab content area uses flex-1 overflow-hidden (contained within shell)', () => {
    expect(finance).toContain('flex-1 overflow-hidden');
  });

  it('portal-content does NOT use h-[100dvh] (would ignore topbar/dock height)', () => {
    expect(finance).not.toContain('h-[100dvh]');
  });

  it('portal-content uses flex flex-col (vertical layout for header + tabs + content)', () => {
    expect(finance).toContain('flex flex-col');
  });
});

// ── 13–15. Deep-link URL params ───────────────────────────────────────────────

describe('Finance shell — deep-link URL params', () => {
  it('financeTab=ledger is a recognised tab key', () => {
    expect(finance).toContain("key: 'ledger'");
    expect(finance).not.toMatch(/activeTab === 'ledger'[\s\S]*?navigate\(/);
  });

  it('financeTab=purchase-orders is a recognised tab key', () => {
    expect(finance).toContain("key: 'purchase-orders'");
    expect(finance).not.toMatch(/activeTab === 'purchase-orders'[\s\S]*?navigate\(/);
  });

  it('financeTab=settings is a recognised tab key', () => {
    expect(finance).toContain("key: 'settings'");
  });
});

// ── 16–18. Timesheets removed from all entry points ──────────────────────────

describe('Timesheets — removed from all user-facing entry points', () => {
  it('/timesheets standalone page redirects to /home (not Finance shell)', () => {
    expect(timesheetsPg).toContain('/home');
    expect(timesheetsPg).toContain('replace: true');
    expect(timesheetsPg).not.toContain('/finance?financeTab=timesheets');
  });

  it('homeIcons does NOT include a timesheets entry', () => {
    expect(homeIcons).not.toContain("key: 'timesheet'");
    expect(homeIcons).not.toContain("financeTab=timesheets");
  });

  it('PortalSidebar does NOT include a timesheets href', () => {
    expect(sidebar).not.toContain("financeTab=timesheets");
    expect(sidebar).not.toContain("href: '/timesheets'");
  });
});

// ── 19–20. Tab component root elements fill the shell content area ────────────

describe('Tab component root elements — fill Finance shell content area', () => {
  it('FinanceLedgerTab root uses h-full (fills flex-1 content area)', () => {
    expect(ledgerTab).toMatch(/className="flex flex-col h-full/);
  });

  it('FinancePurchaseOrdersTab root uses h-full overflow-hidden', () => {
    expect(poTab).toMatch(/className="flex flex-col h-full overflow-hidden/);
  });
});

// ── 21. Shared Finance header is always visible ───────────────────────────────

describe('Finance shell — shared header always visible', () => {
  it('Finance header is rendered unconditionally (not inside a tab conditional)', () => {
    const headerIdx  = finance.indexOf('Page header');
    const tabCondIdx = finance.indexOf("activeTab === 'ledger'");
    expect(headerIdx).toBeGreaterThan(-1);
    expect(tabCondIdx).toBeGreaterThan(-1);
    expect(headerIdx).toBeLessThan(tabCondIdx);
  });
});
