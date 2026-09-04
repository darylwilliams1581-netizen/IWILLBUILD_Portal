/**
 * Finance shell — tab integration regression tests
 *
 * Verifies that Ledger, Purchase Orders, Timesheets, and Finance Settings
 * all render inside the shared Finance shell (portal-page + shared header +
 * shared tab row) and do NOT have their own standalone page chrome.
 *
 * Also verifies iPad portrait/landscape non-overlap and contained-overflow
 * for all four tabs (CSS structure checks).
 *
 * Covers:
 *  1.  Finance TABS array includes all four: ledger, purchase-orders, timesheets, settings
 *  2.  Finance page renders FinanceLedgerTab for ledger tab
 *  3.  Finance page renders FinancePurchaseOrdersTab for purchase-orders tab
 *  4.  Finance page renders FinanceTimesheetsTab for timesheets tab
 *  5.  Finance page renders FinanceSettingsTab for settings tab
 *  6.  Finance page does NOT redirect timesheets away from the shell
 *  7.  FinanceLedgerTab has no standalone portal-page / PortalSidebar / DesktopDock
 *  8.  FinancePurchaseOrdersTab has no standalone portal-page / PortalSidebar / DesktopDock
 *  9.  FinanceTimesheetsTab has no standalone portal-page / PortalSidebar / DesktopDock
 * 10.  FinanceSettingsTab has no standalone portal-page / PortalSidebar / DesktopDock
 * 11.  Finance page tab strip is overflow-x-auto (tablet scrollable)
 * 12.  Finance page tab content area uses flex-1 overflow-hidden (contained)
 * 13.  Finance page portal-content does NOT use h-[100dvh] (would ignore topbar)
 * 14.  Deep-link: financeTab=ledger is a valid TABS key
 * 15.  Deep-link: financeTab=purchase-orders is a valid TABS key
 * 16.  Deep-link: financeTab=timesheets is a valid TABS key
 * 17.  Deep-link: financeTab=settings is a valid TABS key
 * 18.  /timesheets standalone page redirects to /finance?financeTab=timesheets
 * 19.  homeIcons timesheets href points to Finance shell
 * 20.  PortalSidebar timesheets href points to Finance shell
 * 21.  FinanceLedgerTab root element uses h-full (fills Finance shell content area)
 * 22.  FinancePurchaseOrdersTab root element uses h-full overflow-hidden
 * 23.  FinanceTimesheetsTab root element uses h-full overflow-hidden
 * 24.  Finance page shared header is always visible (not tab-conditional)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../');

function readSrc(rel: string) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

const finance      = readSrc('pages/finance.tsx');
const ledgerTab    = readSrc('components/finance/FinanceLedgerTab.tsx');
const poTab        = readSrc('components/finance/FinancePurchaseOrdersTab.tsx');
const tsTab        = readSrc('components/finance/FinanceTimesheetsTab.tsx');
const settingsTab  = readSrc('components/finance/FinanceSettingsTab.tsx');
const timesheetsPg = readSrc('pages/timesheets.tsx');
const homeIcons    = readSrc('lib/homeIcons.ts');
const sidebar      = readSrc('components/PortalSidebar.tsx');

// ── 1–5. Finance TABS array and tab rendering ─────────────────────────────────

describe('Finance shell — TABS array completeness', () => {
  it('includes ledger tab', () => {
    expect(finance).toContain("key: 'ledger'");
  });

  it('includes purchase-orders tab', () => {
    expect(finance).toContain("key: 'purchase-orders'");
  });

  it('includes timesheets tab', () => {
    expect(finance).toContain("key: 'timesheets'");
  });

  it('includes settings tab', () => {
    expect(finance).toContain("key: 'settings'");
  });
});

describe('Finance shell — tab component rendering', () => {
  it('renders FinanceLedgerTab for ledger tab', () => {
    expect(finance).toContain('FinanceLedgerTab');
    expect(finance).toContain("activeTab === 'ledger'");
  });

  it('renders FinancePurchaseOrdersTab for purchase-orders tab', () => {
    expect(finance).toContain('FinancePurchaseOrdersTab');
    expect(finance).toContain("activeTab === 'purchase-orders'");
  });

  it('renders FinanceTimesheetsTab for timesheets tab', () => {
    expect(finance).toContain('FinanceTimesheetsTab');
    expect(finance).toContain("activeTab === 'timesheets'");
  });

  it('renders FinanceSettingsTab for settings tab', () => {
    expect(finance).toContain('FinanceSettingsTab');
    expect(finance).toContain("activeTab === 'settings'");
  });
});

// ── 6. No redirect away from timesheets ──────────────────────────────────────

describe('Finance shell — no redirect away from timesheets', () => {
  it('does NOT navigate to /timesheets (timesheets stays in shell)', () => {
    expect(finance).not.toContain("navigate('/timesheets'");
    expect(finance).not.toContain('navigate("/timesheets"');
  });
});

// ── 7–10. Tab components have no standalone page chrome ──────────────────────

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

describe('FinanceTimesheetsTab — no standalone page chrome', () => {
  CHROME_MARKERS.forEach(marker => {
    it(`does not contain "${marker}"`, () => {
      expect(tsTab).not.toContain(marker);
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

// ── 11–13. iPad portrait/landscape non-overlap + contained overflow ───────────

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

// ── 14–17. Deep-link URL params ───────────────────────────────────────────────

describe('Finance shell — deep-link URL params', () => {
  it('financeTab=ledger is a recognised tab key', () => {
    // TABS array must include the key so the URL param is not rejected
    expect(finance).toContain("key: 'ledger'");
    // URL normalisation must not redirect away from ledger
    expect(finance).not.toMatch(/activeTab === 'ledger'[\s\S]*?navigate\(/);
  });

  it('financeTab=purchase-orders is a recognised tab key', () => {
    expect(finance).toContain("key: 'purchase-orders'");
    expect(finance).not.toMatch(/activeTab === 'purchase-orders'[\s\S]*?navigate\(/);
  });

  it('financeTab=timesheets is a recognised tab key', () => {
    expect(finance).toContain("key: 'timesheets'");
    // Must NOT redirect timesheets away
    expect(finance).not.toContain("navigate('/timesheets'");
  });

  it('financeTab=settings is a recognised tab key', () => {
    expect(finance).toContain("key: 'settings'");
  });
});

// ── 18–20. Entry points all point to Finance shell ───────────────────────────

describe('Entry points — all route to Finance shell', () => {
  it('/timesheets standalone page redirects to /finance?financeTab=timesheets', () => {
    expect(timesheetsPg).toContain('/finance?financeTab=timesheets');
    expect(timesheetsPg).toContain('replace: true');
  });

  it('homeIcons timesheets href is /finance?financeTab=timesheets', () => {
    const entry = homeIcons.match(/key: 'timesheet'[^\n]*/)?.[0] ?? '';
    expect(entry).toContain("href: '/finance?financeTab=timesheets'");
    expect(entry).not.toContain("href: '/timesheets'");
  });

  it('PortalSidebar timesheets href is /finance?financeTab=timesheets', () => {
    expect(sidebar).toContain("href: '/finance?financeTab=timesheets'");
    expect(sidebar).not.toContain("href: '/timesheets'");
  });
});

// ── 21–23. Tab component root elements fill the shell content area ────────────

describe('Tab component root elements — fill Finance shell content area', () => {
  it('FinanceLedgerTab root uses h-full (fills flex-1 content area)', () => {
    // The root div must use h-full so it fills the Finance shell's flex-1 content zone
    expect(ledgerTab).toMatch(/className="flex flex-col h-full/);
  });

  it('FinancePurchaseOrdersTab root uses h-full overflow-hidden', () => {
    expect(poTab).toMatch(/className="flex flex-col h-full overflow-hidden/);
  });

  it('FinanceTimesheetsTab root uses h-full overflow-hidden', () => {
    expect(tsTab).toMatch(/className="flex flex-col h-full overflow-hidden/);
  });
});

// ── 24. Shared Finance header is always visible ───────────────────────────────

describe('Finance shell — shared header always visible', () => {
  it('Finance header is rendered unconditionally (not inside a tab conditional)', () => {
    // The header div must appear before any activeTab conditional
    const headerIdx  = finance.indexOf('Page header');
    const tabCondIdx = finance.indexOf("activeTab === 'ledger'");
    expect(headerIdx).toBeGreaterThan(-1);
    expect(tabCondIdx).toBeGreaterThan(-1);
    // Header must come before the first tab conditional
    expect(headerIdx).toBeLessThan(tabCondIdx);
  });
});
