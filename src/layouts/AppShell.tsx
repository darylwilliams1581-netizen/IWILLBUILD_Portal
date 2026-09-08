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
    <div className="flex h-full min-h-0 flex-col bg-[#F2F2F7] text-gray-900">
      {/* No top spacer here — each page's header row owns its own
          padding-top: env(safe-area-inset-top) so it always clears the
          iPhone status bar regardless of scroll position. */}
      {/* Main content area — scrollable, leaves room for MobileTabBar (56px + safe-area).
          overflow-x:hidden clips the 300%-wide swipe track inside PagedHomeScreen.
          contain:'layout' must NOT be used — on iOS Safari it causes flex children to
          miscalculate their own width, producing the left-clip / overflow bug. */}
      <main
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        style={{
          paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          minWidth: 0,
          maxWidth: '100%',
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
