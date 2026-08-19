/**
 * DesktopPageChrome — Shared desktop chrome wrapper for portal pages.
 * ─────────────────────────────────────────────────────────────────────────────
 * A children-based visual wrapper only. Renders exactly one DesktopDock
 * alongside whatever children are passed in.
 *
 * ── CRITICAL OWNERSHIP RULE ──────────────────────────────────────────────────
 * DesktopTopBar is owned by PortalSidebar (PortalSidebar.tsx line 715).
 * Every portal page that renders <PortalSidebar /> already gets one
 * DesktopTopBar. This wrapper must NEVER render DesktopTopBar — doing so
 * produces a visible duplicate at lg+ viewports (two fixed bars stacked at
 * top: 0, z-index: 1100).
 *
 * DesktopDock is NOT rendered by PortalSidebar, so this wrapper renders it.
 *
 * Each component is self-hiding at the wrong breakpoint:
 *   DesktopDock — hidden md:flex lg:hidden  (visible at md–lg / 768–1023px)
 *
 * This wrapper does NOT:
 *   - Own routing or use React Router Outlet
 *   - Render DesktopTopBar (PortalSidebar owns it)
 *   - Add a sidebar (PortalSidebar is rendered by each page separately)
 *   - Manage Helmet, page titles or metadata
 *   - Add padding, breakpoints, scrolling or global CSS
 *   - Change authentication or permissions
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────────
 * Pages that use this wrapper must still render <PortalSidebar /> themselves
 * (outside this wrapper) to get the sidebar + DesktopTopBar. This wrapper
 * only adds DesktopDock.
 *
 * ── CURRENT STATUS ───────────────────────────────────────────────────────────
 * This wrapper exists for future use once the ownership model is fully
 * understood. The pilot page (safety-posters.tsx) was reverted to the direct
 * pattern (PortalSidebar + DesktopDock inline) after the integration test
 * revealed the duplicate DesktopTopBar. Do not use this wrapper on any page
 * until a route-level integration test confirms zero chrome duplication.
 */

import type { ReactNode } from 'react';
import DesktopDock from '@/components/DesktopDock';

interface DesktopPageChromeProps {
  children: ReactNode;
}

export default function DesktopPageChrome({ children }: DesktopPageChromeProps) {
  // DesktopTopBar is intentionally absent — PortalSidebar renders it.
  return (
    <>
      <DesktopDock />
      {children}
    </>
  );
}
