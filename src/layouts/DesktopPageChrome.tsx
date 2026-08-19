/**
 * DesktopPageChrome — Shared desktop chrome wrapper for portal pages.
 * ─────────────────────────────────────────────────────────────────────────────
 * A children-based visual wrapper only. Renders exactly one DesktopTopBar and
 * one DesktopDock alongside whatever children are passed in.
 *
 * Each component is self-hiding at the wrong breakpoint:
 *   DesktopTopBar — hidden lg:flex  (visible at lg+ / 1024px+)
 *   DesktopDock   — hidden md:flex lg:hidden  (visible at md–lg / 768–1023px)
 *
 * This wrapper does NOT:
 *   - Own routing or use React Router Outlet
 *   - Add a sidebar (PortalSidebar is rendered by each page separately)
 *   - Manage Helmet, page titles or metadata
 *   - Add padding, breakpoints, scrolling or global CSS
 *   - Change authentication or permissions
 */

import type { ReactNode } from 'react';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';

interface DesktopPageChromeProps {
  children: ReactNode;
}

export default function DesktopPageChrome({ children }: DesktopPageChromeProps) {
  return (
    <>
      <DesktopTopBar />
      <DesktopDock />
      {children}
    </>
  );
}
