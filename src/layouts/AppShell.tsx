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
      {/* Navy safe-area — keeps clock / Dynamic Island off the dashboard */}
      <div
        className="shrink-0 w-full"
        style={{
          height: 'env(safe-area-inset-top, 0px)',
          backgroundColor: '#111827',
        }}
        aria-hidden="true"
      />
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
    </div>
  );
}
