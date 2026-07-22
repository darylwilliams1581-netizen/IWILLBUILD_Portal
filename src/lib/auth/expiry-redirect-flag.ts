/**
 * Expiry Redirect Flag
 *
 * A sessionStorage flag written by useSessionTimeout when it initiates a
 * hard redirect to /login?reason=expired. ProtectedRoute reads and consumes
 * this flag to avoid firing a second silent redirect that would strip the
 * ?reason=expired param from the URL.
 *
 * Kept in its own file to avoid a circular import between auth-client.tsx
 * (which defines ProtectedRoute) and useSessionTimeout.ts (which imports
 * signOut from auth-client.tsx).
 */

const EXPIRY_REDIRECT_KEY = '__iwb_expiry_redirect__';

/**
 * Write the flag. Called by useSessionTimeout just before the hard redirect.
 */
export function setExpiryRedirectFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(EXPIRY_REDIRECT_KEY, '1');
  } catch { /* best-effort */ }
}

/**
 * Read and consume the flag. Returns true once if the flag was set, then
 * clears it so subsequent checks return false.
 */
export function consumeExpiryRedirectFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const val = sessionStorage.getItem(EXPIRY_REDIRECT_KEY);
    if (val) {
      sessionStorage.removeItem(EXPIRY_REDIRECT_KEY);
      return true;
    }
  } catch { /* best-effort */ }
  return false;
}
