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
 */

import { lazy, Suspense, useEffect } from 'react';
import { useShell } from '@/lib/useShell';
import OfficeShell from '@/layouts/OfficeShell';

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

export default function ShellRouter() {
  const { hasOverride, setShellOverride, viewportShell } = useShell();

  // If there's a stale localStorage override that contradicts the natural
  // viewport shell, clear it so the viewport-based default takes over.
  useEffect(() => {
    if (hasOverride) {
      setShellOverride(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  const effectiveIsAppShell = viewportShell === 'app';

  if (effectiveIsAppShell) {
    return (
      <Suspense fallback={<PageLoader />}>
        <HomeScreen />
      </Suspense>
    );
  }

  return (
    <OfficeShell>
      <Suspense fallback={<PageLoader />}>
        <DashboardPage />
      </Suspense>
    </OfficeShell>
  );
}
