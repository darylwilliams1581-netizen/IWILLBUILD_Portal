/**
 * DesktopTopBar — Persistent desktop portal header bar.
 *
 * Fixed at the top on desktop (md+). Hidden on mobile.
 * Height: 56px. z-index: 1100.
 *
 * Layout:
 *   Left  — Logo + IWILLBUILD wordmark
 *   Right — Notification bell
 */

import { Link } from 'react-router-dom';
import NotificationBell from '@/components/NotificationBell';

export const DESKTOP_TOPBAR_HEIGHT = 56;

export default function DesktopTopBar() {
  return (
    <div
      className="hidden md:flex"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: DESKTOP_TOPBAR_HEIGHT,
        zIndex: 1100,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 16,
        paddingRight: 12,
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
      }}
    >
      {/* ── Left: logo + wordmark ── */}
      <Link
        to="/home"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          textDecoration: 'none',
          flexShrink: 0,
        }}
      >
        <img
          src="/assets/logo.png"
          alt="IWILLBUILD"
          style={{
            height: 32,
            width: 'auto',
            objectFit: 'contain',
            display: 'block',
          }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <span
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '-0.03em',
            lineHeight: 1,
            fontFamily: 'var(--font-heading, inherit)',
          }}
        >
          IWILLBUILD
        </span>
      </Link>

      {/* ── Right: notification bell ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <NotificationBell collapsed={false} />
      </div>
    </div>
  );
}
