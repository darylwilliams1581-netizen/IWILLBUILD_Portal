/**
 * DesktopTopBar — Persistent desktop shell header.
 *
 * Sits fixed at the top of the viewport on desktop (md+).
 * Hidden on mobile — mobile uses MobileTabBar instead.
 *
 * Contains:
 *   - Notification bell (top-right)
 *
 * AppLauncher removed — the DesktopDock covers all navigation.
 */

import NotificationBell from '@/components/NotificationBell';

export default function DesktopTopBar() {
  return (
    <div
      className="hidden md:flex"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        left: 0,
        height: 44,
        zIndex: 1100,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: 12,
        gap: 4,
        background: 'transparent',
        pointerEvents: 'none',
      }}
    >
      {/* Notification bell — re-enable pointer events */}
      <div style={{ pointerEvents: 'auto' }}>
        <NotificationBell collapsed={false} />
      </div>
    </div>
  );
}
