import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { sosError: boolean; }

// Separate key from the index.html guard so they don't interfere.
const GUARD_KEY = 'smrb_reload_ts';
const WINDOW_MS = 12_000;

function recentReload(): boolean {
  try {
    const ts = parseInt(localStorage.getItem(GUARD_KEY) ?? '0', 10);
    return ts > 0 && Date.now() - ts < WINDOW_MS;
  } catch {
    return false;
  }
}

function isSosError(error: unknown): boolean {
  return error instanceof ReferenceError &&
    typeof (error as Error).message === 'string' &&
    (error as Error).message.includes('SOSAlertPopup');
}

/**
 * Catches the SOSAlertPopup ReferenceError thrown by the frozen Vite HMR
 * snapshot of RootLayout.tsx (t=1783772358219).
 *
 * Sits INSIDE AiroErrorBoundary, directly wrapping RootLayout, so it is the
 * nearest ancestor boundary for any error thrown inside RootLayout.
 *
 * On SOSAlertPopup error: reload once (guard prevents loop).
 * On any other error: re-throw from render so AiroErrorBoundary catches it.
 */
export default class StaleModuleReloadBoundary extends Component<Props, State> {
  state: State = { sosError: false };
  private _otherError: Error | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { sosError: isSosError(error) };
  }

  componentDidCatch(error: Error) {
    if (!isSosError(error)) {
      // Store for re-throw in render — componentDidCatch fires after
      // getDerivedStateFromError so we can stash it here safely.
      this._otherError = error;
    }
  }

  componentDidUpdate(_: Props, prev: State) {
    if (this.state.sosError && !prev.sosError) {
      if (!recentReload()) {
        try { localStorage.setItem(GUARD_KEY, String(Date.now())); } catch (_) {}
        window.location.reload();
      }
      // Guard active — fall through to show manual-reload UI.
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
      // Only shown if reload guard is active (already reloaded once in last 12s).
      return (
        <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
          <h2>Something went wrong loading the portal.</h2>
          <p>Please do a hard reload (Ctrl+Shift+R / Cmd+Shift+R) to clear the browser cache.</p>
          <button
            onClick={() => {
              try { localStorage.removeItem(GUARD_KEY); } catch (_) {}
              window.location.reload();
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
