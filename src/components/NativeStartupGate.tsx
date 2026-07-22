/**
 * NativeStartupGate
 * ─────────────────────────────────────────────────────────────────────────────
 * Intercepts the root route ('/') when running inside the Capacitor native app.
 *
 * Behaviour:
 *   Native + authenticated   → redirect to /home  (app icon grid)
 *   Native + unauthenticated → redirect to /login
 *   Web browser              → render children (public landing page, unchanged)
 *
 * This component is placed as the element for the '/' route in routes.tsx,
 * wrapping the existing HomePage. It resolves the session once and redirects —
 * no flash of the landing page occurs because the redirect fires before paint
 * when isPending resolves quickly from a cached cookie.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/lib/auth/auth-client';
import { isNativeApp, NATIVE_HOME, NATIVE_LOGIN } from '@/lib/native-routing';

interface NativeStartupGateProps {
  children: React.ReactNode;
}

export default function NativeStartupGate({ children }: NativeStartupGateProps) {
  const { isAuthenticated, isPending } = useSession();

  // Web browser — render the public landing page as normal
  if (!isNativeApp) {
    return <>{children}</>;
  }

  // Native app — wait for session to resolve before deciding
  if (isPending) {
    // Minimal splash-style loader — splash screen is still visible at this point
    // so this is rarely seen, but prevents a blank flash if splash hides early.
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
            width: 32,
            height: 32,
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

  // Native + authenticated → app home
  if (isAuthenticated) {
    return <Navigate to={NATIVE_HOME} replace />;
  }

  // Native + unauthenticated → login
  return <Navigate to={NATIVE_LOGIN} replace />;
}
