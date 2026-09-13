export type LoginNavigate = (
  destination: string,
  options: { replace: boolean },
) => void;

interface FinishLoginNavigationOptions {
  destination: string;
  isNative: boolean;
  navigate: LoginNavigate;
  invalidateMe: () => void;
  invalidateSubscription: () => void;
  blurActiveElement?: () => void;
}

/**
 * Completes an authenticated login without reloading the Capacitor WebView.
 * A hard reload can discard the newly established cross-origin auth session
 * before Better Auth has rehydrated it, which sends the user back to /login.
 */
export function finishLoginNavigation({
  destination,
  isNative,
  navigate,
  invalidateMe,
  invalidateSubscription,
  blurActiveElement,
}: FinishLoginNavigationOptions): void {
  invalidateMe();
  invalidateSubscription();

  if (isNative) {
    blurActiveElement?.();
    navigate('/home', { replace: true });
    return;
  }

  navigate(destination, { replace: true });
}
