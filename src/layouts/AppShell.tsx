/**
 * AppShell — Mobile / field-worker interface shell.
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the mobile app home (icon grid) with:
 *   - No desktop sidebar
 *   - No desktop header
 *   - MobileTabBar at the bottom
 *   - Safe-area aware padding
 *   - Light background (iOS-style)
 *
 * Used when: isNativeApp OR viewport < 768px OR user has overridden to 'app'.
 */

import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div
      className="flex flex-col bg-[#F2F2F7] text-gray-900"
      style={{
        minHeight: '100dvh',
        // Ensure content never bleeds under the native status bar
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* Main content area — scrollable, leaves room for MobileTabBar (56px + safe-area) */}
      <main
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{
          paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {children}
      </main>
      {/* MobileTabBar is rendered by the HomeScreen page itself — it lives inside
          the page component so it can access page-level state (camera FAB, more sheet).
          AppShell only provides the structural container. */}
    </div>
  );
}
