/**
 * ShellRouter — Two-interface home dispatcher.
 * ─────────────────────────────────────────────────────────────────────────────
 * Sits at the /home route and decides which interface to render:
 *
 *   App shell  (mobile / field)  → HomeScreen (icon grid + MobileTabBar)
 *   Office shell (desktop)       → OfficeShell wrapping DashboardPage
 *
 * Detection priority:
 *   1. Capacitor native app → always App shell
 *   2. localStorage override → honour it
 *   3. Viewport < 768px → App shell
 *   4. Viewport ≥ 768px → Office shell
 *
 * The shell toggle button is rendered here so it's always accessible on
 * desktop browsers. On native it is hidden (no toggle possible).
 */

import { lazy, Suspense } from 'react';
import { useShell } from '@/lib/useShell';
import OfficeShell from '@/layouts/OfficeShell';
import { Smartphone, Monitor } from 'lucide-react';

// Lazy-load both home pages — only one will be rendered per session
const HomeScreen   = lazy(() => import('@/pages/home'));
const DashboardPage = lazy(() => import('@/pages/dashboard'));

function PageLoader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100dvh',
        background: '#0F1117',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: '3px solid rgba(249,115,22,0.2)',
          borderTopColor: '#F97316',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * ShellToggle — floating button that lets desktop users switch between
 * App view (icon grid) and Office view (dashboard + sidebar).
 * Hidden on native (always app) and on mobile viewports (< 768px).
 */
function ShellToggle() {
  const { shell, canToggle, toggleShell, viewportShell } = useShell();
  // Never show on native; never show when the viewport is mobile-sized
  if (!canToggle) return null;
  if (viewportShell === 'app') return null;

  const isApp = shell === 'app';

  return (
    <button
      onClick={toggleShell}
      title={isApp ? 'Switch to Office view' : 'Switch to App view'}
      className="fixed bottom-6 right-6 z-[80] flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
      style={{
        background: isApp ? '#1c2333' : '#F97316',
        color: isApp ? '#9ca3af' : '#fff',
        border: isApp ? '1px solid rgba(255,255,255,0.08)' : 'none',
        boxShadow: isApp
          ? '0 4px 16px rgba(0,0,0,0.4)'
          : '0 4px 16px rgba(249,115,22,0.4)',
      }}
    >
      {isApp ? (
        <>
          <Monitor size={14} />
          Office view
        </>
      ) : (
        <>
          <Smartphone size={14} />
          App view
        </>
      )}
    </button>
  );
}

export default function ShellRouter() {
  const { isAppShell } = useShell();

  if (isAppShell) {
    // Mobile / field app — HomeScreen manages its own full-screen layout.
    // ShellToggle hides itself on mobile viewports, so it's safe to render here.
    return (
      <>
        <Suspense fallback={<PageLoader />}>
          <HomeScreen />
        </Suspense>
        <ShellToggle />
      </>
    );
  }

  // Desktop office portal — PortalSidebar + DashboardPage
  return (
    <>
      <OfficeShell>
        <Suspense fallback={<PageLoader />}>
          <DashboardPage />
        </Suspense>
      </OfficeShell>
      <ShellToggle />
    </>
  );
}
