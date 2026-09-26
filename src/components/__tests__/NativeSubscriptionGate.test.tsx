/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const controls = vi.hoisted(() => ({
  isNativeApp: true,
  session: { isAuthenticated: true, isPending: false },
  subscription: { status: 'active', isViewOnly: false, isLoading: false },
  openExternalUrl: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
  invalidateSubscriptionCache: vi.fn(),
  resetDiagnosticBuffer: vi.fn(),
}));

vi.mock('@/lib/native-routing', () => ({
  get isNativeApp() {
    return controls.isNativeApp;
  },
  openExternalUrl: controls.openExternalUrl,
}));

vi.mock('@/lib/auth/auth-client', () => ({
  useSession: () => controls.session,
  signOut: controls.signOut,
}));

vi.mock('@/lib/useSubscriptionGate', () => ({
  useSubscriptionGate: () => controls.subscription,
  invalidateSubscriptionCache: controls.invalidateSubscriptionCache,
}));

vi.mock('@/lib/diagnosticBuffer', () => ({
  resetDiagnosticBuffer: controls.resetDiagnosticBuffer,
}));

import NativeSubscriptionGate, {
  logoutPausedNativeApp,
  shouldPauseNativeSubscription,
} from '@/components/NativeSubscriptionGate';

describe('native subscription pause decision', () => {
  it.each(['locked_out', 'cancelled', 'trial_expired'] as const)(
    'pauses the native shell for %s',
    (status) => {
      expect(shouldPauseNativeSubscription(status, false)).toBe(true);
    },
  );

  it('pauses any status explicitly marked view-only', () => {
    expect(shouldPauseNativeSubscription('past_due', true)).toBe(true);
    expect(shouldPauseNativeSubscription('suspended', true)).toBe(true);
  });

  it.each(['active', 'trial', 'cancel_at_period_end', 'past_due'] as const)(
    'keeps the native shell available for %s with full access',
    (status) => {
      expect(shouldPauseNativeSubscription(status, false)).toBe(false);
    },
  );
});

describe('NativeSubscriptionGate', () => {
  beforeEach(() => {
    controls.isNativeApp = true;
    controls.session.isAuthenticated = true;
    controls.session.isPending = false;
    controls.subscription.status = 'active';
    controls.subscription.isViewOnly = false;
    controls.subscription.isLoading = false;
    vi.clearAllMocks();
  });

  it('does not mount the native shell when the subscription is paused', () => {
    controls.subscription.status = 'cancelled';
    controls.subscription.isViewOnly = true;

    render(
      <NativeSubscriptionGate>
        <div data-testid="native-tab-bar">Native shell</div>
      </NativeSubscriptionGate>,
    );

    expect(screen.getByRole('heading', { name: 'IWILLBUILD is paused' })).toBeVisible();
    expect(screen.queryByTestId('native-tab-bar')).not.toBeInTheDocument();
  });

  it('does not link a paused account to the website checkout', () => {
    controls.subscription.status = 'trial_expired';
    controls.subscription.isViewOnly = true;
    render(<NativeSubscriptionGate><div>Native shell</div></NativeSubscriptionGate>);

    expect(screen.queryByRole('button', { name: /open company website|subscribe|billing/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeVisible();
    expect(controls.openExternalUrl).not.toHaveBeenCalled();
  });

  it('clears cached status, signs out and redirects to login', async () => {
    const redirect = vi.fn();
    await logoutPausedNativeApp(redirect);

    expect(controls.invalidateSubscriptionCache).toHaveBeenCalledTimes(1);
    expect(controls.signOut).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('leaves active native accounts and all browser sessions unchanged', () => {
    const { rerender } = render(
      <NativeSubscriptionGate><div data-testid="native-shell">Native shell</div></NativeSubscriptionGate>,
    );
    expect(screen.getByTestId('native-shell')).toBeVisible();

    controls.isNativeApp = false;
    controls.subscription.status = 'cancelled';
    controls.subscription.isViewOnly = true;
    rerender(
      <NativeSubscriptionGate><div data-testid="browser-shell">Browser shell</div></NativeSubscriptionGate>,
    );
    expect(screen.getByTestId('browser-shell')).toBeVisible();
    expect(screen.queryByText('IWILLBUILD is paused')).not.toBeInTheDocument();
  });
});
