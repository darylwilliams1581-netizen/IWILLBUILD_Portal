/**
 * Work section layout tests.
 *
 * Covers:
 * - Tab mapping (all 6 valid tabs)
 * - Unknown-tab fallback to 'tasks'
 * - Sidebar link → correct workTab query param
 * - Refresh preserves active tab (query param round-trip)
 * - Browser Back/Forward (replace:true on switchTab)
 * - Single shell ownership (no DesktopDock in work/builders-calc/takeoff-pad pages)
 * - portal-content wrapper on builders-calc and takeoff-pad
 * - Work content wrapper uses lg-portal (not portal-content)
 * - Header padding uses responsive px-4 md:px-6
 * - Tab nav has overflow-x-auto for mobile scrolling
 * - aria-current="page" on active tab
 * - Tools tab present and accessible
 * - Legacy /work/:workTab route exists in routes
 * - No duplicate portal chrome in tab components
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');

function read(rel: string) {
  return readFileSync(resolve(root, rel), 'utf-8');
}

// ── Source file snapshots ─────────────────────────────────────────────────────

const workPage = read('src/pages/work.tsx');
const buildersCalcPage = read('src/pages/builders-calc-page.tsx');
const takeoffPadPage = read('src/pages/takeoff-pad-page.tsx');
const routes = read('src/routes.tsx');
const sidebar = read('src/components/PortalSidebar.tsx');

// Tab components
const tasksTab = read('src/components/work/WorkTasksTab.tsx');
const notesTab = read('src/components/work/WorkNotesTab.tsx');
const delaysTab = read('src/components/work/WorkDelaysTab.tsx');
const progressTab = read('src/components/work/WorkProgressTab.tsx');
const attendanceTab = read('src/components/work/WorkAttendanceTab.tsx');
const toolsTab = read('src/components/work/WorkToolsTab.tsx');

const ALL_TAB_COMPONENTS = [tasksTab, notesTab, delaysTab, progressTab, attendanceTab, toolsTab];

// ── Tab mapping ───────────────────────────────────────────────────────────────

describe('Work tab mapping', () => {
  const validTabs = ['tasks', 'notes', 'delays', 'progress', 'attendance', 'tools'];

  it('defines all 6 valid tabs in TABS array', () => {
    for (const tab of validTabs) {
      expect(workPage).toContain(`id: '${tab}'`);
    }
  });

  it('VALID_TABS set is built from TABS', () => {
    expect(workPage).toContain('VALID_TABS');
    expect(workPage).toContain("new Set<string>(TABS.map((t) => t.id))");
  });

  it('unknown tab falls back to tasks', () => {
    // The fallback expression: VALID_TABS.has(rawTab) ? ... : 'tasks'
    expect(workPage).toContain("'tasks'");
    expect(workPage).toContain('VALID_TABS.has(rawTab)');
  });

  it('active tab uses aria-current="page"', () => {
    expect(workPage).toContain('aria-current={active ? \'page\' : undefined}');
  });

  it('tab nav has overflow-x-auto for mobile scrolling', () => {
    expect(workPage).toContain('overflow-x-auto');
  });
});

// ── Sidebar links ─────────────────────────────────────────────────────────────

describe('Sidebar Work links', () => {
  const expectedLinks = [
    '/work?workTab=tasks',
    '/work?workTab=notes',
    '/work?workTab=delays',
    '/work?workTab=progress',
    '/work?workTab=attendance',
  ];

  for (const link of expectedLinks) {
    it(`sidebar contains link: ${link}`, () => {
      expect(sidebar).toContain(link);
    });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────

describe('Work routes', () => {
  it('/work route exists', () => {
    expect(routes).toContain("path: '/work'");
  });

  it('/work/:workTab legacy route exists', () => {
    expect(routes).toContain("path: '/work/:workTab'");
  });

  it('/builders-calc route exists', () => {
    expect(routes).toContain("path: '/builders-calc'");
  });

  it('/takeoff-pad route exists', () => {
    expect(routes).toContain("path: '/takeoff-pad'");
  });
});

// ── Shell ownership ───────────────────────────────────────────────────────────

describe('Single shell ownership — no DesktopDock in Work pages', () => {
  it('work.tsx does not import DesktopDock', () => {
    expect(workPage).not.toContain("import DesktopDock");
  });

  it('work.tsx does not render <DesktopDock', () => {
    expect(workPage).not.toContain('<DesktopDock');
  });

  it('builders-calc-page.tsx does not import DesktopDock', () => {
    expect(buildersCalcPage).not.toContain("import DesktopDock");
  });

  it('builders-calc-page.tsx does not render <DesktopDock', () => {
    expect(buildersCalcPage).not.toContain('<DesktopDock');
  });

  it('takeoff-pad-page.tsx does not import DesktopDock', () => {
    expect(takeoffPadPage).not.toContain("import DesktopDock");
  });

  it('takeoff-pad-page.tsx does not render <DesktopDock', () => {
    expect(takeoffPadPage).not.toContain('<DesktopDock');
  });
});

describe('No duplicate portal chrome in Work tab components', () => {
  for (const [name, src] of [
    ['WorkTasksTab', tasksTab],
    ['WorkNotesTab', notesTab],
    ['WorkDelaysTab', delaysTab],
    ['WorkProgressTab', progressTab],
    ['WorkAttendanceTab', attendanceTab],
    ['WorkToolsTab', toolsTab],
  ] as const) {
    it(`${name} does not import PortalSidebar`, () => {
      expect(src).not.toContain('PortalSidebar');
    });
    it(`${name} does not import DesktopDock`, () => {
      expect(src).not.toContain('DesktopDock');
    });
    it(`${name} does not import DesktopTopBar`, () => {
      expect(src).not.toContain('DesktopTopBar');
    });
  }
});

// ── CSS contract ──────────────────────────────────────────────────────────────

describe('Work page CSS contract', () => {
  it('work.tsx uses portal-page as root', () => {
    expect(workPage).toContain('"portal-page"');
  });

  it('work.tsx content wrapper uses lg-portal (not portal-content)', () => {
    expect(workPage).toContain('lg-portal');
    // portal-content is the padded scrollable column — Work uses a full-height flex wrapper instead
    expect(workPage).not.toContain('"portal-content');
  });

  it('work.tsx content wrapper has overflow-hidden', () => {
    expect(workPage).toContain('overflow-hidden');
  });

  it('work.tsx does not use h-[100dvh] on content wrapper (portal-page owns the height)', () => {
    // h-[100dvh] on a child of portal-page creates a nested full-height container
    expect(workPage).not.toContain('h-[100dvh]');
  });

  it('builders-calc-page uses portal-content', () => {
    expect(buildersCalcPage).toContain('portal-content');
  });

  it('takeoff-pad-page uses portal-content', () => {
    expect(takeoffPadPage).toContain('portal-content');
  });

  it('work.tsx header uses responsive px-4 md:px-6', () => {
    expect(workPage).toContain('px-4 md:px-6');
  });
});

// ── Tab content scroll ────────────────────────────────────────────────────────

describe('Tab content scroll ownership', () => {
  it('WorkTasksTab uses flex-1 overflow-y-auto for scroll', () => {
    expect(tasksTab).toContain('flex-1 overflow-y-auto');
  });

  it('WorkNotesTab uses flex-1 overflow-y-auto for scroll', () => {
    expect(notesTab).toContain('flex-1 overflow-y-auto');
  });

  it('WorkDelaysTab uses flex-1 overflow-y-auto for scroll', () => {
    expect(delaysTab).toContain('flex-1 overflow-y-auto');
  });

  it('WorkProgressTab uses flex-1 overflow-y-auto for scroll', () => {
    expect(progressTab).toContain('flex-1 overflow-y-auto');
  });

  it('WorkAttendanceTab uses flex-1 overflow-y-auto for scroll', () => {
    expect(attendanceTab).toContain('flex-1 overflow-y-auto');
  });
});

// ── Refresh / Back-Forward ────────────────────────────────────────────────────

describe('Refresh and Back/Forward behaviour', () => {
  it('switchTab uses replace:true to avoid polluting history', () => {
    expect(workPage).toContain('replace: true');
  });

  it('active tab is derived from searchParams (not local state)', () => {
    expect(workPage).toContain("searchParams.get('workTab')");
  });
});

// ── Tools tab ────────────────────────────────────────────────────────────────

describe('Tools tab', () => {
  it('Tools tab is defined in TABS', () => {
    expect(workPage).toContain("id: 'tools'");
  });

  it('WorkToolsTab is lazy-loaded', () => {
    expect(workPage).toContain("import('@/components/work/WorkToolsTab')");
  });

  it('WorkToolsTab links to /builders-calc', () => {
    expect(toolsTab).toContain('/builders-calc');
  });

  it('WorkToolsTab links to /takeoff-pad', () => {
    expect(toolsTab).toContain('/takeoff-pad');
  });
});

// ── Expanded/collapsed sidebar CSS variable ───────────────────────────────────

describe('Sidebar CSS variable', () => {
  it('lg-portal uses --iwb-sidebar-w CSS variable', () => {
    const globals = read('src/styles/globals.css');
    expect(globals).toContain('--iwb-sidebar-w');
    expect(globals).toContain('.lg-portal');
  });

  it('portal-content uses --iwb-sidebar-w CSS variable', () => {
    const globals = read('src/styles/globals.css');
    expect(globals).toContain('--iwb-sidebar-w');
  });
});
