/**
 * ShellRouter — Home screen dispatcher.
 * ─────────────────────────────────────────────────────────────────────────────
 * Always renders HomeScreen (the icon-grid launcher) on both mobile and
 * desktop. The dashboard is a separate route at /dashboard.
 */

import { lazy, Suspense } from 'react';

const HomeScreen = lazy(() => import('@/pages/home'));

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
          borderTopColor: '#7C3AED',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function ShellRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <HomeScreen />
    </Suspense>
  );
}
