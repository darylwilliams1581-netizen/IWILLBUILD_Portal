/**
 * OfficeShell — Desktop / office portal interface shell.
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the office home (DashboardPage) for the desktop shell.
 *
 * NOTE: DashboardPage already renders PortalSidebar internally (it uses the
 * same layout pattern as all other portal pages). OfficeShell is therefore a
 * transparent structural wrapper — it does NOT add another sidebar.
 *
 * Its purpose is to:
 *   - Provide a semantic boundary for the office shell in ShellRouter
 *   - Allow future office-specific chrome (top nav, breadcrumbs, etc.)
 *     to be added here without touching individual pages
 *   - Serve as the named counterpart to AppShell in the codebase
 */

import type { ReactNode } from 'react';

interface OfficeShellProps {
  children: ReactNode;
}

export default function OfficeShell({ children }: OfficeShellProps) {
  // DashboardPage manages its own sidebar + layout.
  // OfficeShell is a transparent pass-through for now.
  return <>{children}</>;
}
