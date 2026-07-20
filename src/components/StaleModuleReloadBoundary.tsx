import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { sosError: boolean; }

// Separate key from the index.html guard so they don't interfere.
const GUARD_KEY = 'smrb_nav_ts_v3';
const COUNT_KEY = 'smrb_nav_count_v3';
const SESSION_KEY = 'smrb_session_v3';
const WINDOW_MS = 30_000;
const MAX_NAV   = 8;

// Reset per-session so the guard never permanently blocks a fresh tab.
try {
  if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(SESSION_KEY)) {
    localStorage.removeItem(GUARD_KEY);
    localStorage.removeItem(COUNT_KEY);
    sessionStorage.setItem(SESSION_KEY, '1');
  }
} catch (_) { /* ignore */ }

function canNav(): boolean {
  try {
    const now   = Date.now();
    const ts    = parseInt(localStorage.getItem(GUARD_KEY)  ?? '0', 10);
    const count = parseInt(localStorage.getItem(COUNT_KEY) ?? '0', 10);
    if (now - ts > WINDOW_MS) return true;   // window expired — reset
    return count < MAX_NAV;
  } catch {
    return true;
  }
}

function recordNav(): void {
  try {
    const now   = Date.now();
    const ts    = parseInt(localStorage.getItem(GUARD_KEY)  ?? '0', 10);
    let count   = parseInt(localStorage.getItem(COUNT_KEY) ?? '0', 10);
    if (now - ts > WINDOW_MS) count = 0;
    localStorage.setItem(COUNT_KEY, String(count + 1));
    localStorage.setItem(GUARD_KEY, String(now));
  } catch { /* ignore */ }
}

function doFullNav(): void {
  if (!canNav()) return;
  recordNav();
  // location.href navigation busts the ES module registry (reload() does not in Chromium).
  const dest = new URL(location.href);
  dest.searchParams.set('_smrb', String(Date.now()));
  location.href = dest.toString();
}

function isSosError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg   = error.message ?? '';
  const stack = (error as Error).stack ?? '';
  return (
    msg.includes('SOSAlertPopup') ||
    stack.includes('SOSAlertPopup') ||
    stack.includes('1783772358219') ||
    // stale sos-shim patchedRemoveChild throwing NotFoundError
    stack.includes('patchedRemoveChild') ||
    (msg.includes('removeChild') && msg.includes('not a child'))
  );
}

/** True for the patchedRemoveChild NotFoundError — swallow silently, no reload needed */
function isRemoveChildError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const stack = (error as Error).stack ?? '';
  const msg   = (error as Error).message ?? '';
  return (
    stack.includes('patchedRemoveChild') ||
    (msg.includes('removeChild') && msg.includes('not a child'))
  );
}

/**
 * Catches the SOSAlertPopup ReferenceError thrown by the frozen Vite HMR
 * snapshot of RootLayout.tsx (t=1783772358219).
 *
 * Sits INSIDE AiroErrorBoundary, directly wrapping RootLayout, so it is the
 * nearest ancestor boundary for any error thrown inside RootLayout.
 *
 * On SOSAlertPopup error: full location.href navigation (busts module registry).
 * On any other error: re-throw from render so AiroErrorBoundary catches it.
 */
export default class StaleModuleReloadBoundary extends Component<Props, State> {
  state: State = { sosError: false };
  private _otherError: Error | null = null;
  private _isRemoveChildError = false;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { sosError: isSosError(error) };
  }

  componentDidCatch(error: Error) {
    if (isRemoveChildError(error)) {
      // patchedRemoveChild NotFoundError from stale shim — swallow silently.
      this._isRemoveChildError = true;
      return;
    }
    if (isSosError(error)) {
      // Fire immediately in componentDidCatch (synchronous, before any render).
      // __sosBoundaryTrigger is set by index.html and also does location.href nav.
      if (typeof (window as any).__sosBoundaryTrigger === 'function') {
        (window as any).__sosBoundaryTrigger();
      } else {
        doFullNav();
      }
    } else {
      this._otherError = error;
    }
  }

  render() {
    // Re-throw non-SOS errors from render so AiroErrorBoundary catches them.
    if (this._otherError) {
      const err = this._otherError;
      this._otherError = null;
      throw err;
    }

    if (this.state.sosError) {
      // If it was a removeChild error, recover silently — reset state and render children.
      // The boundary caught it; React will re-render from here cleanly.
      // We detect this by checking if the error was a removeChild type via the flag set in componentDidCatch.
      if (this._isRemoveChildError) {
        this._isRemoveChildError = false;
        // Reset error state so children render normally on next tick.
        // Use setState to trigger re-render without the error state.
        setTimeout(() => this.setState({ sosError: false }), 0);
        return null;
      }

      // Shown only if nav guard is exhausted (reloaded MAX_NAV times already).
      return (
        <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
          <h2>Something went wrong loading the portal.</h2>
          <p>Please do a hard reload (Ctrl+Shift+R / Cmd+Shift+R) to clear the browser cache.</p>
          <button
            onClick={() => {
              try {
                localStorage.removeItem(GUARD_KEY);
                localStorage.removeItem(COUNT_KEY);
              } catch (_) {}
              doFullNav();
            }}
          >
            Reload now
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
