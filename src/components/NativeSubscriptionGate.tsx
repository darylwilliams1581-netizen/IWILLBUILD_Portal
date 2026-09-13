import type { ReactNode } from 'react';
import { useState } from 'react';
import { ExternalLink, LogOut, PauseCircle } from 'lucide-react';

import { signOut, useSession } from '@/lib/auth/auth-client';
import { resetDiagnosticBuffer } from '@/lib/diagnosticBuffer';
import { isNativeApp, openExternalUrl } from '@/lib/native-routing';
import {
  invalidateSubscriptionCache,
  useSubscriptionGate,
  type SubscriptionStatus,
} from '@/lib/useSubscriptionGate';

const BILLING_URL = 'https://iwillbuild.com/billing';
const PAUSED_STATUSES: ReadonlySet<string> = new Set([
  'locked_out',
  'cancelled',
  'trial_expired',
]);

export function shouldPauseNativeSubscription(
  status: SubscriptionStatus | null,
  isViewOnly: boolean,
): boolean {
  return isViewOnly || (status !== null && PAUSED_STATUSES.has(status));
}

export async function logoutPausedNativeApp(
  redirectToLogin: () => void = () => window.location.replace('/login'),
): Promise<void> {
  invalidateSubscriptionCache();
  try {
    resetDiagnosticBuffer();
  } catch {
    // Diagnostic cleanup is best-effort and must never block logout.
  }

  try {
    await signOut();
  } finally {
    redirectToLogin();
  }
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[#0F1117]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-violet-500" />
    </div>
  );
}

function PausedScreen() {
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await logoutPausedNativeApp();
  }

  return (
    <main className="flex min-h-[100dvh] w-full items-center justify-center bg-[#0F1117] px-5 py-[max(24px,env(safe-area-inset-top))] text-white">
      <section className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#171A23] p-6 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/15 text-violet-400">
          <PauseCircle size={34} aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">IWILLBUILD is paused</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Your subscription has ended. You can view records on iwillbuild.com for a limited time.
        </p>

        <div className="mt-7 grid gap-3">
          <button
            type="button"
            onClick={() => openExternalUrl(BILLING_URL)}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-violet-500 active:bg-violet-700"
          >
            <ExternalLink size={18} aria-hidden="true" />
            Manage billing on iwillbuild.com
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            <LogOut size={18} aria-hidden="true" />
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </section>
    </main>
  );
}

function AuthenticatedNativeSubscriptionGate({ children }: { children: ReactNode }) {
  const { status, isViewOnly, isLoading } = useSubscriptionGate();

  if (isLoading) return <FullScreenLoader />;
  if (shouldPauseNativeSubscription(status, isViewOnly)) return <PausedScreen />;
  return <>{children}</>;
}

function NativeGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isPending } = useSession();

  if (isPending) return <FullScreenLoader />;
  if (!isAuthenticated) return <>{children}</>;
  return <AuthenticatedNativeSubscriptionGate>{children}</AuthenticatedNativeSubscriptionGate>;
}

export default function NativeSubscriptionGate({ children }: { children: ReactNode }) {
  if (!isNativeApp) return <>{children}</>;
  return <NativeGate>{children}</NativeGate>;
}
