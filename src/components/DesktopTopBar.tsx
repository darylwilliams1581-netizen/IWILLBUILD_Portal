/**
 * DesktopTopBar — Persistent desktop shell header.
 *
 * Sits fixed at the top of the viewport on desktop (md+).
 * Hidden on mobile — mobile uses MobileTabBar instead.
 *
 * Contains:
 *   - App launcher (9-dot) — primary global nav trigger
 *   - Notification bell
 *
 * Rendered once inside PortalSidebar's desktop wrapper so it is always
 * present regardless of which page is active.
 */

import AppLauncher from '@/components/AppLauncher';
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
        paddingRight: 16,
        paddingLeft: 16,
        gap: 4,
        // Transparent — sits above page content, controls float in top-right
        background: 'transparent',
        pointerEvents: 'none', // let clicks fall through to page content by default
      }}
    >
      {/* Controls cluster — re-enable pointer events only on the buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          pointerEvents: 'auto',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRadius: 10,
          border: '1px solid rgba(226,232,240,0.8)',
          padding: '3px 6px',
          boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
        }}
      >
        <AppLauncher />
        <div style={{ width: 1, height: 16, background: '#e2e8f0', flexShrink: 0 }} />
        <NotificationBell collapsed={false} />
      </div>
    </div>
  );
}
