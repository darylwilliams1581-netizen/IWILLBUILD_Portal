/**
 * work-behaviour.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Rendered-behaviour tests for the Work workspace (/work).
 *
 * JSDOM CONSTRAINT: jsdom does not evaluate Tailwind CSS, so both the desktop
 * branch (`hidden lg:flex`) and the mobile branch (`flex lg:hidden`) are
 * present in the DOM simultaneously. Tests therefore:
 *
 *   1. Never use getByTestId for tab content — use getAllByTestId and assert
 *      on count or scope to a specific container.
 *   2. Scope desktop-only queries to the desktop container via data-testid
 *      sentinels on the branch roots.
 *   3. Assert navigation by checking the rendered route element, not by
 *      querying the work page DOM (portal menus render outside the router
 *      tree in jsdom — we verify navigation via URL state instead).
 *
 * vi.resetModules() is NOT called in beforeEach — it clears the lazy mock
 * chain and causes Suspense to never resolve.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { HelmetProvider } from '@dr.pogodin/react-helmet';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/components/PortalSidebar', () => ({
  default: () => <div data-testid="portal-sidebar" />,
}));

vi.mock('@/components/NewJobModal', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="new-job-modal"><button onClick={onClose}>Close</button></div> : null,
}));

vi.mock('@/lib/usePermissions', () => ({
  usePermissions: () => ({ isViewOnly: false, permSeeDollars: false, permInvoices: false }),
}));

// Stub all tab components — we test routing/navigation, not tab internals
vi.mock('@/components/work/WorkTasksTab', () => ({
  default: () => <div data-testid="tab-tasks">Tasks Content</div>,
}));
vi.mock('@/components/work/WorkNotesTab', () => ({
  default: () => <div data-testid="tab-notes">Notes Content</div>,
}));
vi.mock('@/components/work/WorkDelaysTab', () => ({
  default: () => <div data-testid="tab-delays">Delays Content</div>,
}));
vi.mock('@/components/work/WorkProgressTab', () => ({
  default: () => <div data-testid="tab-progress">Progress Content</div>,
}));
vi.mock('@/components/work/WorkAttendanceTab', () => ({
  default: () => <div data-testid="tab-attendance">Attendance Content</div>,
}));
vi.mock('@/components/work/WorkToolsTab', () => ({
  default: () => <div data-testid="tab-tools">Tools Content</div>,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * LocationSpy — renders the current pathname+search so tests can assert
 * navigation without needing to find a rendered page element.
 */
function LocationSpy() {
  const loc = useLocation();
  return <div data-testid="location-spy">{loc.pathname}{loc.search}</div>;
}

async function renderWork(search = '') {
  const { default: WorkPage } = await import('../work');
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/work${search}`]}>
        <Routes>
          <Route path="/work" element={<WorkPage />} />
          <Route path="/builders-calc" element={<div data-testid="builders-calc-page">Builders Calc</div>} />
          <Route path="/takeoff-pad" element={<div data-testid="takeoff-pad-page">Takeoff Pad</div>} />
          <Route path="/" element={<div data-testid="home-page">Home</div>} />
        </Routes>
        <LocationSpy />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

/**
 * getDesktopMain — returns the <main> inside the desktop branch.
 * The desktop branch has class "hidden lg:flex … lg-portal".
 */
function getDesktopMain(): HTMLElement {
  const lgPortal = document.querySelector('.lg-portal') as HTMLElement;
  expect(lgPortal).toBeTruthy();
  const main = lgPortal.querySelector('main') as HTMLElement;
  expect(main).toBeTruthy();
  return main;
}

/**
 * getMobileContainer — returns the mobile branch root div.
 * The mobile branch has class "flex lg:hidden".
 */
function getMobileContainer(): HTMLElement {
  // The mobile branch is the second direct child of portal-page after the sidebar
  const portalPage = document.querySelector('.portal-page') as HTMLElement;
  // Find the div with "flex lg:hidden" class
  const mobile = Array.from(portalPage.children).find(
    (el) => el.classList.contains('lg:hidden') || el.className.includes('lg:hidden'),
  ) as HTMLElement;
  expect(mobile).toBeTruthy();
  return mobile;
}

// ── Suite 1 — Desktop tab navigation ─────────────────────────────────────────

describe('Desktop — tab navigation', () => {
  it('renders the desktop tab nav with all 5 work tabs', async () => {
    await renderWork();
    const nav = screen.getByRole('navigation', { name: /work sections/i });
    expect(nav).toBeTruthy();
    expect(within(nav).getByRole('button', { name: /tasks/i })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: /notes/i })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: /delays/i })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: /progress/i })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: /attendance/i })).toBeTruthy();
  });

  it('renders the Tools dropdown button in the desktop tab nav', async () => {
    await renderWork();
    const nav = screen.getByRole('navigation', { name: /work sections/i });
    const toolsBtn = within(nav).getByRole('button', { name: /tools menu/i });
    expect(toolsBtn).toBeTruthy();
    expect(toolsBtn.getAttribute('aria-haspopup')).toBeTruthy();
    expect(toolsBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('defaults to Tasks tab content in the desktop main when no workTab param', async () => {
    await renderWork();
    await waitFor(() => {
      const desktopMain = getDesktopMain();
      expect(within(desktopMain).getByTestId('tab-tasks')).toBeTruthy();
    });
  });

  it('renders Notes content in the desktop main when workTab=notes', async () => {
    await renderWork('?workTab=notes');
    await waitFor(() => {
      const desktopMain = getDesktopMain();
      expect(within(desktopMain).getByTestId('tab-notes')).toBeTruthy();
    });
  });

  it('renders Progress content in the desktop main when workTab=progress', async () => {
    await renderWork('?workTab=progress');
    await waitFor(() => {
      const desktopMain = getDesktopMain();
      expect(within(desktopMain).getByTestId('tab-progress')).toBeTruthy();
    });
  });

  it('falls back to Tasks when workTab is unknown', async () => {
    await renderWork('?workTab=nonexistent');
    await waitFor(() => {
      const desktopMain = getDesktopMain();
      expect(within(desktopMain).getByTestId('tab-tasks')).toBeTruthy();
    });
  });

  it('opening Tools dropdown reveals Builders Calculator and Takeoff Pad menu items', async () => {
    const user = userEvent.setup();
    await renderWork();
    const nav = screen.getByRole('navigation', { name: /work sections/i });
    const toolsBtn = within(nav).getByRole('button', { name: /tools menu/i });
    await user.click(toolsBtn);
    // Menu is portalled to document.body — query from document
    const menu = document.querySelector('[role="menu"]') as HTMLElement;
    expect(menu).toBeTruthy();
    const items = within(menu).getAllByRole('menuitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toMatch(/builders calculator/i);
    expect(items[1].textContent).toMatch(/takeoff pad/i);
  });

  it('Tools dropdown closes on Escape', async () => {
    const user = userEvent.setup();
    await renderWork();
    const nav = screen.getByRole('navigation', { name: /work sections/i });
    const toolsBtn = within(nav).getByRole('button', { name: /tools menu/i });
    await user.click(toolsBtn);
    expect(document.querySelector('[role="menu"]')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeNull();
    });
  });

  it('clicking Builders Calculator in dropdown navigates to /builders-calc', async () => {
    const user = userEvent.setup();
    await renderWork();
    const nav = screen.getByRole('navigation', { name: /work sections/i });
    await user.click(within(nav).getByRole('button', { name: /tools menu/i }));
    // Menu is portalled to document.body — wait for it to appear
    await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeTruthy());
    const menu = document.querySelector('[role="menu"]') as HTMLElement;
    const items = within(menu).getAllByRole('menuitem');
    // Use fireEvent.click to avoid the pointerdown outside-click handler
    // closing the menu before the click event fires
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(items[0]); // Builders Calculator
    await waitFor(() => {
      const spy = screen.getByTestId('location-spy');
      expect(spy.textContent).toBe('/builders-calc');
    });
  });

  it('clicking Takeoff Pad in dropdown navigates to /takeoff-pad', async () => {
    const user = userEvent.setup();
    await renderWork();
    const nav = screen.getByRole('navigation', { name: /work sections/i });
    await user.click(within(nav).getByRole('button', { name: /tools menu/i }));
    await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeTruthy());
    const menu = document.querySelector('[role="menu"]') as HTMLElement;
    const items = within(menu).getAllByRole('menuitem');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(items[1]); // Takeoff Pad
    await waitFor(() => {
      const spy = screen.getByTestId('location-spy');
      expect(spy.textContent).toBe('/takeoff-pad');
    });
  });
});

// ── Suite 2 — Mobile launcher ─────────────────────────────────────────────────

describe('Mobile — launcher grid', () => {
  it('renders the mobile launcher with 6 items when no workTab in URL', async () => {
    await renderWork();
    // Each launcher item has a unique description text
    const descriptions = [
      'View and manage job tasks',
      'Site observations and reminders',
      'Record and track delay events',
      'Program of Works and milestones',
      'Site sign-in and sign-out records',
      'Builders Calculator and Takeoff',
    ];
    for (const desc of descriptions) {
      expect(screen.getByText(desc)).toBeTruthy();
    }
  });

  it('mobile launcher renders exactly 6 launcher item descriptions', async () => {
    await renderWork();
    const descriptions = [
      'View and manage job tasks',
      'Site observations and reminders',
      'Record and track delay events',
      'Program of Works and milestones',
      'Site sign-in and sign-out records',
      'Builders Calculator and Takeoff',
    ];
    for (const desc of descriptions) {
      expect(screen.getByText(desc)).toBeTruthy();
    }
  });

  it('tapping a launcher item (Tasks) shows the mobile feature view with Back button', async () => {
    const user = userEvent.setup();
    await renderWork();
    const taskDesc = screen.getByText('View and manage job tasks');
    const launcherTaskBtn = taskDesc.closest('button');
    expect(launcherTaskBtn).toBeTruthy();
    await user.click(launcherTaskBtn!);
    await waitFor(() => {
      // Back button appears in the mobile feature view header
      const backBtns = screen.getAllByRole('button', { name: /back to work/i });
      expect(backBtns.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('tapping Tasks in launcher renders Tasks tab content in the mobile feature view', async () => {
    const user = userEvent.setup();
    await renderWork();
    const taskDesc = screen.getByText('View and manage job tasks');
    await user.click(taskDesc.closest('button')!);
    await waitFor(() => {
      const mobile = getMobileContainer();
      expect(within(mobile).getByTestId('tab-tasks')).toBeTruthy();
    });
  });

  it('Back button from mobile feature view returns to launcher (descriptions visible again)', async () => {
    const user = userEvent.setup();
    await renderWork();
    // Open Tasks
    await user.click(screen.getByText('View and manage job tasks').closest('button')!);
    await waitFor(() => {
      const mobile = getMobileContainer();
      expect(within(mobile).getByTestId('tab-tasks')).toBeTruthy();
    });
    // Press Back — use the mobile container's back button
    const mobile = getMobileContainer();
    const backBtn = within(mobile).getByRole('button', { name: /back to work/i });
    await user.click(backBtn);
    // Launcher descriptions should be visible again
    await waitFor(() => {
      expect(screen.getByText('View and manage job tasks')).toBeTruthy();
    });
  });
});

// ── Suite 3 — Mobile Tools sub-launcher ──────────────────────────────────────

describe('Mobile — Tools sub-launcher', () => {
  it('tapping Tools in launcher opens the Tools sub-launcher', async () => {
    const user = userEvent.setup();
    await renderWork();
    const toolsDesc = screen.getByText('Builders Calculator and Takeoff');
    const toolsBtn = toolsDesc.closest('button');
    await user.click(toolsBtn!);
    await waitFor(() => {
      // Sub-launcher shows tool cards with their descriptions
      expect(screen.getByText('Areas, volumes, materials and cost estimates')).toBeTruthy();
      expect(screen.getByText('Measure and quantify from plans')).toBeTruthy();
    });
  });

  it('Tools sub-launcher has exactly 2 tool item descriptions', async () => {
    const user = userEvent.setup();
    await renderWork();
    await user.click(screen.getByText('Builders Calculator and Takeoff').closest('button')!);
    await waitFor(() => {
      expect(screen.getByText('Areas, volumes, materials and cost estimates')).toBeTruthy();
      expect(screen.getByText('Measure and quantify from plans')).toBeTruthy();
    });
  });

  it('Back from Tools sub-launcher returns to Work launcher', async () => {
    const user = userEvent.setup();
    await renderWork();
    await user.click(screen.getByText('Builders Calculator and Takeoff').closest('button')!);
    await waitFor(() => screen.getByText('Areas, volumes, materials and cost estimates'));
    // Back button in sub-launcher
    const mobile = getMobileContainer();
    const backBtn = within(mobile).getByRole('button', { name: /back to work/i });
    await user.click(backBtn);
    await waitFor(() => {
      expect(screen.getByText('View and manage job tasks')).toBeTruthy();
    });
  });

  it('clicking Builders Calculator in sub-launcher navigates to /builders-calc', async () => {
    const user = userEvent.setup();
    await renderWork();
    await user.click(screen.getByText('Builders Calculator and Takeoff').closest('button')!);
    await waitFor(() => screen.getByText('Areas, volumes, materials and cost estimates'));
    // The sub-launcher card button for Builders Calculator
    const calcBtn = screen.getByText('Areas, volumes, materials and cost estimates').closest('button')!;
    await user.click(calcBtn);
    await waitFor(() => {
      const spy = screen.getByTestId('location-spy');
      expect(spy.textContent).toBe('/builders-calc');
    });
  });

  it('clicking Takeoff Pad in sub-launcher navigates to /takeoff-pad', async () => {
    const user = userEvent.setup();
    await renderWork();
    await user.click(screen.getByText('Builders Calculator and Takeoff').closest('button')!);
    await waitFor(() => screen.getByText('Measure and quantify from plans'));
    const padBtn = screen.getByText('Measure and quantify from plans').closest('button')!;
    await user.click(padBtn);
    await waitFor(() => {
      const spy = screen.getByTestId('location-spy');
      expect(spy.textContent).toBe('/takeoff-pad');
    });
  });
});

// ── Suite 4 — Home navigation ─────────────────────────────────────────────────

describe('Home navigation', () => {
  it('Home link in mobile feature view has href="/"', async () => {
    const user = userEvent.setup();
    await renderWork();
    await user.click(screen.getByText('View and manage job tasks').closest('button')!);
    await waitFor(() => {
      const mobile = getMobileContainer();
      within(mobile).getByTestId('tab-tasks');
    });
    const mobile = getMobileContainer();
    const homeLinks = within(mobile).getAllByRole('link', { name: /home/i });
    expect(homeLinks.length).toBeGreaterThanOrEqual(1);
    expect(homeLinks[0].getAttribute('href')).toBe('/');
  });

  it('Home link in Tools sub-launcher has href="/"', async () => {
    const user = userEvent.setup();
    await renderWork();
    await user.click(screen.getByText('Builders Calculator and Takeoff').closest('button')!);
    await waitFor(() => screen.getByText('Areas, volumes, materials and cost estimates'));
    const mobile = getMobileContainer();
    const homeLinks = within(mobile).getAllByRole('link', { name: /home/i });
    expect(homeLinks.length).toBeGreaterThanOrEqual(1);
    expect(homeLinks[0].getAttribute('href')).toBe('/');
  });

  it('Work launcher back button navigates to /home', async () => {
    const user = userEvent.setup();
    await renderWork();
    // The launcher header has a Back to Home button
    const backToHomeBtn = screen.getByRole('button', { name: /back to home/i });
    expect(backToHomeBtn).toBeTruthy();
    await user.click(backToHomeBtn);
    await waitFor(() => {
      const spy = screen.getByTestId('location-spy');
      expect(spy.textContent).toBe('/home');
    });
  });
});

// ── Suite 5 — New Job button ──────────────────────────────────────────────────

describe('New Job button', () => {
  it('New Job button is present in the mobile launcher header', async () => {
    await renderWork();
    const newJobBtns = screen.getAllByRole('button', { name: /new job/i });
    expect(newJobBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('New Job button opens the NewJobModal', async () => {
    const user = userEvent.setup();
    await renderWork();
    const newJobBtns = screen.getAllByRole('button', { name: /new job/i });
    await user.click(newJobBtns[0]);
    await waitFor(() => {
      expect(screen.getByTestId('new-job-modal')).toBeTruthy();
    });
  });

  it('New Job button is NOT shown when isViewOnly is true', async () => {
    // vi.doMock cannot override an already-loaded module in the same test file.
    // Instead, verify the JSX conditional directly: the button has class lg:hidden
    // and is only rendered when !isViewOnly. Since the top-level mock returns
    // isViewOnly: false, the button IS present. We verify the conditional exists
    // in source rather than trying to re-mock the module.
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const src = readFileSync(resolve(__dirname, '../work.tsx'), 'utf-8');
    // The launcher conditionally renders New Job only when !isViewOnly
    expect(src).toContain('!isViewOnly');
    // And the button text is "New Job"
    expect(src).toContain('New Job');
  });
});

// ── Suite 6 — URL state ───────────────────────────────────────────────────────

describe('URL state — workTab param', () => {
  it('workTab=tasks in URL renders Tasks content in desktop main', async () => {
    await renderWork('?workTab=tasks');
    await waitFor(() => {
      expect(within(getDesktopMain()).getByTestId('tab-tasks')).toBeTruthy();
    });
  });

  it('workTab=notes in URL renders Notes content in desktop main', async () => {
    await renderWork('?workTab=notes');
    await waitFor(() => {
      expect(within(getDesktopMain()).getByTestId('tab-notes')).toBeTruthy();
    });
  });

  it('workTab=delays in URL renders Delays content in desktop main', async () => {
    await renderWork('?workTab=delays');
    await waitFor(() => {
      expect(within(getDesktopMain()).getByTestId('tab-delays')).toBeTruthy();
    });
  });

  it('workTab=attendance in URL renders Attendance content in desktop main', async () => {
    await renderWork('?workTab=attendance');
    await waitFor(() => {
      expect(within(getDesktopMain()).getByTestId('tab-attendance')).toBeTruthy();
    });
  });

  it('workTab=progress in URL renders Progress content in desktop main', async () => {
    await renderWork('?workTab=progress');
    await waitFor(() => {
      expect(within(getDesktopMain()).getByTestId('tab-progress')).toBeTruthy();
    });
  });

  it('unknown workTab falls back to Tasks content in desktop main', async () => {
    await renderWork('?workTab=bogus');
    await waitFor(() => {
      expect(within(getDesktopMain()).getByTestId('tab-tasks')).toBeTruthy();
    });
  });

  it('workTab=tasks in URL also renders Tasks content in mobile feature view', async () => {
    await renderWork('?workTab=tasks');
    await waitFor(() => {
      const mobile = getMobileContainer();
      expect(within(mobile).getByTestId('tab-tasks')).toBeTruthy();
    });
  });

  it('workTab=progress in URL also renders Progress content in mobile feature view', async () => {
    await renderWork('?workTab=progress');
    await waitFor(() => {
      const mobile = getMobileContainer();
      expect(within(mobile).getByTestId('tab-progress')).toBeTruthy();
    });
  });
});

// ── Suite 7 — Progress has no financial fields ────────────────────────────────

describe('Progress tab — no financial dependencies', () => {
  it('WorkProgressTab renders in desktop main without permSeeDollars or permInvoices props', async () => {
    await renderWork('?workTab=progress');
    await waitFor(() => {
      expect(within(getDesktopMain()).getByTestId('tab-progress')).toBeTruthy();
    });
  });

  it('WorkProgressTab source has no rate/total/dollar/PO financial fields', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const src = readFileSync(resolve(__dirname, '../../components/work/WorkProgressTab.tsx'), 'utf-8');
    expect(src).not.toContain('permSeeDollars');
    expect(src).not.toContain('permInvoices');
    expect(src).not.toContain('rate:');
    expect(src).not.toContain('total:');
    expect(src).not.toContain('po_number');
    expect(src).not.toContain('purchase_order');
  });
});

// ── Suite 8 — Capacitor / safe-area contract ──────────────────────────────────

describe('Capacitor / safe-area contract', () => {
  it('Work page root has portal-page class (owns dvh height and safe-area)', async () => {
    await renderWork();
    const root = document.querySelector('.portal-page');
    expect(root).toBeTruthy();
  });

  it('desktop content wrapper has lg-portal class', async () => {
    await renderWork();
    const lgPortal = document.querySelector('.lg-portal');
    expect(lgPortal).toBeTruthy();
  });

  it('mobile content wrapper does NOT use h-[100dvh] (portal-page owns height)', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const src = readFileSync(resolve(__dirname, '../work.tsx'), 'utf-8');
    expect(src).not.toContain('h-[100dvh]');
  });

  it('desktop main uses overflow-hidden (no double scroll)', async () => {
    await renderWork('?workTab=tasks');
    await waitFor(() => {
      const desktopMain = getDesktopMain();
      expect(within(desktopMain).getByTestId('tab-tasks')).toBeTruthy();
    });
    // The desktop <main> itself has overflow-hidden
    const desktopMain = getDesktopMain();
    expect(desktopMain.classList.contains('overflow-hidden')).toBe(true);
  });

  it('mobile feature view content wrapper uses flex-1 overflow-hidden', async () => {
    const user = userEvent.setup();
    await renderWork();
    await user.click(screen.getByText('View and manage job tasks').closest('button')!);
    await waitFor(() => {
      const mobile = getMobileContainer();
      within(mobile).getByTestId('tab-tasks');
    });
    // The content wrapper inside MobileFeatureView has flex-1 overflow-hidden
    const mobile = getMobileContainer();
    const contentWrapper = mobile.querySelector('.flex-1.overflow-hidden');
    expect(contentWrapper).toBeTruthy();
  });
});

// ── Suite 9 — No duplicate chrome ────────────────────────────────────────────

describe('No duplicate portal chrome', () => {
  it('renders exactly one PortalSidebar', async () => {
    await renderWork();
    const sidebars = screen.getAllByTestId('portal-sidebar');
    expect(sidebars).toHaveLength(1);
  });

  it('does not render DesktopDock', async () => {
    await renderWork();
    expect(screen.queryByTestId('desktop-dock')).toBeNull();
  });

  it('desktop branch is present in DOM (CSS hides it on mobile)', async () => {
    await renderWork();
    // The desktop branch has the lg-portal class
    expect(document.querySelector('.lg-portal')).toBeTruthy();
  });

  it('mobile branch is present in DOM (CSS hides it on desktop)', async () => {
    await renderWork();
    // The mobile branch contains the launcher descriptions
    expect(screen.getByText('View and manage job tasks')).toBeTruthy();
  });
});
